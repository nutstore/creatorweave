// Canonical eo2weave web-app origins (single source of truth).
//
// Production is dual-site:
//   - weave.eo2suite.cn  — domestic (国内) deployment
//   - weave.eo2suite.com — international deployment
// The legacy creatorweave.eo2suite.cn origin stays trusted during the
// migration window so existing bookmarks/installed panels keep working
// until the old domain is decommissioned.
// Plus the local Vite origin used during development.

export const CW_WEBAPP_ORIGIN_CN = 'https://weave.eo2suite.cn'
export const CW_WEBAPP_ORIGIN_COM = 'https://weave.eo2suite.com'
export const CW_WEBAPP_ORIGIN_LEGACY = 'https://creatorweave.eo2suite.cn'
export const CW_WEBAPP_ORIGIN_DEV = 'http://localhost:5173'

/** Every origin the web app is (or was, during migration) served from. */
export const CW_WEBAPP_ORIGINS: readonly string[] = [
  CW_WEBAPP_ORIGIN_CN,
  CW_WEBAPP_ORIGIN_COM,
  CW_WEBAPP_ORIGIN_LEGACY,
  CW_WEBAPP_ORIGIN_DEV,
]

/**
 * Base URL the extension uses to OPEN the web app (side panel / new tab).
 *
 * Runtime site selection by browser UI language: a Chinese-primary browser
 * gets the domestic .cn site, everything else gets the international .com
 * site. We look at the MOST preferred language only (navigator.language,
 * equivalent to navigator.languages[0]) — the full list may contain e.g.
 * ['en-US', 'zh-CN'] for an English-primary user who also reads Chinese,
 * and routing should follow their primary preference.
 * Dev builds always target the local Vite server regardless of language.
 */
export function getCwWebappBaseUrl(): string {
  if (import.meta.env.MODE === 'development') return CW_WEBAPP_ORIGIN_DEV
  const nav: { language?: string; languages?: readonly string[] } =
    typeof navigator === 'undefined' ? {} : navigator
  const primary = nav.language || nav.languages?.[0] || ''
  return /^zh/i.test(primary) ? CW_WEBAPP_ORIGIN_CN : CW_WEBAPP_ORIGIN_COM
}

/** True when `origin` is one of the web app's own origins. */
export function isCwWebappOrigin(origin: string): boolean {
  return CW_WEBAPP_ORIGINS.includes(origin)
}
