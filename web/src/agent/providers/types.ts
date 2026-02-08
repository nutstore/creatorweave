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

export type LLMProviderType =
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
  | 'qwen'
  // Custom
  | 'custom'

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
    modelName: 'glm-4-flash',
    headers: {},
  },
  'glm-coding': {
    baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4/',
    modelName: 'glm-4-flash',
    headers: {},
  },
  kimi: {
    baseURL: 'https://api.moonshot.cn/v1',
    modelName: 'moonshot-v1-8k',
    headers: {},
  },
  minimax: {
    baseURL: 'https://api.minimax.chat/v1',
    modelName: 'abab6.5s-chat',
    headers: {},
  },
  qwen: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-turbo',
    headers: {},
  },
  // Custom
  custom: {
    baseURL: '',
    modelName: '',
    headers: {},
  },
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
        id: 'glm-4-flash',
        name: 'GLM-4 Flash',
        capabilities: ['code', 'writing', 'fast'],
        contextWindow: 128000,
      },
      {
        id: 'glm-4',
        name: 'GLM-4',
        capabilities: ['code', 'writing', 'reasoning'],
        contextWindow: 128000,
      },
      {
        id: 'glm-4-long',
        name: 'GLM-4 Long',
        capabilities: ['writing', 'long-context'],
        contextWindow: 1000000,
      },
    ],
  },
  'glm-coding': {
    category: 'chinese',
    displayName: '智谱 GLM (Coding)',
    website: 'https://open.bigmodel.cn',
    models: [
      {
        id: 'glm-4-flash',
        name: 'GLM-4 Flash (Code)',
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
    category: 'chinese',
    displayName: 'MiniMax',
    website: 'https://www.minimaxi.com',
    models: [
      {
        id: 'abab6.5s-chat',
        name: 'ABAB 6.5s',
        capabilities: ['writing', 'fast'],
        contextWindow: 8000,
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
  custom: {
    category: 'custom',
    displayName: '自定义 (OpenAI 兼容)',
    models: [],
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
  return grouped
}

/** Get available models for a provider */
export function getModelsForProvider(providerType: LLMProviderType): ModelInfo[] {
  return PROVIDER_META[providerType]?.models ?? []
}

export interface ProviderOptions {
  providerType: LLMProviderType
  apiKey: string
  modelName?: string
  baseURL?: string
}
