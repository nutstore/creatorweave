/**
 * AgentBackend — VfsBackend adapter for agent namespace files.
 *
 * Thin wrapper around AgentManager.
 * Agent files are simpler than workspace: no pending tracking, no native FS fallback.
 */

import type { AgentManager } from '@/opfs'
import type { VfsBackend, VfsReadResult, VfsReadOptions, VfsDirEntry, VfsListOptions } from '../vfs-backend'

function inferMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    md: 'text/markdown', txt: 'text/plain',
    ts: 'text/typescript', js: 'text/javascript',
    json: 'application/json',
  }
  return map[ext] ?? 'text/plain'
}

export class AgentBackend implements VfsBackend {
  readonly label = 'agent' as const

  constructor(
    private agentManager: AgentManager,
    private agentId: string,
  ) {}

  async readFile(path: string, _options?: VfsReadOptions): Promise<VfsReadResult> {
    const content = await this.agentManager.readPath(this.agentId, path)
    if (content == null) {
      throw new Error(`File not found: vfs://agents/${this.agentId}/${path}`)
    }
    const size = new TextEncoder().encode(content).length
    return {
      content,
      size,
      mimeType: inferMimeType(path),
      source: 'agent',
    }
  }

  async writeFile(path: string, content: string | ArrayBuffer): Promise<void> {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content)
    // Auto-create agent if it doesn't exist yet
    const exists = await this.agentManager.hasAgent(this.agentId)
    if (!exists) {
      await this.agentManager.createAgent(this.agentId)
    }
    await this.agentManager.writePath(this.agentId, path, text)
  }

  async deleteFile(path: string): Promise<void> {
    await this.agentManager.deletePath(this.agentId, path)
  }

  async listDir(path: string, _options?: VfsListOptions): Promise<VfsDirEntry[]> {
    const handle = await this.agentManager.getDirectoryHandle(this.agentId, path, { allowMissing: true })
    if (!handle.exists || !handle.handle) return []

    const entries: VfsDirEntry[] = []
    for await (const [name, entry] of (handle.handle as any).entries()) {
      entries.push({
        name,
        path: path ? `${path}/${name}` : name,
        kind: entry.kind,
      })
    }
    return entries
  }

  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    const result = await this.agentManager.getDirectoryHandle(this.agentId, '', { allowMissing: true })
    return result.handle ?? null
  }

  async exists(path: string): Promise<boolean> {
    const content = await this.agentManager.readPath(this.agentId, path)
    return content != null
  }
}
