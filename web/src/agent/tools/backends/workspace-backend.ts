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
    wasm: 'application/wasm', zip: 'application/zip',
  }
  return map[ext] ?? 'application/octet-stream'
}

export class WorkspaceBackend implements VfsBackend {
  readonly label = 'workspace' as const

  constructor(
    private workspaceId?: string | null,
    private directoryHandle?: FileSystemDirectoryHandle | null,
  ) {}

  async readFile(path: string, options?: VfsReadOptions): Promise<VfsReadResult> {
    const { readFile } = useOPFSStore.getState()
    // Pass null to let WorkspaceRuntime resolve the correct root via resolvePath()
    const readPolicy = options?.readPolicy as ReadPolicy | undefined

    const result = readPolicy
      ? await readFile(path, null, this.workspaceId, readPolicy)
      : await readFile(path, null, this.workspaceId)

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
    await writeFile(path, content, null, this.workspaceId)
  }

  async deleteFile(path: string): Promise<void> {
    const { deleteFile } = useOPFSStore.getState()
    // Pass null to let WorkspaceRuntime resolve the correct root
    await deleteFile(path, null, this.workspaceId)
  }

  async listDir(path: string, _options?: VfsListOptions): Promise<VfsDirEntry[]> {
    // ls.tool.ts has its own complex traversal logic.
    // This fallback resolves a single handle for basic listing.
    const handle = await this.resolveDirHandle()
    if (!handle) return []

    let dirHandle: FileSystemDirectoryHandle = handle
    if (path) {
      for (const segment of path.split('/').filter(Boolean)) {
        dirHandle = await dirHandle.getDirectoryHandle(segment)
      }
    }

    const entries: VfsDirEntry[] = []
    for await (const [name, entry] of (dirHandle as any).entries()) {
      entries.push({
        name,
        path: path ? `${path}/${name}` : name,
        kind: entry.kind,
      })
    }
    return entries
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
   * Resolve a directory handle for callers that need a single handle (listDir, getDirectoryHandle).
   * Not used by readFile/writeFile/deleteFile which go through WorkspaceRuntime's multi-root routing.
   */
  private async resolveDirHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (this.directoryHandle) return this.directoryHandle
    return resolveNativeDirectoryHandle(this.directoryHandle, this.workspaceId)
  }
}
