// ============================================================
// Web Bridge Tools — web_search & web_fetch
// Provides web capabilities via the Browser Extension bridge
// (window.__agentWeb).
//
// These tools are only registered when the Browser Extension
// is detected at runtime.
// ============================================================

import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import { toolOkJson, toolErrorJson } from './tool-envelope'

// ---------------------------------------------------------------------------
// Types for the browser extension bridge API
// ---------------------------------------------------------------------------

interface AgentWebSearchResult {
  title: string
  url: string
  snippet: string
}

interface AgentWebSearchResponse {
  ok: boolean
  results: AgentWebSearchResult[]
  provider?: string
  error?: string
}

interface AgentWebFetchResponse {
  ok: boolean
  status: number
  headers: Record<string, string>
  body: string
  truncated?: boolean
  readability?: {
    title: string
    excerpt: string
    byline: string
    siteName: string
    length: number
  }
  error?: string
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

function getAgentWeb() {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { __agentWeb?: { ready: boolean; search: unknown; fetch: unknown } }
  return w.__agentWeb?.ready ? w.__agentWeb as {
    search: (query: string, options?: { count?: number; provider?: string }) => Promise<AgentWebSearchResponse>
    fetch: (url: string, options?: {
      method?: string
      headers?: Record<string, string>
      body?: string | null
      render?: boolean
    }) => Promise<AgentWebFetchResponse>
  } : null
}

/** Check if the Browser Extension bridge is available */
export function isWebBridgeAvailable(): boolean {
  return getAgentWeb() !== null
}

// ===========================================================================
// web_search
// ===========================================================================

export const webSearchDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description: [
      'Search the web. Returns a list of results with title, URL, and snippet.',
      'Use this tool to find information on the internet, look up documentation, research topics, or find specific URLs.',
      'The search engine is auto-selected based on your region (DuckDuckGo for overseas, Baidu for China).',
      'This tool requires the Browser Extension to be installed and active.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        count: {
          type: 'number',
          description: 'Number of results to return (default: 10, max: 20)',
        },
        provider: {
          type: 'string',
          description: [
            'Search engine to use. Default: auto (region-detected).',
            'Options: "auto" (recommended), "duckduckgo", "baidu".',
            'Set explicitly only when you need to override the auto-detected engine.',
          ].join('\n'),
          enum: ['auto', 'duckduckgo', 'baidu'],
        },
      },
      required: ['query'],
    },
  },
}

export const webSearchExecutor: ToolExecutor = async (args) => {
  const bridge = getAgentWeb()
  if (!bridge) {
    return toolErrorJson('web_search', 'BRIDGE_UNAVAILABLE', 'Browser Extension not detected. Please install and enable the extension to use web search.')
  }

  const query = args.query as string
  if (!query || typeof query !== 'string') {
    return toolErrorJson('web_search', 'INVALID_INPUT', 'query must be a non-empty string')
  }

  const count = typeof args.count === 'number' ? Math.min(args.count, 20) : 10
  const provider = typeof args.provider === 'string' ? args.provider : 'auto'

  try {
    const result = await bridge.search(query, { count, provider })

    if (!result.ok) {
      return toolErrorJson('web_search', 'SEARCH_FAILED', result.error || 'Search returned no results', { retryable: true })
    }

    return toolOkJson('web_search', {
      results: result.results,
      total: result.results.length,
      ...(result.provider ? { provider: result.provider } : {}),
    })
  } catch (err) {
    return toolErrorJson('web_search', 'SEARCH_ERROR', (err as Error).message, { retryable: true })
  }
}

// ===========================================================================
// web_fetch
// ===========================================================================

export const webFetchDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_fetch',
    description: [
      'Fetch the content of a web page by URL and return clean Markdown.',
      '',
      'Automatically extracts the main article content (removes ads, navigation, sidebars, footers) using Mozilla Readability, then converts to Markdown.',
      'If the page is a JS-heavy SPA that returns an empty shell via HTTP, automatically retries with a hidden browser tab for full JavaScript rendering.',
      'You can also set render=true to force JavaScript rendering (useful when you know the page is an SPA like a React/Vue app).',
      '',
      'Returns: Markdown body, HTTP status, headers, and readability metadata (title, excerpt, byline).',
      '',
      'This tool requires the Browser Extension to be installed and active.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
        method: {
          type: 'string',
          description: 'HTTP method (default: GET)',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
        },
        headers: {
          type: 'object',
          description: 'Request headers as key-value pairs',
          properties: {},
        },
        body: {
          type: 'string',
          description: 'Request body (for POST/PUT/PATCH)',
        },
        render: {
          type: 'boolean',
          description: [
            'Force full JavaScript rendering via a hidden browser tab.',
            'Set to true for JS-heavy SPA pages (e.g. React/Vue apps that return an empty HTML shell).',
            'Default: false (fast HTTP fetch). The tool also auto-detects SPA shells and retries with rendering automatically.',
          ].join('\n'),
        },
      },
      required: ['url'],
    },
  },
}

export const webFetchExecutor: ToolExecutor = async (args) => {
  const bridge = getAgentWeb()
  if (!bridge) {
    return toolErrorJson('web_fetch', 'BRIDGE_UNAVAILABLE', 'Browser Extension not detected. Please install and enable the extension to use web fetch.')
  }

  const url = args.url as string
  if (!url || typeof url !== 'string') {
    return toolErrorJson('web_fetch', 'INVALID_INPUT', 'url must be a non-empty string')
  }

  // Validate URL format
  try {
    new URL(url)
  } catch {
    return toolErrorJson('web_fetch', 'INVALID_URL', `Invalid URL format: ${url}`)
  }

  const options: {
    method?: string
    headers?: Record<string, string>
    body?: string | null
    render?: boolean
  } = {}

  if (args.method && typeof args.method === 'string') options.method = args.method
  if (args.headers && typeof args.headers === 'object') options.headers = args.headers as Record<string, string>
  if (args.body !== undefined && args.body !== null) options.body = String(args.body)
  if (typeof args.render === 'boolean') options.render = args.render

  try {
    const result = await bridge.fetch(url, options)

    if (!result.ok && result.status === 0) {
      return toolErrorJson('web_fetch', 'FETCH_ERROR', result.error || 'Failed to fetch URL', { retryable: true })
    }

    return toolOkJson('web_fetch', {
      status: result.status,
      headers: result.headers,
      body: result.body,
      ...(result.truncated ? { truncated: true } : {}),
      ...(result.readability ? { readability: result.readability } : {}),
    })
  } catch (err) {
    return toolErrorJson('web_fetch', 'FETCH_ERROR', (err as Error).message, { retryable: true })
  }
}

export const webBridgePromptDoc: ToolPromptDoc = {
  category: 'web',
  section: '### Web Tools (requires Browser Extension)',
  lines: [
    '- `web_search(query, count?, provider?)` - Search the web (auto-selects DuckDuckGo or Baidu based on region)',
    '- `web_fetch(url, ...)` - Fetch the content of a web page by URL',
  ],
}
