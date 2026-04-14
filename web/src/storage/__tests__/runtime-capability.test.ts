import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeCapability } from '../runtime-capability'

describe('runtime-capability', () => {
  const originalShowDirectoryPicker = window.showDirectoryPicker
  const originalStorage = navigator.storage

  afterEach(() => {
    if (originalShowDirectoryPicker) {
      window.showDirectoryPicker = originalShowDirectoryPicker
    } else {
      delete (window as Partial<Window>).showDirectoryPicker
    }

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: originalStorage,
    })

    vi.restoreAllMocks()
  })

  it('can run app in OPFS-only mode when directory picker is unavailable', () => {
    delete (window as Partial<Window>).showDirectoryPicker
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn(),
      },
    })

    const capability = getRuntimeCapability()

    expect(capability.canPickDirectory).toBe(false)
    expect(capability.canUseOPFS).toBe(true)
    expect(capability.canRunApp).toBe(true)
  })

  it('reports directory picker capability when picker is available', () => {
    window.showDirectoryPicker = vi.fn()
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn(),
      },
    })

    const capability = getRuntimeCapability()

    expect(capability.canPickDirectory).toBe(true)
    expect(capability.canUseOPFS).toBe(true)
    expect(capability.canRunApp).toBe(true)
  })

  it('cannot run app when neither directory picker nor OPFS is available', () => {
    delete (window as Partial<Window>).showDirectoryPicker
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {},
    })

    const capability = getRuntimeCapability()

    expect(capability.canPickDirectory).toBe(false)
    expect(capability.canUseOPFS).toBe(false)
    expect(capability.canRunApp).toBe(false)
  })
})
