import { describe, expect, it, vi } from 'vitest'
import { autoApplyCompletedRunChanges, type AutoApplyWorkspace } from '../auto-apply-run-changes'

const nativeDirectory = {} as FileSystemDirectoryHandle

function createWorkspace(overrides: Partial<AutoApplyWorkspace> = {}): AutoApplyWorkspace {
  return {
    getNativeDirectoryHandle: vi.fn().mockResolvedValue(nativeDirectory),
    hasAnyNativeDirectoryHandle: vi.fn().mockResolvedValue(true),
    getPendingChanges: vi.fn().mockReturnValue([
      { id: 'a', path: 'root/a.ts', type: 'modify', fsMtime: 1, timestamp: 1 },
    ]),
    detectSyncConflicts: vi.fn().mockResolvedValue([]),
    createApprovedSnapshotForPaths: vi.fn().mockResolvedValue({ snapshotId: 'snapshot-1', opCount: 1 }),
    syncToDisk: vi.fn().mockResolvedValue({ success: 1, failed: 0, skipped: 0, conflicts: [] }),
    markSnapshotAsSynced: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('autoApplyCompletedRunChanges', () => {
  it('creates an unnamed rollback record and syncs only supplied pending paths', async () => {
    const workspace = createWorkspace()
    const refresh = vi.fn().mockResolvedValue(undefined)

    await expect(autoApplyCompletedRunChanges(workspace, ['root/a.ts'], refresh)).resolves.toEqual({
      status: 'synced',
      paths: ['root/a.ts'],
      snapshotId: 'snapshot-1',
    })

    expect(workspace.detectSyncConflicts).toHaveBeenCalledWith(nativeDirectory, ['root/a.ts'])
    expect(workspace.createApprovedSnapshotForPaths).toHaveBeenCalledWith(['root/a.ts'], undefined, nativeDirectory, undefined)
    expect(workspace.syncToDisk).toHaveBeenCalledWith(nativeDirectory, ['root/a.ts'], false)
    expect(workspace.markSnapshotAsSynced).toHaveBeenCalledWith('snapshot-1')
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('keeps the full run batch pending when any path conflicts', async () => {
    const workspace = createWorkspace({
      getPendingChanges: vi.fn().mockReturnValue([
        { id: 'a', path: 'root/a.ts', type: 'modify', fsMtime: 1, timestamp: 1 },
        { id: 'b', path: 'root/b.ts', type: 'modify', fsMtime: 1, timestamp: 1 },
      ]),
      detectSyncConflicts: vi.fn().mockResolvedValue([
        { path: 'root/a.ts', workspaceId: 'w', otherWorkspaces: [], opfsMtime: 1, currentFsMtime: 2 },
      ]),
    })
    const refresh = vi.fn().mockResolvedValue(undefined)

    await expect(autoApplyCompletedRunChanges(workspace, ['root/a.ts', 'root/b.ts'], refresh)).resolves.toEqual({
      status: 'conflict',
      conflictPaths: ['root/a.ts'],
    })

    expect(workspace.createApprovedSnapshotForPaths).not.toHaveBeenCalled()
    expect(workspace.syncToDisk).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not create a snapshot when the run has no still-pending changes', async () => {
    const workspace = createWorkspace({ getPendingChanges: vi.fn().mockReturnValue([]) })
    const refresh = vi.fn().mockResolvedValue(undefined)

    await expect(autoApplyCompletedRunChanges(workspace, ['root/a.ts'], refresh)).resolves.toEqual({
      status: 'skipped',
      reason: 'no_pending_paths',
    })

    expect(workspace.detectSyncConflicts).not.toHaveBeenCalled()
    expect(workspace.createApprovedSnapshotForPaths).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('keeps deletions in the manual review flow', async () => {
    const workspace = createWorkspace({
      getPendingChanges: vi.fn().mockReturnValue([
        { id: 'a', path: 'root/a.ts', type: 'delete', fsMtime: 1, timestamp: 1 },
      ]),
    })
    const refresh = vi.fn().mockResolvedValue(undefined)

    await expect(autoApplyCompletedRunChanges(workspace, ['root/a.ts'], refresh)).resolves.toEqual({
      status: 'skipped',
      reason: 'no_pending_paths',
    })

    expect(workspace.detectSyncConflicts).not.toHaveBeenCalled()
    expect(workspace.createApprovedSnapshotForPaths).not.toHaveBeenCalled()
  })

  it('does not sync when the pending records cannot be snapshotted', async () => {
    const workspace = createWorkspace({
      createApprovedSnapshotForPaths: vi.fn().mockResolvedValue(null),
    })
    const refresh = vi.fn().mockResolvedValue(undefined)

    await expect(autoApplyCompletedRunChanges(workspace, ['root/a.ts'], refresh)).resolves.toMatchObject({
      status: 'partial',
      skipped: 1,
    })

    expect(workspace.syncToDisk).not.toHaveBeenCalled()
    expect(workspace.markSnapshotAsSynced).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not mark a rollback record synced after a partial failure', async () => {
    const workspace = createWorkspace({
      syncToDisk: vi.fn().mockResolvedValue({ success: 0, failed: 1, skipped: 0, conflicts: [] }),
    })
    const refresh = vi.fn().mockResolvedValue(undefined)

    await expect(autoApplyCompletedRunChanges(workspace, ['root/a.ts'], refresh)).resolves.toMatchObject({
      status: 'partial',
      failed: 1,
    })

    expect(workspace.markSnapshotAsSynced).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('refreshes pending state when the disk sync throws after snapshot creation', async () => {
    const error = new Error('disk unavailable')
    const workspace = createWorkspace({ syncToDisk: vi.fn().mockRejectedValue(error) })
    const refresh = vi.fn().mockResolvedValue(undefined)

    await expect(autoApplyCompletedRunChanges(workspace, ['root/a.ts'], refresh)).rejects.toThrow(error)

    expect(workspace.markSnapshotAsSynced).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('marks snapshot as synced even when syncToDisk skips unrelated pending files', async () => {
    // syncToDisk with onlyPaths skips every OTHER pending change (files from
    // prior runs). Those skips are unrelated to this batch and must NOT block
    // marking this snapshot as synced.
    const workspace = createWorkspace({
      getPendingChanges: vi.fn().mockReturnValue([
        { id: 'a', path: 'root/a.ts', type: 'modify', fsMtime: 1, timestamp: 1 },
        { id: 'b', path: 'root/b.ts', type: 'modify', fsMtime: 1, timestamp: 1 }, // unrelated
      ]),
      syncToDisk: vi.fn().mockResolvedValue({ success: 1, failed: 0, skipped: 1, conflicts: [] }),
    })
    const refresh = vi.fn().mockResolvedValue(undefined)

    await expect(autoApplyCompletedRunChanges(workspace, ['root/a.ts'], refresh)).resolves.toEqual({
      status: 'synced',
      paths: ['root/a.ts'],
      snapshotId: 'snapshot-1',
    })

    expect(workspace.markSnapshotAsSynced).toHaveBeenCalledWith('snapshot-1')
  })
})
