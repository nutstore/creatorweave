import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../loop/tool-execution', async () => {
  const actual = await vi.importActual<typeof import('../loop/tool-execution')>(
    '../loop/tool-execution'
  )
  return {
    ...actual,
    ensureLatestToolResultFitsContext: vi.fn(actual.ensureLatestToolResultFitsContext),
  }
})

import { convertAgentMessagesToLlm } from '../loop/convert-bridge'
import { ensureLatestToolResultFitsContext } from '../loop/tool-execution'

describe('convert-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('increments convert call count and returns mapped pi messages', async () => {
    const result = await convertAgentMessagesToLlm({
      agentMessages: [
        {
          role: 'user',
          content: 'hello',
          timestamp: Date.now(),
        },
      ] as never[],
      model: { api: 'openai', provider: 'openai', id: 'test-model' } as never,
      provider: {
        maxContextTokens: 128000,
        estimateTokens: vi.fn(() => 1),
      } as never,
      contextManager: {
        getConfig: () => ({ maxContextTokens: 128000, reserveTokens: 4096 }),
        trimMessages: (msgs: unknown) => ({ messages: msgs as never[] }),
        trimMessagesToTarget: (msgs: unknown) => msgs as never[],
      } as never,
      callbacks: {},
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
      summaryMinDroppedGroups: 2,
      summaryMinDroppedContentChars: 800,
      summaryMinIntervalConvertCalls: 8,
      compressionTargetRatio: 0.7,
      generateContextSummaryWithLLM: async () => ({ summary: null, mode: 'skip' }),
    })

    expect(result.convertCallCount).toBe(1)
    expect(result.piMessages).toHaveLength(1)
    expect(result.piMessages[0]).toMatchObject({ role: 'user', content: 'hello' })
  })

  it('continues with emergency trim when latest-tool-fit check fails', async () => {
    vi.mocked(ensureLatestToolResultFitsContext).mockImplementation(() => {
      throw new Error('tool result cannot fit')
    })

    const trimMessagesToTarget = vi.fn((msgs: unknown) => msgs as never[])

    const result = await convertAgentMessagesToLlm({
      agentMessages: [
        {
          role: 'user',
          content: 'hello',
          timestamp: Date.now(),
        },
      ] as never[],
      model: { api: 'openai', provider: 'openai', id: 'test-model' } as never,
      provider: {
        maxContextTokens: 128000,
        estimateTokens: vi.fn(() => 1),
      } as never,
      contextManager: {
        getConfig: () => ({ maxContextTokens: 128000, reserveTokens: 4096 }),
        trimMessages: (msgs: unknown) => ({ messages: msgs as never[] }),
        trimMessagesToTarget,
      } as never,
      callbacks: {},
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
      summaryMinDroppedGroups: 2,
      summaryMinDroppedContentChars: 800,
      summaryMinIntervalConvertCalls: 8,
      compressionTargetRatio: 0.7,
      generateContextSummaryWithLLM: async () => ({ summary: null, mode: 'skip' }),
    })

    expect(trimMessagesToTarget).toHaveBeenCalled()
    expect(result.convertCallCount).toBe(1)
    expect(result.piMessages.length).toBeGreaterThan(0)
  })

  it('does not cancel compression just because last-turn real usage is below the trigger', async () => {
    const onContextCompressionStart = vi.fn()
    const generateContextSummaryWithLLM = vi.fn(async () => ({
      summary: 'short summary',
      mode: 'llm' as const,
    }))

    await convertAgentMessagesToLlm({
      agentMessages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'previous answer' }],
          timestamp: Date.now(),
          usage: { input: 100, output: 20 },
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }],
          timestamp: Date.now(),
        },
      ] as never[],
      model: { api: 'openai', provider: 'openai', id: 'test-model' } as never,
      provider: {
        maxContextTokens: 128000,
        estimateTokens: vi.fn(() => 1),
      } as never,
      contextManager: {
        getConfig: () => ({ maxContextTokens: 128000, reserveTokens: 4096 }),
        trimMessages: vi.fn((msgs: unknown) => ({
          messages: msgs as never[],
          droppedGroups: 2,
          droppedContent: 'dropped old history that should be summarized',
          wasTruncated: true,
        })),
        trimMessagesToTarget: (msgs: unknown) => msgs as never[],
      } as never,
      callbacks: { onContextCompressionStart },
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
      summaryMinDroppedGroups: 1,
      summaryMinDroppedContentChars: 1,
      summaryMinIntervalConvertCalls: 0,
      compressionTargetRatio: 0.7,
      generateContextSummaryWithLLM,
    })

    expect(onContextCompressionStart).toHaveBeenCalled()
    expect(generateContextSummaryWithLLM).toHaveBeenCalled()
  })

  it('does not start compression when assistant usage is below 85 percent of model max tokens', async () => {
    const onContextCompressionStart = vi.fn()
    const generateContextSummaryWithLLM = vi.fn(async () => ({
      summary: 'short summary',
      mode: 'llm' as const,
    }))

    await convertAgentMessagesToLlm({
      agentMessages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'previous answer' }],
          timestamp: Date.now(),
          usage: { input: 700, output: 120 },
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }],
          timestamp: Date.now(),
        },
      ] as never[],
      model: { api: 'openai', provider: 'openai', id: 'test-model' } as never,
      provider: {
        maxContextTokens: 1000,
        estimateTokens: vi.fn(() => 1),
      } as never,
      contextManager: {
        getConfig: () => ({ maxContextTokens: 1000, reserveTokens: 100 }),
        trimMessages: vi.fn((msgs: unknown, options?: { createSummary?: boolean }) => ({
          messages: msgs as never[],
          droppedGroups: options?.createSummary ? 2 : 0,
          droppedContent: options?.createSummary ? 'dropped old history that should be summarized' : undefined,
          wasTruncated: true,
        })),
        trimMessagesToTarget: (msgs: unknown) => msgs as never[],
      } as never,
      callbacks: { onContextCompressionStart },
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
      summaryMinDroppedGroups: 1,
      summaryMinDroppedContentChars: 1,
      summaryMinIntervalConvertCalls: 0,
      compressionTargetRatio: 0.7,
      generateContextSummaryWithLLM,
    })

    expect(onContextCompressionStart).not.toHaveBeenCalled()
    expect(generateContextSummaryWithLLM).not.toHaveBeenCalled()
  })
})
