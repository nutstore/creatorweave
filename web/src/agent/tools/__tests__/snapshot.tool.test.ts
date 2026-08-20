import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import {
  snapshotDiffExecutor,
  snapshotLogExecutor,
  snapshotRestoreExecutor,
  snapshotShowExecutor,
  snapshotStatusExecutor,
} from '../snapshot.tool'

const mocked = vi.hoisted(() => ({
  snapshotStatusMock: vi.fn(),
  formatSnapshotStatusMock: vi.fn(),
  snapshotDiffMock: vi.fn(),
  formatSnapshotDiffMock: vi.fn(),
  snapshotLogMock: vi.fn(),
  formatSnapshotLogMock: vi.fn(),
  formatSnapshotLogOnelineMock: vi.fn(),
  snapshotShowMock: vi.fn(),
  formatSnapshotShowMock: vi.fn(),
  snapshotRestoreMock: vi.fn(),
  formatSnapshotRestoreMock: vi.fn(),
  updateCurrentCountsMock: vi.fn(),
  refreshPendingChangesMock: vi.fn(),
}))

vi.mock('@/opfs/snapshot', () => ({
  snapshotStatus: mocked.snapshotStatusMock,
  formatSnapshotStatus: mocked.formatSnapshotStatusMock,
  snapshotDiff: mocked.snapshotDiffMock,
  formatSnapshotDiff: mocked.formatSnapshotDiffMock,
  snapshotLog: mocked.snapshotLogMock,
  formatSnapshotLog: mocked.formatSnapshotLogMock,
  formatSnapshotLogOneline: mocked.formatSnapshotLogOnelineMock,
  snapshotShow: mocked.snapshotShowMock,
  formatSnapshotShow: mocked.formatSnapshotShowMock,
  snapshotRestore: mocked.snapshotRestoreMock,
  formatSnapshotRestore: mocked.formatSnapshotRestoreMock,
}))

vi.mock('@/store/conversation-context.store', () => ({
  useConversationContextStore: {
    getState: () => ({
      updateCurrentCounts: mocked.updateCurrentCountsMock,
      refreshPendingChanges: mocked.refreshPendingChangesMock,
    }),
  },
}))

const context = {
  workspaceId: 'ws_1',
  projectId: 'project_1',
  directoryHandle: null,
} as ToolContext

describe('snapshot.tool envelope + validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.formatSnapshotStatusMock.mockReturnValue('status text')
    mocked.formatSnapshotDiffMock.mockReturnValue('diff text')
    mocked.formatSnapshotLogMock.mockReturnValue('log text')
    mocked.formatSnapshotLogOnelineMock.mockReturnValue('log one line')
    mocked.formatSnapshotShowMock.mockReturnValue('show text')
    mocked.formatSnapshotRestoreMock.mockReturnValue('restore text')
    mocked.snapshotStatusMock.mockResolvedValue({ branch: 'main' })
    mocked.snapshotDiffMock.mockResolvedValue({ files: [] })
    mocked.snapshotLogMock.mockResolvedValue({ commits: [] })
    mocked.snapshotShowMock.mockResolvedValue({ id: 's1' })
    mocked.snapshotRestoreMock.mockResolvedValue({ restored: 0, discarded: 0, message: 'ok' })
  })

  it('snapshot_status returns envelope success', async () => {
    const raw = await snapshotStatusExecutor({}, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(parsed.tool).toBe('snapshot_status')
  })

  it('snapshot_status validates format', async () => {
    const raw = await snapshotStatusExecutor({ format: 'xml' }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('snapshot_diff validates mode', async () => {
    const raw = await snapshotDiffExecutor({ mode: 'xxx' }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('snapshot_diff forwards directoryHandle to opfs snapshotDiff', async () => {
    const directoryHandle = {} as FileSystemDirectoryHandle
    const raw = await snapshotDiffExecutor({ mode: 'working' }, { workspaceId: 'ws_1', directoryHandle } as ToolContext)
    const parsed = JSON.parse(raw)

    expect(parsed.ok).toBe(true)
    expect(mocked.snapshotDiffMock).toHaveBeenCalledWith(
      'ws_1',
      expect.objectContaining({
        mode: 'working',
      })
    )
  })

  it('snapshot_diff supports cached=true alias and render flags', async () => {
    const raw = await snapshotDiffExecutor(
      { cached: true, name_only: true, patch: false, unified: 0 },
      context
    )
    const parsed = JSON.parse(raw)

    expect(parsed.ok).toBe(true)
    expect(mocked.snapshotDiffMock).toHaveBeenCalledWith(
      'ws_1',
      expect.objectContaining({
        mode: 'cached',
        contextLines: 0,
      })
    )
    expect(mocked.formatSnapshotDiffMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        nameOnly: true,
        patch: false,
      })
    )
  })

  it('snapshot_diff validates conflicting name flags', async () => {
    const raw = await snapshotDiffExecutor({ name_only: true, name_status: true }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('snapshot_diff validates unified argument', async () => {
    const raw = await snapshotDiffExecutor({ unified: -1 }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('snapshot_log validates limit', async () => {
    const raw = await snapshotLogExecutor({ limit: -1 }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('snapshot_log calls snapshotLog with projectId', async () => {
    const raw = await snapshotLogExecutor({ limit: 5 }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(mocked.snapshotLogMock).toHaveBeenCalledWith(
      'project_1',
      expect.objectContaining({
        limit: 5,
      })
    )
  })

  it('snapshot_show validates include_diff type', async () => {
    const raw = await snapshotShowExecutor({ include_diff: 'yes' }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('snapshot_show calls snapshotShow with projectId', async () => {
    const raw = await snapshotShowExecutor({ snapshot_id: 's1' }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(mocked.snapshotShowMock).toHaveBeenCalledWith(
      'project_1',
      's1',
      expect.objectContaining({
        includeDiff: false,
      })
    )
  })

  it('snapshot_restore accepts empty paths and applies to all eligible paths', async () => {
    const raw = await snapshotRestoreExecutor({ paths: [] }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(mocked.snapshotRestoreMock).toHaveBeenCalledWith(
      'ws_1',
      expect.objectContaining({
        paths: [],
      })
    )
  })

  it('snapshot_restore accepts omitted paths and applies to all eligible paths', async () => {
    const raw = await snapshotRestoreExecutor({}, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(mocked.snapshotRestoreMock).toHaveBeenCalledWith(
      'ws_1',
      expect.objectContaining({
        paths: [],
      })
    )
  })

  it('returns no_active_workspace when workspace missing (snapshot_status)', async () => {
    const raw = await snapshotStatusExecutor({}, { directoryHandle: null } as ToolContext)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('no_active_workspace')
  })

  it('returns no_active_project when project missing (snapshot_log)', async () => {
    const raw = await snapshotLogExecutor({}, { workspaceId: 'ws_1', directoryHandle: null } as ToolContext)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('no_active_project')
  })

  it('returns no_active_project when project missing (snapshot_show)', async () => {
    const raw = await snapshotShowExecutor({}, { workspaceId: 'ws_1', directoryHandle: null } as ToolContext)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('no_active_project')
  })
})
