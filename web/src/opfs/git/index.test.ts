import { beforeEach, describe, expect, it, vi } from 'vitest'

const listSnapshotsMock = vi.fn()
const listSnapshotOpsMock = vi.fn()
const listPendingOpsMock = vi.fn()
const getSnapshotFileContentMock = vi.fn()
const listSnapshotFilesMock = vi.fn()
const getUnsyncedSnapshotsMock = vi.fn()
const getCurrentSnapshotIdMock = vi.fn()
const getSnapshotByIdMock = vi.fn()
const discardPendingPathMock = vi.fn()
const getOrCreateDraftChangesetMock = vi.fn()

const queryFirstMock = vi.fn()
const queryAllMock = vi.fn()
const executeMock = vi.fn()

const workspaceWriteFileMock = vi.fn()
const workspaceDeleteFileMock = vi.fn()
const workspaceDiscardPendingPathMock = vi.fn()
const workspaceDiscardAllPendingChangesMock = vi.fn()
const getWorkspaceMock = vi.fn()

vi.mock('@/sqlite/repositories/fs-overlay.repository', () => ({
  getFSOverlayRepository: () => ({
    listSnapshots: listSnapshotsMock,
    listSnapshotOps: listSnapshotOpsMock,
    listPendingOps: listPendingOpsMock,
    getSnapshotFileContent: getSnapshotFileContentMock,
    listSnapshotFiles: listSnapshotFilesMock,
    getUnsyncedSnapshots: getUnsyncedSnapshotsMock,
    getCurrentSnapshotId: getCurrentSnapshotIdMock,
    getSnapshotById: getSnapshotByIdMock,
    discardPendingPath: discardPendingPathMock,
    getOrCreateDraftChangeset: getOrCreateDraftChangesetMock,
  }),
}))

vi.mock('@/sqlite', () => ({
  getSQLiteDB: () => ({
    queryFirst: queryFirstMock,
    queryAll: queryAllMock,
    execute: executeMock,
  }),
}))

vi.mock('@/opfs', () => ({
  getWorkspaceManager: () => ({
    getWorkspace: getWorkspaceMock,
  }),
}))

import { formatGitDiff, gitDiff, gitRestore, gitStatus } from './index'
import { gitLog } from './index'
import { formatGitShow, gitShow } from './index'

