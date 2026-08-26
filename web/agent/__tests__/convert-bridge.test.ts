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
      maxContextTokens: 128000,
      reserveTokens: 4096,
      callbacks: {},
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
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
      maxContextTokens: 128000,
      reserveTokens: 4096,
      callbacks: {},
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
      generateContextSummaryWithLLM: async () => ({ summary: null, mode: 'skip' }),
    })

    expect(result.convertCallCount).toBe(1)
    expect(result.piMessages.length).toBeGreaterThan(0)
  })

  it('starts compression when totalTokens exceeds trigger even when input/output metrics look small', async () => {
    // extractLastTurnUsedTokens prefers `totalTokens` over input + output +
    // cacheRead because that's what the API reports as the authoritative
    // "context already consumed" number.  If `totalTokens` is missing or
    // small but the API under-reported per-message metrics, the total
    // still wins — this guards the auth source of truth.
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
          usage: { input: 100, output: 20, totalTokens: 120000 },
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
      maxContextTokens: 128000,
      reserveTokens: 4096,
      callbacks: { onContextCompressionStart },
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
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
      maxContextTokens: 1000,
      reserveTokens: 100,
      callbacks: { onContextCompressionStart },
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
      generateContextSummaryWithLLM,
    })

    expect(onContextCompressionStart).not.toHaveBeenCalled()
    expect(generateContextSummaryWithLLM).not.toHaveBeenCalled()
  })

  it('does NOT start compression when usedRealTokens is below trigger even if preTrimTokens is high', async () => {
    // Regression guard: the previous design let the heuristic `preTrimTokens`
    // independently trigger compression.  Real usage from the API is more
    // accurate (counts cache hits, image tokens, etc.) so we now gate
    // compression exclusively on `usedRealTokens`.  A high heuristic must
    // NOT push us into compression if real usage is still under the trigger.
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
          content: [{ type: 'text', text: 'continue' }],
          timestamp: Date.now(),
        },
      ] as never[],
      model: { api: 'openai', provider: 'openai', id: 'test-model' } as never,
      provider: {
        maxContextTokens: 1000,
        estimateTokens: vi.fn(() => 900),
      } as never,
      maxContextTokens: 1000,
      reserveTokens: 100,
      callbacks: { onContextCompressionStart },
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
      generateContextSummaryWithLLM,
    })

    expect(onContextCompressionStart).not.toHaveBeenCalled()
    expect(generateContextSummaryWithLLM).not.toHaveBeenCalled()
  })

  it('starts compression when last assistant totalTokens exceeds threshold', async () => {
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
          usage: { input: 700, output: 120, cacheRead: 50, totalTokens: 900 },
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'continue' }],
          timestamp: Date.now(),
        },
      ] as never[],
      model: { api: 'openai', provider: 'openai', id: 'test-model' } as never,
      provider: {
        maxContextTokens: 1000,
        estimateTokens: vi.fn(() => 100),
      } as never,
      maxContextTokens: 1000,
      reserveTokens: 100,
      callbacks: { onContextCompressionStart },
      compressedMemoryPrefix: 'Earlier conversation summary:',
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      compressionBaseline: null,
      generateContextSummaryWithLLM,
    })

    expect(onContextCompressionStart).toHaveBeenCalled()
    expect(generateContextSummaryWithLLM).toHaveBeenCalled()
  })
})
