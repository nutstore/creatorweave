import { describe, expect, it, vi } from 'vitest'
import { createInstallPromptController, type InstallPromptState } from '../install-prompt'

interface MiniWindow {
  listeners: Map<string, Set<(event?: unknown) => void>>
  localStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }
  matchMedia?: (query: string) => { matches: boolean }
  navigator: { standalone?: boolean }
}

function createFakeWindow(options: Partial<MiniWindow> = {}): Window {
  const listeners = new Map<string, Set<(event?: unknown) => void>>()
  const store = new Map<string, string>()
  const win = {
    listeners,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    matchMedia: options.matchMedia ?? (() => ({ matches: false })),
    navigator: options.navigator ?? {},
    addEventListener: (type: string, handler: (event?: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(handler)
    },
    removeEventListener: (type: string, handler: (event?: unknown) => void) => {
      listeners.get(type)?.delete(handler)
    },
  }
  return win as unknown as Window
}

/** Internal access to the fake's listener map for dispatching DOM events. */
function listenersOf(win: Window): Map<string, Set<(event?: unknown) => void>> {
  return (win as unknown as { listeners: Map<string, Set<(event?: unknown) => void>> }).listeners
}

function dispatch(win: Window, type: string, event?: unknown) {
  listenersOf(win).get(type)?.forEach((handler) => handler(event))
}

function makePromptEvent() {
  const prompt = vi.fn(async () => {})
  const userChoice = Promise.resolve({ outcome: 'accepted' as const })
  const preventDefault = vi.fn()
  return { prompt, userChoice, preventDefault }
}

describe('createInstallPromptController', () => {
  it('starts unavailable, not installed, not dismissed', () => {
    const controller = createInstallPromptController(createFakeWindow())
    expect(controller.getState()).toEqual<InstallPromptState>({
      available: false,
      installed: false,
      dismissed: false,
    })
  })

  it('captures beforeinstallprompt: preventDefault + available state change', () => {
    const win = createFakeWindow()
    const controller = createInstallPromptController(win)
    const listener = vi.fn()
    controller.onStateChange(listener)

    const event = makePromptEvent()
    dispatch(win, 'beforeinstallprompt', event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(controller.getState().available).toBe(true)
    expect(listener).toHaveBeenCalled()
  })

  it('prompt() forwards to the captured event and resolves with userChoice', async () => {
    const win = createFakeWindow()
    const controller = createInstallPromptController(win)
    const event = makePromptEvent()
    dispatch(win, 'beforeinstallprompt', event)

    await expect(controller.prompt()).resolves.toBe('accepted')
    expect(event.prompt).toHaveBeenCalledOnce()
  })

  it('prompt() without a captured event resolves unavailable and never throws', async () => {
    const controller = createInstallPromptController(createFakeWindow())
    await expect(controller.prompt()).resolves.toBe('unavailable')
  })

  it('a second prompt() resolves unavailable — Chrome allows one prompt per page load', async () => {
    const win = createFakeWindow()
    const controller = createInstallPromptController(win)
    dispatch(win, 'beforeinstallprompt', makePromptEvent())

    await expect(controller.prompt()).resolves.toBe('accepted')
    await expect(controller.prompt()).resolves.toBe('unavailable')
  })

  it('appinstalled marks installed and drops the capture (card must go away)', () => {
    const win = createFakeWindow()
    const controller = createInstallPromptController(win)
    dispatch(win, 'beforeinstallprompt', makePromptEvent())
    expect(controller.getState().available).toBe(true)

    dispatch(win, 'appinstalled', {})

    expect(controller.getState()).toMatchObject({ installed: true, available: false })
  })

  describe('dismissal', () => {
    it('dismiss() persists to localStorage and updates state', () => {
      const win = createFakeWindow()
      const controller = createInstallPromptController(win)

      controller.dismiss()

      expect(controller.getState().dismissed).toBe(true)
      expect(win.localStorage.getItem('cw-pwa-install-dismissed-v1')).toBe('1')
      expect(controller.isDismissedPersisted()).toBe(true)
    })

    it('refresh() adopts a previously persisted dismissal', () => {
      const win = createFakeWindow()
      win.localStorage.setItem('cw-pwa-install-dismissed-v1', '1')
      const controller = createInstallPromptController(win)
      expect(controller.getState().dismissed).toBe(false)

      controller.refresh()

      expect(controller.getState().dismissed).toBe(true)
    })

    it('appinstalled clears the dismissal (give the card another chance post-install)', () => {
      const win = createFakeWindow()
      const controller = createInstallPromptController(win)
      controller.dismiss()
      expect(controller.getState().dismissed).toBe(true)

      dispatch(win, 'appinstalled', {})

      expect(controller.getState().dismissed).toBe(false)
    })
  })

  describe('installed detection', () => {
    it('refresh() detects standalone display-mode', () => {
      const win = createFakeWindow({ matchMedia: (q: string) => ({ matches: q.includes('standalone') }) })
      const controller = createInstallPromptController(win)
      expect(controller.getState().installed).toBe(false)

      controller.refresh()

      expect(controller.getState().installed).toBe(true)
    })

    it('refresh() detects iOS navigator.standalone', () => {
      const win = createFakeWindow({ navigator: { standalone: true } })
      const controller = createInstallPromptController(win)

      controller.refresh()

      expect(controller.getState().installed).toBe(true)
    })
  })

  describe('pre-hydration buffer adoption (__cwInstallPromptCapture)', () => {
    it('adopts an event buffered by the layout inline script', () => {
      const win = createFakeWindow()
      const buffered = makePromptEvent()
      ;(win as unknown as Record<string, unknown>).__cwInstallPromptCapture = buffered

      const controller = createInstallPromptController(win)

      expect(controller.getState().available).toBe(true)
      // Buffer must be consumed, not left dangling on window.
      expect((win as unknown as Record<string, unknown>).__cwInstallPromptCapture).toBeUndefined()
      // And the adopted event is actually promptable.
      return expect(controller.prompt()).resolves.toBe('accepted')
    })

    it('a late beforeinstallprompt still works when no buffer was set', () => {
      const win = createFakeWindow()
      const controller = createInstallPromptController(win)
      dispatch(win, 'beforeinstallprompt', makePromptEvent())
      expect(controller.getState().available).toBe(true)
    })
  })

  describe('state snapshot stability (useSyncExternalStore contract)', () => {
    it('getState returns the same object identity when nothing changed', () => {
      const controller = createInstallPromptController(createFakeWindow())
      expect(controller.getState()).toBe(controller.getState())
    })

    it('getState returns a new identity only when state actually changes', () => {
      const win = createFakeWindow()
      const controller = createInstallPromptController(win)
      const before = controller.getState()
      controller.refresh() // no-op refresh — same values
      expect(controller.getState()).toBe(before)

      controller.dismiss()
      expect(controller.getState()).not.toBe(before)
    })

    it('unsubscribing stops listener callbacks', () => {
      const win = createFakeWindow()
      const controller = createInstallPromptController(win)
      const listener = vi.fn()
      const unsubscribe = controller.onStateChange(listener)
      unsubscribe()

      controller.dismiss()

      expect(listener).not.toHaveBeenCalled()
    })
  })
})
