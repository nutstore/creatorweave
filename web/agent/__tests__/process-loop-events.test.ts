import { describe, expect, it, vi } from 'vitest'
import { processPiLoopEvents } from '../loop/process-loop-events'
import { applyPiAssistantUpdate } from '../loop/pi-events'

describe('process-loop-events', () => {
  it('appends assistant message and triggers message start fallback on update', async () => {
    async function* events() {
      yield { type: 'message_update', assistantMessageEvent: { type: 'text_start' } }
      yield {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          usage: { input: 1, output: 1, totalTokens: 2 },
          timestamp: Date.now(),
        },
      }
    }

    const callbacks = { onMessageStart: vi.fn(), onMessagesUpdated: vi.fn() }
    const result = await processPiLoopEvents({
      loop: events() as never,
      initialMessages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: Date.now() }],
      callbacks: callbacks as never,
      maxIterations: 20,
      applyAssistantUpdate: applyPiAssistantUpdate,
      mapPiToInternal: (message) =>
        ({
          id: 'a1',
          role: message.role,
          content: 'done',
          timestamp: Date.now(),
        }) as never,
      extractTextContent: () => null,
    })

    expect(callbacks.onMessageStart).toHaveBeenCalledOnce()
    expect(result.allMessages).toHaveLength(2)
    expect(result.reachedMaxIterations).toBe(false)
  })

  it('yields after committing the completed tool result when shouldYield returns true', async () => {
    const shouldYield = vi.fn(() => true)
    const onToolCallComplete = vi.fn()

    async function* events() {
      yield {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'tc-1', name: 'bash', arguments: { command: 'ls' } }],
          usage: { input: 1, output: 1, totalTokens: 2 },
          timestamp: Date.now(),
        },
      }
      yield {
        type: 'tool_execution_start',
        toolCallId: 'tc-1',
        toolName: 'bash',
        args: { command: 'ls' },
      }
      yield {
        type: 'tool_execution_end',
        toolCallId: 'tc-1',
        toolName: 'bash',
        result: { content: 'file1\nfile2' },
      }
      // The tool result must be committed before shouldYield breaks the loop.
      yield {
        type: 'message_end',
        message: {
          role: 'toolResult',
          toolCallId: 'tc-1',
          toolName: 'bash',
          content: [{ type: 'text', text: 'file1\nfile2' }],
          timestamp: Date.now(),
        },
      }
      yield {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'next turn' }],
          usage: { input: 1, output: 1, totalTokens: 2 },
          timestamp: Date.now(),
        },
      }
    }

    const result = await processPiLoopEvents({
      loop: events() as never,
      initialMessages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: Date.now() }],
      callbacks: { onToolCallComplete: onToolCallComplete as never } as never,
      maxIterations: 20,
      applyAssistantUpdate: applyPiAssistantUpdate,
      mapPiToInternal: (message) =>
        message.role === 'toolResult'
          ? ({
              id: 't1',
              role: 'tool',
              content: 'file1\nfile2',
              toolCallId: 'tc-1',
              name: 'bash',
              timestamp: Date.now(),
            } as never)
          : ({
              id: message.role === 'assistant' ? 'a1' : 'mapped',
              role: message.role,
              content: '',
              toolCalls:
                message.role === 'assistant'
                  ? [{ id: 'tc-1', type: 'function', function: { name: 'bash', arguments: '{\"command\":\"ls\"}' } }]
                  : undefined,
              timestamp: Date.now(),
            } as never),
      extractTextContent: (content) =>
        (content as { text?: string } | undefined)?.text ||
        (Array.isArray(content) ? (content[0] as { text?: string } | undefined)?.text || null : null),
      shouldYield,
    })

    // The queued message is noticed at tool_execution_end, but the actual
    // tool result must be persisted before the loop yields.
    expect(shouldYield).toHaveBeenCalledOnce()
    expect(result.reachedMaxIterations).toBe(false)
    expect(onToolCallComplete).toHaveBeenCalledOnce()
    expect(onToolCallComplete.mock.calls[0][0]).toMatchObject({
      id: 'tc-1',
      function: { name: 'bash' },
    })
    expect(result.allMessages.find((m) => m.role === 'tool')).toMatchObject({
      toolCallId: 'tc-1',
      content: 'file1\nfile2',
    })
    // The next assistant iteration must NOT have been appended.
    expect(result.allMessages.filter((m) => m.role === 'assistant')).toHaveLength(1)
  })

  it('does not yield when shouldYield returns false', async () => {
    const shouldYield = vi.fn(() => false)

    async function* events() {
      yield {
        type: 'tool_execution_start',
        toolCallId: 'tc-1',
        toolName: 'bash',
        args: { command: 'ls' },
      }
      yield {
        type: 'tool_execution_end',
        toolCallId: 'tc-1',
        toolName: 'bash',
        result: { content: 'file1' },
      }
      yield {
        type: 'message_start',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '' }],
        },
      }
      yield {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'all done' }],
          usage: { input: 1, output: 1, totalTokens: 2 },
          timestamp: Date.now(),
        },
      }
    }

    const result = await processPiLoopEvents({
      loop: events() as never,
      initialMessages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: Date.now() }],
      callbacks: {} as never,
      maxIterations: 20,
      applyAssistantUpdate: applyPiAssistantUpdate,
      mapPiToInternal: (message) =>
        ({
          id: 'a1',
          role: message.role,
          content:
            (message as { content?: Array<{ type?: string; text?: string }> }).content?.[0]
              ?.text || '',
          timestamp: Date.now(),
        }) as never,
      extractTextContent: () => null,
      shouldYield,
    })

    expect(shouldYield).toHaveBeenCalledOnce()
    expect(result.allMessages.filter((m) => m.role === 'assistant')).toHaveLength(1)
    expect(result.reachedMaxIterations).toBe(false)
  })

  it('does not check shouldYield when not provided (no-op for subagents)', async () => {
    async function* events() {
      yield {
        type: 'tool_execution_end',
        toolCallId: 'tc-1',
        toolName: 'bash',
        result: { content: 'x' },
      }
      yield {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          usage: { input: 1, output: 1, totalTokens: 2 },
          timestamp: Date.now(),
        },
      }
    }

    const result = await processPiLoopEvents({
      loop: events() as never,
      initialMessages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: Date.now() }],
      callbacks: {} as never,
      maxIterations: 20,
      applyAssistantUpdate: applyPiAssistantUpdate,
      mapPiToInternal: (message) =>
        ({
          id: 'a1',
          role: message.role,
          content: 'done',
          timestamp: Date.now(),
        }) as never,
      extractTextContent: () => null,
      // shouldYield intentionally omitted
    })

    expect(result.allMessages.filter((m) => m.role === 'assistant')).toHaveLength(1)
    expect(result.reachedMaxIterations).toBe(false)
  })

  it('treats maxIterations=0 as unlimited', async () => {
    let nextId = 1
    async function* events() {
      yield {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '1' }],
          usage: { input: 1, output: 1, totalTokens: 2 },
          timestamp: Date.now(),
        },
      }
      yield {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '2' }],
          usage: { input: 1, output: 1, totalTokens: 2 },
          timestamp: Date.now(),
        },
      }
      yield {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '3' }],
          usage: { input: 1, output: 1, totalTokens: 2 },
          timestamp: Date.now(),
        },
      }
    }

    const result = await processPiLoopEvents({
      loop: events() as never,
      initialMessages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: Date.now() }],
      callbacks: {} as never,
      maxIterations: 0,
      applyAssistantUpdate: applyPiAssistantUpdate,
      mapPiToInternal: (message) =>
        ({
          id: `a-${nextId++}`,
          role: message.role,
          content:
            (message as { content?: Array<{ type?: string; text?: string }> }).content?.[0]?.text ||
            'done',
          timestamp: Date.now(),
        }) as never,
      extractTextContent: () => null,
    })

    expect(result.allMessages.filter((m) => m.role === 'assistant')).toHaveLength(3)
    expect(result.reachedMaxIterations).toBe(false)
  })
})
