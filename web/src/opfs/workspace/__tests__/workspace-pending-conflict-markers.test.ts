import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspacePendingManager } from '../workspace-pending'
import { CONFLICT_MARKER_END, CONFLICT_MARKER_MIDDLE, CONFLICT_MARKER_START } from '../conflict-markers'

const createSyncBatchMock = vi.fn(async () => 'batch-1')
const recordSyncItemMock = vi.fn(async () => undefined)
const keepOpPendingMock = vi.fn(async () => undefined)
const markOpSyncedMock = vi.fn(async () => undefined)
const finalizeSyncBatchMock = vi.fn(async () => undefined)

vi.mock('@/sqlite/repositories/fs-overlay.repository', () => ({
  getFSOverlayRepository: () => ({
    createSyncBatch: createSyncBatchMock,
    recordSyncItem: recordSyncItemMock,
    keepOpPending: keepOpPendingMock,
    markOpSynced: markOpSyncedMock,
    finalizeSyncBatch: finalizeSyncBatchMock,
  }),
}))

function createManager(): WorkspacePendingManager {
  const manager = new WorkspacePendingManager('w1', {} as FileSystemDirectoryHandle) as any
  manager.initialized = true
  manager.pendingChanges = new Map([
    [
      'src/a.ts',
      {
        id: 'pending-1',
        path: 'src/a.ts',
        type: 'modify',
        fsMtime: 123,
        timestamp: 123,
        reviewStatus: 'approved',
      },
    ],
  ])
  manager.pendingIdToPath = new Map([['pending-1', 'src/a.ts']])
  return manager
}

describe('WorkspacePendingManager conflict markers', () => {
  beforeEach(() => {
    createSyncBatchMock.mockClear()
    recordSyncItemMock.mockClear()
    keepOpPendingMock.mockClear()
    markOpSyncedMock.mockClear()
    finalizeSyncBatchMock.mockClear()
  })

  it('blocks sync when unresolved conflict markers still exist', async () => {
    const manager = createManager() as any
    manager.checkNativeConflict = vi.fn(async () => ({ isConflict: false, currentFsMtime: 123 }))
    manager.readCacheContent = vi.fn(
      async () =>
        `${CONFLICT_MARKER_START}\n` +
        'left\n' +
        `${CONFLICT_MARKER_MIDDLE}\n` +
        'right\n' +
        `${CONFLICT_MARKER_END}\n`
    )
    manager.writeFile = vi.fn(async () => {})

    const result = await manager.sync(
      {} as FileSystemDirectoryHandle,
      {
        read: vi.fn(async () => ({ content: null })),
      },
      undefined,
      false
    )

    expect(result.success).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].path).toBe('src/a.ts')
    expect(manager.writeFile).not.toHaveBeenCalled()
    expect(keepOpPendingMock).toHaveBeenCalledWith(
      'pending-1',
      expect.stringContaining('未解决冲突标记')
    )
  })
})
