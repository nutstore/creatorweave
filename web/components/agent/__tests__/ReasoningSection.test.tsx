import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReasoningSection } from '../ReasoningSection'

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

describe('ReasoningSection', () => {
  it('renders reasoning summaries with the shared Markdown renderer', () => {
    render(
      <ReasoningSection
        reasoning={'**Assessing persistence policy**\n\n- Current preference: `confirm`\n- User confirmation is required'}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /workflow\.thinkingProcess/i }))

    expect(screen.getByText('Assessing persistence policy').tagName).toBe('STRONG')
    expect(screen.getByText('Current preference:').closest('li')).toHaveTextContent('confirm')
    expect(screen.getByText('User confirmation is required').closest('li')).not.toBeNull()
  })
})
