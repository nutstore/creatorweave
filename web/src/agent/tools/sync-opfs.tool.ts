/**
 * Sync-to-OPFS Tool - Copy files from native filesystem to OPFS (only if absent).
 *
 * When Pyodide needs to access files that only exist on the native filesystem,
 * this tool copies them into the OPFS files/ directory (mounted at /mnt/ in Pyodide).
 *
 * IMPORTANT: Files already present in OPFS are NEVER overwritten, because the OPFS
 * version may contain agent edits (pending changes) that should not be clobbered
 * by the on-disk version. Only files that do NOT exist in OPFS are synced.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import type { WorkspaceRuntime } from '@/opfs/workspace/workspace-runtime'
import { resolveNativeDirectoryHandle } from './tool-utils'
import { toolErrorJson, toolOkJson } from './tool-envelope'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024 // 50MB total per call
const MAX_FILES = 50

export const syncToOPFSDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'sync',
    description:
      'Copy files from disk to OPFS (mounted at /mnt/ in Python), but ONLY if they do NOT already exist in OPFS. ' +
      'Files already in OPFS (which may contain agent edits) are skipped to avoid overwriting pending changes. ' +
      'Use this before `python` when the script needs workspace files not yet available in OPFS. ' +
      'Accepts glob patterns (e.g., "data/**/*.csv") or explicit file paths. ' +
      'Files are copied silently without loading content into the conversation.',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          description:
            'File paths or glob patterns to sync. Examples: ["data/report.csv"], ["src/**/*.py"], ["./config.json"]. ' +
            'Glob patterns are resolved against the workspace root.',
          items: { type: 'string' },
        },
      },
      required: ['paths'],
    },
  },
}

