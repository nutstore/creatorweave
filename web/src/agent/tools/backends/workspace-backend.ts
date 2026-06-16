/**
 * WorkspaceBackend — VfsBackend adapter for OPFS workspace files.
 *
 * Thin wrapper around useOPFSStore / WorkspaceRuntime.
 * Tools call backend.readFile() instead of directly calling opfsStore.readFile().
 *
 * Multi-root: passes null as directoryHandle to WorkspaceRuntime methods,
 * allowing the runtime to resolve the correct root via resolvePath() internally.
 */

import { useOPFSStore } from '@/store/opfs.store'
import type { VfsBackend, VfsReadResult, VfsReadOptions, VfsDirEntry, VfsListOptions } from '../vfs-backend'
import { resolveNativeDirectoryHandle } from '../tool-utils'
import type { ReadPolicy } from '@/opfs/types/opfs-types'
import { getWorkspaceManager } from '@/opfs'

function inferMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'text/typescript', tsx: 'text/typescript',
    js: 'text/javascript', jsx: 'text/javascript', mjs: 'text/javascript',
    json: 'application/json', css: 'text/css', html: 'text/html',
    md: 'text/markdown', txt: 'text/plain', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
    py: 'text/x-python', rs: 'text/rust', go: 'text/go',
    toml: 'text/toml', yaml: 'text/yaml', yml: 'text/yaml',
    xml: 'text/xml', csv: 'text/csv', pdf: 'application/pdf',
    wasm: 'application/wasm', nol: 'application/zip', zip: 'application/zip',
  }
  return map[ext] ?? 'application/octet-stream'
}

export class WorkspaceBackend implements VfsBackend {
  readonly label = 'workspace' as const

  constructor(
    private workspaceId?: string | null,
    private directoryHandle?: FileSystemDirectoryHandle | null,
    private projectId?: string | null,
  ) {}

  async readFile(path: string, options?: VfsReadOptions): Promise<VfsReadResult> {
    const { readFile } = useOPFSStore.getState()
    // Pass null as directoryHandle to let WorkspaceRuntime resolve the correct root via resolvePath()
    const readPolicy = options?.readPolicy as ReadPolicy | undefined

    const result = readPolicy
      ? await readFile(path, null, this.workspaceId, readPolicy, this.projectId)
      : await readFile(path, null, this.workspaceId, undefined, this.projectId)

    const { content, metadata, source } = result
    return {
      content,
      size: metadata.size,
      mimeType: metadata.contentType === 'binary' ? inferMimeType(path) : metadata.contentType,
      source: source === 'opfs' ? 'opfs' : 'native',
      mtime: metadata.mtime,
    }
  }

  async writeFile(path: string, content: string | ArrayBuffer | Blob): Promise<void> {
    const { writeFile } = useOPFSStore.getState()
    // Pass null to let WorkspaceRuntime resolve the correct root
    await writeFile(path, content, null, this.workspaceId, this.projectId)
  }

  async deleteFile(path: string): Promise<void> {
    const { deleteFile } = useOPFSStore.getState()
    // Pass null to let WorkspaceRuntime resolve the correct root
    await deleteFile(path, null, this.workspaceId, this.projectId)
  }

