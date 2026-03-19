import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionWorkspace } from '../session-workspace'

const listSnapshotsMock = vi.fn()
const setCurrentSnapshotIdMock = vi.fn()

vi.mock('@/sqlite/repositories/fs-overlay.repository', () => ({
  getFSOverlayRepository: () => ({
    listSnapshots: listSnapshotsMock,
    setCurrentSnapshotId: setCurrentSnapshotIdMock,
  }),
}))

function createWorkspaceForSwitch() {
  const workspace: any = Object.create(SessionWorkspace.prototype)
  workspace.initialized = true
  workspace.sessionId = 'ws_1'
  workspace.initialize = vi.fn(async () => undefined)
  workspace.rollbackSnapshot = vi.fn()
  workspace.applySnapshot = vi.fn()
  return workspace
}

describe('SessionWorkspace switchToSnapshot', () => {
  beforeEach(() => {
    listSnapshotsMock.mockReset()
    setCurrentSnapshotIdMock.mockReset()
  })

  it('rolls backward from latest to older target in order', async () => {
    const workspace = createWorkspaceForSwitch()
    listSnapshotsMock.mockResolvedValue([
      { id: 's3', status: 'approved' },
      { id: 's2', status: 'approved' },
      { id: 's1', status: 'approved' },
    ])
    workspace.rollbackSnapshot.mockResolvedValue({ reverted: 1, unresolved: [] })

    const result = await workspace.switchToSnapshot('s1')

    expect(result.direction).toBe('backward')
    expect(result.rolledBackSnapshotIds).toEqual(['s3', 's2'])
    expect(workspace.rollbackSnapshot).toHaveBeenNthCalledWith(1, 's3', undefined)
    expect(workspace.rollbackSnapshot).toHaveBeenNthCalledWith(2, 's2', undefined)
  })

  it('rolls forward from older pointer to newer target in order', async () => {
    const workspace = createWorkspaceForSwitch()
    listSnapshotsMock.mockResolvedValue([
      { id: 's3', status: 'rolled_back' },
      { id: 's2', status: 'rolled_back' },
      { id: 's1', status: 'approved' },
    ])
    workspace.applySnapshot.mockResolvedValue({ applied: 1, unresolved: [] })

    const result = await workspace.switchToSnapshot('s3')

    expect(result.direction).toBe('forward')
    expect(result.appliedSnapshotIds).toEqual(['s2', 's3'])
    expect(workspace.applySnapshot).toHaveBeenNthCalledWith(1, 's2', undefined)
    expect(workspace.applySnapshot).toHaveBeenNthCalledWith(2, 's3', undefined)
  })

  it('attempts compensation when backward switch fails midway', async () => {
    const workspace = createWorkspaceForSwitch()
    listSnapshotsMock.mockResolvedValue([
      { id: 's3', status: 'approved' },
      { id: 's2', status: 'approved' },
      { id: 's1', status: 'approved' },
    ])
    workspace.rollbackSnapshot
      .mockResolvedValueOnce({ reverted: 1, unresolved: [] })
      .mockResolvedValueOnce({ reverted: 0, unresolved: ['a.ts'] })
    workspace.applySnapshot.mockResolvedValue({ applied: 1, unresolved: [] })

    const result = await workspace.switchToSnapshot('s1')

    expect(result.direction).toBe('backward')
    expect(result.failedSnapshotId).toBe('s2')
    expect(result.compensationAttempted).toBe(true)
    expect(result.compensationSucceeded).toBe(true)
    expect(workspace.applySnapshot).toHaveBeenCalledWith('s3', undefined)
  })
})
