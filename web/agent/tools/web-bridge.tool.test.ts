import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  search: vi.fn(),
  fetch: vi.fn(),
}))

import { webFetchExecutor, webSearchExecutor } from './web-bridge.tool'

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

describe('webFetchExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, '__agentWeb', {
      configurable: true,
      value: { ready: true, ...bridge },
    })
  })

  it('passes the bridge finalUrl through so the Markdown pipeline can pin relative links', async () => {
    bridge.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html><body>ok</body></html>',
      finalUrl: 'https://example.com/final/path',
    })

    const result = JSON.parse(await webFetchExecutor(
      { url: 'https://example.com/redirecting-page' },
      {} as never,
    ))

    expect(result.data.finalUrl).toBe('https://example.com/final/path')
  })

  it('omits finalUrl when the bridge does not provide one', async () => {
    bridge.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html><body>ok</body></html>',
    })

    const result = JSON.parse(await webFetchExecutor(
      { url: 'https://example.com/page' },
      {} as never,
    ))

    expect(result.data).not.toHaveProperty('finalUrl')
  })
})
