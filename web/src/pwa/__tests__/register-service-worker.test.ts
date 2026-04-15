import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from '../register-service-worker'

type EventHandler = (event?: Event) => void

function createEventTargetMock() {
  const listeners = new Map<string, Set<EventHandler>>()

  return {
    addEventListener: vi.fn((type: string, handler: EventHandler) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(handler)
    }),
    removeEventListener: vi.fn((type: string, handler: EventHandler) => {
      listeners.get(type)?.delete(handler)
    }),
    dispatch(type: string, event?: Event) {
      listeners.get(type)?.forEach((handler) => handler(event))
    },
  }
}

describe('registerServiceWorker', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
  let windowMock: ReturnType<typeof createEventTargetMock>

  beforeEach(() => {
    windowMock = createEventTargetMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
    }
  })

  it('registers with versioned script url and updateViaCache=none on load', async () => {
    const register = vi.fn(async () => ({
      addEventListener: vi.fn(),
      waiting: null,
      update: vi.fn(),
    }))

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        register,
        addEventListener: vi.fn(),
      },
    })

    registerServiceWorker({
      buildId: 'build-123',
      windowTarget: windowMock,
      reload: vi.fn(),
      updateIntervalMs: 60_000,
    })

    await windowMock.dispatch('load')

    expect(register).toHaveBeenCalledWith('/sw.js?v=build-123', {
      scope: '/',
      updateViaCache: 'none',
    })
  })

  it('asks waiting worker to skip waiting when update is installed', async () => {
    const waitingPostMessage = vi.fn()
    const installingWorker = createEventTargetMock()
    ;(installingWorker as unknown as { state: string }).state = 'installed'

    let updateFoundHandler: EventHandler | undefined

    const registration = {
      waiting: { postMessage: waitingPostMessage },
      installing: installingWorker,
      update: vi.fn(),
      addEventListener: vi.fn((type: string, handler: EventHandler) => {
        if (type === 'updatefound') updateFoundHandler = handler
      }),
    }

    const register = vi.fn(async () => registration)

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        register,
        addEventListener: vi.fn(),
      },
    })

    registerServiceWorker({
      buildId: 'build-123',
      windowTarget: windowMock,
      reload: vi.fn(),
      updateIntervalMs: 60_000,
    })

    await windowMock.dispatch('load')
    updateFoundHandler?.()
    installingWorker.dispatch('statechange')

    expect(waitingPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })
})
