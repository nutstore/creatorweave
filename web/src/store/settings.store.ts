/**
 * Settings store - manages LLM configuration and user preferences.
 *
 * Important: hasApiKey is NOT persisted because it's derived from SQLite.
 * Always check the actual database value to ensure consistency.
 */

import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LLMProviderType } from '@/agent/providers/types'
import {
  LLM_PROVIDER_CONFIGS,
  isCustomProviderType,
  registerDynamicProvider,
  unregisterDynamicProvider,
  getProviderConfig,
  getProviderMeta,
} from '@/agent/providers/types'
import type { ThinkingLevel } from '@mariozechner/pi-ai'

// Cache for hasApiKey to avoid repeated database queries
// This is a soft cache that can be invalidated
const apiKeyCache = new Map<string, boolean>()
const apiKeyCachePromise: Map<string, Promise<boolean>> = new Map()

/** API mode for custom providers: chat completions vs OpenAI responses API */
export type CustomApiMode = 'chat-completions' | 'responses'

export interface CustomProviderConfig {
  id: string
  name: string
  baseUrl: string
  models: string[]
  /** Which API endpoint format to use. Defaults to 'chat-completions' */
  apiMode: CustomApiMode
  createdAt: number
  updatedAt: number
}

interface EffectiveProviderConfig {
  apiKeyProviderKey: string
  baseUrl: string
  modelName: string
}

/** Per-workspace model override */
export interface WorkspaceModelOverride {
  providerType: LLMProviderType
  modelName: string
  // activeCustomProviderId removed — providerType IS the custom provider id now
}

interface SettingsState {
  // LLM settings
  providerType: LLMProviderType
  modelName: string
  customBaseUrl: string
  // Persisted custom provider configs — used to re-register on app load
  customProviders: CustomProviderConfig[]
  temperature: number
  maxTokens: number
  maxIterations: number
  enableThinking: boolean
  thinkingLevel: ThinkingLevel

  // 实验性功能 (Experimental features, disabled by default)
  enableBatchSpawn: boolean

  // API key status - NOT persisted, derived from SQLite
  // Use getHasApiKey() or checkHasApiKey() to get the current value
  hasApiKey: boolean

  // Per-workspace model overrides
  modelOverridesByWorkspace: Record<string, WorkspaceModelOverride>

  // Last used model per provider (for restoring on switch-back)
  lastUsedModelByProvider: Partial<Record<LLMProviderType, string>>

  // Pinned (user-selected) models per provider — subset of full model list
  pinnedModelsByProvider: Record<string, string[]>

  // Actions
  setProviderType: (type: LLMProviderType) => void
  setModelName: (name: string) => void
  setCustomBaseUrl: (url: string) => void
  createCustomProvider: (input: { name: string; baseUrl: string; model: string }) => boolean
  updateCustomProvider: (
    providerId: string,
    patch: { name?: string; baseUrl?: string; model?: string }
  ) => boolean
  removeCustomProvider: (providerId: string) => void
  addCustomProviderModel: (providerId: string, model: string) => boolean
  removeCustomProviderModel: (providerId: string, model: string) => void
  setCustomProviderApiMode: (providerId: string, apiMode: import('@/store/settings.store').CustomApiMode) => void
  setTemperature: (temp: number) => void
  setMaxTokens: (tokens: number) => void
  setMaxIterations: (iterations: number) => void
  setEnableThinking: (v: boolean) => void
  setThinkingLevel: (v: ThinkingLevel) => void
  setEnableBatchSpawn: (v: boolean) => void
  setHasApiKey: (has: boolean) => void
  getEffectiveProviderConfig: () => EffectiveProviderConfig | null

  /**
   * Check if API key exists for current provider
   * This queries the database directly, bypassing the cached state
   */
  checkHasApiKey: () => Promise<boolean>

  /**
   * Invalidate the API key cache for a provider
   * Call this after saving/deleting an API key
   */
  invalidateApiKeyCache: (provider?: string) => void

  /**
   * Save current model selection to a specific workspace
   */
  saveModelOverrideForWorkspace: (workspaceId: string) => void

  /**
   * Restore model selection from a workspace override (or fallback to defaults)
   */
  syncModelForWorkspace: (workspaceId: string | null) => void

