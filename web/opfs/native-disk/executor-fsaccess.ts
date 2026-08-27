/**
 * FSAccessExecutor — the File System Access API implementation of DiskExecutor.
 *
 * Moves WorkspaceRuntime's native disk logic (which used to call
 * FileSystemDirectoryHandle directly) into an implementation class. Behavior
 * is identical to before the refactor (phase 1, pure restructuring).
 *
 * Data sources:
 *   - Authorization + persistence: @/native-fs (DirectoryHandleManager + IDB)
 *   - Runtime handle registry: getRuntimeDirectoryHandle / getRuntimeHandlesForProject
 *   - File operations: direct FileSystemDirectoryHandle API calls
 *
 * rootId convention: compoundKey (`projectId:rootName`), same as native-fs's storage key.
 */

import type {
  DiskExecutor,
  DiskRoot,
  DiskStat,
  DiskEntry,
  DiskReadResult,
  DiskWriteContent,
} from './executor'
import { getFileContentType } from '../utils/opfs-utils'
import {
  requestDirectoryAccess,
  releaseDirectoryHandle,
  getRuntimeDirectoryHandle,
  getRuntimeHandlesForProject,
  buildHandleKey,
} from '@/native-fs'
import type { DirectoryPickerOptions } from '@/native-fs'

/** resolveSafeRelative: reject absolute paths / .. traversal */
function assertRelativePath(p: string): void {
  if (!p) throw new Error('relativePath is empty')
  if (p.startsWith('/')) throw new Error(`relativePath must be relative, got: ${p}`)
}

/** Resolve the parent directory handle along the path; returns (parent dir handle, file name). */
async function resolveParent(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) throw new Error(`Invalid path: ${path}`)
  const name = parts.pop()!
  let current = root
  for (const part of parts) {
    current = await current.getDirectoryHandle(part)
  }
  return { parent: current, name }
}

