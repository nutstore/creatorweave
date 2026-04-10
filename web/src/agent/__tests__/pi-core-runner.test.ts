import { describe, expect, it } from 'vitest'
import { executePiCoreLoop } from '../loop/pi-core-runner'

describe('pi-core-runner', () => {
  it('returns early when there is no abort signal', async () => {
    const result = await executePiCoreLoop({
      signal: undefined,
      initialMessages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: Date.now() }],
      callbacks: {},
      baseSystemPrompt: 'sys',
      mode: 'act',
      toolRegistry: {
        getToolDefinitionsForMode: () => [],
      } as never,
      beforeToolCall: undefined,
      afterToolCall: undefined,
      getToolContext: () => ({ directoryHandle: null }),
      setToolContext: () => {},
      provider: {
        getModel: () => ({ api: 'openai', provider: 'openai', id: 'm', maxTokens: 1024 }),
        getApiKey: () => 'k',
        maxContextTokens: 128000,
        estimateTokens: () => 1,
      } as never,
      contextManager: {
        getConfig: () => ({ systemPrompt: 'sys', maxContextTokens: 128000, reserveTokens: 4096 }),
        trimMessages: (msgs: unknown) => ({ messages: msgs as never[] }),
        trimMessagesToTarget: (msgs: unknown) => msgs as never[],
      } as never,
      toolExecutionTimeout: 30000,
      toolTimeoutExemptions: new Set<string>(),
      maxIterations: 20,
      convertCallCount: 0,
      lastSummaryConvertCall: Number.NEGATIVE_INFINITY,
      summaryMinDroppedGroups: 2,
      summaryMinDroppedContentChars: 800,
      summaryMinIntervalConvertCalls: 8,
      compressionTargetRatio: 0.7,
      compressedMemoryPrefix: 'Earlier conversation summary:',
      generateContextSummaryWithLLM: async () => ({ summary: null, mode: 'skip' }),
    })

    expect(result.allMessages).toHaveLength(1)
    expect(result.shouldStopForElicitation).toBe(false)
    expect(result.reachedMaxIterations).toBe(false)
  })
})
