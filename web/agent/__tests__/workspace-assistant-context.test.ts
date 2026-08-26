import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('workspace assistant side-panel state', () => {
  beforeEach(() => {
    vi.resetModules()
    sessionStorage.clear()
    window.history.replaceState(
      {},
      document.title,
      '/#/?source=side_panel&binding=7e30f3b0-d790-4d42-9e05-8f3d38e90be4&origin=https%3A%2F%2Fdocs.example.com',
    )
  })

  afterEach(() => {
    window.history.replaceState({}, document.title, '/')
  })

  it('removes transient URL metadata and restores the opaque binding from session storage', async () => {
    const context = await import('../workspace-assistant-context')

    expect(context.isSidePanelMode()).toBe(true)
    expect(context.getSidePanelBindingId()).toBe('7e30f3b0-d790-4d42-9e05-8f3d38e90be4')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#/')

    vi.resetModules()
    const refreshedContext = await import('../workspace-assistant-context')
    expect(refreshedContext.isSidePanelMode()).toBe(true)
    expect(refreshedContext.getSidePanelBindingId()).toBe('7e30f3b0-d790-4d42-9e05-8f3d38e90be4')
  })
})
