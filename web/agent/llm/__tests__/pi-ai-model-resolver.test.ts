import { describe, expect, it } from 'vitest'
import { resolvePiAIModel } from '../pi-ai-model-resolver'
import { getOpenRouterInputModalities } from '@/agent/providers/openrouter-pricing'

describe('resolvePiAIModel', () => {
  it('should resolve known native provider/model', () => {
    const model = resolvePiAIModel('openai', 'gpt-4o', 'https://api.openai.com/v1')
    expect(model.provider).toBe('openai')
    expect(model.id).toBe('gpt-4o')
  })

  it('should use alias for known model mismatch', () => {
    const model = resolvePiAIModel('google', 'gemini-2.0-pro', 'https://generativelanguage.googleapis.com/v1beta')
    expect(model.provider).toBe('google')
    expect(model.id).toBe('gemini-2.0-flash')
  })

  it('should fallback to openai-completions for custom provider', () => {
    const model = resolvePiAIModel('custom', 'my-model', 'https://example.com/v1/')
    expect(model.api).toBe('openai-completions')
    expect(model.id).toBe('my-model')
    expect(model.baseUrl).toBe('https://example.com/v1')
  })

  it('should fallback for unknown model on known provider', () => {
    const model = resolvePiAIModel('anthropic', 'non-existent-model', 'https://api.anthropic.com/v1')
    expect(model.api).toBe('openai-completions')
    expect(model.provider).toBe('anthropic')
  })

  it('should resolve latest GLM models', () => {
    const model = resolvePiAIModel('glm-coding', 'glm-5', 'https://open.bigmodel.cn/api/coding/paas/v4/')
    expect(model.provider).toBe('glm-coding')
    expect(model.id).toBe('glm-5')
  })

  it('should map MiniMax M2.7 to custom fetch fallback for browser CORS safety', () => {
    const model = resolvePiAIModel('minimax', 'MiniMax-M2.7', 'https://api.minimax.io/v1')
    expect(model.provider).toBe('minimax')
    expect(model.id).toBe('MiniMax-M2.7')
    expect(model.api).toBe('cw-openai-fetch')
  })

  it('should map MiniMax M2.7 to custom fetch fallback for minimax-cn', () => {
    const model = resolvePiAIModel('minimax-cn', 'MiniMax-M2.7', 'https://api.minimaxi.com/v1')
    expect(model.provider).toBe('minimax-cn')
    expect(model.id).toBe('MiniMax-M2.7')
    expect(model.api).toBe('cw-openai-fetch')
  })

  // ── Vision capability via OpenRouter modalities ─────────────────────────

  it('should resolve codex-oauth vision model with image input', () => {
    const model = resolvePiAIModel('codex-oauth', 'gpt-5.6-terra', 'https://chatgpt.com/backend-api/codex')
    expect(model.provider).toBe('codex-oauth')
    expect(model.id).toBe('gpt-5.6-terra')
    expect(model.api).toBe('openai-responses')
    // Terra supports image input per OpenRouter snapshot — must NOT be text-only
    expect(model.input).toContain('image')
  })

  it('should resolve all gpt-5.6 variants as vision models', () => {
    for (const id of ['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol']) {
      const model = resolvePiAIModel('codex-oauth', id, 'https://chatgpt.com/backend-api/codex')
      expect(model.input).toContain('image')
    }
  })

  it('should keep unknown codex-oauth model as text-only', () => {
    const model = resolvePiAIModel('codex-oauth', 'some-future-unknown-model', 'https://chatgpt.com/backend-api/codex')
    expect(model.input).toEqual(['text'])
    expect(model.input).not.toContain('image')
  })

  it('should resolve vision for custom provider model known to OpenRouter', () => {
    // Custom OpenAI-compatible endpoint serving a model that OpenRouter knows
    // supports image input.
    const model = resolvePiAIModel('custom', 'gpt-5.6-terra', 'https://my-proxy.example.com/v1')
    expect(model.input).toContain('image')
  })

  it('should keep custom provider model text-only when unknown to OpenRouter', () => {
    const model = resolvePiAIModel('custom', 'my-private-model-v1', 'https://my-proxy.example.com/v1')
    expect(model.input).toEqual(['text'])
  })

  it('should resolve vision for GLM-5.2 text-only model as text-only', () => {
    // GLM-5.2 is text-only per OpenRouter snapshot — must NOT declare image
    const model = resolvePiAIModel('glm-coding', 'glm-5.2', 'https://open.bigmodel.cn/api/coding/paas/v4/')
    expect(model.input).toEqual(['text'])
    expect(model.input).not.toContain('image')
  })
})

describe('getOpenRouterInputModalities', () => {
  it('should return modalities for gpt-5.6-terra', () => {
    const mods = getOpenRouterInputModalities('gpt-5.6-terra')
    expect(mods).not.toBeNull()
    expect(mods).toContain('text')
    expect(mods).toContain('image')
  })

  it('should return null for unknown model', () => {
    expect(getOpenRouterInputModalities('totally-nonexistent-model-xyz')).toBeNull()
  })

  it('should match regardless of vendor prefix', () => {
    // Full id "openai/gpt-5.6-terra" and bare id "gpt-5.6-terra" both match
    expect(getOpenRouterInputModalities('openai/gpt-5.6-terra')).toContain('image')
    expect(getOpenRouterInputModalities('gpt-5.6-terra')).toContain('image')
  })
})
