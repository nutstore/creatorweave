import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { createSnapshotExecutor, rollbackSnapshotExecutor } from '../changeset.tool'

const createDraftSnapshotMock = vi.fn()
const rollbackSnapshotMock = vi.fn()
const updateCurrentCountsMock = vi.fn()
const refreshPendingChangesMock = vi.fn()
const getActiveConversationMock = vi.fn()

vi.mock('@/store/conversation-context.store', () => ({
  getActiveConversation: () => getActiveConversationMock(),
  useConversationContextStore: {
    getState: () => ({
      updateCurrentCounts: updateCurrentCountsMock,
      refreshPendingChanges: refreshPendingChangesMock,
    }),
  },
}))

const context: ToolContext = {
  directoryHandle: null,
}

describe('snapshot tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateCurrentCountsMock.mockResolvedValue(undefined)
    refreshPendingChangesMock.mockResolvedValue(undefined)
  })

  it('create_snapshot returns created payload when draft exists', async () => {
    createDraftSnapshotMock.mockResolvedValue({ snapshotId: 'snap_1', opCount: 3 })
    getActiveConversationMock.mockResolvedValue({
      conversation: { createDraftSnapshot: createDraftSnapshotMock },
    })

    const result = await createSnapshotExecutor({ summary: 'batch update' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.created).toBe(true)
    expect(parsed.snapshotId).toBe('snap_1')
    expect(parsed.opCount).toBe(3)
  })

  it('create_snapshot returns no-op when no draft exists', async () => {
    createDraftSnapshotMock.mockResolvedValue(null)
    getActiveConversationMock.mockResolvedValue({
      conversation: { createDraftSnapshot: createDraftSnapshotMock },
    })

    const result = await createSnapshotExecutor({}, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.created).toBe(false)
  })

  it('rollback_snapshot validates required snapshot_id', async () => {
    const result = await rollbackSnapshotExecutor({}, context)
    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('snapshot_id is required')
  })

  it('rollback_snapshot returns unresolved paths', async () => {
    rollbackSnapshotMock.mockResolvedValue({ reverted: 1, unresolved: ['src/a.ts'] })
    getActiveConversationMock.mockResolvedValue({
      conversation: {
        rollbackSnapshot: rollbackSnapshotMock,
        getNativeDirectoryHandle: vi.fn().mockResolvedValue(null),
      },
    })

    const result = await rollbackSnapshotExecutor({ snapshot_id: 'snap_1' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(false)
    expect(parsed.reverted).toBe(1)
    expect(parsed.unresolved).toEqual(['src/a.ts'])
  })
})
