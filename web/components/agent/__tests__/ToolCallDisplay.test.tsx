import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToolCallDisplay } from '../ToolCallDisplay'
import type { ToolCall } from '@/agent/message-types'

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: {
    subscribe: vi.fn(),
    getState: () => ({ activeWorkspaceId: null }),
  },
}))

vi.mock('../SubagentDetailPanel', () => ({
  SubagentDetailPanel: ({ agentId, conversationId }: { agentId: string; conversationId?: string }) => (
    <div data-testid="subagent-detail">{agentId}:{conversationId}</div>
  ),
}))

describe('ToolCallDisplay', () => {
  it('renders subagent result content as markdown', () => {
    const toolCall: ToolCall = {
      id: 'tc-1',
      type: 'function',
      function: {
        name: 'spawn_subagent',
        arguments: JSON.stringify({ description: 'run task', subagent_type: 'explorer' }),
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

    expect(screen.getByText('Explorer')).toBeInTheDocument()
    expect(screen.queryByText('spawn_subagent')).toBeNull()

    // Collapsed by default: markdown details should be hidden.
    expect(screen.queryByRole('heading', { name: 'Execution Result' })).toBeNull()

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('heading', { name: 'Execution Result' })).toBeInTheDocument()
    expect(screen.getByText('Completed step A')).toBeInTheDocument()
    expect(container.textContent || '').toContain('Execution Result')
  })

  it('passes the conversation ID to recovered subagent detail panels', async () => {
    const toolCall: ToolCall = {
      id: 'tc-1',
      type: 'function',
      function: {
        name: 'spawn_subagent',
        arguments: JSON.stringify({ description: 'run task' }),
      },
    }
    const result = JSON.stringify({ data: { agentId: 'subagent-1' } })

    render(<ToolCallDisplay toolCall={toolCall} result={result} conversationId="conversation-1" />)

    fireEvent.click(screen.getByRole('button'))

    expect(await screen.findByTestId('subagent-detail')).toHaveTextContent('subagent-1:conversation-1')
  })

  it('replays failed batch task panels from the committed result', async () => {
    const toolCall: ToolCall = {
      id: 'tc-batch',
      type: 'function',
      function: {
        name: 'batch_spawn',
        arguments: JSON.stringify({ tasks: [{ description: 'will fail', prompt: 'run' }] }),
      },
    }
    const result = JSON.stringify({
      data: { completed: [], failed: [{ agentId: 'subagent-failed-1' }] },
    })

    render(<ToolCallDisplay toolCall={toolCall} result={result} conversationId="conversation-2" />)

    fireEvent.click(screen.getByRole('button'))

    expect(await screen.findByTestId('subagent-detail')).toHaveTextContent(
      'subagent-failed-1:conversation-2'
    )
  })
})
