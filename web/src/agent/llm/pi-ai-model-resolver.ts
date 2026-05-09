import { getModel } from '@mariozechner/pi-ai'
import type { Api, KnownProvider, Model } from '@mariozechner/pi-ai'
import type { LLMProviderType } from '@/agent/providers/types'
import { getModelsForProvider, isCustomProviderType } from '@/agent/providers/types'
import { CW_OPENAI_FETCH_API } from './pi-ai-custom-openai-fetch'
import { normalizeBaseUrl } from './pi-ai-url-utils'

const DEFAULT_CONTEXT_WINDOW = 128000
const DEFAULT_MAX_TOKENS = 8192

const PROVIDER_MAP: Partial<Record<LLMProviderType, KnownProvider>> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  groq: 'groq',
  mistral: 'mistral',
  kimi: 'kimi-coding',
  glm: 'zai',
  'glm-coding': 'zai',
}

const MODEL_ALIASES: Partial<Record<LLMProviderType, Record<string, string>>> = {
  google: {
    'gemini-2.0-pro': 'gemini-2.0-flash',
  },
  minimax: {
    'abab6.5s-chat': 'MiniMax-M2.7',
    'MiniMax-M2': 'MiniMax-M2.7',
    'MiniMax-M2.1': 'MiniMax-M2.7',
    'MiniMax-M2.5': 'MiniMax-M2.7',
    'MiniMax-M2.5-highspeed': 'MiniMax-M2.7-highspeed',
  },
  'minimax-cn': {
    'abab6.5s-chat': 'MiniMax-M2.7',
    'MiniMax-M2': 'MiniMax-M2.7',
    'MiniMax-M2.1': 'MiniMax-M2.7',
    'MiniMax-M2.5': 'MiniMax-M2.7',
    'MiniMax-M2.5-highspeed': 'MiniMax-M2.7-highspeed',
  },
  kimi: {
    'moonshot-v1-8k': 'k2p5',
  },
  glm: {
    'glm-4-flash': 'glm-4.7-flash',
    'glm-4': 'glm-4.7',
    'glm-4-long': 'glm-4.7',
  },
  'glm-coding': {
    'glm-4-flash': 'glm-4.7-flash',
  },
}

function tryGetNativeModel(
  providerType: LLMProviderType,
  modelName: string,
  baseUrl: string
): Model<Api> | null {
  const provider = PROVIDER_MAP[providerType]
  if (!provider) return null

  const alias = MODEL_ALIASES[providerType]?.[modelName]
  const candidates = alias && alias !== modelName ? [modelName, alias] : [modelName]

  for (const candidate of candidates) {
    try {
      const model = getModel(provider, candidate as never) as Model<Api>
      if (!model) continue
      if (baseUrl) {
        return { ...model, baseUrl: normalizeBaseUrl(baseUrl) }
      }
      return model
    } catch {
      // try next candidate
    }
  }

  return null
}

function lookupContextWindow(providerType: LLMProviderType, modelName: string): number {
  const models = getModelsForProvider(providerType)
  return models.find((m) => m.id === modelName)?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
}

function createOpenAICompatibleFallback(
  providerType: LLMProviderType,
  modelName: string,
  baseUrl: string,
  apiMode?: 'chat-completions' | 'responses'
): Model<Api> {
  const fallbackApi: Api =
    providerType === 'minimax' || providerType === 'minimax-cn' || isCustomProviderType(providerType)
      ? (apiMode === 'responses' ? 'openai-responses' : CW_OPENAI_FETCH_API)
      : 'openai-completions'
  const contextWindow = lookupContextWindow(providerType, modelName)

  return {
    id: modelName,
    name: modelName,
    api: fallbackApi,
    provider: providerType,
    baseUrl: normalizeBaseUrl(baseUrl),
    reasoning: true,
    input: ['text', 'image'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow,
    maxTokens: DEFAULT_MAX_TOKENS,
  }
}

export function resolvePiAIModel(
  providerType: LLMProviderType,
  modelName: string,
  baseUrl: string,
  apiMode?: 'chat-completions' | 'responses'
): Model<Api> {
  const native = tryGetNativeModel(providerType, modelName, baseUrl)
  if (native) return native
  const resolvedModelName = MODEL_ALIASES[providerType]?.[modelName] || modelName
  return createOpenAICompatibleFallback(providerType, resolvedModelName, baseUrl, apiMode)
}
