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
import { LLM_PROVIDER_CONFIGS } from '@/agent/providers/types'
import type { ThinkingLevel } from '@mariozechner/pi-ai'

// Cache for hasApiKey to avoid repeated database queries
// This is a soft cache that can be invalidated
const apiKeyCache = new Map<string, boolean>()
const apiKeyCachePromise: Map<string, Promise<boolean>> = new Map()

export interface CustomProviderConfig {
  id: string
  name: string
  baseUrl: string
  models: string[]
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
  activeCustomProviderId?: string
}

interface SettingsState {
  // LLM settings
  providerType: LLMProviderType
  modelName: string
  customBaseUrl: string
  customProviders: CustomProviderConfig[]
  activeCustomProviderId: string
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
  setActiveCustomProvider: (providerId: string) => void
  addCustomProviderModel: (providerId: string, model: string) => boolean
  removeCustomProviderModel: (providerId: string, model: string) => void
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
  switchProviderAndModel: (providerType: LLMProviderType, modelName: string, customProviderId?: string) => void

  /**
   * Get all providers that have a saved API key
   */
  getAvailableProviders: () => Promise<Array<{
    providerType: LLMProviderType
    displayName: string
    models: Array<{ id: string; name: string }>
    providerKey: string
  }>>
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      providerType: 'glm-coding',
      modelName: 'glm-4.7-flash',
      customBaseUrl: '',
      customProviders: [],
      activeCustomProviderId: '',
      temperature: 0.7,
      maxTokens: 4096,
      maxIterations: 20,
      enableThinking: false,
      thinkingLevel: 'medium' as ThinkingLevel,
      enableBatchSpawn: false,
      hasApiKey: false,
      modelOverridesByWorkspace: {},

      setProviderType: (providerType) => {
        set({ providerType })
        if (providerType !== 'custom') return
        const effective = get().getEffectiveProviderConfig()
        if (effective) {
          set({
            customBaseUrl: effective.baseUrl,
            modelName: effective.modelName,
          })
        }
      },
      setModelName: (modelName) => set({ modelName }),
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
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          customProviders: [provider, ...state.customProviders],
          activeCustomProviderId: id,
          providerType: 'custom',
          customBaseUrl: trimmedBaseUrl,
          modelName: trimmedModel,
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

        const state = get()
        if (state.activeCustomProviderId === providerId) {
          const refreshed = state.customProviders.find((provider) => provider.id === providerId)
          if (refreshed) {
            set({
              customBaseUrl: refreshed.baseUrl,
              modelName: nextModel ?? state.modelName,
            })
          }
        }

        return true
      },
      removeCustomProvider: (providerId) => {
        const existing = get().customProviders
        const remaining = existing.filter((provider) => provider.id !== providerId)
        const wasActive = get().activeCustomProviderId === providerId
        const fallback = remaining[0]

        set({
          customProviders: remaining,
          activeCustomProviderId: wasActive ? fallback?.id || '' : get().activeCustomProviderId,
          customBaseUrl: wasActive ? fallback?.baseUrl || '' : get().customBaseUrl,
          modelName: wasActive ? fallback?.models[0] || '' : get().modelName,
        })

        apiKeyCache.delete(`custom:${providerId}`)
        apiKeyCachePromise.delete(`custom:${providerId}`)
      },
      setActiveCustomProvider: (providerId) => {
        const provider = get().customProviders.find((item) => item.id === providerId)
        if (!provider) return
        set({
          activeCustomProviderId: provider.id,
          providerType: 'custom',
          customBaseUrl: provider.baseUrl,
          modelName: provider.models[0] || get().modelName,
        })
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

        if (get().activeCustomProviderId === providerId && get().modelName === model) {
          set({ modelName: nextModels[0] })
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
        if (state.providerType !== 'custom') {
          const config = LLM_PROVIDER_CONFIGS[state.providerType]
          return {
            apiKeyProviderKey: state.providerType,
            baseUrl: config.baseURL,
            modelName: state.modelName || config.modelName,
          }
        }

        const activeCustom =
          state.customProviders.find((provider) => provider.id === state.activeCustomProviderId) ||
          state.customProviders[0]
        if (!activeCustom) return null

        const resolvedModel =
          state.modelName && activeCustom.models.includes(state.modelName)
            ? state.modelName
            : activeCustom.models[0]
        if (!resolvedModel) return null

        return {
          apiKeyProviderKey: `custom:${activeCustom.id}`,
          baseUrl: activeCustom.baseUrl,
          modelName: resolvedModel,
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
              activeCustomProviderId: state.activeCustomProviderId || undefined,
            },
          },
        })
      },

      syncModelForWorkspace: (workspaceId) => {
        if (!workspaceId) return
        const state = get()
        const override = state.modelOverridesByWorkspace[workspaceId]
        if (override) {
          set({
            providerType: override.providerType,
            modelName: override.modelName,
            activeCustomProviderId: override.activeCustomProviderId || '',
          })
          // Also update customBaseUrl if custom provider
          if (override.providerType === 'custom' && override.activeCustomProviderId) {
            const customProvider = state.customProviders.find(
              (p) => p.id === override.activeCustomProviderId
            )
            if (customProvider) {
              set({ customBaseUrl: customProvider.baseUrl })
            }
          }
        }
      },

      switchProviderAndModel: (newProviderType, newModelName, customProviderId) => {
        if (newProviderType === 'custom' && customProviderId) {
          const state = get()
          const provider = state.customProviders.find((p) => p.id === customProviderId)
          if (provider) {
            set({
              providerType: 'custom',
              modelName: newModelName,
              activeCustomProviderId: customProviderId,
              customBaseUrl: provider.baseUrl,
            })
          }
        } else {
          set({
            providerType: newProviderType,
            modelName: newModelName,
          })
        }
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
          if (type === 'custom') continue // handled separately
          const providerType = type as LLMProviderType
          const key = await loadApiKey(providerType)
          if (key) {
            results.push({
              providerType,
              displayName: meta.displayName,
              models: getModelsForProvider(providerType).map((m) => ({ id: m.id, name: m.name })),
              providerKey: providerType,
            })
          }
        }

        // Check custom providers
        for (const cp of state.customProviders) {
          const key = await loadApiKey(`custom:${cp.id}`)
          if (key) {
            results.push({
              providerType: 'custom',
              displayName: cp.name,
              models: cp.models.map((m) => ({ id: m, name: m })),
              providerKey: `custom:${cp.id}`,
            })
          }
        }

        return results
      },
    }),
    {
      name: 'bfosa-settings',
      // Don't persist hasApiKey - it's derived from SQLite
      partialize: (state) => ({
        providerType: state.providerType,
        modelName: state.modelName,
        customBaseUrl: state.customBaseUrl,
        customProviders: state.customProviders,
        activeCustomProviderId: state.activeCustomProviderId,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        maxIterations: state.maxIterations,
        enableThinking: state.enableThinking,
        thinkingLevel: state.thinkingLevel,
        enableBatchSpawn: state.enableBatchSpawn,
        modelOverridesByWorkspace: state.modelOverridesByWorkspace,
      }),
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