/** Resolve to the target file handle along the path (does not create). */
async function resolveFileHandle(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemFileHandle> {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  if (!name) throw new Error(`Invalid path: ${path}`)
  let current = root
  for (const part of parts) {
    current = await current.getDirectoryHandle(part)
  }
  return current.getFileHandle(name)
}

/** Restore (projectId, rootName) from a compoundKey. */
function parseCompoundKey(rootId: string): { projectId: string; rootName: string } {
  const idx = rootId.indexOf(':')
  if (idx === -1) return { projectId: rootId, rootName: rootId }
  return { projectId: rootId.substring(0, idx), rootName: rootId.substring(idx + 1) }
}

export class FSAccessExecutor implements DiskExecutor {
  readonly backend = 'fsaccess' as const

  // —— Authorization management ———————————————————————————————————

  async listRoots(projectId: string): Promise<DiskRoot[]> {
    const handles = getRuntimeHandlesForProject(projectId)
    const roots: DiskRoot[] = []
    for (const [rootName] of handles) {
      roots.push({
        id: buildHandleKey(projectId, rootName),
        displayName: rootName,
        readOnly: false, // FS Access doesn't split read/write (authorization is readwrite)
        backend: 'fsaccess',
        permissions: ['read', 'write', 'search'],
      })
    }
    return roots
  }

  async authorizeRoot(
    projectId: string,
    opts?: { displayName?: string; readOnly?: boolean }
  ): Promise<DiskRoot | null> {
    const rootName = opts?.displayName ?? projectId
    const pickerOpts: DirectoryPickerOptions = { mode: 'readwrite' }
    const handle = await requestDirectoryAccess(projectId, rootName, pickerOpts)
    if (!handle) return null // user cancelled

    // rootName uses the actually-picked folder name (handle.name), not the
    // passed displayName — same behavior as folder-access.store.pickDirectory.
    const actualName = handle.name
    return {
      id: buildHandleKey(projectId, actualName),
      displayName: actualName,
      readOnly: opts?.readOnly ?? false,
      backend: 'fsaccess',
      permissions: ['read', 'write', 'search'],
    }
  }

  async revokeRoot(projectId: string, rootId: string): Promise<void> {
    const { rootName } = parseCompoundKey(rootId)
    await releaseDirectoryHandle(projectId, rootName)
  }

  async hydrateRoot(projectId: string, rootId: string): Promise<boolean> {
    const { rootName } = parseCompoundKey(rootId)
    const handle = getRuntimeDirectoryHandle(projectId, rootName)
    if (!handle) return false
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' })
      return perm === 'granted'
    } catch {
      return false
    }
  }

  // —— Disk execution ————————————————————————————————————————————

  async read(rootId: string, relativePath: string): Promise<DiskReadResult> {
    assertRelativePath(relativePath)
    const handle = this.requireHandle(rootId)
    const fileHandle = await resolveFileHandle(handle, relativePath)
    const file = await fileHandle.getFile()
    const contentType = getFileContentType(relativePath)
    const content: string | ArrayBuffer =
      contentType === 'text' ? await file.text() : await file.arrayBuffer()
    return {
      content,
      stat: {
        mtime: file.lastModified,
        size: file.size,
        contentType,
        isFile: true,
      },
    }
  }

  async write(
    rootId: string,
    relativePath: string,
    content: DiskWriteContent
  ): Promise<DiskStat> {
    assertRelativePath(relativePath)
    const handle = this.requireHandle(rootId)
    const parts = relativePath.split('/').filter(Boolean)
    const fileName = parts.pop()!
    // Create parent directories automatically
    let current = handle
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true })
    }
    const targetFile = await current.getFileHandle(fileName, { create: true })
    const writable = await targetFile.createWritable()
    await writable.write(content)
    await writable.close()

    // Read back metadata for the returned stat (mirrors the
    // writeNativeFile-then-getFileMetadata pattern)
    const file = await targetFile.getFile()
    return {
      mtime: file.lastModified,
      size: file.size,
      contentType: getFileContentType(relativePath),
      isFile: true,
    }
  }

  async delete(
    rootId: string,
    relativePath: string,
    opts?: { pruneEmptyParents?: boolean }
  ): Promise<void> {
    assertRelativePath(relativePath)
    const handle = this.requireHandle(rootId)
    try {
      const { parent, name } = await resolveParent(handle, relativePath)
      await parent.removeEntry(name)

      // Prune the now-empty chain of parent directories upward
      // (best-effort, no throw). Called after syncing a delete to disk, to
      // avoid empty directory trees left behind on the disk side.
      if (opts?.pruneEmptyParents) {
        const parts = relativePath.split('/').filter(Boolean)
        // Check level by level from the deepest parent toward the root,
        // skipping the last level (the deleted entry itself)
        let current = handle
        for (let i = 0; i < parts.length - 1; i++) {
          try {
            const dir = await current.getDirectoryHandle(parts[i])
            let isEmpty = true
            for await (const _entry of dir.entries()) {
              void _entry
              isEmpty = false
              break
            }
            if (!isEmpty) break
            await current.removeEntry(parts[i])
          } catch {
            // Directory missing or removal failed — stop pruning upward
            break
          }
        }
      }
    } catch {
      // Silently succeed when missing (idempotent), mirroring deleteFromNativeIfExists
    }
  }

  async stat(rootId: string, relativePath: string): Promise<DiskStat | null> {
    assertRelativePath(relativePath)
    const handle = this.requireHandle(rootId)
    try {
      const fileHandle = await resolveFileHandle(handle, relativePath)
      const file = await fileHandle.getFile()
      return {
        mtime: file.lastModified,
        size: file.size,
        contentType: getFileContentType(relativePath),
        isFile: true,
      }
    } catch {
      // May be a directory or missing; try resolving as a directory
      try {
        const parts = relativePath.split('/').filter(Boolean)
        let current = handle
        for (const part of parts) {
          current = await current.getDirectoryHandle(part)
        }
        // It's a directory
        return { mtime: 0, size: 0, contentType: 'binary', isFile: false }
      } catch {
        return null
      }
    }
  }

  async listDir(rootId: string, relativePath: string): Promise<DiskEntry[]> {
    const handle = this.requireHandle(rootId)
    // Empty relativePath or '.' means the root
    let dir = handle
    if (relativePath && relativePath !== '.') {
      const parts = relativePath.split('/').filter(Boolean)
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part)
      }
    }
    const entries: DiskEntry[] = []
    for await (const [name, childHandle] of dir.entries()) {
      const kind = childHandle.kind === 'file' ? 'file' : 'directory'
      const entry: DiskEntry = { name, kind }
      if (kind === 'file') {
        try {
          const file = await (childHandle as FileSystemFileHandle).getFile()
          entry.stat = {
            mtime: file.lastModified,
            size: file.size,
            contentType: getFileContentType(name),
            isFile: true,
          }
        } catch {
          /* ignore single-file read failures */
        }
      }
      entries.push(entry)
    }
    return entries
  }

  // —— Internal helpers ———————————————————————————————————————————

  /**
   * Resolve the runtime handle from a rootId; throws when missing.
   * Note: this is a File System Access FileSystemDirectoryHandle.
   */
  private requireHandle(rootId: string): FileSystemDirectoryHandle {
    const { projectId, rootName } = parseCompoundKey(rootId)
    const handle = getRuntimeDirectoryHandle(projectId, rootName)
    if (!handle) {
      throw new Error(`[FSAccessExecutor] No runtime handle for root "${rootId}" (permission may have expired)`)
    }
    return handle
  }
}
