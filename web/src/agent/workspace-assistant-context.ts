/**
 * Workspace Assistant — Side Panel Context
 *
 * CreatorWeave mounts inside the browser extension's side panel (per-tab —
 * each tab has its own CreatorWeave instance).
 *
 * Architecture:
 *   - CreatorWeave runs in side panel mode, identified by URL hash params.
 *   - When active, CreatorWeave pulls page context from the upstream tab
 *     AT SYSTEM PROMPT BUILD TIME (not at load time). This avoids the
 *     race / stale-data problem entirely: every LLM call gets fresh context.
 *   - The pull goes through the existing browser extension bridge:
 *       CreatorWeave → window.__agentWeb.fetchSidePanelContext(tabId)
 *         → injected.content.ts (MAIN world content script, matches <all_urls>)
 *           posts window.postMessage({__agentWebBridge:true,...})
 *         → content.ts (ISOLATED world content script) calls
 *             chrome.runtime.sendMessage({type:'requestSidePanelContext', tabId})
 *         → background.ts handles it, executes
 *             `window.__sidePanelContextProvider.getContext()` in the upstream tab
 *             via chrome.scripting.executeScript({world:'MAIN'})
 *         → result flows back the same chain.
 *   - CreatorWeave itself never touches `chrome.runtime` — that's only
 *     available in extension pages, not in the web page context where
 *     CreatorWeave loads (even when displayed inside a side panel iframe).
 *
 * Provider convention (NOT CreatorWeave's concern — anyone can implement):
 *   The upstream page (or a userscript like Tampermonkey) is expected to
 *   expose:
 *     window.__sidePanelContextProvider = {
 *       getContext: () => any  // any shape; CreatorWeave does NOT parse
 *     }
 *   This is a soft convention between the upstream site and the browser
 *   extension — neither this file nor CreatorWeave enforces it.
 *
 * Why pull (not push):
 *   - Context is fetched fresh on every LLM call, so user changes on the
 *     upstream page (e.g. switching tabs in the workspace) are reflected
 *     immediately.
 *   - No module-level context state to manage or invalidate.
 *
 * Why NOT WebMCP:
 *   - WebMCP tools are visible to the LLM in its tool catalog. The agent
 *     would call them itself. We want CreatorWeave to inject context once
 *     into the system prompt, not expose it as a re-callable tool.
 */

const SIDE_PANEL_FLAG_KEY = '__cw_workspace_assistant_pending'
const SIDE_PANEL_HOSTNAME_KEY = '__cw_workspace_assistant_hostname'
const SIDE_PANEL_TABID_KEY = '__cw_workspace_assistant_tabid'

//=============================================================================
// Module-level state
//=============================================================================
//
// We only remember the routing metadata (tabId, hostname). Page context
// is NOT stored here — it's fetched fresh each time fetchSidePanelContext()
// is called.

let _sidePanelTabId: number | null = null
let _sidePanelHostname: string | null = null

export function isSidePanelMode(): boolean {
  return _sidePanelTabId != null
}

export function getSidePanelHostname(): string | null {
  return _sidePanelHostname
}


//=============================================================================
// Recovery from sessionStorage
//=============================================================================
//
// Vite HMR can re-evaluate this module AFTER the IIFE below has already
// run and stripped `?tabId=&origin=` from the URL hash. Without this
// backstop, the module-level state resets to null and isSidePanelMode()
// would falsely report false even though CreatorWeave is genuinely
// running in a side panel — causing enhancements.ts to skip the page
// context block silently.
//
// We restore tabId + hostname from sessionStorage BEFORE the IIFE runs.
// Then the IIFE either:
//   - finds a fresh ?tabId= in the URL and overwrites (normal first load), OR
//   - sees a clean URL (HMR re-eval) and returns early, leaving the
//     recovered state intact.
//
// SIDE_PANEL_FLAG_KEY is NOT restored here — handleWorkspaceAssistantOnReady
// owns its lifecycle (it consumes + removes that key after project routing).
function recoverFromSessionStorage() {
  try {
    const persistedTabId = sessionStorage.getItem(SIDE_PANEL_TABID_KEY)
    if (persistedTabId) {
      const n = Number(persistedTabId)
      if (Number.isFinite(n)) _sidePanelTabId = n
    }
    const persistedHostname = sessionStorage.getItem(SIDE_PANEL_HOSTNAME_KEY)
    if (persistedHostname) _sidePanelHostname = persistedHostname
  } catch {}
}
recoverFromSessionStorage()

