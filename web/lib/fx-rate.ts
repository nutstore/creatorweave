/**
 * Live USD→CNY FX rate for cost estimates (CN build only).
 *
 * All pricing data is USD, but the domestic build shows RMB. Rather than a
 * hard-coded rate, fetch a real-time rate from free public FX APIs and cache
 * it in localStorage with a multi-hour TTL so a fresh session still shows a
 * sane number offline. Every failure degrades one step:
 *
 *   live fetch → stale cache → build-time rate → static default (7.2)
 *
 * Endpoints (all CORS-friendly, no API key, all return USD→CNY directly):
 *   1. open.er-api.com      (exchangerate-api free tier, daily refresh)
 *   2. jsDelivr @fawazahmed0/currency-api (jsDelivr has CN PoPs → good reachability)
 *   3. api.frankfurter.dev  (ECB reference rates)
 *
 * All fetching is skipped entirely when FX_RATE_FIXED (a valid build-time
 * NEXT_PUBLIC_USD_TO_CNY_RATE is set) — deterministic display for ops.
 *
 * State lives in createFxRateController() closures; the app uses the shared
 * `default` instance, tests create isolated instances per test.
 */

import { useEffect, useState } from 'react'
import {
  FX_RATE_FIXED,
  getActiveUsdToCnyRate,
  setActiveUsdToCnyRate,
} from './currency'

/** Refresh interval: FX moves slowly; 12h is plenty for an estimate UI. */
const FX_TTL_MS = 12 * 60 * 60 * 1000

/** localStorage key. Bump the suffix when the payload shape changes. */
const FX_STORAGE_KEY = 'cw.fx.usd-cny.v1'

/** Per-request timeout — never block the UI on a slow FX endpoint. */
const FX_FETCH_TIMEOUT_MS = 5_000

export interface FxCache {
  rate: number
  fetchedAt: number
  source: string
}

// ── Fetch layer (stateless) ───────────────────────────────────────

interface FxSource {
  name: string
  url: string
  pick: (json: unknown) => unknown
}

const SOURCES: FxSource[] = [
  {
    name: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    pick: (j) => (j as { rates?: { CNY?: unknown } } | null)?.rates?.CNY,
  },
  {
    name: 'jsdelivr:currency-api',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    pick: (j) => (j as { usd?: { cny?: unknown } } | null)?.usd?.cny,
  },
  {
    name: 'frankfurter.dev',
    url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY',
    pick: (j) => (j as { rates?: { CNY?: unknown } } | null)?.rates?.CNY,
  },
]

/** Sanity bound: reject 0/negative/garbage; USD→CNY is realistically 1–100. */
function sanitizeRate(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null
  return n
}

async function fetchFrom(source: FxSource): Promise<number | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FX_FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(source.url, { signal: ctrl.signal })
      if (!res.ok) return null
      const json: unknown = await res.json()
      return sanitizeRate(Number(source.pick(json)))
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

async function fetchLiveRate(): Promise<FxCache | null> {
  for (const source of SOURCES) {
    const rate = await fetchFrom(source)
    if (rate != null) return { rate, fetchedAt: Date.now(), source: source.name }
  }
  return null
}

// ── Controller (per-instance state: cache + single-flight + listeners) ──

export interface FxRateController {
  ensureFxRate(): Promise<number>
  getCachedFxRate(): FxCache | null
  subscribeFxRate(fn: () => void): () => void
  /** Sync-hydrate the active rate from cache (no network, no notify). */
  primeFromCache(): void
}

export function createFxRateController(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = globalThis.localStorage ?? null,
): FxRateController {
  const listeners = new Set<() => void>()
  let inFlight: Promise<number> | null = null

  function loadCache(): FxCache | null {
    try {
      const raw = storage?.getItem(FX_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<FxCache> | null
      if (
        typeof parsed?.rate === 'number' &&
        Number.isFinite(parsed.rate) &&
        parsed.rate > 0 &&
        typeof parsed?.fetchedAt === 'number'
      ) {
        return { rate: parsed.rate, fetchedAt: parsed.fetchedAt, source: parsed.source ?? 'cache' }
      }
    } catch {
      // Corrupted JSON or storage unavailable → treat as no cache.
    }
    return null
  }

  let cached: FxCache | null = loadCache()

  function saveCache(entry: FxCache): void {
    cached = entry
    try {
      storage?.setItem(FX_STORAGE_KEY, JSON.stringify(entry))
    } catch {
      // Quota exceeded / private mode → in-memory value still works this session.
    }
  }

  function isCacheFresh(): boolean {
    return cached != null && Date.now() - cached.fetchedAt < FX_TTL_MS
  }

  /** Sync: install the cached rate as the active one (no network). */
  function primeFromCache(): void {
    if (!FX_RATE_FIXED && cached) setActiveUsdToCnyRate(cached.rate)
  }

  function notifyListeners(): void {
    for (const fn of listeners) fn()
  }

  return {
    getCachedFxRate: () => cached,
    primeFromCache,

    subscribeFxRate(fn: () => void): () => void {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },

    /**
     * Ensure the active rate is as fresh as possible:
     *  1. hydrate from cache synchronously (first render already uses it)
     *  2. cache fresh → done, no network
     *  3. otherwise fetch (single-flight) → save + activate + notify
     * Resolves with the best-known rate either way; never rejects.
     */
    async ensureFxRate(): Promise<number> {
      if (FX_RATE_FIXED) return getActiveUsdToCnyRate()

      primeFromCache()
      if (cached && isCacheFresh()) return cached.rate

      if (!inFlight) {
        inFlight = fetchLiveRate()
          .then((entry) => {
            if (entry) {
              saveCache(entry)
              setActiveUsdToCnyRate(entry.rate)
              notifyListeners()
            }
            return getActiveUsdToCnyRate()
          })
          .finally(() => {
            inFlight = null
          })
      }
      return inFlight
    },
  }
}

// ── App-facing default instance ───────────────────────────────────

const defaultController = createFxRateController()

/** Best cached rate (may be stale); null when never fetched. */
export const getCachedFxRate = (): FxCache | null => defaultController.getCachedFxRate()

/** Subscribe to live-rate updates. Returns an unsubscribe function. */
export const subscribeFxRate = (fn: () => void): (() => void) =>
  defaultController.subscribeFxRate(fn)

/** See createFxRateController.ensureFxRate. */
export const ensureFxRate = (): Promise<number> => defaultController.ensureFxRate()

/**
 * React hook: best-known USD→CNY rate, re-rendering when a live rate lands.
 * Starts with cache/static so there is no undefined state, then updates.
 */
export function useUsdToCnyRate(): number {
  // Lazy initializer: sync-hydrate from cache so the very first render
  // already shows the best-known rate (no fetch, no flicker).
  const [rate, setRate] = useState(() => {
    defaultController.primeFromCache()
    return getActiveUsdToCnyRate()
  })

  useEffect(() => {
    setRate(getActiveUsdToCnyRate())
    const unsubscribe = subscribeFxRate(() => setRate(getActiveUsdToCnyRate()))
    // Fire-and-forget: joins the in-flight request if another consumer
    // already started one.
    void ensureFxRate()
    return unsubscribe
  }, [])

  return rate
}
