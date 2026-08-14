import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '../SearchConversationsRenderer'
import { getRenderer } from '../registry'
import type { ToolRenderCtx } from '../types'

describe('SearchConversationsRenderer', () => {
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
