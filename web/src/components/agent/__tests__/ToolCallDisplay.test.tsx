import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToolCallDisplay } from '../ToolCallDisplay'
import type { ToolCall } from '@/agent/message-types'

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

describe('ToolCallDisplay', () => {
  it('renders subagent result content as markdown', () => {
    const toolCall: ToolCall = {
      id: 'tc-1',
      type: 'function',
      function: {
        name: 'spawn_subagent',
        arguments: JSON.stringify({ description: 'run task' }),
      },
    }

    const result = JSON.stringify({
      ok: true,
      tool: 'spawn_subagent',
      version: 2,
      data: {
        content: '# Execution Result\n- Completed step A',
      },
    })

    const { container } = render(
      <ToolCallDisplay toolCall={toolCall} result={result} isExecuting={false} />
    )

    // Collapsed by default: markdown details should be hidden.
    expect(screen.queryByRole('heading', { name: 'Execution Result' })).toBeNull()

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('heading', { name: 'Execution Result' })).toBeInTheDocument()
    expect(screen.getByText('Completed step A')).toBeInTheDocument()
    expect(container.textContent || '').toContain('Execution Result')
  })
})
