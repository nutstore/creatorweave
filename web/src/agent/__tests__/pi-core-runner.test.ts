import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executePiCoreLoop } from '../loop/pi-core-runner'

const mockAgentLoopContinue = vi.fn()
const mockConvertAgentMessagesToLlm = vi.fn()

vi.mock('@/store/settings.store', () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      enableThinking: false,
      thinkingLevel: 'low',
    })),
  },
}))

vi.mock('@mariozechner/pi-agent-core', () => ({
  agentLoopContinue: (...args: unknown[]) => mockAgentLoopContinue(...args),
}))

vi.mock('../loop/build-agent-tools', () => ({
  buildAgentTools: vi.fn(() => []),
}))

vi.mock('../loop/convert-bridge', () => ({
  convertAgentMessagesToLlm: (...args: unknown[]) => mockConvertAgentMessagesToLlm(...args),
}))

describe('pi-core-runner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('retains injected context summary in final messages when loop events continue', async () => {
    mockConvertAgentMessagesToLlm.mockImplementation(async (input: any) => {
      input.onSummaryInjected?.('compressed snapshot')
      return {
        piMessages: [{ role: 'user', content: 'hi', timestamp: Date.now() }],
        convertCallCount: input.convertCallCount + 1,
        lastSummaryConvertCall: input.convertCallCount + 1,
        compressionBaseline: { summary: 'compressed snapshot', cutoffTimestamp: Date.now() },
      }
    })

    mockAgentLoopContinue.mockImplementation((context: any, config: any) => {
      return (async function* () {
        await config.convertToLlm(context.messages)
        yield {
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'done' }],
            usage: { input: 1, output: 1, totalTokens: 2 },
            stopReason: 'stop',
            api: 'openai',
            provider: 'openai',
            model: 'm',
            timestamp: Date.now(),
          },
        }
      })()
    })

    const abortController = new AbortController()
    const result = await executePiCoreLoop({
      signal: abortController.signal,
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

    const hasSummary = result.allMessages.some(
      (msg) => msg.role === 'assistant' && msg.kind === 'context_summary'
    )
    expect(hasSummary).toBe(true)
    expect(result.allMessages.some((msg) => msg.role === 'assistant' && msg.content === 'done')).toBe(
      true
    )
  })
})
