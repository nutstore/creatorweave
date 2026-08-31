/**
 * Display-currency helpers for cost estimates.
 *
 * Pricing data (OpenRouter snapshot + per-provider /models endpoints) is
 * always USD, but the domestic deployment (weave.eo2suite.cn) should show
 * cost estimates in RMB (¥). The deployment region is inlined at build time
 * via NEXT_PUBLIC_DEPLOY_REGION (same mechanism as app/layout.tsx and
 * i18n/store.ts — the CN and international sites are BUILT separately), so
 * the currency choice is a build-time constant, not a runtime toggle.
 *
 * USD→CNY rate: lib/fx-rate.ts keeps it fresh from public FX APIs (CN build
 * only). This module holds the rate STATE so the two modules stay
 * dependency-ordered (fx-rate → currency, never the reverse):
 *   1. live/cached rate (set by fx-rate.ts via setActiveUsdToCnyRate)
 *   2. build-time NEXT_PUBLIC_USD_TO_CNY_RATE when explicitly set
 *      → FX_RATE_FIXED mode: fx-rate.ts never fetches, rate is deterministic
 *   3. DEFAULT_USD_TO_CNY_RATE as the last-resort offline fallback
 */

export type Currency = 'USD' | 'CNY'

/** Build-time deployment region flag (mirrors app/layout.tsx). */
export const IS_CN_BUILD = process.env.NEXT_PUBLIC_DEPLOY_REGION === 'cn'

/** Currency used for cost display: RMB on the domestic build, USD elsewhere. */
export const DISPLAY_CURRENCY: Currency = IS_CN_BUILD ? 'CNY' : 'USD'

/** Last-resort indicative USD→CNY rate when no live/cached rate is available. */
export const DEFAULT_USD_TO_CNY_RATE = 7.2

const ENV_RATE_RAW = process.env.NEXT_PUBLIC_USD_TO_CNY_RATE
const ENV_RATE_PARSED = Number.parseFloat(ENV_RATE_RAW ?? '')

/**
 * Build-time fixed rate (NEXT_PUBLIC_USD_TO_CNY_RATE). When explicitly set
 * to a valid positive number, live FX fetching is DISABLED and this exact
 * rate is used — ops escape hatch for deterministic display.
 */
export const USD_TO_CNY_RATE: number =
  Number.isFinite(ENV_RATE_PARSED) && ENV_RATE_PARSED > 0
    ? ENV_RATE_PARSED
    : DEFAULT_USD_TO_CNY_RATE

/** True when the rate was pinned at build time (live fetching disabled). */
export const FX_RATE_FIXED = Number.isFinite(ENV_RATE_PARSED) && ENV_RATE_PARSED > 0

// ── Active rate state (kept here so fx-rate.ts can stay one-directional) ──

let activeRate: number | null = null

/** Sanity bound: USD→CNY is realistically 1–100; anything else is garbage. */
export function setActiveUsdToCnyRate(rate: number): boolean {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return false
  activeRate = rate
  return true
}

/** Current best-known USD→CNY rate: live/cached if available, else static. */
export function getActiveUsdToCnyRate(): number {
  return activeRate ?? USD_TO_CNY_RATE
}

export function convertUsdToCny(usd: number): number {
  return usd * getActiveUsdToCnyRate()
}

/**
 * Format a USD amount for display in the target currency.
 *   USD: $0.00 / $0.0023 / $1.23
 *   CNY: ¥0.00 / ¥0.0072 / ¥8.88
 *
 * `rate` defaults to the active (live/cached/static) rate; components that
 * subscribe to live updates pass it explicitly for pure render semantics.
 */
export function formatCost(
  usd: number,
  currency: Currency = DISPLAY_CURRENCY,
  rate: number = getActiveUsdToCnyRate(),
): string {
  const value = currency === 'CNY' ? usd * rate : usd
  const symbol = currency === 'CNY' ? '¥' : '$'
  if (value === 0) return `${symbol}0.00`
  if (value < 0.01) return `${symbol}${value.toFixed(4)}`
  if (value < 1) return `${symbol}${value.toFixed(3)}`
  return `${symbol}${value.toFixed(2)}`
}
