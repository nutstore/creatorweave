import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { syncToDiskExecutor } from '../sync-to-disk.tool'
import { useToolAuthStore } from '@/store/tool-auth.store'
import { useSessionAllowStore } from '@/store/session-allow.store'
import { usePageActionSessionStore } from '@/store/page-action-session.store'

/**
 * sync-to-disk is the authorized disk-flush entry point. These tests pin the
 * three guarantees from redesign doc §3.6:
 *   1. delete-type changes are stripped BEFORE the disk pipeline
 *   2. forceOverwrite is never passed through (conflicts → skipped, reported)
 *   3. every call passes the policy engine (prompt level)
 */

vi.mock('@/opfs', () => ({
  getWorkspaceManager: () => ({
    getWorkspace: vi.fn(async () => mockRuntime),
  }),
}))

const syncToDiskMock = vi.fn()
const createSnapshotMock = vi.fn()
const markSyncedMock = vi.fn()

const mockRuntime = {
  getPendingChanges: vi.fn(() => [] as Array<{ path: string; type: string }>),
  createApprovedSnapshotForPaths: createSnapshotMock,
  syncToDisk: syncToDiskMock,
  markSnapshotAsSynced: markSyncedMock,
} as never as {
  getPendingChanges: ReturnType<typeof vi.fn>
  createApprovedSnapshotForPaths: ReturnType<typeof vi.fn>
  syncToDisk: ReturnType<typeof vi.fn>
  markSnapshotAsSynced: ReturnType<typeof vi.fn>
}

const context = {
  workspaceId: 'conv-1',
  abortSignal: undefined,
} as unknown as ToolContext

describe('sync-to-disk tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToolAuthStore.getState().clear()
    useSessionAllowStore.getState().clearAll()
    usePageActionSessionStore.setState({ pageActionYolo: false })
    createSnapshotMock.mockResolvedValue({ snapshotId: 'snap_1' })
    markSyncedMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    useToolAuthStore.getState().clear()
    useSessionAllowStore.getState().clearAll()
    usePageActionSessionStore.setState({ pageActionYolo: false })
  })

  it('queues an authorization modal BEFORE touching the disk (prompt level)', async () => {
    mockRuntime.getPendingChanges.mockReturnValue([
      { path: 'a.ts', type: 'modify' },
    ])
    syncToDiskMock.mockResolvedValue({ success: 1, failed: 0, conflicts: [] })

    const pending = syncToDiskExecutor({ paths: ['a.ts'] }, context)
    // Flush all pending microtasks (dynamic import + manager.getWorkspace)
    await new Promise((r) => setTimeout(r, 0))
    // then assert the modal is queued before any disk write.
    // first), then assert the modal is queued before any disk write.
    expect(useToolAuthStore.getState().pending?.toolName).toBe('sync-to-disk')
    expect(useToolAuthStore.getState().pending?.memoryKey).toBe('sync-to-disk')
    expect(syncToDiskMock).not.toHaveBeenCalled()

    useToolAuthStore.getState().approve()
    const result = JSON.parse((await pending) as string) as { tool: string; data?: { synced: string[] } }
    expect(result.tool).toBe('sync-to-disk')
    expect(result.data?.synced).toEqual(['a.ts'])
  })

  it('"always allow" persists the grant and the next call short-circuits', async () => {
    mockRuntime.getPendingChanges.mockReturnValue([
      { path: 'a.ts', type: 'modify' },
    ])
    syncToDiskMock.mockResolvedValue({ success: 1, failed: 0, conflicts: [] })

    const first = syncToDiskExecutor({ paths: ['a.ts'] }, context)
    await new Promise((r) => setTimeout(r, 0))
    useToolAuthStore.getState().approve(true)
    await first
    expect(useSessionAllowStore.getState().has('conv-1', 'sync-to-disk')).toBe(true)

    // Second call: no modal queued (memory short-circuit), disk written.
    const second = (await syncToDiskExecutor({ paths: ['a.ts'] }, context)) as string
    expect(useToolAuthStore.getState().queue).toHaveLength(0)
    const parsed = JSON.parse(second) as { data?: { synced_count: number } }
    expect(parsed.data?.synced_count).toBe(1)
  })

  it('strips delete-type changes BEFORE the disk pipeline and reports them', async () => {
    mockRuntime.getPendingChanges.mockReturnValue([
      { path: 'keep.ts', type: 'modify' },
      { path: 'gone.ts', type: 'delete' },
    ])
    syncToDiskMock.mockResolvedValue({ success: 1, failed: 0, conflicts: [] })

    const pending = syncToDiskExecutor({}, context)
    await new Promise((r) => setTimeout(r, 0))
    useToolAuthStore.getState().approve()
    const parsed = JSON.parse((await pending) as string) as {
      data?: { synced: string[]; excluded_deletions: string[] }
      hint?: string
    }

    // syncToDisk only ever saw the modify — never the delete.
    expect(syncToDiskMock).toHaveBeenCalledWith(null, ['keep.ts'], false)
    expect(parsed.data?.synced).toEqual(['keep.ts'])
    expect(parsed.data?.excluded_deletions).toEqual(['gone.ts'])
    const metaHint = String((parsed as { meta?: { hint?: string } }).meta?.hint ?? '')
    expect(metaHint).toContain('delete-type')
    expect(metaHint).toContain('Sync panel')
  })

  it('forces forceOverwrite=false and reports per-file conflicts as skipped', async () => {
    mockRuntime.getPendingChanges.mockReturnValue([
      { path: 'clean.ts', type: 'create' },
      { path: 'hot.ts', type: 'modify' },
    ])
    syncToDiskMock.mockResolvedValue({
      success: 1,
      failed: 0,
      conflicts: [{ path: 'hot.ts' }],
    })

    const pending = syncToDiskExecutor({}, context)
    await new Promise((r) => setTimeout(r, 0))
    useToolAuthStore.getState().approve()
    const parsed = JSON.parse((await pending) as string) as {
      data?: { synced: string[]; skipped_conflicts: string[] }
      hint?: string
    }

    expect(syncToDiskMock).toHaveBeenCalledWith(null, expect.anything(), false)
    expect(parsed.data?.synced).toEqual(['clean.ts'])
    expect(parsed.data?.skipped_conflicts).toEqual(['hot.ts'])
    const metaHint = String((parsed as { meta?: { hint?: string } }).meta?.hint ?? '')
    expect(metaHint).toContain('skipped')
  })

  it('reports no-op clearly when nothing is pending', async () => {
    mockRuntime.getPendingChanges.mockReturnValue([])
    const parsed = JSON.parse(
      (await syncToDiskExecutor({}, context)) as string,
    ) as { data?: { message?: string } }
    expect(parsed.data?.message).toContain('No pending changes')
    expect(syncToDiskMock).not.toHaveBeenCalled()
    expect(createSnapshotMock).not.toHaveBeenCalled()
  })

  it('yolo mode auto-allows the disk flush (documented exemption behavior)', async () => {
    usePageActionSessionStore.setState({ pageActionYolo: true })
    mockRuntime.getPendingChanges.mockReturnValue([
      { path: 'a.ts', type: 'modify' },
    ])
    syncToDiskMock.mockResolvedValue({ success: 1, failed: 0, conflicts: [] })

    // Resolves WITHOUT a modal decision — yolo short-circuits the prompt.
    const parsed = JSON.parse(
      (await syncToDiskExecutor({ paths: ['a.ts'] }, context)) as string,
    ) as { data?: { synced: string[] } }
    expect(parsed.data?.synced).toEqual(['a.ts'])
    expect(useToolAuthStore.getState().queue).toHaveLength(0)
  })
})
