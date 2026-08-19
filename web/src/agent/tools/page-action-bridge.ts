// ============================================================
// Page Action Bridge — web-side bridge to `window.__agentWeb.runPageAction`
//
// This module provides typed access to the page-action runner injected
// into the upstream tab by the Browser Extension. It is the web-side
// counterpart of:
//   - browser-extension/entrypoints/page-action-runner.content.ts  (runner)
//   - browser-extension/entrypoints/injected.content.ts            (__agentWeb.runPageAction)
//   - browser-extension/entrypoints/background.ts                  (runPageAction handler)
//
// Availability: only when both
//   (a) the Browser Extension bridge is present (window.__agentWeb),
//   (b) we are in side-panel mode (bound to an upstream tabId).
// ============================================================

import { getSidePanelBindingId, isSidePanelMode } from '@/agent/workspace-assistant-context'

// --------------------------------------------------------------
// Shared types (must stay in sync with page-action-runner.content.ts)
// --------------------------------------------------------------

export interface Locator {
  /** Stable id assigned by a previous snapshot (preferred for reuse). */
  element_id?: string
  /** CSS selector. */
  selector?: string
  /** XPath expression. */
  xpath?: string
  /** Substring that must appear in the element's textContent. */
  text?: string
  /** ARIA role attribute (e.g. "button", "link"). */
  role?: string
  /** HTML name attribute (e.g. form field name). */
  name?: string
  /** Substring appearing in nearby text (within ~300px). Helps disambiguate. */
  near_text?: string
  /** Substring appearing in an ancestor's textContent. */
  ancestor_text?: string
  /** Lowercase tag name (e.g. "button", "input"). */
  tag_name?: string
  /** Input type attribute (e.g. "text", "email", "checkbox"). */
  input_type?: string
  /** When true, only currently-visible elements match. Default false. */
  visible_only?: boolean
}

export type PageAction =
  | { type: 'snapshot'; maxNodes?: number }
  | { type: 'text_content'; locator?: Locator; maxLength?: number }
  | { type: 'find_elements'; locator: Locator; limit?: number }
  | { type: 'synthesize_locators'; locator: Locator; limit?: number }
  | { type: 'click'; locator: Locator }
  | { type: 'fill'; locator: Locator; value: string; clearFirst?: boolean }
  | { type: 'type'; locator: Locator; text: string }
  | { type: 'scroll'; locator?: Locator; x?: number; y?: number; behavior?: 'auto' | 'smooth' | 'instant' }
  | { type: 'evaluate'; expression: string }

export interface SynthesizedLocator {
  kind: 'css' | 'id' | 'name' | 'link_text'
  query: string
  verification: string
  stability: 'high' | 'medium' | 'low'
  score?: number
  strategy?: string
}

export interface ElementInfo {
  elementId: string
  tagName: string
  role: string | null
  name: string | null
  text: string | null
  visible: boolean
  rect: { x: number; y: number; width: number; height: number }
  attributes: Record<string, string>
  /** Only present from synthesize_locators: ranked candidate locators. */
  locators?: SynthesizedLocator[]
}

export interface PageActionResult {
  ok: boolean
  errorCode?: string
  error?: string
  // snapshot
  tree_text?: string
  nodeCount?: number
  truncated?: boolean
  // text_content
  text?: string
  // find_elements / click(fill/type) candidates
  count?: number
  elements?: ElementInfo[]
  candidates?: ElementInfo[]
  // click/fill/type element echo
  element?: ElementInfo
  // evaluate
  result?: unknown
}

// --------------------------------------------------------------
// Bridge access
// --------------------------------------------------------------

interface AgentWebWithPageAction {
  ready: boolean
  runBoundPageAction: (binding: string, action: Record<string, unknown>) => Promise<PageActionResult>
  captureBoundTab?: (binding: string, format?: 'png' | 'jpeg', quality?: number) => Promise<CaptureTabResult>
}

function getAgentWebWithPageAction(): AgentWebWithPageAction | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { __agentWeb?: AgentWebWithPageAction }
  return w.__agentWeb?.ready && typeof w.__agentWeb.runBoundPageAction === 'function'
    ? w.__agentWeb
    : null
}

/**
 * Whether page-action tools can be used right now:
 *   - Extension bridge present (window.__agentWeb.runPageAction)
 *   - Side-panel mode active (bound to an upstream tab)
 */
export function isPageActionAvailable(): boolean {
  return getAgentWebWithPageAction() !== null && isSidePanelMode()
}

/**
 * Execute a page action against the current upstream tab.
 * Throws a structured error when unavailable so the tool layer can surface
 * a helpful message instead of a generic failure.
 */
export async function runPageAction(action: PageAction): Promise<PageActionResult> {
  const bridge = getAgentWebWithPageAction()
  if (!bridge) {
    return {
      ok: false,
      errorCode: 'BRIDGE_UNAVAILABLE',
      error:
        'Page action requires the eo2weave browser extension. Install/enable it and reopen the side panel.',
    }
  }
  if (!isSidePanelMode()) {
    return {
      ok: false,
      errorCode: 'NOT_IN_SIDE_PANEL',
      error:
        'Page action tools only work in side-panel mode (when eo2weave is docked to an upstream tab).',
    }
  }
  const binding = getSidePanelBindingId()
  if (!binding) {
    return { ok: false, errorCode: 'MISSING_PANEL_BINDING', error: 'Side-panel binding is unavailable. Reopen the side panel.' }
  }
  return bridge.runBoundPageAction(binding, action as unknown as Record<string, unknown>)
}

// --------------------------------------------------------------
// Screenshot (captureVisibleTab)
// --------------------------------------------------------------

export interface CaptureTabResult {
  ok: boolean
  dataUrl?: string
  format?: 'png' | 'jpeg'
  errorCode?: string
  error?: string
}

/** Convert a browser-extension screenshot data URL into the same File shape
 * used by the regular attachment picker. */
export async function captureDataUrlAsFile(dataUrl: string, name: string): Promise<File> {
  const response = await fetch(dataUrl)
  if (!response.ok) {
    throw new Error(`Unable to read screenshot data (${response.status})`)
  }
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) {
    throw new Error('Screenshot data is not an image')
  }
  return new File([blob], name, { type: blob.type })
}

/**
 * Capture the visible viewport of the upstream tab.
 * Uses chrome.tabs.captureVisibleTab via the extension bridge —
 * no debugger permission, no yellow bar.
 */
export async function captureTab(
  format: 'png' | 'jpeg' = 'png',
  quality?: number,
): Promise<CaptureTabResult> {
  const bridge = getAgentWebWithPageAction()
  if (!bridge) {
    return {
      ok: false,
      errorCode: 'BRIDGE_UNAVAILABLE',
      error: 'Screenshot requires the eo2weave browser extension.',
    }
  }
  if (!isSidePanelMode()) {
    return {
      ok: false,
      errorCode: 'NOT_IN_SIDE_PANEL',
      error: 'Screenshot only works in side-panel mode.',
    }
  }
  if (typeof bridge.captureBoundTab !== 'function') {
    return {
      ok: false,
      errorCode: 'CAPTURE_NOT_SUPPORTED',
      error: 'The extension version does not support bound screenshots. Please rebuild and reload the extension.',
    }
  }
  const binding = getSidePanelBindingId()
  if (!binding) {
    return { ok: false, errorCode: 'MISSING_PANEL_BINDING', error: 'Side-panel binding is unavailable. Reopen the side panel.' }
  }
  return bridge.captureBoundTab(binding, format, quality)
}