  async deleteDir(path: string): Promise<{ deletedFiles: string[]; deletedDirs: string[] }> {
    const deletedFiles: string[] = []
    const deletedDirs: string[] = []

    // Collect all file paths under this directory.
    // listDir() now merges native + OPFS-only entries, so discoveredFiles covers both.
    // We still do a separate OPFS-only scan as a safety net for any edge cases.

    let discoveredFiles = new Set<string>()
    let nativeDirs: VfsDirEntry[] = []

    try {
      const nativeEntries = await this.listDir(path, { recursive: true, maxDepth: 100 })
      discoveredFiles = new Set(
        nativeEntries.filter((e) => e.kind === 'file').map((e) => e.path)
      )
      nativeDirs = nativeEntries
        .filter((e) => e.kind === 'directory')
        .sort((a, b) => b.path.split('/').length - a.path.split('/').length)
    } catch {
      // Directory doesn't exist on native filesystem — OPFS-only, that's OK
    }

    // Also collect OPFS-only files that might have been missed by listDir (safety net)
    const prefix = path ? path + '/' : ''
    const opfsOnlyFiles = new Set<string>()

    // From cached paths (files written to OPFS but not on native disk)
    const { getCachedPaths } = useOPFSStore.getState()
    const cachedPaths = getCachedPaths()
    for (const cachedPath of cachedPaths) {
      if (cachedPath.startsWith(prefix) && !discoveredFiles.has(cachedPath)) {
        opfsOnlyFiles.add(cachedPath)
      }
    }

    // From pending changes — collect files to delete AND stale pending entries to clean up
    const { getPendingChanges } = useOPFSStore.getState()
    const pendingChanges = getPendingChanges()

    // Collect create/modify files for actual deletion
    for (const change of pendingChanges) {
      if (
        (change.type === 'create' || change.type === 'modify') &&
        change.path.startsWith(prefix) &&
        !discoveredFiles.has(change.path) &&
        !opfsOnlyFiles.has(change.path)
      ) {
        opfsOnlyFiles.add(change.path)
      }
    }

    // Delete all files: discovered + OPFS-only
    const allFiles = [...discoveredFiles, ...opfsOnlyFiles.keys()]
    for (const filePath of allFiles) {
      try {
        await this.deleteFile(filePath)
        deletedFiles.push(filePath)
      } catch {
        // Skip files that fail to delete
      }
    }

    // Clean up stale pending entries under this directory that were NOT already handled above.
    // This covers leftover 'delete' entries from previous partial deletions where the file
    // data was already removed from OPFS but the pending record was never synced/discarded.
    const staleDeletePaths = pendingChanges
      .filter(
        (change) =>
          change.type === 'delete' &&
          change.path.startsWith(prefix) &&
          !allFiles.includes(change.path)
      )
      .map((change) => change.path)

    if (staleDeletePaths.length > 0) {
      try {
        await this.discardPendingPaths(staleDeletePaths)
      } catch {
        // Fall back to one-by-one if batch fails
        for (const p of staleDeletePaths) {
          try {
            await this.discardPendingPath(p)
          } catch {
            // Skip entries that fail to discard
          }
        }
      }

      // Refresh OPFS store state once after batch discard
      try {
        const state = useOPFSStore.getState()
        if (state.refresh) await state.refresh()
      } catch {
        // Non-critical — store will refresh on next interaction
      }
    }

    // Record directories that were emptied
    for (const dir of nativeDirs) {
      deletedDirs.push(dir.path)
    }
    deletedDirs.push(path)

    // Try to remove the directory itself from native filesystem.
    // This handles the case where all files are already pending deletion —
    // the directory can be removed immediately since it's effectively empty.
    try {
      const { workspace } = await this.getWorkspaceForBackend()
      if (workspace) {
        const resolved = await workspace.resolvePath(path)
        const rootHandle = await workspace.getNativeDirectoryHandleForPath(path)
        if (rootHandle) {
          const relativePath = resolved.relativePath || ''
          const parts = relativePath.split('/').filter(Boolean)
          if (parts.length > 0) {
            let parentHandle = rootHandle
            for (let i = 0; i < parts.length - 1; i++) {
              parentHandle = await parentHandle.getDirectoryHandle(parts[i])
            }
            const dirName = parts[parts.length - 1]
            await parentHandle.removeEntry(dirName, { recursive: true })
          }
        }
      }
    } catch (e) {
      console.warn('[deleteDir] Failed to remove directory from native FS:', path, e)
    }

    return { deletedFiles, deletedDirs }
  }

