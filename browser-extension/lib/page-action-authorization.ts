// Page-action calls cross from the CreatorWeave web app into extension
// privileges. Keep this allowlist intentionally exact: the dual-site
// production origins (weave.eo2suite.cn / weave.eo2suite.com), the legacy
// creatorweave.eo2suite.cn origin (trusted during the migration window), and
// the local Vite origin used during development. Single source of truth:
// lib/webapp-origins.ts.
import { CW_WEBAPP_ORIGINS } from './webapp-origins'

const TRUSTED_CREATORWEAVE_ORIGINS = new Set(CW_WEBAPP_ORIGINS)

/** True only when the message originated from an approved CreatorWeave origin. */
export function isTrustedCreatorWeaveSenderUrl(senderUrl: string | undefined): boolean {
  if (!senderUrl) return false

  try {
    return TRUSTED_CREATORWEAVE_ORIGINS.has(new URL(senderUrl).origin)
  } catch {
    return false
  }
}

/** Opaque, extension-generated key which maps a side panel to one tab. */
export function isSidePanelBindingId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
