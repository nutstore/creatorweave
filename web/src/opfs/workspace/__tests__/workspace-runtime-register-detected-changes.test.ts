import { describe, expect, it, vi } from 'vitest'
import { WorkspaceRuntime } from '../workspace-runtime'

describe('WorkspaceRuntime.registerDetectedChanges', () => {
  it('treats detected add as modify when native file already exists', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      markAsCreated: vi.fn(async () => {}),
      add: vi.fn(async () => {}),
      markForDeletion: vi.fn(async () => {}),
    }

    runtime.getFileHandle = vi.fn(async () => ({
      getFile: async () => ({
        lastModified: 111,
        arrayBuffer: async () => new TextEncoder().encode('native').buffer,
      }),
    }))
    runtime.readFromFilesDir = vi.fn(async () => ({
      content: 'opfs-changed',
      mtime: 222,
      size: 11,
      contentType: 'text',
    }))
    runtime.areFileContentsEqual = vi.fn(async () => false)
    runtime.captureModifyBaseline = vi.fn(async () => {})

    await runtime.registerDetectedChanges(
      [{ type: 'add', path: 'src/a.ts', size: 11, mtime: 222 }],
      {} as FileSystemDirectoryHandle
    )

    expect(runtime.pendingManager.markAsCreated).not.toHaveBeenCalled()
    expect(runtime.pendingManager.add).toHaveBeenCalledWith('src/a.ts', 111)
    expect(runtime.captureModifyBaseline).toHaveBeenCalledTimes(1)
  })
})