//=============================================================================
// Runtime context fetch
//=============================================================================

/**
 * Fetch the upstream tab's context by asking the browser extension to
 * pull it. Returns whatever the provider's `getContext()` returns (any
 * shape). Returns `null` if:
 *   - not in side panel mode
 *   - the browser extension bridge is unavailable (no content script
 *     injected on this page, e.g. CreatorWeave opened in a regular tab
 *     without the extension being active on that origin)
 *   - the upstream tab did not expose a provider
 *   - the request times out or fails for any reason
 *
 * The pull goes through the existing `window.__agentWeb.fetchSidePanelContext`
 * bridge — NOT `chrome.runtime.sendMessage` directly. CreatorWeave always
 * runs in a regular web page context (localhost:5173 in dev, the prod
 * domain in prod), even when the page is displayed inside a Chrome
 * extension side panel iframe. Web pages don't have access to the
 * `chrome.runtime` API; the only legitimate way to talk to the extension
 * from CreatorWeave is via the content-script bridge that `injected.content.ts`
 * (MAIN world) and `content.ts` (ISOLATED world, matches <all_urls>)
 * set up — relay: window.postMessage ↔ chrome.runtime.sendMessage.
 *
 * `background.ts` handles `requestSidePanelContext` by calling
 * `chrome.scripting.executeScript({world:'MAIN'})` on the upstream tab
 * to read `window.__sidePanelContextProvider.getContext()`.
 *
 * 3-second timeout: extensions that hang (e.g. page in a weird state)
 * must not block LLM calls indefinitely.
 */
const CONTEXT_FETCH_TIMEOUT_MS = 3000

export async function fetchSidePanelContext(): Promise<unknown | null> {
  if (_sidePanelTabId == null) return null

  const agentWeb = (
    globalThis as {
      __agentWeb?: {
        fetchSidePanelContext?: (tabId: number) => Promise<unknown>
      }
    }
  ).__agentWeb
  if (!agentWeb?.fetchSidePanelContext) {
    // eslint-disable-next-line no-console
    console.warn(
      '[Workspace Assistant] window.__agentWeb.fetchSidePanelContext not available',
      {
        hasAgentWeb: !!agentWeb,
        hasMethod: !!agentWeb?.fetchSidePanelContext,
        hint: 'Is the CreatorWeave browser extension installed and active on this origin?',
      },
    )
    return null
  }

  try {
    const result = await Promise.race([
      agentWeb.fetchSidePanelContext(_sidePanelTabId),
      new Promise<unknown>((_, reject) =>
        setTimeout(
          () => reject(new Error('context fetch timeout')),
          CONTEXT_FETCH_TIMEOUT_MS,
        ),
      ),
    ])
    return (result as unknown) ?? null
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[Workspace Assistant] fetch context failed:', err)
    return null
  }
}

//=============================================================================
// URL capture — runs synchronously at module load (before React Router
// can modify the hash). Records tabId + hostname, then strips params.
//=============================================================================

function extractHostname(originLike: string | null): string | null {
  if (!originLike) return null
  try {
    return new URL(originLike).hostname || null
  } catch {
    return null
  }
}

