import { describe, expect, it } from 'vitest'
import { buildChatCompletionsPayload, CW_OPENAI_FETCH_API } from '../pi-ai-custom-openai-fetch'

describe('buildChatCompletionsPayload', () => {
  it('should request usage in streaming mode', () => {
    const model = {
      id: 'MiniMax-M2.7',
      api: CW_OPENAI_FETCH_API,
      provider: 'minimax',
      baseUrl: 'https://api.minimax.io/v1',
      name: 'MiniMax M2.7',
      reasoning: true,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
    } as never

    const context = {
      systemPrompt: 'You are helpful',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    } as never

    const payload = buildChatCompletionsPayload(model, context, {
      temperature: 0.2,
      maxTokens: 1024,
    } as never) as Record<string, unknown>

    expect(payload.stream).toBe(true)
    expect(payload.stream_options).toEqual({ include_usage: true })
    expect(payload.temperature).toBe(0.2)
    expect(payload.max_tokens).toBe(1024)
    expect(Array.isArray(payload.messages)).toBe(true)
  })
})
