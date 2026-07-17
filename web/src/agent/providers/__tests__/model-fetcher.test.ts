import { afterEach, describe, expect, it, vi } from 'vitest'
import { canFetchModels, fetchModelsForProvider } from '../model-fetcher'
import { registerDynamicProvider, unregisterDynamicProvider } from '../types'

const CODEX_PROVIDER = 'codex-oauth'

afterEach(() => {
  unregisterDynamicProvider(CODEX_PROVIDER)
  vi.unstubAllGlobals()
})

describe('fetchModelsForProvider', () => {
  it('uses extension-provided models for Codex OAuth without requesting /models', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    registerDynamicProvider(
      CODEX_PROVIDER,
      {
        baseURL: 'https://chatgpt.com/backend-api/codex',
        modelName: 'gpt-5.6-terra',
        apiMode: 'responses',
      },
      {
        category: 'custom',
        displayName: 'Codex (Browser OAuth)',
        models: [{
          id: 'gpt-5.6-terra',
          name: 'GPT-5.6 Terra',
          contextWindow: 258000,
          capabilities: ['code', 'reasoning', 'vision'],
        }],
      },
    )

    const result = await fetchModelsForProvider(CODEX_PROVIDER, {
      apiKey: 'virtual-key',
      baseUrl: 'https://chatgpt.com/backend-api/codex',
    })

    expect(result.source).toBe('static')
    expect(result.models.map((model) => model.id)).toEqual(['gpt-5.6-terra'])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(canFetchModels(CODEX_PROVIDER)).toBe(false)
  })
})