  /**
   * Switch provider and model atomically (used by quick-switcher)
   */
  switchProviderAndModel: (providerType: LLMProviderType, modelName: string) => void

  /**
   * Get all providers that have a saved API key
   */
  getAvailableProviders: () => Promise<Array<{
    providerType: LLMProviderType
    displayName: string
    models: Array<{ id: string; name: string }>
    providerKey: string
  }>>

  /**
   * Restore dynamic providers from persisted customProviders on app load
   */
  _restoreDynamicProviders: () => void

  // Pinned models actions
  pinModel: (providerType: LLMProviderType, modelId: string) => void
  unpinModel: (providerType: LLMProviderType, modelId: string) => void
  setPinnedModels: (providerType: LLMProviderType, modelIds: string[]) => void

  /**
   * Runtime version counter — incremented when provider/model list changes
   * (API key saved, model pinned/unpinned, custom provider removed).
   * UI components watch this to decide when to refresh their provider lists.
   */
  _providerRefreshVersion: number
  triggerProviderRefresh: () => void
}

/** Helper: register a CustomProviderConfig into the dynamic provider registry */
function registerCustomAsDynamic(cp: CustomProviderConfig) {
  registerDynamicProvider(
    cp.id,
    { baseURL: cp.baseUrl, modelName: cp.models[0] || '', headers: {}, apiMode: cp.apiMode || 'chat-completions' },
    {
      category: 'custom',
      displayName: cp.name,
      models: cp.models.map((m) => ({
        id: m,
        name: m,
        capabilities: ['code', 'writing'] as const,
        contextWindow: 128000,
      })),
    },
  )
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      providerType: '' as LLMProviderType,
      modelName: '',
      customBaseUrl: '',
      customProviders: [],
      temperature: 0.7,
      maxTokens: 4096,
      maxIterations: 20,
      enableThinking: false,
      thinkingLevel: 'medium' as ThinkingLevel,
      enableBatchSpawn: false,
      hasApiKey: false,
      modelOverridesByWorkspace: {},
      lastUsedModelByProvider: {},
      pinnedModelsByProvider: {},
      _providerRefreshVersion: 0,

      triggerProviderRefresh: () => {
        set((s) => ({ _providerRefreshVersion: s._providerRefreshVersion + 1 }))
      },

      _restoreDynamicProviders: () => {
        const { customProviders } = get()
        for (const cp of customProviders) {
          registerCustomAsDynamic(cp)
        }
      },

      setProviderType: (providerType) => {
        set({ providerType })
      },
      setModelName: (modelName) => {
        const state = get()
        set({
          modelName,
          lastUsedModelByProvider: {
            ...state.lastUsedModelByProvider,
            [state.providerType]: modelName,
          },
        })
      },
      setCustomBaseUrl: (customBaseUrl) => set({ customBaseUrl }),

      createCustomProvider: ({ name, baseUrl, model }) => {
        const trimmedName = name.trim()
        const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
        const trimmedModel = model.trim()
        if (!trimmedName || !trimmedBaseUrl || !trimmedModel) return false

        const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const now = Date.now()
        const provider: CustomProviderConfig = {
          id,
          name: trimmedName,
          baseUrl: trimmedBaseUrl,
          models: [trimmedModel],
          apiMode: 'chat-completions',
          createdAt: now,
          updatedAt: now,
        }

        // Register in dynamic provider registry
        registerCustomAsDynamic(provider)

        set((state) => ({
          customProviders: [provider, ...state.customProviders],
        }))
        return true
      },

      updateCustomProvider: (providerId, patch) => {
        const providers = get().customProviders
        const target = providers.find((provider) => provider.id === providerId)
        if (!target) return false

        const nextName = patch.name?.trim()
        const nextBaseUrl = patch.baseUrl?.trim().replace(/\/+$/, '')
        const nextModel = patch.model?.trim()

        if (patch.name !== undefined && !nextName) return false
        if (patch.baseUrl !== undefined && !nextBaseUrl) return false
        if (patch.model !== undefined && !nextModel) return false

        set((state) => ({
          customProviders: state.customProviders.map((provider) => {
            if (provider.id !== providerId) return provider
            const mergedModels =
              nextModel && !provider.models.includes(nextModel)
                ? [nextModel, ...provider.models]
                : provider.models
            return {
              ...provider,
              name: nextName ?? provider.name,
              baseUrl: nextBaseUrl ?? provider.baseUrl,
              models: mergedModels,
              updatedAt: Date.now(),
            }
          }),
        }))

        // Re-register in dynamic registry
        const updated = get().customProviders.find((p) => p.id === providerId)
        if (updated) {
          registerCustomAsDynamic(updated)
        }

        // If currently active, sync state
        if (get().providerType === providerId) {
          const refreshed = get().customProviders.find((p) => p.id === providerId)
          if (refreshed) {
            set({
              customBaseUrl: refreshed.baseUrl,
              modelName: nextModel ?? get().modelName,
            })
          }
        }

        return true
      },

      removeCustomProvider: (providerId) => {
        const existing = get().customProviders
        const remaining = existing.filter((provider) => provider.id !== providerId)
        const wasActive = get().providerType === providerId

        // Unregister from dynamic registry
        unregisterDynamicProvider(providerId)

        const updates: Partial<SettingsState> = {
          customProviders: remaining,
        }
        if (wasActive) {
          const fallback = remaining[0]
          if (fallback) {
            updates.providerType = fallback.id as LLMProviderType
            updates.customBaseUrl = fallback.baseUrl
            updates.modelName = fallback.models[0] || ''
          } else {
            // No custom providers left, clear selection
            updates.providerType = '' as LLMProviderType
            updates.customBaseUrl = ''
            updates.modelName = ''
          }
        }
        set(updates as SettingsState)

        apiKeyCache.delete(providerId)
        apiKeyCachePromise.delete(providerId)
      },

      addCustomProviderModel: (providerId, model) => {
        const trimmedModel = model.trim()
        if (!trimmedModel) return false
        const target = get().customProviders.find((provider) => provider.id === providerId)
        if (!target) return false
        if (target.models.includes(trimmedModel)) return true

        set((state) => ({
          customProviders: state.customProviders.map((provider) =>
            provider.id === providerId
              ? {
                  ...provider,
                  models: [...provider.models, trimmedModel],
                  updatedAt: Date.now(),
                }
              : provider
          ),
        }))

        // Re-register in dynamic registry
        const updated = get().customProviders.find((p) => p.id === providerId)
        if (updated) {
          registerCustomAsDynamic(updated)
        }
        return true
      },

      removeCustomProviderModel: (providerId, model) => {
        const target = get().customProviders.find((provider) => provider.id === providerId)
        if (!target) return
        const nextModels = target.models.filter((item) => item !== model)
        if (nextModels.length === 0) return

        set((state) => ({
          customProviders: state.customProviders.map((provider) =>
            provider.id === providerId
              ? { ...provider, models: nextModels, updatedAt: Date.now() }
              : provider
          ),
        }))

        // Re-register in dynamic registry
        const updated = get().customProviders.find((p) => p.id === providerId)
        if (updated) {
          registerCustomAsDynamic(updated)
        }

        if (get().providerType === providerId && get().modelName === model) {
          set({ modelName: nextModels[0] })
        }
      },

      setCustomProviderApiMode: (providerId, apiMode) => {
        set((state) => ({
          customProviders: state.customProviders.map((provider) =>
            provider.id === providerId
              ? { ...provider, apiMode, updatedAt: Date.now() }
              : provider
          ),
        }))

        // Re-register in dynamic registry
        const updated = get().customProviders.find((p) => p.id === providerId)
        if (updated) {
          registerCustomAsDynamic(updated)
        }
      },

      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
      setMaxIterations: (maxIterations) =>
        set({
          maxIterations:
            maxIterations === 0
              ? 0
              : Math.max(1, Math.min(100, Math.round(maxIterations))),
        }),
      setEnableThinking: (enableThinking) => set({ enableThinking }),
      setThinkingLevel: (thinkingLevel) => set({ thinkingLevel }),
      setEnableBatchSpawn: (enableBatchSpawn) => set({ enableBatchSpawn }),
      setHasApiKey: (hasApiKey) => set({ hasApiKey }),

      getEffectiveProviderConfig: () => {
        const state = get()
        const config = getProviderConfig(state.providerType)
        if (!config) return null

        return {
          apiKeyProviderKey: state.providerType,
          baseUrl: config.baseURL,
          modelName: state.modelName || config.modelName,
        }
      },

      checkHasApiKey: async () => {
        const effective = get().getEffectiveProviderConfig()
        if (!effective) {
          set({ hasApiKey: false })
          return false
        }
        const providerKey = effective.apiKeyProviderKey

        // Return cached value if available and not stale
        if (apiKeyCache.has(providerKey)) {
          return apiKeyCache.get(providerKey)!
        }

        // Use promise cache to avoid concurrent queries
        if (apiKeyCachePromise.has(providerKey)) {
          return apiKeyCachePromise.get(providerKey)!
        }

        const promise = (async () => {
          try {
            const { loadApiKey } = await import('@/security/api-key-store')
            const key = await loadApiKey(providerKey)
            const hasKey = !!key
            apiKeyCache.set(providerKey, hasKey)

            // Update the reactive state
            set({ hasApiKey: hasKey })

            return hasKey
          } catch (error) {
            console.error('[SettingsStore] Failed to check API key:', error)
            return false
          } finally {
            apiKeyCachePromise.delete(providerKey)
          }
        })()

        apiKeyCachePromise.set(providerKey, promise)
        return promise
      },

      invalidateApiKeyCache: (provider) => {
        const currentProvider = provider || get().getEffectiveProviderConfig()?.apiKeyProviderKey
        if (!currentProvider) return
        apiKeyCache.delete(currentProvider)
        apiKeyCachePromise.delete(currentProvider)
      },

      saveModelOverrideForWorkspace: (workspaceId) => {
        const state = get()
        set({
          modelOverridesByWorkspace: {
            ...state.modelOverridesByWorkspace,
            [workspaceId]: {
              providerType: state.providerType,
              modelName: state.modelName,
            },
          },
        })
      },

      syncModelForWorkspace: (workspaceId) => {
        if (!workspaceId) return
        const state = get()
        const override = state.modelOverridesByWorkspace[workspaceId]
        if (override) {
          const updates: Partial<SettingsState> = {
            providerType: override.providerType,
            modelName: override.modelName,
          }
          // If it's a custom provider, also set baseUrl
          if (isCustomProviderType(override.providerType)) {
            const cp = state.customProviders.find((p) => p.id === override.providerType)
            if (cp) {
              updates.customBaseUrl = cp.baseUrl
            }
          }
          set(updates as SettingsState)
        }
      },

      switchProviderAndModel: (newProviderType, newModelName) => {
        const state = get()
        const updates: Partial<SettingsState> = {
          providerType: newProviderType,
          modelName: newModelName,
          lastUsedModelByProvider: {
            ...state.lastUsedModelByProvider,
            [newProviderType]: newModelName,
          },
        }
        if (isCustomProviderType(newProviderType)) {
          const cp = state.customProviders.find((p) => p.id === newProviderType)
          if (cp) {
            updates.customBaseUrl = cp.baseUrl
          }
        }
        set(updates as SettingsState)
      },

      getAvailableProviders: async () => {
        const { loadApiKey } = await import('@/security/api-key-store')
        const { PROVIDER_META, getModelsForProvider } = await import('@/agent/providers/types')
        const state = get()
        const results: Array<{
          providerType: LLMProviderType
          displayName: string
          models: Array<{ id: string; name: string }>
          providerKey: string
        }> = []

        // Check built-in providers
        for (const [type, meta] of Object.entries(PROVIDER_META)) {
          const providerType = type as LLMProviderType
          const key = await loadApiKey(providerType)
          if (key) {
            // Use pinned models if available, otherwise fallback to all models
            const pinned = state.pinnedModelsByProvider[providerType]
            const allModels = getModelsForProvider(providerType)
            const models = pinned
              ? pinned
                  .map((id) => {
                    const found = allModels.find((m) => m.id === id)
                    return found ? { id: found.id, name: found.name } : { id, name: id }
                  })
              : allModels.map((m) => ({ id: m.id, name: m.name }))

            results.push({
              providerType,
              displayName: meta.displayName,
              models,
              providerKey: providerType,
            })
          }
        }

        // Check custom providers
        for (const cp of state.customProviders) {
          const key = await loadApiKey(cp.id)
          if (key) {
            // Use pinned models if available, otherwise fallback to custom provider models
            const pinned = state.pinnedModelsByProvider[cp.id]
            const models = pinned
              ? pinned.map((id) => ({ id, name: id }))
              : cp.models.map((m) => ({ id: m, name: m }))

            results.push({
              providerType: cp.id,
              displayName: cp.name,
              models,
              providerKey: cp.id,
            })
          }
        }

        return results
      },

      pinModel: (providerType, modelId) => {
        const state = get()
        const current = state.pinnedModelsByProvider[providerType] || []
        if (current.includes(modelId)) return
        set({
          pinnedModelsByProvider: {
            ...state.pinnedModelsByProvider,
            [providerType]: [...current, modelId],
          },
          _providerRefreshVersion: state._providerRefreshVersion + 1,
        })
      },

      unpinModel: (providerType, modelId) => {
        const state = get()
        const current = state.pinnedModelsByProvider[providerType] || []
        if (!current.includes(modelId)) return
        set({
          pinnedModelsByProvider: {
            ...state.pinnedModelsByProvider,
            [providerType]: current.filter((id) => id !== modelId),
          },
          _providerRefreshVersion: state._providerRefreshVersion + 1,
        })
      },

      setPinnedModels: (providerType, modelIds) => {
        const state = get()
        set({
          pinnedModelsByProvider: {
            ...state.pinnedModelsByProvider,
            [providerType]: modelIds,
          },
          _providerRefreshVersion: state._providerRefreshVersion + 1,
        })
      },
    }),
    {
      name: 'bfosa-settings',
      version: 1,
      // Migrate from version 0: only clear the hardcoded default provider/model.
      // User-configured values are preserved.
      migrate: (persisted: any, version?: number) => {
        if ((version ?? 0) < 1) {
          if (persisted.providerType === 'glm-coding' && persisted.modelName === 'glm-5.1') {
            persisted.providerType = ''
            persisted.modelName = ''
          }
        }
        return persisted
      },
      // Don't persist hasApiKey - it's derived from SQLite
      partialize: (state) => ({
        providerType: state.providerType,
        modelName: state.modelName,
        customBaseUrl: state.customBaseUrl,
        customProviders: state.customProviders,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        maxIterations: state.maxIterations,
        enableThinking: state.enableThinking,
        thinkingLevel: state.thinkingLevel,
        enableBatchSpawn: state.enableBatchSpawn,
        modelOverridesByWorkspace: state.modelOverridesByWorkspace,
        lastUsedModelByProvider: state.lastUsedModelByProvider,
        pinnedModelsByProvider: state.pinnedModelsByProvider,
      }),
      // On rehydration, restore dynamic providers
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Migrate old 'custom' providerType to the new dynamic system
          if ((state.providerType as string) === 'custom') {
            const first = state.customProviders[0]
            if (first) {
              state.providerType = first.id as LLMProviderType
              state.modelName = first.models[0] || ''
              state.customBaseUrl = first.baseUrl
            } else {
              state.providerType = '' as LLMProviderType
              state.modelName = ''
              state.customBaseUrl = ''
            }
          }
          // Migrate old activeCustomProviderId in workspace overrides
          const overrides = state.modelOverridesByWorkspace
          for (const wsId of Object.keys(overrides)) {
            const o = overrides[wsId]
            if ((o.providerType as string) === 'custom' && (o as any).activeCustomProviderId) {
              o.providerType = (o as any).activeCustomProviderId
              delete (o as any).activeCustomProviderId
            }
          }
          // Register all custom providers into dynamic registry
          for (const cp of state.customProviders) {
            registerCustomAsDynamic(cp)
          }
        }
      },
    }
  )
)

/**
 * Hook to get the real-time API key status
 * This ensures the value is always synced with the database
 */
export function useHasApiKey(): boolean {
  const hasApiKey = useSettingsStore((s) => s.hasApiKey)
  const checkHasApiKey = useSettingsStore((s) => s.checkHasApiKey)
  const providerType = useSettingsStore((s) => s.providerType)

  // Check on mount and when provider changes
  // Note: This is intentionally not tracking hasApiKey to avoid loops
  // The component will re-render when hasApiKey changes via setHasApiKey
  useEffect(() => {
    let mounted = true
    checkHasApiKey().then((hasKey) => {
      if (mounted) {
        useSettingsStore.getState().setHasApiKey(hasKey)
      }
    })
    return () => {
      mounted = false
    }
  }, [providerType, checkHasApiKey])

  return hasApiKey
}
