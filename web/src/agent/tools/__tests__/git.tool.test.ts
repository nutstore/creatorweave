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

  it('git_log validates limit', async () => {
    const raw = await gitLogExecutor({ limit: -1 }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
  })

  it('git_show validates include_diff type', async () => {
    const raw = await gitShowExecutor({ include_diff: 'yes' }, context)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('invalid_arguments')
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

  it('returns no_active_workspace when workspace missing', async () => {
    const raw = await gitStatusExecutor({}, { directoryHandle: null } as ToolContext)
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('no_active_workspace')
  })
})
