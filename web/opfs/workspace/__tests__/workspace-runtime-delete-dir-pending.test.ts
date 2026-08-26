import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceRuntime } from '../workspace-runtime'

/**
 * deleteDirPending — 目录级 pending delete 记录。
 *
 * 背景：deleteDir() 逐文件记录 pending，但空目录树（0 文件）不产生任何
 * 记录，sync 的 pruneEmptyParents 无锚点可触发，磁盘空目录永远残留。
 * deleteDirPending 把目录路径本身记为 pending delete（fsMtime=0 跳过
 * 冲突检查；回滚按 ghost delete 处理，无基线即静默清理）。
 */
describe('WorkspaceRuntime deleteDirPending', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks the directory path as pending delete with fsMtime 0 (native mode)', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.hasAnyNativeDirectoryHandle = vi.fn(async () => true)
    runtime.pendingManager = {
      markForDeletion: vi.fn(async () => {}),
    }
    runtime.saveMetadata = vi.fn(async () => {})

    await runtime.deleteDirPending('rootName/web/src')

    // fsMtime=0 → sync 冲突检查天然跳过；路径保持原样（normalizeWorkspacePath）
    expect(runtime.pendingManager.markForDeletion).toHaveBeenCalledWith('rootName/web/src', 0)
    expect(runtime.saveMetadata).toHaveBeenCalled()
  })

  it('is a no-op record in pure OPFS mode (no native root mounted)', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.hasAnyNativeDirectoryHandle = vi.fn(async () => false)
    runtime.pendingManager = {
      markForDeletion: vi.fn(async () => {}),
    }
    runtime.deleteFromFilesDirIfExists = vi.fn(async () => {})
    runtime.saveMetadata = vi.fn(async () => {})

    await runtime.deleteDirPending('web/src')

    // 纯 OPFS 模式没有磁盘侧可删，也不应产生 pending 记录
    expect(runtime.pendingManager.markForDeletion).not.toHaveBeenCalled()
  })

  it('pure OPFS mode still prunes the OPFS files/ side best-effort', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.hasAnyNativeDirectoryHandle = vi.fn(async () => false)
    runtime.pendingManager = {
      markForDeletion: vi.fn(async () => {}),
    }
    runtime.deleteFromFilesDirIfExists = vi.fn(async () => {})
    runtime.saveMetadata = vi.fn(async () => {})

    await runtime.deleteDirPending('web/src')

    expect(runtime.deleteFromFilesDirIfExists).toHaveBeenCalledWith('web/src')
  })

  it('tolerates missing files/ representation in pure OPFS mode', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.hasAnyNativeDirectoryHandle = vi.fn(async () => false)
    runtime.pendingManager = {
      markForDeletion: vi.fn(async () => {}),
    }
    // files/ 里没有该目录 → deleteFromFilesDir 抛 NotFoundError，应被吞掉
    runtime.deleteFromFilesDirIfExists = vi.fn(async () => {
      throw new Error('NotFoundError')
    })
    runtime.saveMetadata = vi.fn(async () => {})

    await expect(runtime.deleteDirPending('web/src')).resolves.toBeUndefined()
  })

  it('cancels out when the directory already has a pending create record', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.hasAnyNativeDirectoryHandle = vi.fn(async () => true)
    const discardPendingPath = vi.fn(async () => {})
    runtime.pendingManager = {
      markForDeletion: vi.fn(async () => {}),
      pendingChanges: new Map([
        ['rootName/web/src', { id: 'p1', path: 'rootName/web/src', type: 'create', fsMtime: 0, timestamp: 1 }],
      ]),
      removePendingPath: vi.fn(),
      discardPendingPath,
    }
    runtime.saveMetadata = vi.fn(async () => {})

    // markForDeletion 内部对 create→delete 的抵消逻辑在真实 manager 中，
    // 这里 mock 之外验证 runtime 侧不会崩溃即可
    await runtime.deleteDirPending('rootName/web/src')
    expect(runtime.pendingManager.markForDeletion).toHaveBeenCalledWith('rootName/web/src', 0)
  })
})
