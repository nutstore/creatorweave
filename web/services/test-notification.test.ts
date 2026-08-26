import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { showTestNotification } from './test-notification'

const mockShowNotification = vi.fn()
const MockNotification = vi.fn()

describe('showTestNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'Notification', {
      value: MockNotification,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to the browser notification when Service Workers are unsupported', async () => {
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    await showTestNotification({ title: 'Test title', body: 'Test body' })

    expect(mockShowNotification).not.toHaveBeenCalled()
    expect(MockNotification).toHaveBeenCalledWith('Test title', {
      body: 'Test body',
      icon: '/favicon.svg',
      tag: expect.stringMatching(/^agent-notification-test-\d+$/),
    })
  })

  it('uses the registration resolved by serviceWorker.ready', async () => {
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({ showNotification: mockShowNotification }),
      },
      configurable: true,
      writable: true,
    })

    await showTestNotification({ title: 'Test title', body: 'Test body' })

    expect(mockShowNotification).toHaveBeenCalledWith(
      'Test title',
      expect.objectContaining({
        tag: expect.stringMatching(/^agent-notification-test-\d+$/),
      })
    )
  })
})
