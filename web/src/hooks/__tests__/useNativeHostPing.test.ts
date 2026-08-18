import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeHostPing } from '../useNativeHostPing'

type Bridge = {
  nativeHostCall?: (payload: { action: string }) => Promise<unknown>
}

function setBridge(bridge: Bridge | undefined) {
  const w = window as unknown as { __agentWeb?: Bridge }
  if (bridge) w.__agentWeb = bridge
  else delete w.__agentWeb
}

describe('useNativeHostPing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    setBridge(undefined)
  })

  it('reports unavailable immediately when the bridge is missing (no extension)', () => {
    setBridge(undefined)
    const { result } = renderHook(() => useNativeHostPing())
    expect(result.current).toBe('unavailable')
  })

  it('reports available after a successful ping round-trip', async () => {
    const nativeHostCall = vi.fn(async () => ({ ok: true }))
    setBridge({ nativeHostCall })

    const { result } = renderHook(() => useNativeHostPing())
    expect(result.current).toBe('probing')

    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(result.current).toBe('available')
    expect(nativeHostCall).toHaveBeenCalledWith({ action: 'ping' })
  })

  it('reports unavailable when the host answers !ok (extension present, Rust app missing)', async () => {
    const nativeHostCall = vi.fn(async () => ({ ok: false, error: 'host not found' }))
    setBridge({ nativeHostCall })

    const { result } = renderHook(() => useNativeHostPing())
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(result.current).toBe('unavailable')
  })

  it('reports unavailable when the bridge throws (sendNativeMessage rejects)', async () => {
    const nativeHostCall = vi.fn(async () => {
      throw new Error('Native messaging host not found')
    })
    setBridge({ nativeHostCall })

    const { result } = renderHook(() => useNativeHostPing())
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(result.current).toBe('unavailable')
  })

  it('reports unavailable when the ping times out', async () => {
    const nativeHostCall = vi.fn(() => new Promise(() => {})) // never settles
    setBridge({ nativeHostCall })

    const { result } = renderHook(() => useNativeHostPing())
    expect(result.current).toBe('probing')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    expect(result.current).toBe('unavailable')
  })

  it('re-probes on window focus', async () => {
    let ok = false
    setBridge({
      nativeHostCall: vi.fn(async () => ({ ok })),
    })

    const { result } = renderHook(() => useNativeHostPing())
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(result.current).toBe('unavailable')

    // User installs the Rust app, then returns to the tab.
    ok = true
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(result.current).toBe('available')
  })
})
