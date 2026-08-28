import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('workspace assistant side-panel state', () => {
  const binding = '7e30f3b0-d790-4d42-9e05-8f3d38e90be4'
  const launchUrl = `/?source=side_panel&binding=${binding}&origin=https%3A%2F%2Fdocs.example.com`

  beforeEach(() => {
    vi.resetModules()
    sessionStorage.clear()
    window.history.replaceState({}, document.title, launchUrl)
  })

  afterEach(() => {
    window.history.replaceState({}, document.title, '/')
  })

  it('consumes normal-query launch metadata and restores the opaque binding from session storage', async () => {
    const context = await import('../workspace-assistant-context')

    expect(context.isSidePanelMode()).toBe(true)
    expect(context.getSidePanelBindingId()).toBe(binding)
    expect(context.hasPendingSidePanelProjectRoute()).toBe(true)
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('')

    vi.resetModules()
    const refreshedContext = await import('../workspace-assistant-context')
    expect(refreshedContext.isSidePanelMode()).toBe(true)
    expect(refreshedContext.getSidePanelBindingId()).toBe(binding)
    expect(refreshedContext.hasPendingSidePanelProjectRoute()).toBe(true)
  })

  it('continues to accept legacy hash-query launch URLs during extension rollout', async () => {
    vi.resetModules()
    sessionStorage.clear()
    window.history.replaceState({}, document.title, `/#/?source=side_panel&binding=${binding}&origin=https%3A%2F%2Fdocs.example.com`)

    const context = await import('../workspace-assistant-context')

    expect(context.isSidePanelMode()).toBe(true)
    expect(context.getSidePanelBindingId()).toBe(binding)
    expect(context.hasPendingSidePanelProjectRoute()).toBe(true)
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#/')
  })
})
