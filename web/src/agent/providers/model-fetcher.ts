/**
 * Dynamic Model Fetcher
 *
 * Fetches available models from provider APIs (OpenAI-compatible /v1/models endpoint).
 * Falls back to static PROVIDER_META models if the API call fails.
 *
 * Supported providers:
 * - OpenAI-compatible: OpenAI, Groq, Mistral, GLM, Kimi, MiniMax, Qwen, Custom
 * - Google Gemini: uses /v1beta/models endpoint with API key auth
 * - Anthropic: no list models API → always falls back to static list
 */

import type { LLMProviderType, ModelInfo, ModelCapability } from './types'
import { LLM_PROVIDER_CONFIGS, PROVIDER_META } from './types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FetchModelsResult {
  models: ModelInfo[]
  source: 'dynamic' | 'static'
  fetchedAt: number
  error?: string
}

// ─── Provider-specific fetch strategies ──────────────────────────────────────

/**
 * Providers that support OpenAI-compatible GET /v1/models
 */
const OPENAI_COMPATIBLE_PROVIDERS: LLMProviderType[] = [
  'openai',
  'groq',
  'mistral',
  'glm',
  'glm-coding',
  'kimi',
  'minimax',
  'minimax-cn',
  'qwen',
  'custom',
]

/**
 * Anthropic has no list models API
 */
const STATIC_ONLY_PROVIDERS: LLMProviderType[] = ['anthropic']

/**
 * Check if a provider supports dynamic model fetching
 */
export function canFetchModels(providerType: LLMProviderType): boolean {
  return !STATIC_ONLY_PROVIDERS.includes(providerType)
}

// ─── Fetch implementations ──────────────────────────────────────────────────

/**
 * Fetch models from OpenAI-compatible /v1/models endpoint
 */
async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string
): Promise<ModelInfo[]> {
  const url = `${baseUrl}/models`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10000), // 10s timeout
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()

  // OpenAI format: { data: [{ id: "model-name", ... }, ...] }
  const rawModels: Array<{ id: string; owned_by?: string; created?: number }> = data.data || data

  if (!Array.isArray(rawModels)) {
    throw new Error('Unexpected response format: expected array of models')
  }

  return rawModels
    .filter((m) => m.id && typeof m.id === 'string')
    .map((m) => parseModelInfo(m.id))
    .sort((a, b) => {
      // Sort: put more capable/recent models first
      const aScore = getModelSortScore(a.id)
      const bScore = getModelSortScore(b.id)
      return bScore - aScore || a.id.localeCompare(b.id)
    })
}

/**
 * Fetch models from Google Gemini API
 */
async function fetchGoogleModels(apiKey: string): Promise<ModelInfo[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`

  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()

  // Google format: { models: [{ name: "models/gemini-pro", displayName: "...", ... }] }
  const rawModels: Array<{
    name: string
    displayName?: string
    supportedGenerationMethods?: string[]
  }> = data.models || []

  return rawModels
    .filter((m) => {
      // Only include models that support generateContent (chat completion)
      const methods = m.supportedGenerationMethods || []
      return methods.includes('generateContent') && m.name
    })
    .map((m) => {
      // Google model names are like "models/gemini-2.0-flash" → extract the id
      const id = m.name.replace(/^models\//, '')
      return {
        id,
        name: m.displayName || id,
        capabilities: guessCapabilities(id),
        contextWindow: guessContextWindow(id),
      }
    })
    .sort((a, b) => getModelSortScore(b.id) - getModelSortScore(a.id))
}

// ─── Main fetch function ────────────────────────────────────────────────────

/**
 * Fetch available models for a given provider.
 *
 * @returns FetchModelsResult with models and metadata about the source
 */
export async function fetchModelsForProvider(
  providerType: LLMProviderType,
  options?: { apiKey?: string; baseUrl?: string }
): Promise<FetchModelsResult> {
  const now = Date.now()
  const staticModels = PROVIDER_META[providerType]?.models ?? []

  // Static-only providers always return static list
  if (STATIC_ONLY_PROVIDERS.includes(providerType)) {
    return {
      models: staticModels,
      source: 'static',
      fetchedAt: now,
    }
  }

  const apiKey = options?.apiKey
  const baseUrl =
    options?.baseUrl || LLM_PROVIDER_CONFIGS[providerType]?.baseURL || ''

  // Cannot fetch without API key
  if (!apiKey) {
    return {
      models: staticModels,
      source: 'static',
      fetchedAt: now,
      error: 'No API key provided',
    }
  }

  try {
    let models: ModelInfo[]

    if (providerType === 'google') {
      models = await fetchGoogleModels(apiKey)
    } else if (OPENAI_COMPATIBLE_PROVIDERS.includes(providerType)) {
      models = await fetchOpenAICompatibleModels(baseUrl, apiKey)
    } else {
      // Unknown provider → static fallback
      return {
        models: staticModels,
        source: 'static',
        fetchedAt: now,
      }
    }

    // If API returned empty, fall back to static
    if (models.length === 0) {
      return {
        models: staticModels,
        source: 'static',
        fetchedAt: now,
        error: 'API returned empty model list',
      }
    }

    return {
      models,
      source: 'dynamic',
      fetchedAt: now,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[model-fetcher] Failed to fetch models for ${providerType}:`, message)

    return {
      models: staticModels,
      source: 'static',
      fetchedAt: now,
      error: message,
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a raw model ID string into a ModelInfo object
 */
function parseModelInfo(modelId: string): ModelInfo {
  return {
    id: modelId,
    name: formatModelName(modelId),
    capabilities: guessCapabilities(modelId),
    contextWindow: guessContextWindow(modelId),
  }
}

/**
 * Format a model ID into a human-readable name
 */
function formatModelName(id: string): string {
  // Try to make a readable name from the model ID
  let name = id

  // Common patterns
  name = name.replace(/^(accounts\/[^/]+\/models\/)/, '') // Fireworks AI pattern
  name = name.replace(/^(models\/)/, '') // Google pattern

  // Capitalize known prefixes
  const knownPrefixes: Record<string, string> = {
    'gpt-4': 'GPT-4',
    'gpt-3': 'GPT-3',
    'o1': 'o1',
    'o3': 'o3',
    'o4': 'o4',
    'claude': 'Claude',
    'gemini': 'Gemini',
    'llama': 'Llama',
    'mixtral': 'Mixtral',
    'mistral': 'Mistral',
    'codestral': 'Codestral',
    'glm': 'GLM',
    'moonshot': 'Moonshot',
    'qwen': 'Qwen',
    'deepseek': 'DeepSeek',
    'MiniMax': 'MiniMax',
    'abab': 'ABAB',
  }

  for (const [prefix, replacement] of Object.entries(knownPrefixes)) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
      name = replacement + name.slice(prefix.length)
      break
    }
  }

  return name
}

