/**
 * Chinese LLM Provider Configuration
 * Supports: GLM (Zhipu AI), Kimi (Moonshot), MiniMax, Qwen (Alibaba)
 */

export interface LLMProviderConfig {
  apiKey: string
  baseURL: string
  modelName: string
  headers?: Record<string, string>
}

export type LLMProviderType = 'glm' | 'kimi' | 'minimax' | 'qwen'

export const LLM_PROVIDER_CONFIGS: Record<LLMProviderType, Omit<LLMProviderConfig, 'apiKey'>> = {
  glm: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
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
}

export interface ProviderOptions {
  providerType: LLMProviderType
  apiKey: string
  modelName?: string
  baseURL?: string
}
