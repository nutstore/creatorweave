import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import {
  gitDiffExecutor,
  gitLogExecutor,
  gitRestoreExecutor,
  gitShowExecutor,
  gitStatusExecutor,
} from '../git.tool'

const mocked = vi.hoisted(() => ({
  gitStatusMock: vi.fn(),
  formatGitStatusMock: vi.fn(),
  gitDiffMock: vi.fn(),
  formatGitDiffMock: vi.fn(),
  gitLogMock: vi.fn(),
  formatGitLogMock: vi.fn(),
  formatGitLogOnelineMock: vi.fn(),
  gitShowMock: vi.fn(),
  formatGitShowMock: vi.fn(),
  gitRestoreMock: vi.fn(),
  formatGitRestoreMock: vi.fn(),
  updateCurrentCountsMock: vi.fn(),
  refreshPendingChangesMock: vi.fn(),
}))

vi.mock('@/opfs/git', () => ({
  gitStatus: mocked.gitStatusMock,
  formatGitStatus: mocked.formatGitStatusMock,
  gitDiff: mocked.gitDiffMock,
  formatGitDiff: mocked.formatGitDiffMock,
  gitLog: mocked.gitLogMock,
  formatGitLog: mocked.formatGitLogMock,
  formatGitLogOneline: mocked.formatGitLogOnelineMock,
  gitShow: mocked.gitShowMock,
  formatGitShow: mocked.formatGitShowMock,
  gitRestore: mocked.gitRestoreMock,
  formatGitRestore: mocked.formatGitRestoreMock,
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

describe('git.tool envelope + validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.formatGitStatusMock.mockReturnValue('status text')
    mocked.formatGitDiffMock.mockReturnValue('diff text')
    mocked.formatGitLogMock.mockReturnValue('log text')
    mocked.formatGitLogOnelineMock.mockReturnValue('log one line')
    mocked.formatGitShowMock.mockReturnValue('show text')
    mocked.formatGitRestoreMock.mockReturnValue('restore text')
    mocked.gitStatusMock.mockResolvedValue({ branch: 'main' })
    mocked.gitDiffMock.mockResolvedValue({ files: [] })
    mocked.gitLogMock.mockResolvedValue({ commits: [] })
    mocked.gitShowMock.mockResolvedValue({ id: 's1' })
    mocked.gitRestoreMock.mockResolvedValue({ restored: 0, discarded: 0, message: 'ok' })
  })

  it('git_status returns envelope success', async () => {
    const raw = await gitStatusExecutor({}, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(parsed.tool).toBe('git_status')
  })

  it('git_status validates format', async () => {
    const raw = await gitStatusExecutor({ format: 'xml' }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('git_diff validates mode', async () => {
    const raw = await gitDiffExecutor({ mode: 'xxx' }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('git_diff forwards directoryHandle to opfs gitDiff', async () => {
    const directoryHandle = {} as FileSystemDirectoryHandle
    const raw = await gitDiffExecutor({ mode: 'working' }, { workspaceId: 'ws_1', directoryHandle } as ToolContext)
    const parsed = JSON.parse(raw)

    expect(parsed.ok).toBe(true)
    expect(mocked.gitDiffMock).toHaveBeenCalledWith(
      'ws_1',
      expect.objectContaining({
        mode: 'working',
      })
    )
  })

  it('git_diff supports cached=true alias and render flags', async () => {
    const raw = await gitDiffExecutor(
      { cached: true, name_only: true, patch: false, unified: 0 },
      context
    )
    const parsed = JSON.parse(raw)

    expect(parsed.ok).toBe(true)
    expect(mocked.gitDiffMock).toHaveBeenCalledWith(
      'ws_1',
      expect.objectContaining({
        mode: 'cached',
        contextLines: 0,
      })
    )
    expect(mocked.formatGitDiffMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        nameOnly: true,
        patch: false,
      })
    )
  })

  it('git_diff validates conflicting name flags', async () => {
    const raw = await gitDiffExecutor({ name_only: true, name_status: true }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('git_diff validates unified argument', async () => {
    const raw = await gitDiffExecutor({ unified: -1 }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('git_log validates limit', async () => {
    const raw = await gitLogExecutor({ limit: -1 }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('git_log calls gitLog with projectId', async () => {
    const raw = await gitLogExecutor({ limit: 5 }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(mocked.gitLogMock).toHaveBeenCalledWith(
      'project_1',
      expect.objectContaining({
        limit: 5,
      })
    )
  })

  it('git_show validates include_diff type', async () => {
    const raw = await gitShowExecutor({ include_diff: 'yes' }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('git_show calls gitShow with projectId', async () => {
    const raw = await gitShowExecutor({ snapshot_id: 's1' }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(mocked.gitShowMock).toHaveBeenCalledWith(
      'project_1',
      's1',
      expect.objectContaining({
        includeDiff: false,
      })
    )
  })

  it('git_restore accepts empty paths and applies to all eligible paths', async () => {
    const raw = await gitRestoreExecutor({ paths: [] }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(mocked.gitRestoreMock).toHaveBeenCalledWith(
      'ws_1',
      expect.objectContaining({
        paths: [],
      })
    )
  })

  it('git_restore accepts omitted paths and applies to all eligible paths', async () => {
    const raw = await gitRestoreExecutor({}, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(mocked.gitRestoreMock).toHaveBeenCalledWith(
      'ws_1',
      expect.objectContaining({
        paths: [],
      })
    )
  })

  it('returns no_active_workspace when workspace missing (git_status)', async () => {
    const raw = await gitStatusExecutor({}, { directoryHandle: null } as ToolContext)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('no_active_workspace')
  })

  it('returns no_active_project when project missing (git_log)', async () => {
    const raw = await gitLogExecutor({}, { workspaceId: 'ws_1', directoryHandle: null } as ToolContext)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('no_active_project')
  })

  it('returns no_active_project when project missing (git_show)', async () => {
    const raw = await gitShowExecutor({}, { workspaceId: 'ws_1', directoryHandle: null } as ToolContext)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('no_active_project')
  })
})
