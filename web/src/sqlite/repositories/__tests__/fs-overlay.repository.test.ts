import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FSOverlayRepository } from '../fs-overlay.repository'

const hoisted = vi.hoisted(() => ({
  execute: vi.fn(async () => undefined),
}))

vi.mock('../../sqlite-database', async () => {
  const actual = await vi.importActual<typeof import('../../sqlite-database')>(
    '../../sqlite-database'
  )
  return {
    ...actual,
    getSQLiteDB: () => ({ execute: hoisted.execute }),
  }
})

describe('FSOverlayRepository', () => {
  beforeEach(() => {
    hoisted.execute.mockClear()
  })

  it('returns a failed approved operation to the manual pending-review queue', async () => {
    const repo = new FSOverlayRepository()

    await repo.keepOpPending('op-auto-apply', 'disk write failed')

    expect(hoisted.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'pending', review_status = 'pending'"),
      [expect.any(Number), 'disk write failed', 'op-auto-apply'],
    )
  })
})
