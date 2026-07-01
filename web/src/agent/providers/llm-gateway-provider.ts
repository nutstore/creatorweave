/**
 * LLM Gateway Provider Registration
 *
 * Registers "坚果云 AI" as a built-in LLM provider that uses
 * Device Code Flow for authentication (no manual API key needed).
 *
 * The provider automatically:
 * - Manages token lifecycle (acquire, refresh, persist)
 * - Prompts user with Device Code Flow on first use
 * - Refreshes tokens transparently
 *
 * Environment variables:
 * - VITE_JIANGUOYUN_AI_BASE_URL: Gateway base URL (default: https://ai.jianguoyun.com)
 * - VITE_JIANGUOYUN_AI_CLIENT_ID: Device client ID (required for auth)
 */

import type { LLMProviderConfig, LLMProviderType, ModelInfo, ProviderMeta } from './types'
import { registerDynamicProvider, unregisterDynamicProvider } from './types'
import { fetchGatewayModels } from './llm-gateway-auth'
import { getModelContextWindow } from './model-store'

// ── Provider Identity ──

export const LLM_GATEWAY_PROVIDER_TYPE: LLMProviderType = 'llm-gateway'
const LLM_GATEWAY_API_KEY_ID = '__llm_gateway_token__'

// ── Configuration ──

function getGatewayBaseURL(): string {
  return import.meta.env.VITE_JIANGUOYUN_AI_BASE_URL || 'https://ai.jianguoyun.com'
}

function getGatewayClientId(): string {
  return import.meta.env.VITE_JIANGUOYUN_AI_CLIENT_ID || ''
}

/** Check if LLM Gateway is configured (has client_id) */
export function isLLMGatewayConfigured(): boolean {
  return !!getGatewayClientId()
}

/** Get the gateway base URL */
export function getLLMGatewayBaseURL(): string {
  return getGatewayBaseURL()
}

/** Get the gateway client_id */
export function getLLMGatewayClientId(): string {
  return getGatewayClientId()
}

// ── Provider Registration ──

const GATEWAY_META: ProviderMeta = {
  category: 'chinese',
  displayName: '坚果云 AI',
  models: [], // populated dynamically via updateGatewayModels()
}

/**
 * Register LLM Gateway as a dynamic provider.
 * Called on app startup if VITE_JIANGUOYUN_AI_CLIENT_ID is set.
 * Model list starts empty and is filled once we have a valid token.
 */
export function registerLLMGatewayProvider(): void {
  if (!isLLMGatewayConfigured()) return

  const baseURL = getGatewayBaseURL()

  const config: Omit<LLMProviderConfig, 'apiKey'> = {
    baseURL: `${baseURL}/v1`,
    modelName: '',
    headers: {},
    apiMode: 'chat-completions',
  }

  registerDynamicProvider(LLM_GATEWAY_PROVIDER_TYPE, config, GATEWAY_META)
}

/**
 * Fetch models from gateway /v1/models and re-register the provider
 * with the updated model list. Call after obtaining a valid access token.
 */
export async function updateGatewayModels(accessToken: string): Promise<ModelInfo[]> {
  const baseURL = getGatewayBaseURL()
  const models = await fetchGatewayModels(baseURL, accessToken)

  const modelInfos: ModelInfo[] = models.map((m) => ({
    id: m.id,
    name: m.name,
    capabilities: ['code', 'writing', 'reasoning'] as const,
    // Resolve contextWindow dynamically so MiniMax-m3 (1M), glm-5.2 (1M),
    // gpt-4o (128K), etc. each show their real value instead of a flat 200K.
    contextWindow: getModelContextWindow(LLM_GATEWAY_PROVIDER_TYPE, m.id),
  }))

  const baseURL_str = getGatewayBaseURL()
  const config: Omit<LLMProviderConfig, 'apiKey'> = {
    baseURL: `${baseURL_str}/v1`,
    modelName: modelInfos[0]?.id || '',
    headers: {},
    apiMode: 'chat-completions',
  }

  const meta: ProviderMeta = {
    ...GATEWAY_META,
    models: modelInfos,
  }

  registerDynamicProvider(LLM_GATEWAY_PROVIDER_TYPE, config, meta)
  return modelInfos
}

/**
 * Unregister LLM Gateway provider (for cleanup).
 */
export function unregisterLLMGatewayProvider(): void {
  unregisterDynamicProvider(LLM_GATEWAY_PROVIDER_TYPE)
}

/**
 * Check if LLM Gateway is the current active provider
 */
export function isLLMGatewayActive(providerType: LLMProviderType): boolean {
  return providerType === LLM_GATEWAY_PROVIDER_TYPE
}

/**
 * Get the API key storage key for LLM Gateway.
 * The actual "API key" is the gateway's access_token.
 */
export function getLLMGatewayApiKeyProviderKey(): string {
  return LLM_GATEWAY_API_KEY_ID
}

// Re-export auth functions for convenience
export {
  performDeviceCodeFlow,
  getValidAccessToken,
  hasStoredTokens,
  hasValidAccessToken,
  logoutGateway,
  fetchGatewayModels,
  type AuthState,
  type TokenResponse,
} from './llm-gateway-auth'
