import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  search: vi.fn(),
  fetch: vi.fn(),
}))

import { webSearchExecutor } from './web-bridge.tool'

describe('webSearchExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, '__agentWeb', {
      configurable: true,
      value: { ready: true, ...bridge },
    })
  })

  it('returns a retryable provider-unavailable error without substitute results', async () => {
    bridge.search.mockResolvedValue({
      ok: false,
      results: [],
      provider: 'duckduckgo',
      requestedProvider: 'duckduckgo',
      suggestedProvider: 'baidu',
      reason: 'network error',
      error: 'DuckDuckGo unavailable',
    })

    const result = JSON.parse(await webSearchExecutor({
      query: 'OpenAI',
      provider: 'duckduckgo',
    }, {} as never))

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'SEARCH_PROVIDER_UNAVAILABLE',
        retryable: true,
        details: {
          provider: 'duckduckgo',
          suggestedProvider: 'baidu',
          reason: 'network error',
        },
      },
    })
    expect(result.data).toBeUndefined()
  })
})