;(function captureTriggerOnLoad() {
  if (typeof window === 'undefined') return

  const hash = window.location.hash || ''
  const queryStart = hash.indexOf('?')
  const params =
    queryStart !== -1 ? new URLSearchParams(hash.slice(queryStart + 1)) : null

  // ── Diagnostic: log what the IIFE actually sees on each invocation.
  //    Includes parsed param values so we can see why _sidePanelTabId is
  //    null without instrumenting every call site. Fires even on early
  //    return so we can distinguish "URL had no ?tabId=" from "tabId was
  //    a non-numeric string".
  // eslint-disable-next-line no-console
  console.log('[Workspace Assistant IIFE]', {
    hash: hash.slice(0, 120),
    hasQuery: queryStart !== -1,
    source: params?.get('source') ?? null,
    tabIdStr: params?.get('tabId') ?? null,
    origin: params?.get('origin') ?? null,
    recoveredTabId: _sidePanelTabId,
    recoveredHostname: _sidePanelHostname,
  })

  if (queryStart === -1) return
  if (!params || params.get('source') !== 'side_panel') return

  const tabIdStr = params.get('tabId')
  const tabId = tabIdStr ? Number(tabIdStr) : NaN
  if (Number.isFinite(tabId)) {
    _sidePanelTabId = tabId
    try {
      sessionStorage.setItem(SIDE_PANEL_TABID_KEY, String(tabId))
    } catch {}
  }

  const hostname = extractHostname(params.get('origin'))
  if (hostname) {
    _sidePanelHostname = hostname
    sessionStorage.setItem(SIDE_PANEL_FLAG_KEY, '1')
    sessionStorage.setItem(SIDE_PANEL_HOSTNAME_KEY, hostname)
  }

  // eslint-disable-next-line no-console
  console.log(
    '[Workspace Assistant] Side panel mode:',
    'hostname:',
    hostname,
    'tabId:',
    _sidePanelTabId,
  )

  // Clean URL params so they don't persist on refresh
  const cleanHash = hash.slice(0, queryStart)
  window.history.replaceState(
    {},
    document.title,
    window.location.pathname + cleanHash,
  )
})()

//=============================================================================
// AppReady handler — find-or-create the per-hostname project.
//=============================================================================
//
// Per-hostname project routing (refactored 2026-07-13): one upstream
// hostname maps to one CreatorWeave project, regardless of how many tabs
// the user has open on that site. Rationale:
//   - hostname is stable across navigations; tabId is ephemeral
//   - matches user mental model: "the workspace.jianguoyun.com project"
//   - avoids cluttering the sidebar with one project per tab
//   - the new pull-based context architecture (`fetchSidePanelContext`
//     pulls fresh page context from the *current* upstream tab at every
//     LLM call) means a shared project doesn't leak page content across
//     tabs — the prompt always reflects the page the user is currently
//     looking at. Conversation history is shared, page context isn't.
//
// `tabId` is still captured (needed for the context-pull bridge) but it
// no longer participates in project routing. Falls back to tabId only
// when the user opened CreatorWeave directly without going through the
// extension (rare — no upstream origin → no hostname).

const HOSTNAME_TO_PROJECT_KEY = 'cw_side_panel_hostname_project_map_v1'

export async function handleWorkspaceAssistantOnReady(
  navigate: (path: string) => void,
): Promise<void> {
  if (!sessionStorage.getItem(SIDE_PANEL_FLAG_KEY)) return
  sessionStorage.removeItem(SIDE_PANEL_FLAG_KEY)

  const hostname = sessionStorage.getItem(SIDE_PANEL_HOSTNAME_KEY)
  sessionStorage.removeItem(SIDE_PANEL_HOSTNAME_KEY)

  // Prefer hostname. Fall back to tabId only when no origin was provided
  // (e.g. user opened CreatorWeave directly without the extension).
  const projectKey = hostname || (_sidePanelTabId != null ? `tab-${_sidePanelTabId}` : null)
  if (!projectKey) return

  try {
    const { useProjectStore } = await import('@/store/project.store')
    const store = useProjectStore.getState()

    let projectId: string | null = null

    // Try saved id
    try {
      const raw = localStorage.getItem(HOSTNAME_TO_PROJECT_KEY)
      if (raw) {
        const map = JSON.parse(raw) as Record<string, string>
        if (map[projectKey] && store.projects.some((p) => p.id === map[projectKey])) {
          projectId = map[projectKey]
        }
      }
    } catch {}

    if (!projectId) {
      const existing = store.projects.find((p) => p.name === projectKey)
      if (existing) projectId = existing.id
    }

    if (!projectId) {
      const project = await store.createProject(projectKey)
      if (!project) return
      projectId = project.id
    }

    try {
      const raw = localStorage.getItem(HOSTNAME_TO_PROJECT_KEY)
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
      map[projectKey] = projectId!
      localStorage.setItem(HOSTNAME_TO_PROJECT_KEY, JSON.stringify(map))
    } catch {}

    navigate(`/projects/${encodeURIComponent(projectId!)}/workspace`)
  } catch (err) {
    console.warn('[Workspace Assistant] Failed to handle side panel open:', err)
  }
}