  async listDir(path: string, options?: VfsListOptions): Promise<VfsDirEntry[]> {
    const recursive = options?.recursive ?? false
    const maxDepth = options?.maxDepth ?? 1

    // Phase 1: Collect native filesystem entries (may fail for OPFS-only directories)
    let nativeEntries: VfsDirEntry[] = []
    const nativePathSet = new Set<string>()

    // Multi-root: resolve the correct root handle for this path.
    // Try multi-root routing first (uses resolvePath to find the right root),
    // fall back to the legacy single-root resolveDirHandle().
    let nativeDirHandle: FileSystemDirectoryHandle | null = null
    let nativeRelativePath = path
    try {
      const { workspace } = await this.getWorkspaceForBackend()
      if (workspace) {
        const resolved = await workspace.resolvePath(path)
        const rootHandle = await workspace.getNativeDirectoryHandleForPath(path)
        if (rootHandle) {
          nativeDirHandle = rootHandle
          nativeRelativePath = resolved.relativePath || ''
        }
      }
    } catch {
      // Multi-root resolution failed — fall back to legacy handle
    }
    if (!nativeDirHandle) {
      nativeDirHandle = await this.resolveDirHandle()
    }

    if (nativeDirHandle) {
      try {
        let dirHandle: FileSystemDirectoryHandle = nativeDirHandle
        if (nativeRelativePath) {
          const segments = nativeRelativePath.split('/').filter(Boolean)
          for (let i = 0; i < segments.length; i++) {
            try {
              dirHandle = await dirHandle.getDirectoryHandle(segments[i]!)
            } catch (dirErr) {
              // Check if this segment is a file — if so, the path points to a file, not a directory
              const isLast = i === segments.length - 1
              if (isLast) {
                try {
                  await dirHandle.getFileHandle(segments[i]!)
                  // It's a file — listDir on a file path is an error
                  throw new Error(`ENOTDIR: not a directory, scandir '${path}'`)
                } catch (fileErr) {
                  // getFileHandle also failed — re-throw as ENOTDIR or let it propagate
                  if (fileErr instanceof Error && fileErr.message.startsWith('ENOTDIR')) throw fileErr
                  throw dirErr
                }
              }
              // Not the last segment — a parent path component is not a directory
              throw dirErr
            }
          }
        }

        if (!recursive || maxDepth <= 1) {
          for await (const [name, entry] of (dirHandle as any).entries()) {
            const entryPath = path ? `${path}/${name}` : name
            nativeEntries.push({ name, path: entryPath, kind: entry.kind })
            nativePathSet.add(entryPath)
          }
        } else {
          await this._listDirRecursive(dirHandle, path, nativeEntries, maxDepth, 1)
          for (const e of nativeEntries) nativePathSet.add(e.path)
        }
      } catch {
        // Directory doesn't exist on native filesystem — OPFS-only, that's OK
      }
    }

    // Phase 2: Merge OPFS-only files that are invisible to native filesystem
    // These are files created by Python (Pyodide) writes that never hit native disk.
    const prefix = path ? path + '/' : ''
    const opfsExtraEntries: VfsDirEntry[] = []
    const opfsExtraPaths = new Set<string>()

    // Helper: add a file entry and its parent directories (if under our path)
    const addOpfsFile = (filePath: string) => {
      if (nativePathSet.has(filePath) || opfsExtraPaths.has(filePath)) return
      if (prefix && !filePath.startsWith(prefix)) return

      opfsExtraEntries.push({
        name: filePath.split('/').pop()!,
        path: filePath,
        kind: 'file',
      })
      opfsExtraPaths.add(filePath)
    }

    // Helper: ensure directory entries exist for all intermediate directories
    const ensureDirEntries = (filePath: string) => {
      if (!prefix) return
      // filePath = "rootName/a/b/c/file.txt", prefix = "rootName/a/"
      // Need directory entries for: "rootName/a/b", "rootName/a/b/c" (if recursive)
      const relativePath = filePath.slice(prefix.length) // "b/c/file.txt"
      const segments = relativePath.split('/')
      for (let i = 1; i < segments.length; i++) {
        const dirPath = prefix + segments.slice(0, i).join('/')
        if (!nativePathSet.has(dirPath) && !opfsExtraPaths.has(dirPath)) {
          opfsExtraEntries.push({
            name: segments[i - 1],
            path: dirPath,
            kind: 'directory',
          })
          opfsExtraPaths.add(dirPath)
        }
      }
    }

    // Collect from OPFS cached paths (files in OPFS files/ directory)
    const { getCachedPaths } = useOPFSStore.getState()
    const cachedPaths = getCachedPaths()
    // Collect from pending creates/modifies (not yet in filesIndex but still OPFS-only)
    const { getPendingChanges } = useOPFSStore.getState()
    const pendingChanges = getPendingChanges()
    const allOpfsPaths = [
      ...cachedPaths,
      ...pendingChanges
        .filter((c) => c.type === 'create' || c.type === 'modify')
        .map((c) => c.path),
    ]

    for (const filePath of allOpfsPaths) {
      if (prefix && !filePath.startsWith(prefix)) continue
      if (!prefix && filePath.includes('/')) {
        // Root-level listing (path=''): skip deeply nested paths.
        // OPFS-only root-level files without '/' will still be listed.
        // Note: in multi-root mode, root-level OPFS directories (e.g. "rootName/")
        // are discovered through native filesystem, so this is not a problem.
        continue
      }

      if (recursive) {
        // Recursive: add the file itself + all intermediate directories
        ensureDirEntries(filePath)
        addOpfsFile(filePath)
      } else {
        // Non-recursive: only add the immediate child entry (file or directory)
        const relativePath = prefix ? filePath.slice(prefix.length) : filePath
        const firstSlash = relativePath.indexOf('/')
        if (firstSlash === -1) {
          // Direct child — it's a file
          addOpfsFile(filePath)
        } else {
          // Nested — only add the first directory segment as a directory entry
          const childName = relativePath.slice(0, firstSlash)
          const childPath = prefix ? prefix + childName : childName
          if (!nativePathSet.has(childPath) && !opfsExtraPaths.has(childPath)) {
            opfsExtraEntries.push({
              name: childName,
              path: childPath,
              kind: 'directory',
            })
            opfsExtraPaths.add(childPath)
          }
        }
      }
    }

    // Merge: native entries first, then OPFS-only extras
    const merged = [...nativeEntries, ...opfsExtraEntries]

    // If nothing found, check if the path itself is an OPFS-only file
    // (e.g. a file written by Python/Pyodide that never hit native disk)
    if (merged.length === 0 && path) {
      const isOpfsFile = allOpfsPaths.includes(path)
        || cachedPaths.includes(path)
        || pendingChanges.some(c => c.path === path && (c.type === 'create' || c.type === 'modify'))
      if (isOpfsFile) {
        throw new Error(`ENOTDIR: not a directory, scandir '${path}'`)
      }
    }

    return merged
  }

