import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceRuntime } from '../workspace-runtime'
import type { PendingChange } from '@/opfs/types/opfs-types'

function createPending(id: string, path: string, type: PendingChange['type']): PendingChange {
  return {
    id,
    path,
    type,
    fsMtime: 0,
    timestamp: Date.now(),
  }
}

describe('WorkspaceRuntime discard behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('discardPendingPath deletes OPFS file body when pending op is create', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      getAll: vi.fn(() => [createPending('p1', 'new-file.txt', 'create')]),
      removeByPath: vi.fn(async () => {}),
    }
    runtime.deleteFromFilesDirIfExists = vi.fn(async () => {})
    runtime.saveMetadata = vi.fn(async () => {})

    await runtime.discardPendingPath('new-file.txt')

    expect(runtime.deleteFromFilesDirIfExists).toHaveBeenCalledWith('new-file.txt')
    expect(runtime.pendingManager.removeByPath).toHaveBeenCalledWith('new-file.txt')
  })

  it('discardAllPendingChanges deletes only create files and then clears pending ledger', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      getAll: vi.fn(() => [
        createPending('p1', 'created.txt', 'create'),
        createPending('p2', 'modified.txt', 'modify'),
      ]),
      removeByPath: vi.fn(async () => {}),
    }
    runtime.deleteFromFilesDirIfExists = vi.fn(async () => {})
    runtime.restorePendingModifyFromNative = vi.fn(async () => true)
    runtime.saveMetadata = vi.fn(async () => {})

    await runtime.discardAllPendingChanges()

    expect(runtime.deleteFromFilesDirIfExists).toHaveBeenCalledTimes(1)
    expect(runtime.deleteFromFilesDirIfExists).toHaveBeenCalledWith('created.txt')
    expect(runtime.restorePendingModifyFromNative).toHaveBeenCalledWith('modified.txt')
    expect(runtime.pendingManager.removeByPath).toHaveBeenCalledTimes(2)
  })

  it('discardPendingPath restores modify from native baseline before removing pending', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      getAll: vi.fn(() => [createPending('p1', 'src/a.ts', 'modify')]),
      removeByPath: vi.fn(async () => {}),
    }
    runtime.restorePendingModifyFromNative = vi.fn(async () => true)
    runtime.saveMetadata = vi.fn(async () => {})

    await runtime.discardPendingPath('src/a.ts')

    expect(runtime.restorePendingModifyFromNative).toHaveBeenCalledWith('src/a.ts')
    expect(runtime.pendingManager.removeByPath).toHaveBeenCalledWith('src/a.ts')
  })

  it('discardPendingPath falls back to OPFS baseline when native baseline is unavailable', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      getAll: vi.fn(() => [createPending('p1', 'src/a.ts', 'modify')]),
      removeByPath: vi.fn(async () => {}),
    }
    runtime.restorePendingModifyFromNative = vi.fn(async () => false)
    runtime.restorePendingModifyFromBaseline = vi.fn(async () => true)
    runtime.saveMetadata = vi.fn(async () => {})

    await runtime.discardPendingPath('src/a.ts')

    expect(runtime.restorePendingModifyFromNative).toHaveBeenCalledWith('src/a.ts')
    expect(runtime.restorePendingModifyFromBaseline).toHaveBeenCalledWith('src/a.ts')
    expect(runtime.pendingManager.removeByPath).toHaveBeenCalledWith('src/a.ts')
  })

  it('discardPendingPath keeps pending when modify baseline cannot be restored', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      getAll: vi.fn(() => [createPending('p1', 'src/a.ts', 'modify')]),
      removeByPath: vi.fn(async () => {}),
    }
    runtime.restorePendingModifyFromNative = vi.fn(async () => false)
    runtime.saveMetadata = vi.fn(async () => {})

    await expect(runtime.discardPendingPath('src/a.ts')).rejects.toThrow('缺少本地文件基线')
    expect(runtime.pendingManager.removeByPath).not.toHaveBeenCalled()
  })

  it('discardAllPendingChanges falls back to OPFS baseline for modify records', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      getAll: vi.fn(() => [
        createPending('p1', 'created.txt', 'create'),
        createPending('p2', 'src/a.ts', 'modify'),
      ]),
      removeByPath: vi.fn(async () => {}),
    }
    runtime.deleteFromFilesDirIfExists = vi.fn(async () => {})
    runtime.restorePendingModifyFromNative = vi.fn(async () => false)
    runtime.restorePendingModifyFromBaseline = vi.fn(async () => true)
    runtime.saveMetadata = vi.fn(async () => {})

    await runtime.discardAllPendingChanges()

    expect(runtime.restorePendingModifyFromNative).toHaveBeenCalledWith('src/a.ts')
    expect(runtime.restorePendingModifyFromBaseline).toHaveBeenCalledWith('src/a.ts')
    expect(runtime.pendingManager.removeByPath).toHaveBeenCalledWith('created.txt')
    expect(runtime.pendingManager.removeByPath).toHaveBeenCalledWith('src/a.ts')
  })

  it('discardPendingPath restores delete from OPFS baseline when native baseline is unavailable', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      getAll: vi.fn(() => [createPending('p1', 'src/deleted.ts', 'delete')]),
      removeByPath: vi.fn(async () => {}),
    }
    runtime.restorePendingModifyFromNative = vi.fn(async () => false)
    runtime.restorePendingModifyFromBaseline = vi.fn(async () => true)
    runtime.saveMetadata = vi.fn(async () => {})

    await runtime.discardPendingPath('src/deleted.ts')

    expect(runtime.restorePendingModifyFromNative).toHaveBeenCalledWith('src/deleted.ts')
    expect(runtime.restorePendingModifyFromBaseline).toHaveBeenCalledWith('src/deleted.ts')
    expect(runtime.pendingManager.removeByPath).toHaveBeenCalledWith('src/deleted.ts')
  })

  it('discardAllPendingChanges falls back to OPFS baseline for delete records', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      getAll: vi.fn(() => [createPending('p1', 'src/deleted.ts', 'delete')]),
      removeByPath: vi.fn(async () => {}),
    }
    runtime.restorePendingModifyFromNative = vi.fn(async () => false)
    runtime.restorePendingModifyFromBaseline = vi.fn(async () => true)
    runtime.saveMetadata = vi.fn(async () => {})

    await runtime.discardAllPendingChanges()

    expect(runtime.restorePendingModifyFromNative).toHaveBeenCalledWith('src/deleted.ts')
    expect(runtime.restorePendingModifyFromBaseline).toHaveBeenCalledWith('src/deleted.ts')
    expect(runtime.pendingManager.removeByPath).toHaveBeenCalledWith('src/deleted.ts')
  })

  it('discardPendingPath keeps pending when delete baseline cannot be restored', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      getAll: vi.fn(() => [createPending('p1', 'src/deleted.ts', 'delete')]),
      removeByPath: vi.fn(async () => {}),
    }
    runtime.restorePendingModifyFromNative = vi.fn(async () => false)
    runtime.restorePendingModifyFromBaseline = vi.fn(async () => false)
    runtime.saveMetadata = vi.fn(async () => {})

    await expect(runtime.discardPendingPath('src/deleted.ts')).rejects.toThrow('缺少本地文件基线')
    expect(runtime.pendingManager.removeByPath).not.toHaveBeenCalled()
  })
})
