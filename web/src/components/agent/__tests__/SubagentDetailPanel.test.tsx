import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SubagentDetailPanel } from '../SubagentDetailPanel'

const findByWorkspaceId = vi.fn()

vi.mock('@/sqlite', () => ({
  getSubagentRepository: () => ({ findByWorkspaceId }),
}))

vi.mock('@/store/conversation-runtime.store', () => ({
  useConversationRuntimeStore: (selector: (state: { subagentDrafts: Map<string, unknown> }) => unknown) =>
    selector({ subagentDrafts: new Map() }),
}))

vi.mock('../ToolCallDisplay', () => ({
  ToolCallDisplay: () => <div>tool call</div>,
}))

vi.mock('../ReasoningSection', () => ({
  ReasoningSection: ({ reasoning }: { reasoning: string }) => <div>{reasoning}</div>,
}))

describe('SubagentDetailPanel', () => {
  it('restores saved subagent messages when live draft state is gone', async () => {
    findByWorkspaceId.mockResolvedValueOnce([
      {
        agentId: 'subagent-1',
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '刷新后恢复的回答',
            timestamp: 1,
          },
        ],
      },
    ])

    render(<SubagentDetailPanel agentId="subagent-1" conversationId="conversation-1" />)

    expect(await screen.findByText('刷新后恢复的回答')).toBeInTheDocument()
    expect(findByWorkspaceId).toHaveBeenCalledWith('conversation-1')
  })
})
