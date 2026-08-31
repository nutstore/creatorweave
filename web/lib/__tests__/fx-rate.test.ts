import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createFxRateController,
  type FxRateController,
} from '../fx-rate'
import { getActiveUsdToCnyRate, setActiveUsdToCnyRate } from '../currency'

/**
 * Each test creates its own controller backed by an in-memory storage stub,
 * so module singletons and localStorage never leak state between tests.
 * The network layer is fully mocked via fetch stubs.
 */

function memoryStorage(): Map<string, string> {
  return new Map()
}

function makeController(store: Map<string, string>): FxRateController {
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  return createFxRateController(storage)
}

const KEY = 'cw.fx.usd-cny.v1'
const DAY = 24 * 60 * 60 * 1000

function stubFetchSequence(responses: Array<{ ok: boolean; body: unknown }>) {
  let i = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const r = responses[Math.min(i, responses.length - 1)]
      i++
      return { ok: r.ok, json: async () => r.body } as Response
    }),
  )
}

describe('fx-rate controller', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setActiveUsdToCnyRate(7.2) // reset the shared active rate
  })

  it('fetches from the first source when cache is empty', async () => {
    stubFetchSequence([
      { ok: true, body: { result: 'success', rates: { CNY: 6.73 } } },
    ])
    const fx = makeController(memoryStorage())
    const rate = await fx.ensureFxRate()
    expect(rate).toBeCloseTo(6.73, 10)
    expect(fx.getCachedFxRate()?.source).toBe('open.er-api.com')
    expect(getActiveUsdToCnyRate()).toBeCloseTo(6.73, 10)
  })

  it('persists to storage and a fresh cache short-circuits (no fetch)', async () => {
    const store = memoryStorage()
    store.set(KEY, JSON.stringify({ rate: 6.73, fetchedAt: Date.now(), source: 'test' }))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const fx = makeController(store)
    const rate = await fx.ensureFxRate()
    expect(rate).toBeCloseTo(6.73, 10)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back through sources on failure and rejects garbage', async () => {
    stubFetchSequence([
      { ok: false, body: null },                               // er-api down
      { ok: true, body: { usd: { cny: 'not-a-number' } } },    // garbage
      { ok: true, body: { amount: 1, rates: { CNY: 6.72 } } }, // frankfurter OK
    ])
    const fx = makeController(memoryStorage())
    const rate = await fx.ensureFxRate()
    expect(rate).toBeCloseTo(6.72, 10)
    expect(fx.getCachedFxRate()?.source).toBe('frankfurter.dev')
  })

  it('all sources fail → keeps the previous active rate, cache untouched', async () => {
    stubFetchSequence([{ ok: false, body: null }])
    const fx = makeController(memoryStorage())
    setActiveUsdToCnyRate(7.2)
    const rate = await fx.ensureFxRate()
    expect(rate).toBe(7.2)
    expect(fx.getCachedFxRate()).toBeNull()
  })

  it('stale cache primes the display while a fresh fetch is in flight', async () => {
    const store = memoryStorage()
    store.set(KEY, JSON.stringify({ rate: 7.9, fetchedAt: Date.now() - 14 * DAY, source: 'old' }))
    setActiveUsdToCnyRate(7.9)

    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate
        return { ok: true, json: async () => ({ usd: { cny: 6.75 } }) } as Response
      }),
    )

    const fx = makeController(store)
    const ratePromise = fx.ensureFxRate()
    await Promise.resolve() // let primeFromCache run
    expect(getActiveUsdToCnyRate()).toBe(7.9) // stale but sane

    release()
    const rate = await ratePromise
    expect(rate).toBeCloseTo(6.75, 10)
    expect(getActiveUsdToCnyRate()).toBeCloseTo(6.75, 10)
  })

  it('corrupted cache JSON is ignored, fetch proceeds', async () => {
    const store = memoryStorage()
    store.set(KEY, '{not json')
    stubFetchSequence([{ ok: true, body: { rates: { CNY: 6.73 } } }])
    const fx = makeController(store)
    const rate = await fx.ensureFxRate()
    expect(rate).toBeCloseTo(6.73, 10)
  })

  it('subscribeFxRate fires when a new rate lands', async () => {
    stubFetchSequence([{ ok: true, body: { rates: { CNY: 6.73 } } }])
    const fx = makeController(memoryStorage())
    const calls: number[] = []
    fx.subscribeFxRate(() => calls.push(getActiveUsdToCnyRate()))
    await fx.ensureFxRate()
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[calls.length - 1]).toBeCloseTo(6.73, 10)
  })
})
