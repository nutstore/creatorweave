import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RunEndPolicySelect } from '../RunEndPolicySelect'

vi.mock('@/i18n', () => ({
  useT: () => (key: string, values?: { policy?: string }) => {
    const labels: Record<string, string> = {
      'agent.runEndPolicy.manual': 'Manual apply',
      'agent.runEndPolicy.auto': 'Auto-apply when complete',
      'agent.runEndPolicy.manualDescription': 'Review changes before applying them.',
      'agent.runEndPolicy.autoDescription': 'Apply this run’s conflict-free changes automatically.',
      'agent.runEndPolicy.menuLabel': 'Completion apply policy',
    }
    return key === 'agent.runEndPolicy.currentAriaLabel'
      ? `Completion policy: ${values?.policy}. Click to change.`
      : labels[key] ?? key
  },
}))

describe('RunEndPolicySelect', () => {
  it('uses menu radio semantics and reports the selected policy', () => {
    render(<RunEndPolicySelect runEndPolicy="manual" onRunEndPolicyChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Completion policy: Manual apply. Click to change.' }))

    expect(screen.getByRole('menu', { name: 'Completion apply policy' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Manual apply/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: /Auto-apply when complete/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('changes policy and returns focus to the trigger', () => {
    const onRunEndPolicyChange = vi.fn()
    render(<RunEndPolicySelect runEndPolicy="manual" onRunEndPolicyChange={onRunEndPolicyChange} />)

    const trigger = screen.getByRole('button', { name: 'Completion policy: Manual apply. Click to change.' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Auto-apply when complete/i }))

    expect(onRunEndPolicyChange).toHaveBeenCalledWith('auto')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('opens ArrowDown at the first item and ArrowUp at the last item', () => {
    render(<RunEndPolicySelect runEndPolicy="manual" onRunEndPolicyChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Completion policy: Manual apply. Click to change.' })

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: /Manual apply/i })).toHaveFocus()

    fireEvent.keyDown(screen.getByRole('menuitemradio', { name: /Manual apply/i }), { key: 'Escape' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitemradio', { name: /Auto-apply when complete/i })).toHaveFocus()
  })

  it('closes when Tab leaves the menu without returning focus to the trigger', () => {
    render(<RunEndPolicySelect runEndPolicy="manual" onRunEndPolicyChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Completion policy: Manual apply. Click to change.' })

    fireEvent.click(trigger)
    const selectedOption = screen.getByRole('menuitemradio', { name: /Manual apply/i })
    fireEvent.keyDown(selectedOption, { key: 'Tab' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).not.toHaveFocus()
  })

  it('closes and clears expanded ARIA state when it becomes disabled', () => {
    const { rerender } = render(<RunEndPolicySelect runEndPolicy="manual" onRunEndPolicyChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Completion policy: Manual apply. Click to change.' })

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    rerender(<RunEndPolicySelect runEndPolicy="manual" onRunEndPolicyChange={vi.fn()} disabled />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).not.toHaveAttribute('aria-controls')

    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape and does not open when initially disabled', () => {
    const { rerender } = render(<RunEndPolicySelect runEndPolicy="manual" onRunEndPolicyChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Completion policy: Manual apply. Click to change.' })

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menuitemradio', { name: /Manual apply/i }), { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    rerender(<RunEndPolicySelect runEndPolicy="manual" onRunEndPolicyChange={vi.fn()} disabled />)
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
