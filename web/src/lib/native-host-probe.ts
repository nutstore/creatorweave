/**
 * native-host-probe — cached connectivity probe for the Rust native host.
 *
 * The shallow probe (`typeof window.__agentWeb?.nativeHostCall === 'function'`)
 * only proves the EXTENSION injected the bridge — not that the Rust native
 * host binary is installed and reachable. With the extension installed but
 * the Rust app missing, tool registration (exec/processes) and UI entry
 * points (folder mount) would pass the shallow gate and fail later with a
 * raw Chrome error ("Native messaging host not found") on first use.
 *
 * This module owns the single source of truth for real connectivity:
 *   page → content script → extension background → sendNativeMessage
 *   → Rust host `ping` (side-effect-free, returns {ok:true, pong:true}).
 *
 * Design:
 * - Module-level cache + in-flight dedup: at most one ping per cooldown
 *   window, shared by every consumer (React hook, tool registry, stores).
 * - Synchronous `isNativeHostReachable()` reads the cache — safe to call in
 *   non-React code paths (tool-registry gates, store guards).
 * - `subscribe()` lets React hooks and the tool registry re-check when the
 *   state flips (e.g. the Rust app gets installed while the tab is open).
 * - Unknown state (no probe answered yet) counts as NOT reachable for
 *   gating. Consumers that prefer optimistic display can read
 *   `getNativeHostProbeState()` directly.
 *
 * NOT a liveness monitor: after a successful ping we trust the host until
 * a real call fails; failed probes are retried on the next window focus
 * or explicit `reprobeNativeHost()` call.
 */

export type NativeHostProbeState = 'unknown' | 'probing' | 'reachable' | 'unreachable'

const PING_TIMEOUT_MS = 2000
const FAILURE_COOLDOWN_MS = 15_000

let state: NativeHostProbeState = 'unknown'
let lastFailureAt = 0
let inFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

function getBridge(): { nativeHostCall: (p: { action: string }) => Promise<unknown> } | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    __agentWeb?: { nativeHostCall?: (p: { action: string }) => Promise<unknown> }
  }
  const fn = w.__agentWeb?.nativeHostCall
  if (typeof fn !== 'function') return null
  return { nativeHostCall: (p) => fn.call(w.__agentWeb, p) }
}

function setState(next: NativeHostProbeState): void {
  if (state === next) return
  state = next
  for (const notify of listeners) notify()
}

async function pingOnce(): Promise<boolean> {
  const bridge = getBridge()
  if (!bridge) return false
  try {
    const resp = (await Promise.race([
      bridge.nativeHostCall({ action: 'ping' }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PING_TIMEOUT_MS)),
    ])) as { ok?: boolean } | null
    return !!resp && resp.ok === true
  } catch {
    return false
  }
}

/** Kick off (or join) a probe. Safe to call repeatedly. */
export function probeNativeHost(): Promise<void> {
  const bridge = getBridge()
  if (!bridge) {
    setState('unreachable')
    return Promise.resolve()
  }
  if (state === 'reachable') return Promise.resolve()
  // Cooldown: a host that just failed doesn't get hammered on every call —
  // unless the state is still 'unknown' (first load, never answered).
  if (state === 'unreachable' && Date.now() - lastFailureAt < FAILURE_COOLDOWN_MS) {
    return Promise.resolve()
  }
  if (inFlight) return inFlight
  setState('probing')
  inFlight = pingOnce()
    .then((ok) => {
      if (ok) {
        setState('reachable')
      } else {
        lastFailureAt = Date.now()
        setState('unreachable')
      }
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** Convenience wrapper: fire-and-forget probe (event handlers, focus). */
export function reprobeNativeHost(): void {
  // Cooldown only applies after a completed failure; force a fresh attempt
  // by clearing the timestamp when the caller explicitly asks for a reprobe.
  lastFailureAt = 0
  void probeNativeHost()
}

/** Synchronous cache read — the gate for non-React consumers. */
export function isNativeHostReachable(): boolean {
  return state === 'reachable'
}

/** Full state for UI (e.g. show a spinner while probing). */
export function getNativeHostProbeState(): NativeHostProbeState {
  return state
}

/** Subscribe to state flips. Returns an unsubscribe function. */
export function subscribeNativeHostProbe(notify: () => void): () => void {
  listeners.add(notify)
  return () => listeners.delete(notify)
}