describe('opfs/git gitDiff', () => {
  beforeEach(() => {
    listSnapshotsMock.mockReset()
    listSnapshotOpsMock.mockReset()
    listPendingOpsMock.mockReset()
    getSnapshotFileContentMock.mockReset()
    listSnapshotFilesMock.mockReset()
    getUnsyncedSnapshotsMock.mockReset()
    getCurrentSnapshotIdMock.mockReset()
    getSnapshotByIdMock.mockReset()
    discardPendingPathMock.mockReset()
    getOrCreateDraftChangesetMock.mockReset()
    queryFirstMock.mockReset()
    queryAllMock.mockReset()
    executeMock.mockReset()
    workspaceWriteFileMock.mockReset()
    workspaceDeleteFileMock.mockReset()
    getWorkspaceMock.mockReset()
  })

  it('returns real text line changes for snapshot mode', async () => {
    listSnapshotsMock.mockResolvedValue([
      { id: 'snap_new' },
      { id: 'snap_old' },
    ])
    listSnapshotOpsMock.mockResolvedValue([
      {
        id: 'op1',
        workspaceId: 'ws_1',
        snapshotId: 'snap_new',
        path: 'src/demo.txt',
        type: 'modify',
        status: 'pending',
        fsMtime: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    ])
    getSnapshotFileContentMock.mockResolvedValue({
      snapshotId: 'snap_new',
      workspaceId: 'ws_1',
      path: 'src/demo.txt',
      opType: 'modify',
      beforeContentKind: 'text',
      beforeContentText: 'line1\nold line\nline3\n',
      beforeContentBlob: null,
      afterContentKind: 'text',
      afterContentText: 'line1\nnew line\nline3\n',
      afterContentBlob: null,
    })

    const result = await gitDiff('ws_1', { mode: 'snapshot', snapshotId: 'snap_new' })
    const rendered = formatGitDiff(result)

    expect(result.files).toHaveLength(1)
    expect(result.summary.insertions).toBeGreaterThanOrEqual(1)
    expect(result.summary.deletions).toBeGreaterThanOrEqual(1)
    expect(rendered).toContain('-old line')
    expect(rendered).toContain('+new line')
  })

  it('marks binary snapshot changes clearly', async () => {
    listSnapshotsMock.mockResolvedValue([{ id: 'snap_bin' }])
    listSnapshotOpsMock.mockResolvedValue([
      {
        id: 'op_bin',
        workspaceId: 'ws_1',
        snapshotId: 'snap_bin',
        path: 'assets/logo.png',
        type: 'modify',
        status: 'pending',
        fsMtime: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    ])
    getSnapshotFileContentMock.mockResolvedValue({
      snapshotId: 'snap_bin',
      workspaceId: 'ws_1',
      path: 'assets/logo.png',
      opType: 'modify',
      beforeContentKind: 'binary',
      beforeContentText: null,
      beforeContentBlob: new Uint8Array([1, 2, 3]),
      afterContentKind: 'binary',
      afterContentText: null,
      afterContentBlob: new Uint8Array([4, 5]),
    })

    const result = await gitDiff('ws_1', { mode: 'snapshot', snapshotId: 'snap_bin' })
    const rendered = formatGitDiff(result)

    expect(result.files).toHaveLength(1)
    expect(rendered).toContain('[binary files differ]')
  })

  it('uses unsynced approved snapshots for cached diff instead of first approved snapshot only', async () => {
    listSnapshotsMock.mockResolvedValue([{ id: 'approved_old', status: 'approved' }])
    getUnsyncedSnapshotsMock.mockResolvedValue([
      { snapshotId: 's_new', createdAt: 3, summary: null, opCount: 1 },
      { snapshotId: 's_old', createdAt: 2, summary: null, opCount: 1 },
    ])
    getCurrentSnapshotIdMock.mockResolvedValue('head_1')
    listSnapshotOpsMock.mockImplementation(async (_workspaceId: string, snapshotId: string) => {
      if (snapshotId === 's_new') {
        return [
          {
            id: 'op_new',
            workspaceId: 'ws_1',
            snapshotId: 's_new',
            path: 'src/new.ts',
            type: 'modify',
            status: 'pending',
            fsMtime: 0,
            createdAt: 0,
            updatedAt: 0,
          },
        ]
      }
      if (snapshotId === 's_old') {
        return [
          {
            id: 'op_old',
            workspaceId: 'ws_1',
            snapshotId: 's_old',
            path: 'src/old.ts',
            type: 'modify',
            status: 'pending',
            fsMtime: 0,
            createdAt: 0,
            updatedAt: 0,
          },
        ]
      }
      return []
    })
    getSnapshotFileContentMock.mockImplementation(async (snapshotId: string, path: string) => ({
      snapshotId,
      workspaceId: 'ws_1',
      path,
      opType: 'modify',
      beforeContentKind: 'text',
      beforeContentText: 'before\n',
      beforeContentBlob: null,
      afterContentKind: 'text',
      afterContentText: 'after\n',
      afterContentBlob: null,
    }))

    const result = await gitDiff('ws_1', { mode: 'cached' })

    expect(getUnsyncedSnapshotsMock).toHaveBeenCalledWith('ws_1')
    expect(result.to).toBe('s_new')
    expect(result.from).toBe('head_1')
    expect(result.files.map((f) => f.path)).toContain('src/new.ts')
  })
})

describe('opfs/git gitLog', () => {
  beforeEach(() => {
    listSnapshotsMock.mockReset()
    listSnapshotOpsMock.mockReset()
    listPendingOpsMock.mockReset()
    getSnapshotFileContentMock.mockReset()
    listSnapshotFilesMock.mockReset()
  })

  it('filters snapshots by status', async () => {
    listSnapshotsMock.mockResolvedValue([
      {
        id: 's3',
        workspaceId: 'ws_1',
        status: 'committed',
        summary: 'c',
        source: 'tool',
        createdAt: 3,
        committedAt: 3,
        opCount: 1,
      },
      {
        id: 's2',
        workspaceId: 'ws_1',
        status: 'approved',
        summary: 'b',
        source: 'tool',
        createdAt: 2,
        committedAt: 2,
        opCount: 1,
      },
      {
        id: 's1',
        workspaceId: 'ws_1',
        status: 'rolled_back',
        summary: 'a',
        source: 'tool',
        createdAt: 1,
        committedAt: 1,
        opCount: 1,
      },
    ])

    const result = await gitLog('ws_1', { status: 'approved', limit: 10 })

    expect(result.commits.map((c) => c.id)).toEqual(['s2'])
  })

  it('filters snapshots by path prefix and computes hasMore after filtering', async () => {
    listSnapshotsMock.mockResolvedValue([
      {
        id: 's3',
        workspaceId: 'ws_1',
        status: 'committed',
        summary: 'c',
        source: 'tool',
        createdAt: 3,
        committedAt: 3,
        opCount: 1,
      },
      {
        id: 's2',
        workspaceId: 'ws_1',
        status: 'approved',
        summary: 'b',
        source: 'tool',
        createdAt: 2,
        committedAt: 2,
        opCount: 1,
      },
      {
        id: 's1',
        workspaceId: 'ws_1',
        status: 'committed',
        summary: 'a',
        source: 'tool',
        createdAt: 1,
        committedAt: 1,
        opCount: 1,
      },
    ])

    listSnapshotOpsMock.mockImplementation(async (_workspaceId: string, snapshotId: string) => {
      if (snapshotId === 's3') {
        return [{ path: 'src/a.ts' }]
      }
      if (snapshotId === 's2') {
        return [{ path: 'docs/readme.md' }]
      }
      return [{ path: 'src/b.ts' }]
    })

    const result = await gitLog('ws_1', { path: 'src/', limit: 1 })

    expect(result.commits.map((c) => c.id)).toEqual(['s3'])
    expect(result.hasMore).toBe(true)
  })
})

describe('opfs/git gitShow', () => {
  beforeEach(() => {
    listSnapshotsMock.mockReset()
    listSnapshotOpsMock.mockReset()
    listPendingOpsMock.mockReset()
    getSnapshotFileContentMock.mockReset()
    listSnapshotFilesMock.mockReset()
    getSnapshotByIdMock.mockReset()
  })

  it('includes snapshot diff when includeDiff=true', async () => {
    const snapshot = {
      id: 'snap_1',
      workspaceId: 'ws_1',
      status: 'committed',
      summary: 'update demo',
      source: 'tool',
      createdAt: 1,
      committedAt: 1,
      opCount: 1,
    }
    listSnapshotsMock.mockResolvedValue([snapshot])
    getSnapshotByIdMock.mockResolvedValue(snapshot)
    listSnapshotFilesMock.mockResolvedValue([
      {
        path: 'src/demo.txt',
        opType: 'modify',
        createdAt: 1,
        beforeContentKind: 'text',
        beforeContentSize: 10,
        afterContentKind: 'text',
        afterContentSize: 12,
      },
    ])
    listSnapshotOpsMock.mockResolvedValue([
      {
        id: 'op_1',
        workspaceId: 'ws_1',
        snapshotId: 'snap_1',
        path: 'src/demo.txt',
        type: 'modify',
        status: 'pending',
        fsMtime: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    getSnapshotFileContentMock.mockResolvedValue({
      snapshotId: 'snap_1',
      workspaceId: 'ws_1',
      path: 'src/demo.txt',
      opType: 'modify',
      beforeContentKind: 'text',
      beforeContentText: 'old line\n',
      beforeContentBlob: null,
      afterContentKind: 'text',
      afterContentText: 'new line\n',
      afterContentBlob: null,
    })

    const result = await gitShow('ws_1', 'snap_1', { includeDiff: true })

    expect(result).not.toBeNull()
    expect(result?.diff).toBeDefined()
    const rendered = formatGitShow(result!)
    expect(rendered).toContain('Diff:')
    expect(rendered).toContain('-old line')
    expect(rendered).toContain('+new line')
  })

  it('can load snapshot by exact id even when not in latest snapshot window', async () => {
    listSnapshotsMock.mockResolvedValue([{ id: 'recent_1' }])
    getSnapshotByIdMock.mockResolvedValue({
      id: 'snap_old_exact',
      workspaceId: 'ws_1',
      status: 'committed',
      summary: 'old commit',
      source: 'tool',
      createdAt: 1,
      committedAt: 1,
      opCount: 1,
    })
    listSnapshotFilesMock.mockResolvedValue([])

    const result = await gitShow('ws_1', 'snap_old_exact', { includeDiff: false })

    expect(result).not.toBeNull()
    expect(result?.id).toBe('snap_old_exact')
  })
})

describe('opfs/git gitStatus', () => {
  beforeEach(() => {
    listSnapshotsMock.mockReset()
    listPendingOpsMock.mockReset()
    queryFirstMock.mockReset()
  })

  it('treats all pending ops as unstaged in file list output', async () => {
    listPendingOpsMock.mockResolvedValue([
      {
        id: 'op1',
        workspaceId: 'ws_1',
        path: 'src/a.ts',
        type: 'modify',
        fsMtime: 0,
        timestamp: 0,
        snapshotStatus: 'approved',
      },
    ])
    listSnapshotsMock.mockResolvedValue([])
    queryFirstMock.mockResolvedValue({ name: 'main' })

    const result = await gitStatus('ws_1')

    expect(result.unstaged).toHaveLength(1)
    expect(result.unstaged[0].status).toBe('unstaged')
  })
})

describe('opfs/git gitRestore', () => {
  beforeEach(() => {
    listSnapshotOpsMock.mockReset()
    getSnapshotFileContentMock.mockReset()
    listPendingOpsMock.mockReset()
    getOrCreateDraftChangesetMock.mockReset()
    discardPendingPathMock.mockReset()
    queryAllMock.mockReset()
    executeMock.mockReset()
    workspaceWriteFileMock.mockReset()
    workspaceDeleteFileMock.mockReset()
    workspaceDiscardPendingPathMock.mockReset()
    workspaceDiscardAllPendingChangesMock.mockReset()
    getWorkspaceMock.mockReset()

    getWorkspaceMock.mockResolvedValue({
      writeFile: workspaceWriteFileMock,
      deleteFile: workspaceDeleteFileMock,
      discardPendingPath: workspaceDiscardPendingPathMock,
      discardAllPendingChanges: workspaceDiscardAllPendingChangesMock,
    })
  })

  it('unstages approved pending ops instead of discarding them', async () => {
    queryAllMock.mockResolvedValue([
      { id: 'op1', path: 'src/a.ts' },
      { id: 'op2', path: 'src/b.ts' },
    ])
    getOrCreateDraftChangesetMock.mockResolvedValue('draft_1')

    const result = await gitRestore('ws_1', {
      paths: ['src/a.ts'],
      staged: true,
    })

    expect(discardPendingPathMock).not.toHaveBeenCalled()
    expect(executeMock).toHaveBeenCalled()
    expect(result.message.toLowerCase()).toContain('unstage')
  })

  it('restores snapshot content into workspace files instead of fake restored count', async () => {
    listSnapshotOpsMock.mockResolvedValue([
      {
        id: 'op_mod',
        workspaceId: 'ws_1',
        snapshotId: 'snap_1',
        path: 'src/a.ts',
        type: 'modify',
        status: 'pending',
        fsMtime: 0,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: 'op_del',
        workspaceId: 'ws_1',
        snapshotId: 'snap_1',
        path: 'src/b.ts',
        type: 'delete',
        status: 'pending',
        fsMtime: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    ])
    getSnapshotFileContentMock.mockResolvedValue({
      snapshotId: 'snap_1',
      workspaceId: 'ws_1',
      path: 'src/a.ts',
      opType: 'modify',
      beforeContentKind: 'text',
      beforeContentText: 'old',
      beforeContentBlob: null,
      afterContentKind: 'text',
      afterContentText: 'new',
      afterContentBlob: null,
    })

    const result = await gitRestore('ws_1', {
      paths: ['src/a.ts', 'src/b.ts'],
      snapshotId: 'snap_1',
    })

    expect(workspaceWriteFileMock).toHaveBeenCalledWith('src/a.ts', 'new', undefined)
    expect(workspaceDeleteFileMock).toHaveBeenCalledWith('src/b.ts', undefined)
    expect(result.restored).toBe(2)
  })

  it('unstages all approved pending ops when paths is empty', async () => {
    queryAllMock.mockResolvedValue([
      { id: 'op1', path: 'src/a.ts' },
      { id: 'op2', path: 'src/b.ts' },
    ])
    getOrCreateDraftChangesetMock.mockResolvedValue('draft_1')

    const result = await gitRestore('ws_1', {
      paths: [],
      staged: true,
    })

    expect(executeMock).toHaveBeenCalledTimes(2)
    expect(result.unstaged).toBe(2)
    expect(result.message).toBe('Unstaged 2 of 2 path(s)')
  })

  it('restores all snapshot paths when paths is empty', async () => {
    listSnapshotOpsMock.mockResolvedValue([
      {
        id: 'op_mod',
        workspaceId: 'ws_1',
        snapshotId: 'snap_1',
        path: 'src/a.ts',
        type: 'modify',
        status: 'pending',
        fsMtime: 0,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: 'op_del',
        workspaceId: 'ws_1',
        snapshotId: 'snap_1',
        path: 'src/b.ts',
        type: 'delete',
        status: 'pending',
        fsMtime: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    ])
    getSnapshotFileContentMock.mockResolvedValue({
      snapshotId: 'snap_1',
      workspaceId: 'ws_1',
      path: 'src/a.ts',
      opType: 'modify',
      beforeContentKind: 'text',
      beforeContentText: 'old',
      beforeContentBlob: null,
      afterContentKind: 'text',
      afterContentText: 'new',
      afterContentBlob: null,
    })

    const result = await gitRestore('ws_1', {
      paths: [],
      snapshotId: 'snap_1',
    })

    expect(workspaceWriteFileMock).toHaveBeenCalledWith('src/a.ts', 'new', undefined)
    expect(workspaceDeleteFileMock).toHaveBeenCalledWith('src/b.ts', undefined)
    expect(result.restored).toBe(2)
    expect(result.message).toBe('Restored 2 of 2 file(s) from snapshot')
  })

  it('discards all pending paths through workspace runtime when paths is empty', async () => {
    listPendingOpsMock.mockResolvedValue([
      {
        id: 'op1',
        workspaceId: 'ws_1',
        path: 'src/new.ts',
        type: 'create',
        fsMtime: 0,
        timestamp: 0,
      },
      {
        id: 'op2',
        workspaceId: 'ws_1',
        path: 'src/existing.ts',
        type: 'modify',
        fsMtime: 0,
        timestamp: 0,
      },
    ])

    const result = await gitRestore('ws_1', {
      paths: [],
    })

    expect(workspaceDiscardAllPendingChangesMock).toHaveBeenCalledTimes(1)
    expect(workspaceDiscardPendingPathMock).not.toHaveBeenCalled()
    expect(discardPendingPathMock).not.toHaveBeenCalled()
    expect(result.discarded).toBe(2)
    expect(result.message).toBe('Discarded 2 of 2 file(s) from working tree')
  })
})
