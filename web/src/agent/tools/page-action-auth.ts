// ============================================================
// Page Action Authorization
//
// Authorization model for page-action write tools, adapted from
// browser-agent-wxt's session YOLO + tool policy design, but with one
// extra layer creatorweave needs that browser-agent-wxt does not:
// a HARD URL blacklist that cannot be overridden by any mode.
//
// Rationale: browser-agent-wxt drives tabs IT opens, so its Allow policy
// can cover everything. CreatorWeave drives the user's CURRENT upstream
// tab — even with YOLO on, we must never auto-operate on banking /
// payment / login pages. That's Layer 1.
//
// Decision order (first match wins):
//   1. URL blacklist     → DENY  (hard, cannot be overridden)
//   2. Page-session YOLO           → ALLOW
//   3. Default           → PROMPT (ask the user)
//
// Mode-based visibility (plan/act) is handled separately by
// TOOL_MODE_CLASSIFICATION — read tools are always 'read' category,
// write tools are 'write' category, so Plan mode never sees write tools
// at all. This module only runs when a write tool IS invoked (i.e. Act
// mode). READ tools bypass authorization entirely.
// ============================================================

import { getSidePanelHostname } from '@/agent/workspace-assistant-context'
import { usePageActionSessionStore } from '@/store/page-action-session.store'

// --------------------------------------------------------------
// Decision type
// --------------------------------------------------------------
export type AuthDecision = 'allow' | 'prompt' | 'deny'

export interface AuthResolution {
  decision: AuthDecision
  reason: string
  /** When decision === 'prompt', a human-readable prompt message. */
  promptMessage?: string
}

// --------------------------------------------------------------
// Layer 1: URL blacklist (hard boundary)
// --------------------------------------------------------------
// Pages where automated interaction is NEVER auto-allowed, regardless of
// YOLO. The agent may still read these pages (snapshot/text), but every
// write action will force a user prompt (or be denied if no UI to prompt).
//
// Rationale: mis-automation on these pages has high real-world cost
// (money, credentials, identity). Conservative default; users who truly
// want automation here must do it manually.
//
// Matching: substring match on the lowercase hostname.
const URL_BLACKLIST_SUBSTRINGS: string[] = [
  // Banking / payments
  'paypal',
  'alipay',
  'tenpay',
  'unionpay',
  'stripe',
  'wise.',
  'pay.ebay',
  // Auth / SSO (form submissions carry credentials)
  'accounts.google.com',
  'login.microsoftonline',
  'signin.aws',
  'auth0.',
  'okta.',
  // Wallets / crypto exchanges
  'coinbase',
  'binance',
  'metamask',
  'wallet.',
]

/**
 * Heuristic: is the given host on the hard blacklist?
 * Returns the matching substring for diagnostics, or null if clean.
 */
export function matchesUrlBlacklist(host: string | null): string | null {
  if (!host) return null
  const lower = host.toLowerCase()
  for (const sub of URL_BLACKLIST_SUBSTRINGS) {
    if (lower.includes(sub)) return sub
  }
  return null
}

// --------------------------------------------------------------
// Layer resolution
// --------------------------------------------------------------

/**
 * Resolve the current YOLO state for the current page session.
 */
function resolveYolo(): boolean {
  return usePageActionSessionStore.getState().pageActionYolo
}

/**
 * Full authorization resolution for a page-action WRITE tool.
 *
 * @param toolName  e.g. 'page_click', 'page_fill'
 * @returns AuthResolution with decision + reason (+ promptMessage if prompt)
 */
export function resolveWriteAuthorization(toolName: string): AuthResolution {
  // Layer 1: hard URL blacklist — cannot be overridden.
  const host = getSidePanelHostname()
  const blacklisted = matchesUrlBlacklist(host)
  if (blacklisted) {
    return {
      decision: 'deny',
      reason: `URL_BLACKLISTED:${blacklisted}`,
      promptMessage: `当前页面 (${host}) 属于敏感站点 (${blacklisted})，page-action 写操作已被禁止。如需操作请手动完成。`,
    }
  }

  // Layer 2: YOLO for this page session.
  if (resolveYolo()) {
    return {
      decision: 'allow',
      reason: 'YOLO_AUTO_ALLOW',
    }
  }

  // Layer 3: default — prompt the user.
  return {
    decision: 'prompt',
    reason: 'DEFAULT_PROMPT',
    promptMessage: `AI 请求执行 ${toolName} 操作当前页面。是否允许？`,
  }
}

/**
 * Authorization for page-action READ tools. Read tools are always
 * allowed — they have no side effects and their mode visibility is
 * controlled by TOOL_MODE_CLASSIFICATION (available in both plan and act).
 * No YOLO / blacklist considerations needed.
 */
export function resolveReadAuthorization(): AuthResolution {
  return { decision: 'allow', reason: 'READ_ALWAYS_ALLOWED' }
}

/**
 * Convenience: should the given tool name be treated as a write tool?
 * Used by the registry to decide which resolver to call.
 */
export function isPageActionWriteTool(toolName: string): boolean {
  return (
    toolName === 'page_click' ||
    toolName === 'page_fill' ||
    toolName === 'page_type' ||
    toolName === 'page_scroll' ||
    toolName === 'page_evaluate'
  )
}
