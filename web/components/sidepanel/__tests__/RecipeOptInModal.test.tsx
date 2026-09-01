import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dismissRecipePromptMock = vi.fn()
const enableRecipeAndReloadMock = vi.fn<(id: string) => Promise<boolean>>()

vi.mock('@/agent/sidepanel-recipe-prompt', () => ({
  dismissRecipePrompt: (...args: unknown[]) => dismissRecipePromptMock(...args),
  enableRecipeAndReload: (...args: unknown[]) => enableRecipeAndReloadMock(...(args as [string])),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { toast } from 'sonner'
import { RecipeOptInModal } from '../RecipeOptInModal'

const recipe = {
  id: 'jmessage-world',
  displayName: 'JMessage — Epstein iMessage Archive',
  description: 'Search and read iMessage threads.',
  glyph: '💬',
  hostname: 'jmail.world',
  toolCount: 3,
}

describe('RecipeOptInModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders recipe metadata (glyph, hostname, tool count)', () => {
    render(<RecipeOptInModal recipe={recipe} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('jmail.world')).toBeTruthy()
    expect(screen.getByText(recipe.displayName)).toBeTruthy()
    // description contains the interpolated tool count
    expect(screen.getByText(/3/)).toBeTruthy()
  })

  it('confirm: enables + shows success toast + closes', async () => {
    enableRecipeAndReloadMock.mockResolvedValue(true)
    const onClose = vi.fn()
    render(<RecipeOptInModal recipe={recipe} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Enable & reload page' }))
    await waitFor(() => {
      expect(enableRecipeAndReloadMock).toHaveBeenCalledWith('jmessage-world')
      expect(toast.success).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalledTimes(1)
    })
    expect(dismissRecipePromptMock).not.toHaveBeenCalled()
  })

  it('confirm with failure: shows error toast, records cooldown, closes', async () => {
    enableRecipeAndReloadMock.mockResolvedValue(false)
    const onClose = vi.fn()
    render(<RecipeOptInModal recipe={recipe} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Enable & reload page' }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
      expect(dismissRecipePromptMock).toHaveBeenCalledWith('jmessage-world')
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('"not now" records the dismissal cooldown and closes without enabling', () => {
    const onClose = vi.fn()
    render(<RecipeOptInModal recipe={recipe} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(dismissRecipePromptMock).toHaveBeenCalledWith('jmessage-world')
    expect(enableRecipeAndReloadMock).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('unticking the switch turns confirm into a dismissal (no enable call)', async () => {
    const onClose = vi.fn()
    const { container } = render(<RecipeOptInModal recipe={recipe} onClose={onClose} />)

    const toggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Enable & reload page' }))

    await waitFor(() => {
      expect(dismissRecipePromptMock).toHaveBeenCalledWith('jmessage-world')
      expect(enableRecipeAndReloadMock).not.toHaveBeenCalled()
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
