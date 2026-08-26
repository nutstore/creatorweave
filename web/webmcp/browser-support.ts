import { WEBMCP_MIN_CHROME_VERSION } from './constants'

type BrowserKind = 'chrome' | 'edge' | 'other' | 'unknown'
type SupportReason = 'ok' | 'version-too-low' | 'unsupported-browser' | 'unknown'

export interface WebMCPBrowserSupport {
  kind: BrowserKind
  version: string | null
  isSupported: boolean
  reason: SupportReason
}

function compareVersions(a: string, b: string): number {
  const parse = (value: string) => value.split('.').map((part) => parseInt(part, 10) || 0)
  const aa = parse(a)
  const bb = parse(b)
  const maxLength = Math.max(aa.length, bb.length)
  for (let i = 0; i < maxLength; i++) {
    const left = aa[i] ?? 0
    const right = bb[i] ?? 0
    if (left > right) return 1
    if (left < right) return -1
  }
  return 0
}

export function detectWebMCPBrowserSupport(
  userAgent = (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
  minVersion = WEBMCP_MIN_CHROME_VERSION
): WebMCPBrowserSupport {
  if (!userAgent || typeof userAgent !== 'string') {
    return { kind: 'unknown', version: null, isSupported: false, reason: 'unknown' }
  }

  if (/Edg\//.test(userAgent)) {
    const edgeMatch = userAgent.match(/Edg\/([0-9.]+)/)
    return {
      kind: 'edge',
      version: edgeMatch?.[1] || null,
      isSupported: false,
      reason: 'unsupported-browser',
    }
  }

  const chromeMatch = userAgent.match(/Chrome\/([0-9.]+)/)
  if (!chromeMatch?.[1]) {
    return { kind: 'other', version: null, isSupported: false, reason: 'unsupported-browser' }
  }

  const currentVersion = chromeMatch[1]
  if (compareVersions(currentVersion, minVersion) < 0) {
    return {
      kind: 'chrome',
      version: currentVersion,
      isSupported: false,
      reason: 'version-too-low',
    }
  }

  return {
    kind: 'chrome',
    version: currentVersion,
    isSupported: true,
    reason: 'ok',
  }
}