export const syncToOPFSExecutor: ToolExecutor = async (args, context) => {
  const { paths } = args
  if (!Array.isArray(paths) || paths.length === 0) {
    return toolErrorJson('sync', 'invalid_args', 'paths must be a non-empty array of file paths or glob patterns')
  }

  const projectId = context.projectId ?? null

  // Resolve workspace runtime and files/ dir
  const runtime = await getWorkspaceRuntime(context.workspaceId)
  if (!runtime) {
    return toolErrorJson('sync', 'no_opfs', 'No active workspace OPFS available')
  }
  const filesDir = await runtime.getFilesDir()

  // Collect all native handles: multi-root aware
  let nativeHandleMap: Map<string, FileSystemDirectoryHandle>

  // Always try to get all handles from runtime (multi-root)
  nativeHandleMap = await runtime.getAllNativeDirectoryHandles(projectId)
  if (nativeHandleMap.size === 0) {
    // Fallback: use context handle or resolve single handle
    const fallbackHandle = context.directoryHandle
      ?? await resolveNativeDirectoryHandle(null, context.workspaceId)
    if (!fallbackHandle) {
      return toolErrorJson('sync', 'no_native_fs', 'No native filesystem access available')
    }
    nativeHandleMap = new Map([['', fallbackHandle]])
  }

  if (nativeHandleMap.size === 0) {
    return toolErrorJson('sync', 'no_native_fs', 'No native filesystem access available')
  }

  // Build a rootName → rootHandle map and resolve paths per root
  // For multi-root, paths may have root prefix (e.g. "creatorweave/src/App.tsx")
  // We need to strip the root prefix before globbing within the root's handle
  const resolvedByRoot = new Map<string, { handle: FileSystemDirectoryHandle; patterns: string[] }>()

  for (const rawPath of paths as string[]) {
    const normalized = rawPath.replace(/^(\.\/)+/, '')
    // Try to resolve root prefix using runtime.resolvePath
    try {
      const resolved = await runtime.resolvePath(normalized, projectId)
      const rootName = resolved.rootName
      const relativePattern = resolved.relativePath || '**'
      if (!resolvedByRoot.has(rootName)) {
        const handle = nativeHandleMap.get(rootName) ?? null
        if (!handle) continue // root handle not available, skip
        resolvedByRoot.set(rootName, { handle, patterns: [] })
      }
      resolvedByRoot.get(rootName)!.patterns.push(relativePattern)
    } catch {
      // resolvePath failed — try against all roots with the original pattern
      for (const [rootName, handle] of nativeHandleMap) {
        if (!resolvedByRoot.has(rootName)) {
          resolvedByRoot.set(rootName, { handle, patterns: [] })
        }
        resolvedByRoot.get(rootName)!.patterns.push(normalized)
      }
    }
  }

  // Expand globs per root with resolved patterns
  const allResolvedPaths = new Map<string, string[]>() // rootName → filePaths
  let totalResolved = 0

  for (const [rootName, { handle, patterns }] of resolvedByRoot) {
    const resolvedPaths = await resolvePaths(handle, patterns)
    allResolvedPaths.set(rootName, resolvedPaths)
    totalResolved += resolvedPaths.length
  }

  if (totalResolved === 0) {
    // Check whether paths already exist in OPFS
    const alreadyInOPFS = await resolvePaths(filesDir, paths as string[])
    if (alreadyInOPFS.length > 0) {
      return toolOkJson('sync', {
        synced: 0,
        skipped: alreadyInOPFS.length,
        skippedReason: 'Files already exist in OPFS (sync not required)',
      })
    }
    return toolErrorJson(
      'sync',
      'no_files',
      'No files found on native filesystem matching the given paths',
      {
        hint: 'Paths are resolved relative to workspace root.',
        details: { requested_paths: paths },
      }
    )
  }

  // Sync files from each root
  let synced = 0
  let skipped = 0
  let totalBytes = 0
  const errors: string[] = []

  for (const [rootName, nativeHandle] of nativeHandleMap) {
    const resolvedPaths = allResolvedPaths.get(rootName) ?? []

    // For multi-root, prepend rootName to OPFS path so resolvePath() can route correctly
    const opfsPathPrefix = rootName ? `${rootName}/` : ''

    for (const filePath of resolvedPaths) {
      if (synced >= MAX_FILES) {
        errors.push(`Reached max file limit (${MAX_FILES}), stopping`)
        break
      }
      if (totalBytes >= MAX_TOTAL_SIZE) {
        errors.push(`Reached total size limit (${MAX_TOTAL_SIZE / 1024 / 1024}MB), stopping`)
        break
      }

      try {
        // Source: native handle (root's directory)
        // Destination: OPFS files/ with root prefix for correct routing
        const opfsPath = `${opfsPathPrefix}${filePath}`
        const size = await syncSingleFile(nativeHandle, filesDir, filePath, opfsPath)
        if (size >= 0) {
          synced++
          totalBytes += size
        } else {
          skipped++
        }
      } catch (e) {
        errors.push(
          `${filePath}: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }

    if (synced >= MAX_FILES || totalBytes >= MAX_TOTAL_SIZE) break
  }

  // Rebuild filesIndex so workspace-runtime sees the newly synced files
  if (synced > 0) {
    try {
      await runtime.rebuildFilesIndex()
    } catch {
      // Non-critical: the files are on disk but index may be stale until next init
    }
  }

  return toolOkJson('sync', {
    synced,
    skipped,
    skippedReason: skipped > 0 ? 'File already exists in OPFS (preserved to avoid overwriting agent edits)' : undefined,
    totalBytes,
    errors: errors.length > 0 ? errors : undefined,
  })
}

/**
 * Resolve glob patterns and explicit paths to actual file paths.
 */
async function resolvePaths(
  rootHandle: FileSystemDirectoryHandle,
  patterns: string[]
): Promise<string[]> {
  const result: string[] = []
  const seen = new Set<string>()

  for (const pattern of patterns) {
    const raw = String(pattern ?? '').trim()
    if (!raw) continue
    // Normalize: remove leading ./
    const normalized = raw.replace(/^(\.\/)+/, '')

    if (normalized.includes('*') || normalized.includes('?')) {
      // Glob pattern - expand
      const matches = await expandGlob(rootHandle, normalized)
      for (const match of matches) {
        if (!seen.has(match)) {
          seen.add(match)
          result.push(match)
        }
      }
    } else {
      // Explicit path - check if it's a file or directory
      if (!seen.has(normalized)) {
        seen.add(normalized)
        const expanded = await expandDirectory(rootHandle, normalized)
        result.push(...expanded)
      }
    }
  }

  return result
}

/**
 * Expand a glob pattern against the native filesystem.
 * Supports * (any segment) and ** (recursive).
 */
async function expandGlob(
  rootHandle: FileSystemDirectoryHandle,
  pattern: string
): Promise<string[]> {
  const results: string[] = []
  const parts = pattern.split('/')

  async function match(
    dirHandle: FileSystemDirectoryHandle,
    partIndex: number,
    currentPath: string
  ): Promise<void> {
    if (partIndex >= parts.length) return

    const part = parts[partIndex]
    const isLast = partIndex === parts.length - 1

    if (part === '**') {
      // Recursive match - match zero or more directories
      // Try matching rest of pattern in current dir
      await match(dirHandle, partIndex + 1, currentPath)
      // Also recurse into subdirectories
      for await (const [name, entry] of dirHandle.entries()) {
        if (entry.kind === 'directory') {
          const subDir = await dirHandle.getDirectoryHandle(name)
          const subPath = currentPath ? `${currentPath}/${name}` : name
          await match(subDir, partIndex, subPath)
        }
      }
    } else if (part.includes('*') || part.includes('?')) {
      // Wildcard segment
      const regex = globToRegex(part)
      for await (const [name, entry] of dirHandle.entries()) {
        if (!regex.test(name)) continue

        const entryPath = currentPath ? `${currentPath}/${name}` : name
        if (isLast) {
          if (entry.kind === 'file') {
            results.push(entryPath)
          }
        } else if (entry.kind === 'directory') {
          const subDir = await dirHandle.getDirectoryHandle(name)
          await match(subDir, partIndex + 1, entryPath)
        }
      }
    } else {
      // Literal segment
      try {
        if (isLast) {
          await dirHandle.getFileHandle(part)
          const entryPath = currentPath ? `${currentPath}/${part}` : part
          results.push(entryPath)
        } else {
          const subDir = await dirHandle.getDirectoryHandle(part)
          const subPath = currentPath ? `${currentPath}/${part}` : part
          await match(subDir, partIndex + 1, subPath)
        }
      } catch {
        // Path doesn't exist, skip
      }
    }
  }

  await match(rootHandle, 0, '')
  return results
}

/**
 * If path is a directory, expand to all files recursively.
 * If path is a file, return it as-is.
 */
async function expandDirectory(
  rootHandle: FileSystemDirectoryHandle,
  path: string
): Promise<string[]> {
  const results: string[] = []
  const ignoredDirs = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv'])

  async function walk(dirHandle: FileSystemDirectoryHandle, currentPath: string): Promise<void> {
    for await (const [name, entry] of dirHandle.entries()) {
      const entryPath = currentPath ? `${currentPath}/${name}` : name
      if (entry.kind === 'file') {
        results.push(entryPath)
      } else if (entry.kind === 'directory' && !ignoredDirs.has(name)) {
        const subDir = await dirHandle.getDirectoryHandle(name)
        await walk(subDir, entryPath)
      }
    }
  }

  try {
    // Try as file first
    const parts = path.split('/')
    let dirHandle = rootHandle
    for (let i = 0; i < parts.length - 1; i++) {
      dirHandle = await dirHandle.getDirectoryHandle(parts[i])
    }
    await dirHandle.getFileHandle(parts[parts.length - 1])
    // It's a file
    results.push(path)
  } catch {
    // Not a file, try as directory
    try {
      let dirHandle = rootHandle
      for (const part of path.split('/')) {
        dirHandle = await dirHandle.getDirectoryHandle(part)
      }
      await walk(dirHandle, path)
    } catch {
      // Neither file nor directory
    }
  }

  return results
}

/**
 * Convert a glob pattern segment to a RegExp.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`, 'i')
}

/**
 * Sync a single file from native FS to OPFS files/ directory.
 * Returns the file size, or -1 if skipped (file already exists in OPFS).
 */
async function syncSingleFile(
  nativeHandle: FileSystemDirectoryHandle,
  opfsFilesDir: FileSystemDirectoryHandle,
  filePath: string,
  opfsDestPath?: string
): Promise<number> {
  // opfsDestPath: optional destination path in OPFS (for multi-root prefix routing)
  // If not provided, uses filePath (legacy single-root behavior)
  const destPath = opfsDestPath ?? filePath
  const destParts = destPath.split('/')
  const sourceParts = filePath.split('/')

  // Check if file already exists in OPFS — never overwrite existing files
  // because OPFS version may contain agent edits (pending changes).
  try {
    let checkDir = opfsFilesDir
    for (let i = 0; i < destParts.length - 1; i++) {
      checkDir = await checkDir.getDirectoryHandle(destParts[i])
    }
    await checkDir.getFileHandle(destParts[destParts.length - 1])
    // File exists in OPFS — skip to avoid clobbering agent edits
    return -1
  } catch {
    // File not in OPFS, proceed with sync
  }

  // Read from native FS (using source path relative to root's handle)
  let dirHandle = nativeHandle
  for (let i = 0; i < sourceParts.length - 1; i++) {
    dirHandle = await dirHandle.getDirectoryHandle(sourceParts[i])
  }
  const fileHandle = await dirHandle.getFileHandle(sourceParts[sourceParts.length - 1])
  const file = await fileHandle.getFile()

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
  }

  // Write to OPFS files/ dir (using destination path)
  let opfsDir = opfsFilesDir
  for (let i = 0; i < destParts.length - 1; i++) {
    opfsDir = await opfsDir.getDirectoryHandle(destParts[i], { create: true })
  }

  const opfsFileHandle = await opfsDir.getFileHandle(destParts[destParts.length - 1], { create: true })
  const writable = await opfsFileHandle.createWritable()
  await writable.write(file)
  await writable.close()

  return file.size
}

/**
 * Get the WorkspaceRuntime for the active workspace.
 */
async function getWorkspaceRuntime(
  workspaceId?: string | null
): Promise<WorkspaceRuntime | null> {
  try {
    const { getWorkspaceManager } = await import('@/opfs')
    const manager = await getWorkspaceManager()

    let workspace
    if (workspaceId) {
      workspace = await manager.getWorkspace(workspaceId)
    }
    if (!workspace) {
      const { getActiveWorkspace } = await import('@/store/workspace.store')
      const active = await getActiveWorkspace()
      workspace = active?.workspace
    }
    return workspace ?? null
  } catch {
    return null
  }
}
