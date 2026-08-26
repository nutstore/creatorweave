import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FSOverlayRepository } from '../fs-overlay.repository'

/**
 * Unit tests for FSOverlayRepository.pruneProjectSnapshots.
 *
 * Retention strategy: when the project's non-draft snapshot count exceeds
 * the high watermark, delete eligible fully-synced snapshots down to the
 * low watermark. Unsynced recovery records remain intact.
 *
 * Coverage:
 * 1. Below the high watermark → no-op.
 * 2. Above the high watermark → deletes oldest down to low watermark.
 * 3. Custom watermarks override defaults.
 * 4. Default watermark reads from app_settings table.
 * 5. pruneProjectSnapshots is invoked automatically after createApprovedSnapshotForPaths.
 */

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const fakeDb = {
  execute: vi.fn(async (_sql: string, _params?: unknown[]) => undefined),
  queryFirst: vi.fn(async (_sql: string, _params?: unknown[]) => null as any),
  queryAll: vi.fn(async (_sql: string, _params?: unknown[]) => [] as any[]),
}

vi.mock('../../sqlite-database', async () => {
  const actual = await vi.importActual<typeof import('../../sqlite-database')>(
    '../../sqlite-database'
  )
  return {
    ...actual,
    getSQLiteDB: () => fakeDb,
  }
})

function resetMocks() {
  fakeDb.execute.mockReset()
  fakeDb.queryFirst.mockReset()
  fakeDb.queryAll.mockReset()
  fakeDb.execute.mockResolvedValue(undefined)
  fakeDb.queryFirst.mockResolvedValue(null)
  fakeDb.queryAll.mockResolvedValue([])
}

/**
 * Build a result set for queryAll that returns different rows depending on
 * the SQL fragment.
 */
function stubQueryAllHandlers(handlers: Array<{ match: RegExp; rows: any[] }>) {
  fakeDb.queryAll.mockImplementation(async (sql: string) => {
    for (const h of handlers) {
      if (h.match.test(sql)) return h.rows
    }
    return []
  })
}

