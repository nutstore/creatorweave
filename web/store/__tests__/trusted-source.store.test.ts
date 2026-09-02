import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isToolSourceTrusted, useTrustedSourceStore } from '../trusted-source.store'

describe('trusted-source.store', () => {
  beforeEach(() => {
    useTrustedSourceStore.getState().setDefaultTrustExternal(true)
    // Isolation against persisted localStorage state leaking across tests.
    window.localStorage.clear()
    useTrustedSourceStore.getState().setDefaultTrustExternal(true)
  })
  afterEach(() => {
    useTrustedSourceStore.getState().setDefaultTrustExternal(true)
    window.localStorage.clear()
  })

  it('default trust is ON: any discovered source qualifies without prompts', () => {
    expect(useTrustedSourceStore.getState().defaultTrustExternal).toBe(true)
    expect(isToolSourceTrusted('webmcp', 'workspace.jianguoyun.com')).toBe(true)
    expect(isToolSourceTrusted('mcp', 'fresh-server')).toBe(true)
  })

  it('turning the global switch OFF restores per-call approval', () => {
    useTrustedSourceStore.getState().setDefaultTrustExternal(false)

    expect(isToolSourceTrusted('webmcp', 'workspace.jianguoyun.com')).toBe(false)
    expect(isToolSourceTrusted('mcp', 'fresh-server')).toBe(false)
  })

  it('origin identity does not affect the answer under the global-only model', () => {
    // kind/sourceId stay in the signature for call-site stability, but the
    // single switch governs every origin equally.
    expect(isToolSourceTrusted('webmcp', 'a.example.com')).toBe(
      isToolSourceTrusted('mcp', 'b.example.com')
    )
    expect(isToolSourceTrusted('webmcp', '')).toBe(true)
    expect(isToolSourceTrusted('webmcp', null)).toBe(true)
  })

  it('untrusted-content tools never match, regardless of the switch', () => {
    // Default ON.
    expect(
      isToolSourceTrusted('webmcp', 'example.com', { untrustedContent: true })
    ).toBe(false)
    expect(
      isToolSourceTrusted('webmcp', 'example.com', { untrustedContent: false })
    ).toBe(true)

    // And with the switch OFF they stay denied-by-trust either way.
    useTrustedSourceStore.getState().setDefaultTrustExternal(false)
    expect(
      isToolSourceTrusted('webmcp', 'example.com', { untrustedContent: true })
    ).toBe(false)
    expect(
      isToolSourceTrusted('webmcp', 'example.com', { untrustedContent: false })
    ).toBe(false)
  })

  it('persists the switch via zustand persist', () => {
    useTrustedSourceStore.getState().setDefaultTrustExternal(false)
    const persisted = window.localStorage.getItem(
      'creatorweave-trusted-source-store'
    )
    expect(persisted).toBeTruthy()
    // zustand persist wraps the state: { state: {...}, version }
    expect(JSON.parse(persisted!).state).toEqual({
      defaultTrustExternal: false,
    })
  })
})
