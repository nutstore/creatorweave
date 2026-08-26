import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '../SearchConversationsRenderer'
import { getRenderer } from '../registry'
import type { ToolRenderCtx } from '../types'

describe('SearchConversationsRenderer', () => {
  it('renders every returned conversation so all results can be selected for export', () => {
    const renderer = getRenderer('search_conversations')
    const ctx: ToolRenderCtx = {
      toolName: 'search_conversations',
      args: {},
      rawArgs: '{}',
      rawResult: undefined,
      result: {
        ok: true,
        data: {
          totalMatches: 45,
          hasMore: false,
          mode: 'list',
          results: Array.from({ length: 45 }, (_, index) => ({
            conversationId: `conversation-${index + 1}`,
            title: `Conversation ${index + 1}`,
            updatedAt: Date.now(),
          })),
        },
      },
      isExecuting: false,
      isStreaming: false,
      isError: false,
    }

    expect(renderer).toBeDefined()
    const Detail = renderer!.Detail
    render(<Detail {...ctx} />)

    expect(screen.getByText('Conversation 1')).toBeInTheDocument()
    expect(screen.getByText('Conversation 45')).toBeInTheDocument()
    expect(screen.queryByText(/还有 30 条/)).not.toBeInTheDocument()
  })

  it('filters returned conversations by project without clearing selections', () => {
    const renderer = getRenderer('search_conversations')
    const ctx: ToolRenderCtx = {
      toolName: 'search_conversations',
      args: {},
      rawArgs: '{}',
      rawResult: undefined,
      result: {
        ok: true,
        data: {
          totalMatches: 2,
          hasMore: false,
          mode: 'list',
          results: [
            { conversationId: 'creatorweave-1', title: 'CreatorWeave conversation', projectName: 'creatorweave', updatedAt: Date.now() },
            { conversationId: 'yinghe-1', title: 'Yinghe conversation', projectName: 'yinghe', updatedAt: Date.now() },
          ],
        },
      },
      isExecuting: false,
      isStreaming: false,
      isError: false,
    }

    const Detail = renderer!.Detail
    render(<Detail {...ctx} />)

    fireEvent.click(screen.getByLabelText('CreatorWeave conversation'))
    fireEvent.click(screen.getByRole('button', { name: 'yinghe' }))

    expect(screen.queryByText('CreatorWeave conversation')).not.toBeInTheDocument()
    expect(screen.getByText('Yinghe conversation')).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('shows the tool error when the result envelope has no data payload', () => {
    const renderer = getRenderer('search_conversations')
    const ctx: ToolRenderCtx = {
      toolName: 'search_conversations',
      args: {},
      rawArgs: '{}',
      rawResult: undefined,
      result: {
        ok: false,
        error: { code: 'invalid_arguments', message: 'A filter is required' },
      },
      isExecuting: false,
      isStreaming: false,
      isError: true,
    }

    expect(renderer).toBeDefined()
    const Detail = renderer!.Detail
    render(<Detail {...ctx} />)

    expect(screen.getByText('A filter is required')).toBeInTheDocument()
  })
})
