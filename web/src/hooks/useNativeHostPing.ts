/**
 * useNativeHostPing — real connectivity probe for the native-host bridge.
 *
 * The shallow probe (`typeof window.__agentWeb?.nativeHostCall === 'function'`)
 * only proves the EXTENSION injected the bridge — not that the Rust native
 * host application is installed and running. With the extension installed but
 * the Rust app missing, that probe shows an entry point which fails with a
 * raw Chrome error ("Native messaging host not found") on first click.
 *
 * This hook sends a side-effect-free `ping` through the full chain
 * (page → content script → extension background → Rust host) and only
 * reports available === true when the host actually answers.
 *
 * Semantics:
 * - 'unavailable'  bridge missing (no extension) OR ping failed/timed out
 *                  (extension present but Rust app not installed/running)
 * - 'probing'      ping in flight (treat as unavailable for gating UI —
 *                  buttons fade in when the host answers)
 * - 'available'    ping round-tripped successfully
 *
 * Re-probes when the page regains focus, so installing the Rust app while
 * the tab is open is picked up without a manual refresh.
 */

import { useCallback, useEffect, useState } from 'react'

export type NativeHostPingState = 'probing' | 'available' | 'unavailable'

const PING_TIMEOUT_MS = 2000

function callPing(): Promise<{ ok?: boolean } | null> {
  const w = window as unknown as {
    __agentWeb?: { nativeHostCall?: (payload: { action: string }) => Promise<unknown> }
  }
  const fn = w.__agentWeb?.nativeHostCall
  if (typeof fn !== 'function') return Promise.resolve(null)
  return Promise.race([
    fn.call(w.__agentWeb, { action: 'ping' }) as Promise<{ ok?: boolean }>,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), PING_TIMEOUT_MS)),
  ]).catch(() => null)
}

export function useNativeHostPing(): NativeHostPingState {
  const [state, setState] = useState<NativeHostPingState>(() => {
    if (typeof window === 'undefined') return 'unavailable'
    const w = window as unknown as { __agentWeb?: { nativeHostCall?: unknown } }
    return typeof w.__agentWeb?.nativeHostCall === 'function' ? 'probing' : 'unavailable'
  })

  const probe = useCallback(async () => {
    const w = window as unknown as { __agentWeb?: { nativeHostCall?: unknown } }
    if (typeof w.__agentWeb?.nativeHostCall !== 'function') {
      setState('unavailable')
      return
    }
    const resp = await callPing()
    setState(resp && resp.ok === true ? 'available' : 'unavailable')
  }, [])

  useEffect(() => {
    void probe()
    // Re-probe on focus: installing the Rust app while the tab is open
    // should be picked up without a refresh.
    const onFocus = () => void probe()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [probe])

  return state
}
