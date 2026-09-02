import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { createCheckpointExecutor, detectConflictsExecutor, rollbackCheckpointExecutor } from '../changeset.tool'

/**
 * Mock boundary: changeset tools resolve their workspace via
 *   resolveConversation → getWorkspaceManager().getWorkspace(workspaceId)
 * (see changeset.tool.ts). The workspace object carries the snapshot /
 * rollback / conflict APIs the tools call through.
 *
 * The old test mocked getActiveConversation from conversation-context.store —
 * that indirection was removed when workspaceId became loop-provided.
 */
const createDraftSnapshotMock = vi.fn()
const rollbackSnapshotMock = vi.fn()
const detectSyncConflictsMock = vi.fn()
const getNativeDirectoryHandleMock = vi.fn()
const updateCurrentCountsMock = vi.fn()
const refreshPendingChangesMock = vi.fn()
const getWorkspaceMock = vi.fn()

vi.mock('@/opfs', () => ({
  getWorkspaceManager: async () => ({
    getWorkspace: getWorkspaceMock,
  }),
}))

vi.mock('@/store/conversation-context.store', () => ({
  useConversationContextStore: {
    getState: () => ({
      updateCurrentCounts: updateCurrentCountsMock,
      refreshPendingChanges: refreshPendingChangesMock,
    }),
  },
}))

vi.mock('../tool-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tool-utils')>()
  return {
    ...actual,
    resolveNativeDirectoryHandleForPath: async (...args: unknown[]) => {
      if (resolveNativeDirectoryHandleForPathMock) {
        return resolveNativeDirectoryHandleForPathMock(...args)
      }
      return { handle: null, nativePath: '' }
    },
  }
})

let resolveNativeDirectoryHandleForPathMock: ((...args: unknown[]) => Promise<unknown>) | null = null

const context: ToolContext = {
  directoryHandle: null,
  workspaceId: 'ws-1',
}

/** Wire the workspace mock to a given fake workspace object. */
function mockWorkspace(workspace: Record<string, unknown> | null) {
  getWorkspaceMock.mockResolvedValue(workspace)
}

describe('checkpoint tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveNativeDirectoryHandleForPathMock = null
    updateCurrentCountsMock.mockResolvedValue(undefined)
    refreshPendingChangesMock.mockResolvedValue(undefined)
    getNativeDirectoryHandleMock.mockResolvedValue(null)
  })

  it('create_checkpoint returns created payload when draft exists', async () => {
    createDraftSnapshotMock.mockResolvedValue({ snapshotId: 'snap_1', opCount: 3 })
    mockWorkspace({ createDraftSnapshot: createDraftSnapshotMock })

    const result = await createCheckpointExecutor({ summary: 'batch update' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.created).toBe(true)
    expect(parsed.checkpointId).toBe('snap_1')
    expect(parsed.opCount).toBe(3)
    expect(createDraftSnapshotMock).toHaveBeenCalledWith('batch update', null)
  })

  it('create_checkpoint passes directoryHandle to createDraftSnapshot', async () => {
    const mockHandle = {} as FileSystemDirectoryHandle
    resolveNativeDirectoryHandleForPathMock = async () => ({ handle: mockHandle, nativePath: '' })
    createDraftSnapshotMock.mockResolvedValue({ snapshotId: 'snap_2', opCount: 1 })
    mockWorkspace({ createDraftSnapshot: createDraftSnapshotMock })

    await createCheckpointExecutor({ summary: 'test' }, context)

    expect(createDraftSnapshotMock).toHaveBeenCalledWith('test', mockHandle)
  })

  it('create_checkpoint returns no-op when no draft exists', async () => {
    createDraftSnapshotMock.mockResolvedValue(null)
    mockWorkspace({ createDraftSnapshot: createDraftSnapshotMock })

    const result = await createCheckpointExecutor({}, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.created).toBe(false)
  })

  it('create_checkpoint errors when no workspace is active', async () => {
    mockWorkspace(null)

    const result = await createCheckpointExecutor({}, { directoryHandle: null })
    const parsed = JSON.parse(result)

    expect(parsed.error).toContain('No active workspace')
  })

  it('rollback_checkpoint validates required checkpoint_id', async () => {
    const result = await rollbackCheckpointExecutor({}, context)
    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('checkpoint_id is required')
  })

  it('rollback_checkpoint returns unresolved paths', async () => {
    rollbackSnapshotMock.mockResolvedValue({ reverted: 1, unresolved: ['src/a.ts'] })
    mockWorkspace({
      rollbackSnapshot: rollbackSnapshotMock,
      getNativeDirectoryHandle: getNativeDirectoryHandleMock,
    })

    const result = await rollbackCheckpointExecutor({ checkpoint_id: 'snap_1' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(false)
    expect(parsed.reverted).toBe(1)
    expect(parsed.unresolved).toEqual(['src/a.ts'])
  })

  it('detect_conflicts returns envelope with no conflicts', async () => {
    detectSyncConflictsMock.mockResolvedValue([])
    resolveNativeDirectoryHandleForPathMock = async () => ({
      handle: {} as FileSystemDirectoryHandle,
      nativePath: '',
    })
    mockWorkspace({ detectSyncConflicts: detectSyncConflictsMock })

    const result = await detectConflictsExecutor(
      {},
      { directoryHandle: {} as FileSystemDirectoryHandle, workspaceId: 'ws-1' }
    )
    const parsed = JSON.parse(result)

    expect(parsed.ok).toBe(true)
    expect(parsed.version).toBe(2)
    expect(parsed.data.hasConflicts).toBe(false)
    expect(parsed.data.conflicts).toEqual([])
  })

  it('detect_conflicts errors without a directory handle', async () => {
    mockWorkspace({ detectSyncConflicts: detectSyncConflictsMock })

    const result = await detectConflictsExecutor({}, context)
    const parsed = JSON.parse(result)

    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('no_directory_handle')
  })

  it('detect_conflicts returns envelope with conflict metadata', async () => {
    detectSyncConflictsMock.mockResolvedValue([
      {
        path: 'src/a.ts',
        opfsMtime: 100,
        currentFsMtime: 200,
      },
    ])
    resolveNativeDirectoryHandleForPathMock = async () => ({
      handle: {} as FileSystemDirectoryHandle,
      nativePath: '',
    })
    mockWorkspace({ detectSyncConflicts: detectSyncConflictsMock })

    const result = await detectConflictsExecutor(
      { paths: ['src/a.ts'] },
      { directoryHandle: {} as FileSystemDirectoryHandle, workspaceId: 'ws-1' }
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
