/**
 * Multi-LLM Provider Configuration
 * Supports: Chinese providers (GLM, Kimi, MiniMax, Qwen)
 *           International providers (OpenAI, Anthropic, Google, Groq, Mistral)
 *           Custom OpenAI-compatible endpoints
 */

export interface LLMProviderConfig {
  apiKey: string
  baseURL: string
  modelName: string
  headers?: Record<string, string>
  /** API mode for custom providers: 'chat-completions' or 'responses' */
  apiMode?: 'chat-completions' | 'responses'
}

/** Provider category for grouping in UI */
export type ProviderCategory = 'international' | 'chinese' | 'custom'

/** Model capability tags */
export type ModelCapability = 'code' | 'writing' | 'reasoning' | 'vision' | 'fast' | 'long-context'

/** Model metadata for UI display */
export interface ModelInfo {
  id: string
  name: string
  capabilities: ModelCapability[]
  contextWindow: number
  description?: string
}

/** Provider metadata for UI display */
export interface ProviderMeta {
  category: ProviderCategory
  displayName: string
  icon?: string
  website?: string
  models: ModelInfo[]
}

/** Built-in provider types */
export type BuiltinLLMProviderType =
  // International
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'mistral'
  // Chinese
  | 'glm'
  | 'glm-coding'
  | 'kimi'
  | 'minimax'
  | 'minimax-cn'
  | 'qwen'

/** Provider type: built-in or dynamically registered custom provider (e.g. "custom-abc123") */
export type LLMProviderType = BuiltinLLMProviderType | string

export const LLM_PROVIDER_CONFIGS: Record<LLMProviderType, Omit<LLMProviderConfig, 'apiKey'>> = {
  // International providers
  openai: {
    baseURL: 'https://api.openai.com/v1',
    modelName: 'gpt-4o',
    headers: {},
  },
  anthropic: {
    baseURL: 'https://api.anthropic.com/v1',
    modelName: 'claude-sonnet-4-20250514',
    headers: {},
  },
  google: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    modelName: 'gemini-2.0-pro',
    headers: {},
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    modelName: 'llama-3.3-70b-versatile',
    headers: {},
  },
  mistral: {
    baseURL: 'https://api.mistral.ai/v1',
    modelName: 'mistral-large-latest',
    headers: {},
  },
  // Chinese providers
  glm: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
    modelName: 'glm-5.1',
    headers: {},
  },
  'glm-coding': {
    baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4/',
    modelName: 'glm-5.1',
    headers: {},
  },
  kimi: {
    baseURL: 'https://api.moonshot.cn/v1',
    modelName: 'moonshot-v1-8k',
    headers: {},
  },
  minimax: {
    baseURL: 'https://api.minimax.io/v1',
    modelName: 'MiniMax-M2.7',
    headers: {},
  },
  'minimax-cn': {
    baseURL: 'https://api.minimaxi.com/v1',
    modelName: 'MiniMax-M2.7',
    headers: {},
  },
  qwen: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-turbo',
    headers: {},
  },
}

// ── Dynamic Custom Provider Registry ──
// Custom providers are registered at runtime; each has its own providerType (e.g. "custom-abc123").

const DYNAMIC_PROVIDER_CONFIGS = new Map<string, Omit<LLMProviderConfig, 'apiKey'>>()
const DYNAMIC_PROVIDER_METAS = new Map<string, ProviderMeta>()

/** Register (or update) a custom provider */
export function registerDynamicProvider(
  id: string,
  config: Omit<LLMProviderConfig, 'apiKey'>,
  meta: ProviderMeta,
) {
  DYNAMIC_PROVIDER_CONFIGS.set(id, config)
  DYNAMIC_PROVIDER_METAS.set(id, meta)
}

/** Remove a custom provider */
export function unregisterDynamicProvider(id: string) {
  DYNAMIC_PROVIDER_CONFIGS.delete(id)
  DYNAMIC_PROVIDER_METAS.delete(id)
}

/** Check if a providerType is a dynamically registered custom provider */
export function isCustomProviderType(type: string): boolean {
  return DYNAMIC_PROVIDER_CONFIGS.has(type)
}

/** Get all dynamic provider IDs */
export function getDynamicProviderIds(): string[] {
  return Array.from(DYNAMIC_PROVIDER_CONFIGS.keys())
}