function stubQueryFirstHandlers(handlers: Array<{ match: RegExp; row: any | null }>) {
  fakeDb.queryFirst.mockImplementation(async (sql: string) => {
    for (const h of handlers) {
      if (h.match.test(sql)) return h.row
    }
    return null
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FSOverlayRepository.pruneProjectSnapshots', () => {
  beforeEach(() => {
    resetMocks()
  })

  it('returns 0 deleted when snapshot count is at or below the high watermark', async () => {
    stubQueryFirstHandlers([
      // getProjectSnapshotCount: 50 (≤ default high 100 → no-op)
      { match: /SELECT\s+COUNT/i, row: { n: 50 } },
    ])

    const repo = new FSOverlayRepository()
    const result = await repo.pruneProjectSnapshots('proj-1')

    expect(result).toEqual({ deleted: 0, kept: 50 })
    expect(fakeDb.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM fs_changesets'),
      expect.anything()
    )
  })

  it('returns 0 deleted on exact-boundary count (100 == high)', async () => {
    stubQueryFirstHandlers([
      { match: /SELECT\s+COUNT/i, row: { n: 100 } },
    ])

    const repo = new FSOverlayRepository()
    const result = await repo.pruneProjectSnapshots('proj-1', 100, 50)

    expect(result).toEqual({ deleted: 0, kept: 100 })
  })

  it('deletes oldest snapshots down to low watermark', async () => {
    stubQueryFirstHandlers([
      { match: /SELECT\s+COUNT/i, row: { n: 120 } },
    ])
    // total = 120, high = 100, low = 50 → should delete 70 oldest.
    stubQueryAllHandlers([
      // The "ids to delete" query: returns 70 oldest ids.
      {
        match: /ORDER\s+BY\s+c\.created_at\s+ASC/i,
        rows: Array.from({ length: 70 }, (_, i) => ({ id: `snap-old-${i}` })),
      },
    ])

    const repo = new FSOverlayRepository()
    const result = await repo.pruneProjectSnapshots('proj-1', 100, 50)

    expect(result.deleted).toBe(70)
    expect(result.kept).toBe(50)

    const deleteCall = fakeDb.execute.mock.calls.find(([sql]) =>
      (sql as string).includes('DELETE FROM fs_changesets')
    )
    expect(deleteCall).toBeDefined()
    const [sql, params] = deleteCall!
    const placeholderCount = (sql as string).match(/\?/g)?.length ?? 0
    expect(placeholderCount).toBe(70)
    expect(params).toHaveLength(70)
  })

  it('deletes all snapshots when low=0', async () => {
    stubQueryFirstHandlers([
      { match: /SELECT\s+COUNT/i, row: { n: 120 } },
    ])
    stubQueryAllHandlers([
      // low=0 → total - low = 120 rows to delete.
      {
        match: /ORDER\s+BY\s+c\.created_at\s+ASC/i,
        rows: Array.from({ length: 120 }, (_, i) => ({ id: `snap-${i}` })),
      },
    ])

    const repo = new FSOverlayRepository()
    const result = await repo.pruneProjectSnapshots('proj-1', 100, 0)

    expect(result.deleted).toBe(120)
    expect(result.kept).toBe(0)
  })

  it('respects custom watermarks from app_settings', async () => {
    stubQueryFirstHandlers([
      { match: /SELECT\s+COUNT/i, row: { n: 10 } },
    ])
    stubQueryAllHandlers([
      // Custom values: high=20, low=5
      {
        match: /FROM\s+app_settings/i,
        rows: [
          { key: 'snapshot.high_watermark', value: '20' },
          { key: 'snapshot.low_watermark', value: '5' },
        ],
      },
    ])

    const repo = new FSOverlayRepository()
    const result = await repo.pruneProjectSnapshots('proj-1')

    expect(result).toEqual({ deleted: 0, kept: 10 })
  })

  it('falls back to defaults when app_settings value is non-numeric', async () => {
    stubQueryFirstHandlers([
      { match: /SELECT\s+COUNT/i, row: { n: 100 } },
    ])
    stubQueryAllHandlers([
      {
        match: /FROM\s+app_settings/i,
        rows: [
          { key: 'snapshot.high_watermark', value: 'not-a-number' },
          { key: 'snapshot.low_watermark', value: '' },
        ],
      },
    ])

    const repo = new FSOverlayRepository()
    const result = await repo.pruneProjectSnapshots('proj-1')

    expect(result).toEqual({ deleted: 0, kept: 100 })
  })

  it('coerces low ≥ high to defaults defensively', async () => {
    stubQueryFirstHandlers([
      { match: /SELECT\s+COUNT/i, row: { n: 100 } },
    ])
    stubQueryAllHandlers([
      // Misconfigured: low=200, high=100 (low > high) → fall back to defaults.
      {
        match: /FROM\s+app_settings/i,
        rows: [
          { key: 'snapshot.high_watermark', value: '100' },
          { key: 'snapshot.low_watermark', value: '200' },
        ],
      },
    ])

    const repo = new FSOverlayRepository()
    const result = await repo.pruneProjectSnapshots('proj-1')

    expect(result).toEqual({ deleted: 0, kept: 100 })
  })
})

// ---------------------------------------------------------------------------
// Integration: createApprovedSnapshotForPaths automatically prunes
// ---------------------------------------------------------------------------

describe('FSOverlayRepository.createApprovedSnapshotForPaths → prune trigger', () => {
  beforeEach(() => {
    resetMocks()
  })

  it('invokes pruneProjectSnapshots after a successful snapshot creation', async () => {
    stubQueryFirstHandlers([
      // 1. project_id lookup (new in project-level prune wiring).
      { match: /project_id\s+FROM\s+workspaces\s+WHERE\s+id\s+=\s+\?/i, row: { project_id: 'proj-1' } },
      // getProjectSnapshotCount: under watermark → no-op prune.
      { match: /SELECT\s+COUNT/i, row: { n: 30 } },
    ])
    stubQueryAllHandlers([
      // First call: list existing pending ops for the paths.
      { match: /SELECT\s+id\s+FROM\s+fs_ops/i, rows: [{ id: 'op-1' }] },
      // getSnapshotWatermarks (default since no app_settings row yet).
      { match: /FROM\s+app_settings/i, rows: [] },
    ])

    const repo = new FSOverlayRepository()
    const result = await repo.createApprovedSnapshotForPaths('ws-1', ['foo.ts'])

    expect(result).not.toBeNull()
    expect(result!.opCount).toBe(1)

    const insertSnapshot = fakeDb.execute.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO fs_changesets')
    )
    expect(insertSnapshot).toBeDefined()

    const updateOps = fakeDb.execute.mock.calls.find(([sql]) =>
      (sql as string).includes('UPDATE fs_ops') &&
      (sql as string).includes("review_status = 'approved'")
    )
    expect(updateOps).toBeDefined()

    // No DELETE issued because we're under the watermark.
    expect(fakeDb.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM fs_changesets'),
      expect.anything()
    )
  })

  it('does not fail the snapshot when prune throws', async () => {
    // The post-create prune chain is: SELECT project_id (queryFirst) →
    // getSnapshotWatermarks reads queryAll. Keep the initial fs-op query
    // working, then throw only for the prune's app_settings read.
    fakeDb.queryFirst.mockResolvedValue({ project_id: 'proj-1' })
    fakeDb.queryAll.mockImplementation(async (sql: string) => {
      if (/SELECT\s+id\s+FROM\s+fs_ops/i.test(sql)) {
        return [{ id: 'op-1' }]
      }
      if (/FROM\s+app_settings/i.test(sql)) {
        throw new Error('simulated app_settings read failure')
      }
      return []
    })

    const repo = new FSOverlayRepository()
    const result = await repo.createApprovedSnapshotForPaths('ws-1', ['foo.ts'])

    // Snapshot still succeeds despite prune failure.
    expect(result).not.toBeNull()
    expect(result!.opCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getSnapshotWatermarks / setSnapshotWatermarks
// ---------------------------------------------------------------------------

describe('FSOverlayRepository.getSnapshotWatermarks / setSnapshotWatermarks', () => {
  beforeEach(() => {
    resetMocks()
  })

  it('returns defaults when no app_settings row exists', async () => {
    fakeDb.queryAll.mockResolvedValueOnce([])
    const repo = new FSOverlayRepository()
    const wm = await repo.getSnapshotWatermarks()
    expect(wm).toEqual({ high: 100, low: 50 })
  })

  it('returns stored values when present', async () => {
    fakeDb.queryAll.mockResolvedValueOnce([
      { key: 'snapshot.high_watermark', value: '200' },
      { key: 'snapshot.low_watermark', value: '80' },
    ])
    const repo = new FSOverlayRepository()
    const wm = await repo.getSnapshotWatermarks()
    expect(wm).toEqual({ high: 200, low: 80 })
  })

  it('setSnapshotWatermarks rejects low >= high', async () => {
    const repo = new FSOverlayRepository()
    await expect(repo.setSnapshotWatermarks(100, 100)).rejects.toThrow(/less than/)
    await expect(repo.setSnapshotWatermarks(100, 200)).rejects.toThrow(/less than/)
  })

  it('setSnapshotWatermarks rejects non-positive high or negative low', async () => {
    const repo = new FSOverlayRepository()
    // high must be > 0
    await expect(repo.setSnapshotWatermarks(0, 0)).rejects.toThrow(/positive/)
    await expect(repo.setSnapshotWatermarks(-10, 5)).rejects.toThrow(/positive/)
    // low must be >= 0
    await expect(repo.setSnapshotWatermarks(100, -1)).rejects.toThrow(/non-negative/)
  })

  it('setSnapshotWatermarks accepts low=0 (keep no history)', async () => {
    const repo = new FSOverlayRepository()
    // Should NOT throw
    await repo.setSnapshotWatermarks(100, 0)
    expect(fakeDb.execute).toHaveBeenCalledTimes(2)
  })

  it('setSnapshotWatermarks writes both keys', async () => {
    const repo = new FSOverlayRepository()
    await repo.setSnapshotWatermarks(150, 75)
    expect(fakeDb.execute).toHaveBeenCalledTimes(2)
    const insertCalls = fakeDb.execute.mock.calls.filter(([sql]) =>
      (sql as string).includes('INSERT INTO app_settings')
    )
    expect(insertCalls).toHaveLength(2)
    const allParams = insertCalls.flatMap(([, params]) => (params as any[]) || [])
    expect(allParams).toContain('150')
    expect(allParams).toContain('75')
  })
})