/**
 * Guess model capabilities based on the model ID
 */
function guessCapabilities(id: string): ModelCapability[] {
  const lower = id.toLowerCase()
  const caps: ModelCapability[] = []

  // Most modern models support code and writing
  caps.push('code')

  if (lower.includes('vision') || lower.includes('4o') || lower.includes('gemini')) {
    caps.push('vision')
  }
  if (lower.includes('flash') || lower.includes('mini') || lower.includes('turbo') || lower.includes('fast')) {
    caps.push('fast')
  }
  if (lower.includes('reason') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4') || lower.includes('pro') || lower.includes('max')) {
    caps.push('reasoning')
  }
  if (lower.includes('128k') || lower.includes('200k') || lower.includes('1m') || lower.includes('long')) {
    caps.push('long-context')
  }

  // Default: add writing if nothing else
  if (caps.length <= 1) {
    caps.push('writing')
  }

  return caps
}

/**
 * Guess context window size based on model ID
 */
function guessContextWindow(id: string): number {
  const lower = id.toLowerCase()

  // Explicit size hints in the ID
  if (lower.includes('128k')) return 128000
  if (lower.includes('32k')) return 32000
  if (lower.includes('8k')) return 8000

  // Known large context models
  if (lower.includes('gemini') && (lower.includes('1.5') || lower.includes('2.0'))) return 1000000
  if (lower.includes('gpt-4') || lower.includes('gpt-4o')) return 128000
  if (lower.includes('claude')) return 200000
  if (lower.includes('o1') || lower.includes('o3') || lower.includes('o4')) return 200000
  if (lower.includes('llama') && lower.includes('3.3')) return 128000
  if (lower.includes('glm')) return 200000
  if (lower.includes('qwen')) return 131072

  // Default
  return 128000
}

/**
 * Score a model ID for sorting (higher = shown first)
 */
function getModelSortScore(id: string): number {
  const lower = id.toLowerCase()
  let score = 0

  // Prefer specific known models
  if (lower.includes('gpt-4o') && !lower.includes('mini')) score += 100
  if (lower.includes('claude-sonnet-4') || lower.includes('claude-4')) score += 100
  if (lower.includes('gemini-2') && lower.includes('pro')) score += 100
  if (lower.includes('glm-5')) score += 100
  if (lower.includes('qwen-max') || lower.includes('qwen-plus')) score += 90
  if (lower.includes('llama-3.3')) score += 80

  // Deprioritize embedding models, TTS, image generation, etc.
  if (lower.includes('embed')) score -= 200
  if (lower.includes('tts')) score -= 200
  if (lower.includes('dall-e') || lower.includes('dalle')) score -= 200
  if (lower.includes('whisper')) score -= 200
  if (lower.includes('audio')) score -= 100
  if (lower.includes('image')) score -= 100
  if (lower.includes('moderation')) score -= 200
  if (lower.includes('text-embedding')) score -= 200
  if (lower.includes('text-moderation')) score -= 200

  // Prefer non-mini/flash for general listing
  if (lower.includes('mini') || lower.includes('flash')) score -= 10

  return score
}
