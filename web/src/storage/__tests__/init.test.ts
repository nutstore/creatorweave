import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_RESET_MARKER_KEY } from '../reset-marker'

const mocks = vi.hoisted(() => {
  const queryFirst = vi.fn(async () => ({ ok: 1 }))
  const getMode = vi.fn(() => 'opfs' as const)
  const db = {
    queryFirst,
    getMode,
  }

  return {
    queryFirst,
    getMode,
    db,
    initSQLiteDB: vi.fn(async () => {}),
    getSQLiteDB: vi.fn(() => db),
    clearLegacySahPoolFromOPFSRoot: vi.fn(async () => true),
    clearAllSQLiteTables: vi.fn(async () => {}),
  }
})

vi.mock('@/sqlite', () => ({
  initSQLiteDB: mocks.initSQLiteDB,
  getSQLiteDB: mocks.getSQLiteDB,
  clearLegacySahPoolFromOPFSRoot: mocks.clearLegacySahPoolFromOPFSRoot,
  clearAllSQLiteTables: mocks.clearAllSQLiteTables,
}))

describe('storage init reset marker guard', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mocks.getMode.mockReturnValue('opfs')
    mocks.queryFirst.mockResolvedValue({ ok: 1 })
  })

  it('clears reset marker after healthy init', async () => {
    window.sessionStorage.setItem(STORAGE_RESET_MARKER_KEY, 'pending')
    const { initStorage, __test__ } = await import('../init')

    const result = await initStorage({ allowFallback: false })

    expect(result.success).toBe(true)
    expect(result.mode).toBe('sqlite-opfs')
    expect(mocks.queryFirst).toHaveBeenCalledWith('SELECT 1')
    expect(window.sessionStorage.getItem(STORAGE_RESET_MARKER_KEY)).toBeNull()
    __test__.resetForTests()
  })

  it('returns actionable error when db stays inaccessible right after reset', async () => {
    window.sessionStorage.setItem(STORAGE_RESET_MARKER_KEY, 'pending')
    mocks.initSQLiteDB.mockRejectedValueOnce(
      new Error('DATABASE_INACCESSIBLE: Database connection lost. Please refresh the page.')
    )

    const progress = vi.fn()
    const { initStorage, __test__ } = await import('../init')
    const result = await initStorage({ allowFallback: true, onProgress: progress })

    expect(result.success).toBe(false)
    expect(result.error).toContain('DATABASE_INACCESSIBLE_AFTER_RESET')
    expect(result.error).toContain('请关闭同源的其他标签页/窗口后重试')
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'error',
      })
    )
    expect(window.sessionStorage.getItem(STORAGE_RESET_MARKER_KEY)).toBe('pending')
    __test__.resetForTests()
  })

  it('treats an OPFS sync-handle conflict as an inaccessible database, not corruption', async () => {
    mocks.initSQLiteDB.mockRejectedValueOnce(
      new Error('GetSyncHandleError: database is locked')
    )

    const { initStorage, __test__ } = await import('../init')
    const result = await initStorage({ allowFallback: false })

    expect(result.success).toBe(false)
    expect(result.error).toContain('DATABASE_INACCESSIBLE')
    expect(result.error).toContain('请关闭同源的其他标签页/窗口后刷新重试')
    __test__.resetForTests()
  })
})