/** Get config for any provider (built-in or dynamic) */
export function getProviderConfig(type: LLMProviderType): Omit<LLMProviderConfig, 'apiKey'> | null {
  if (DYNAMIC_PROVIDER_CONFIGS.has(type)) return DYNAMIC_PROVIDER_CONFIGS.get(type)!
  return (LLM_PROVIDER_CONFIGS as Record<string, Omit<LLMProviderConfig, 'apiKey'>>)[type] ?? null
}

/** Get meta for any provider (built-in or dynamic) */
export function getProviderMeta(type: LLMProviderType): ProviderMeta | null {
  if (DYNAMIC_PROVIDER_METAS.has(type)) return DYNAMIC_PROVIDER_METAS.get(type)!
  return (PROVIDER_META as Record<string, ProviderMeta>)[type] ?? null
}

/** Provider metadata registry for UI display and grouping */
export const PROVIDER_META: Record<LLMProviderType, ProviderMeta> = {
  openai: {
    category: 'international',
    displayName: 'OpenAI',
    website: 'https://platform.openai.com',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        capabilities: ['code', 'writing', 'reasoning', 'vision'],
        contextWindow: 128000,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        capabilities: ['code', 'writing', 'fast'],
        contextWindow: 128000,
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        capabilities: ['code', 'writing', 'reasoning', 'vision'],
        contextWindow: 128000,
      },
      { id: 'o1', name: 'o1', capabilities: ['reasoning', 'code'], contextWindow: 200000 },
      {
        id: 'o1-mini',
        name: 'o1-mini',
        capabilities: ['reasoning', 'code', 'fast'],
        contextWindow: 128000,
      },
    ],
  },
  anthropic: {
    category: 'international',
    displayName: 'Anthropic',
    website: 'https://console.anthropic.com',
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        capabilities: ['code', 'writing', 'reasoning'],
        contextWindow: 200000,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        capabilities: ['code', 'writing', 'reasoning'],
        contextWindow: 200000,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        capabilities: ['code', 'fast'],
        contextWindow: 200000,
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        capabilities: ['writing', 'reasoning', 'long-context'],
        contextWindow: 200000,
      },
    ],
  },
  google: {
    category: 'international',
    displayName: 'Google',
    website: 'https://aistudio.google.com',
    models: [
      {
        id: 'gemini-2.0-pro',
        name: 'Gemini 2.0 Pro',
        capabilities: ['code', 'writing', 'reasoning', 'vision'],
        contextWindow: 1000000,
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        capabilities: ['code', 'writing', 'fast', 'vision'],
        contextWindow: 1000000,
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        capabilities: ['code', 'writing', 'long-context', 'vision'],
        contextWindow: 2000000,
      },
    ],
  },
  groq: {
    category: 'international',
    displayName: 'Groq',
    website: 'https://console.groq.com',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B',
        capabilities: ['code', 'writing', 'fast'],
        contextWindow: 128000,
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B',
        capabilities: ['code', 'fast'],
        contextWindow: 32768,
      },
    ],
  },
  mistral: {
    category: 'international',
    displayName: 'Mistral',
    website: 'https://console.mistral.ai',
    models: [
      {
        id: 'mistral-large-latest',
        name: 'Mistral Large',
        capabilities: ['code', 'writing', 'reasoning'],
        contextWindow: 128000,
      },
      {
        id: 'mistral-medium-latest',
        name: 'Mistral Medium',
        capabilities: ['code', 'writing'],
        contextWindow: 32000,
      },
      {
        id: 'codestral-latest',
        name: 'Codestral',
        capabilities: ['code', 'fast'],
        contextWindow: 32000,
      },
    ],
  },
  glm: {
    category: 'chinese',
    displayName: '智谱 GLM',
    website: 'https://open.bigmodel.cn',
    models: [
      {
        id: 'glm-5.1',
        name: 'GLM-5.1',
        capabilities: ['code', 'writing', 'reasoning'],
        contextWindow: 200000,
      },
      {
        id: 'glm-5',
        name: 'GLM-5',
        capabilities: ['code', 'writing', 'reasoning'],
        contextWindow: 200000,
      },
      {
        id: 'glm-4.7',
        name: 'GLM-4.7',
        capabilities: ['code', 'writing', 'reasoning', 'vision'],
        contextWindow: 200000,
      },
      {
        id: 'glm-4.7-flash',
        name: 'GLM-4.7 Flash',
        capabilities: ['code', 'writing', 'fast'],
        contextWindow: 128000,
      },
    ],
  },
  'glm-coding': {
    category: 'chinese',
    displayName: '智谱 GLM (Coding)',
    website: 'https://open.bigmodel.cn',
    models: [
      {
        id: 'glm-5.1',
        name: 'GLM-5.1 (Code)',
        capabilities: ['code', 'reasoning'],
        contextWindow: 200000,
      },
      {
        id: 'glm-5',
        name: 'GLM-5 (Code)',
        capabilities: ['code', 'reasoning'],
        contextWindow: 200000,
      },
      {
        id: 'glm-4.7',
        name: 'GLM-4.7 (Code)',
        capabilities: ['code', 'reasoning'],
        contextWindow: 200000,
      },
      {
        id: 'glm-4.7-flash',
        name: 'GLM-4.7 Flash (Code)',
        capabilities: ['code', 'fast'],
        contextWindow: 128000,
      },
    ],
  },
  kimi: {
    category: 'chinese',
    displayName: 'Kimi (Moonshot)',
    website: 'https://platform.moonshot.cn',
    models: [
      {
        id: 'moonshot-v1-8k',
        name: 'Moonshot v1 8K',
        capabilities: ['writing', 'fast'],
        contextWindow: 8000,
      },
      {
        id: 'moonshot-v1-32k',
        name: 'Moonshot v1 32K',
        capabilities: ['writing', 'long-context'],
        contextWindow: 32000,
      },
      {
        id: 'moonshot-v1-128k',
        name: 'Moonshot v1 128K',
        capabilities: ['writing', 'long-context'],
        contextWindow: 128000,
      },
    ],
  },
  minimax: {
    category: 'international',
    displayName: 'MiniMax (International)',
    website: 'https://www.minimax.io',
    models: [
      {
        id: 'MiniMax-M2.7',
        name: 'MiniMax M2.7',
        capabilities: ['code', 'reasoning'],
        contextWindow: 128000,
      },
      {
        id: 'MiniMax-M2.7-highspeed',
        name: 'MiniMax M2.7 Highspeed',
        capabilities: ['code', 'fast'],
        contextWindow: 128000,
      },
    ],
  },
  'minimax-cn': {
    category: 'chinese',
    displayName: 'MiniMax (国内版)',
    website: 'https://www.minimaxi.com',
    models: [
      {
        id: 'MiniMax-M2.7',
        name: 'MiniMax M2.7',
        capabilities: ['code', 'reasoning'],
        contextWindow: 128000,
      },
      {
        id: 'MiniMax-M2.7-highspeed',
        name: 'MiniMax M2.7 Highspeed',
        capabilities: ['code', 'fast'],
        contextWindow: 128000,
      },
    ],
  },
  qwen: {
    category: 'chinese',
    displayName: '通义千问 (Qwen)',
    website: 'https://dashscope.console.aliyun.com',
    models: [
      {
        id: 'qwen-turbo',
        name: 'Qwen Turbo',
        capabilities: ['code', 'writing', 'fast'],
        contextWindow: 131072,
      },
      {
        id: 'qwen-plus',
        name: 'Qwen Plus',
        capabilities: ['code', 'writing', 'reasoning'],
        contextWindow: 131072,
      },
      {
        id: 'qwen-max',
        name: 'Qwen Max',
        capabilities: ['code', 'writing', 'reasoning', 'long-context'],
        contextWindow: 32000,
      },
      {
        id: 'qwen-long',
        name: 'Qwen Long',
        capabilities: ['writing', 'long-context'],
        contextWindow: 10000000,
      },
    ],
  },
}

/** Get providers grouped by category */
export function getProvidersByCategory(): Record<
  ProviderCategory,
  { type: LLMProviderType; meta: ProviderMeta }[]
> {
  const grouped: Record<ProviderCategory, { type: LLMProviderType; meta: ProviderMeta }[]> = {
    international: [],
    chinese: [],
    custom: [],
  }
  for (const [type, meta] of Object.entries(PROVIDER_META)) {
    grouped[meta.category].push({ type: type as LLMProviderType, meta })
  }
  // Add dynamic custom providers
  for (const [id, meta] of DYNAMIC_PROVIDER_METAS.entries()) {
    grouped.custom.push({ type: id, meta })
  }
  return grouped
}

/** Get static model list for a provider (from PROVIDER_META or dynamic registry) */
export function getModelsForProvider(providerType: LLMProviderType): ModelInfo[] {
  if (DYNAMIC_PROVIDER_METAS.has(providerType)) {
    return DYNAMIC_PROVIDER_METAS.get(providerType)!.models
  }
  return (PROVIDER_META as Record<string, ProviderMeta>)[providerType]?.models ?? []
}

export interface ProviderOptions {
  providerType: LLMProviderType
  apiKey: string
  modelName?: string
  baseURL?: string
}
