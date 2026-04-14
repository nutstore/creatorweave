import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceRuntime } from '../workspace-runtime'

const repoMock = vi.hoisted(() => ({
  listActivePendingOps: vi.fn(),
  updatePendingFsMtime: vi.fn(),
}))

vi.mock('@/sqlite/repositories/fs-overlay.repository', () => ({
  getFSOverlayRepository: () => repoMock,
}))

describe('WorkspaceRuntime native bind rebase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rebases fs_mtime for pending modify/delete when native still equals baseline', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      reload: vi.fn(async () => {}),
    }
    runtime.readFromBaselineDir = vi.fn(async (path: string) => {
      if (path === 'src/a.ts') {
        return { content: 'base-a', mtime: 1, size: 6, contentType: 'text' }
      }
      if (path === 'src/b.ts') {
        return { content: 'base-b', mtime: 1, size: 6, contentType: 'text' }
      }
      return null
    })
    runtime.readFromNativeFS = vi.fn(async (path: string) => {
      if (path === 'src/a.ts') {
        return { content: 'base-a', metadata: { path, mtime: 200, size: 6, contentType: 'text' } }
      }
      if (path === 'src/b.ts') {
        return { content: 'changed-b', metadata: { path, mtime: 300, size: 8, contentType: 'text' } }
      }
      throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' })
    })

    repoMock.listActivePendingOps.mockResolvedValue([
      {
        id: 'op1',
        workspaceId: 'w1',
        path: '/mnt/src/a.ts',
        type: 'modify',
        status: 'pending',
        fsMtime: 100,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'op2',
        workspaceId: 'w1',
        path: 'src/b.ts',
        type: 'delete',
        status: 'pending',
        fsMtime: 100,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'op3',
        workspaceId: 'w1',
        path: 'src/c.ts',
        type: 'create',
        status: 'pending',
        fsMtime: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ])

    const result = await runtime.rebindPendingBaselinesToNative({} as FileSystemDirectoryHandle)

    expect(repoMock.updatePendingFsMtime).toHaveBeenCalledTimes(1)
    expect(repoMock.updatePendingFsMtime).toHaveBeenCalledWith('op1', 200)
    expect(result).toEqual({
      checked: 2,
      rebased: 1,
      skipped: 1,
      conflicts: 1,
    })
    expect(runtime.pendingManager.reload).toHaveBeenCalledTimes(1)
  })

  it('returns empty summary when native handle is unavailable', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.getNativeDirectoryHandle = vi.fn(async () => null)

    const result = await runtime.rebindPendingBaselinesToNative()

    expect(result).toEqual({
      checked: 0,
      rebased: 0,
      skipped: 0,
      conflicts: 0,
    })
    expect(repoMock.listActivePendingOps).not.toHaveBeenCalled()
  })
})