  private async _listDirRecursive(
    dirHandle: FileSystemDirectoryHandle,
    currentPath: string,
    acc: VfsDirEntry[],
    maxDepth: number,
    currentDepth: number,
  ): Promise<void> {
    for await (const [name, entry] of (dirHandle as any).entries()) {
      const entryPath = currentPath ? `${currentPath}/${name}` : name
      acc.push({
        name,
        path: entryPath,
        kind: entry.kind,
      })
      if (entry.kind === 'directory' && currentDepth < maxDepth) {
        try {
          const subDir = await dirHandle.getDirectoryHandle(name)
          await this._listDirRecursive(subDir, entryPath, acc, maxDepth, currentDepth + 1)
        } catch {
          // Skip directories we can't access
        }
      }
    }
  }

  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    return this.resolveDirHandle()
  }

  async exists(path: string): Promise<boolean> {
    try {
      const { readFile } = useOPFSStore.getState()
      // Pass null to let WorkspaceRuntime resolve the correct root
      await readFile(path, null, this.workspaceId)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get the WorkspaceRuntime instance for this backend.
   * Used by listDir and deleteDir for multi-root path resolution.
   */
  private async getWorkspaceForBackend(): Promise<{ workspace: any; workspaceId: string | null }> {
    const { useWorkspaceStore } = await import('@/store/workspace.store')
    const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
    const targetWorkspaceId = this.workspaceId || activeWorkspaceId
    if (!targetWorkspaceId) {
      return { workspace: null, workspaceId: targetWorkspaceId }
    }

    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(targetWorkspaceId)
    return { workspace, workspaceId: targetWorkspaceId }
  }

  /**
   * Resolve a directory handle for callers that need a single handle (listDir, getDirectoryHandle).
   * Not used by readFile/writeFile/deleteFile which go through WorkspaceRuntime's multi-root routing.
   */
  private async resolveDirHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (this.directoryHandle) return this.directoryHandle
    return resolveNativeDirectoryHandle(this.directoryHandle, this.workspaceId)
  }

  /**
   * Discard a stale pending entry by path (removes from pending DB without touching file data).
   * Used by deleteDir to clean up orphaned 'delete' pending records for files whose OPFS data
   * was already removed but the pending record was never synced/discarded.
   * Note: Caller is responsible for refreshing OPFS store state after batch discards.
   */
  private async discardPendingPath(path: string): Promise<void> {
    const { useWorkspaceStore } = await import('@/store/workspace.store')
    const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
    const targetWorkspaceId = this.workspaceId || activeWorkspaceId
    if (!targetWorkspaceId) return

    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(targetWorkspaceId)
    if (!workspace) return

    await workspace.discardPendingPath(path)
  }

  /**
   * Batch-discard stale pending entries. More efficient than one-by-one
   * because it saves metadata once and avoids repeated store refreshes.
   */
  private async discardPendingPaths(paths: string[]): Promise<void> {
    const { useWorkspaceStore } = await import('@/store/workspace.store')
    const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
    const targetWorkspaceId = this.workspaceId || activeWorkspaceId
    if (!targetWorkspaceId) return

    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(targetWorkspaceId)
    if (!workspace) return

    await workspace.discardPendingPaths(paths)
  }
}
