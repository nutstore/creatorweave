import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { createCheckpointExecutor, detectConflictsExecutor, rollbackCheckpointExecutor } from '../changeset.tool'

const createDraftSnapshotMock = vi.fn()
const rollbackSnapshotMock = vi.fn()
const updateCurrentCountsMock = vi.fn()
const refreshPendingChangesMock = vi.fn()
const getActiveConversationMock = vi.fn()
const resolveNativeDirectoryHandleForPathMock = vi.fn()

vi.mock('@/store/conversation-context.store', () => ({
  getActiveConversation: () => getActiveConversationMock(),
  useConversationContextStore: {
    getState: () => ({
      updateCurrentCounts: updateCurrentCountsMock,
      refreshPendingChanges: refreshPendingChangesMock,
    }),
  },
}))

vi.mock('../tool-utils', () => ({
  resolveNativeDirectoryHandleForPath: (...args: unknown[]) => resolveNativeDirectoryHandleForPathMock(...args),
}))

const context: ToolContext = {
  directoryHandle: null,
}

describe('checkpoint tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateCurrentCountsMock.mockResolvedValue(undefined)
    refreshPendingChangesMock.mockResolvedValue(undefined)
    resolveNativeDirectoryHandleForPathMock.mockResolvedValue({ handle: null, nativePath: '' })
  })

  it('create_checkpoint returns created payload when draft exists', async () => {
    createDraftSnapshotMock.mockResolvedValue({ snapshotId: 'snap_1', opCount: 3 })
    getActiveConversationMock.mockResolvedValue({
      conversation: { createDraftSnapshot: createDraftSnapshotMock },
    })

    const result = await createCheckpointExecutor({ summary: 'batch update' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.created).toBe(true)
    expect(parsed.checkpointId).toBe('snap_1')
    expect(parsed.opCount).toBe(3)
    // Verify directoryHandle was passed to createDraftSnapshot
    expect(createDraftSnapshotMock).toHaveBeenCalledWith('batch update', null)
  })

  it('create_checkpoint passes directoryHandle to createDraftSnapshot', async () => {
    const mockHandle = {} as FileSystemDirectoryHandle
    resolveNativeDirectoryHandleForPathMock.mockResolvedValue({ handle: mockHandle, nativePath: '' })
    createDraftSnapshotMock.mockResolvedValue({ snapshotId: 'snap_2', opCount: 1 })
    getActiveConversationMock.mockResolvedValue({
      conversation: { createDraftSnapshot: createDraftSnapshotMock },
    })

    await createCheckpointExecutor({ summary: 'test' }, context)

    expect(createDraftSnapshotMock).toHaveBeenCalledWith('test', mockHandle)
  })

  it('create_checkpoint returns no-op when no draft exists', async () => {
    createDraftSnapshotMock.mockResolvedValue(null)
    getActiveConversationMock.mockResolvedValue({
      conversation: { createDraftSnapshot: createDraftSnapshotMock },
    })

    const result = await createCheckpointExecutor({}, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.created).toBe(false)
  })

  it('rollback_checkpoint validates required checkpoint_id', async () => {
    const result = await rollbackCheckpointExecutor({}, context)
    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('checkpoint_id is required')
  })

  it('rollback_checkpoint returns unresolved paths', async () => {
    rollbackSnapshotMock.mockResolvedValue({ reverted: 1, unresolved: ['src/a.ts'] })
    getActiveConversationMock.mockResolvedValue({
      conversation: {
        rollbackSnapshot: rollbackSnapshotMock,
        getNativeDirectoryHandle: vi.fn().mockResolvedValue(null),
      },
    })

    const result = await rollbackCheckpointExecutor({ checkpoint_id: 'snap_1' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(false)
    expect(parsed.reverted).toBe(1)
    expect(parsed.unresolved).toEqual(['src/a.ts'])
  })

  it('detect_conflicts returns envelope with no conflicts', async () => {
    const detectSyncConflictsMock = vi.fn().mockResolvedValue([])
    getActiveConversationMock.mockResolvedValue({
      conversation: { detectSyncConflicts: detectSyncConflictsMock },
    })

    const result = await detectConflictsExecutor({}, { directoryHandle: {} as FileSystemDirectoryHandle })
    const parsed = JSON.parse(result)

    expect(parsed.ok).toBe(true)
    expect(parsed.version).toBe(2)
    expect(parsed.data.hasConflicts).toBe(false)
    expect(parsed.data.conflicts).toEqual([])
  })

  it('detect_conflicts returns envelope with conflict metadata', async () => {
    const detectSyncConflictsMock = vi.fn().mockResolvedValue([
      {
        path: 'src/a.ts',
        opfsMtime: 100,
        currentFsMtime: 200,
      },
    ])
    getActiveConversationMock.mockResolvedValue({
      conversation: { detectSyncConflicts: detectSyncConflictsMock },
    })

    const result = await detectConflictsExecutor(
      { paths: ['src/a.ts'] },
      { directoryHandle: {} as FileSystemDirectoryHandle }
    )
    const parsed = JSON.parse(result)

    expect(parsed.ok).toBe(true)
    expect(parsed.version).toBe(2)
    expect(parsed.meta.requiresResolution).toBe(true)
    expect(parsed.data.hasConflicts).toBe(true)
    expect(parsed.data.conflicts[0].conflictType).toBe('mtime_or_marker')
    expect(parsed.data.conflicts[0].resolvableByEdit).toBe(true)
  })
})
