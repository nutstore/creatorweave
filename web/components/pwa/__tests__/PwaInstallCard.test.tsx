import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Controllable fake controller — the component gets everything through
// getInstallPromptController(), so mocking that one factory is enough.
let state = { available: false, installed: false, dismissed: false }
const listeners = new Set<() => void>()

const fakeController = {
  refresh: vi.fn(),
  getState: vi.fn(() => state),
  isDismissedPersisted: vi.fn(() => false),
  onStateChange: vi.fn((listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }),
  prompt: vi.fn<() => Promise<'accepted' | 'dismissed' | 'unavailable'>>(async () => 'accepted'),
  dismiss: vi.fn(),
}

vi.mock('@/pwa/install-prompt', () => ({
  getInstallPromptController: () => fakeController,
}))

import { PwaInstallCard } from '../PwaInstallCard'

function setState(next: Partial<typeof state>) {
  state = { ...state, ...next }
}

describe('PwaInstallCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listeners.clear()
    state = { available: false, installed: false, dismissed: false }
    // clearAllMocks does NOT reset implementations (learned the hard way via
    // the io.tool mock-drift incident) — restore per-test defaults explicitly.
    fakeController.isDismissedPersisted.mockReturnValue(false)
    fakeController.prompt.mockResolvedValue('accepted')
  })

  it('renders nothing when no install prompt is available', () => {
    const { container } = render(<PwaInstallCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the app is already installed', () => {
    setState({ available: true, installed: true })
    const { container } = render(<PwaInstallCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the user dismissed before', () => {
    setState({ available: true })
    fakeController.isDismissedPersisted.mockReturnValue(true)
    const { container } = render(<PwaInstallCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the card with resolved i18n copy (not translation keys)', () => {
    setState({ available: true })
    render(<PwaInstallCard />)

    // Test locale is en-US → resolved copy, never the key path.
    expect(screen.getByText('Install as a desktop app')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
    expect(fakeController.refresh).toHaveBeenCalled()
  })

  it('install button triggers the native prompt via the controller', async () => {
    setState({ available: true })
    render(<PwaInstallCard />)

    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await vi.waitFor(() => expect(fakeController.prompt).toHaveBeenCalledOnce())
    expect(fakeController.dismiss).not.toHaveBeenCalled()
  })

  it('a "dismissed" native outcome also persists the dismissal', async () => {
    setState({ available: true })
    fakeController.prompt.mockResolvedValue('dismissed')
    render(<PwaInstallCard />)

    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await vi.waitFor(() => expect(fakeController.dismiss).toHaveBeenCalledOnce())
  })

  it('"Not now" dismisses through the controller', () => {
    setState({ available: true })
    render(<PwaInstallCard />)

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    expect(fakeController.dismiss).toHaveBeenCalledOnce()
    expect(fakeController.prompt).not.toHaveBeenCalled()
  })
})
