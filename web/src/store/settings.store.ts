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

// Cache for hasApiKey to avoid repeated database queries
// This is a soft cache that can be invalidated
let apiKeyCache = new Map<string, boolean>()
let apiKeyCachePromise: Map<string, Promise<boolean>> = new Map()

interface SettingsState {
  // LLM settings
  providerType: LLMProviderType
  modelName: string
  customBaseUrl: string
  temperature: number
  maxTokens: number

  // API key status - NOT persisted, derived from SQLite
  // Use getHasApiKey() or checkHasApiKey() to get the current value
  hasApiKey: boolean

  // Actions
  setProviderType: (type: LLMProviderType) => void
  setModelName: (name: string) => void
  setCustomBaseUrl: (url: string) => void
  setTemperature: (temp: number) => void
  setMaxTokens: (tokens: number) => void
  setHasApiKey: (has: boolean) => void

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
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      providerType: 'glm-coding',
      modelName: 'glm-4-flash',
      customBaseUrl: '',
      temperature: 0.7,
      maxTokens: 4096,
      hasApiKey: false,

      setProviderType: (providerType) => set({ providerType }),
      setModelName: (modelName) => set({ modelName }),
      setCustomBaseUrl: (customBaseUrl) => set({ customBaseUrl }),
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
      setHasApiKey: (hasApiKey) => set({ hasApiKey }),

      checkHasApiKey: async () => {
        const { providerType } = get()

        // Return cached value if available and not stale
        if (apiKeyCache.has(providerType)) {
          return apiKeyCache.get(providerType)!
        }

        // Use promise cache to avoid concurrent queries
        if (apiKeyCachePromise.has(providerType)) {
          return apiKeyCachePromise.get(providerType)!
        }

        const promise = (async () => {
          try {
            const { loadApiKey } = await import('@/security/api-key-store')
            const key = await loadApiKey(providerType)
            const hasKey = !!key
            apiKeyCache.set(providerType, hasKey)

            // Update the reactive state
            set({ hasApiKey: hasKey })

            return hasKey
          } catch (error) {
            console.error('[SettingsStore] Failed to check API key:', error)
            return false
          } finally {
            apiKeyCachePromise.delete(providerType)
          }
        })()

        apiKeyCachePromise.set(providerType, promise)
        return promise
      },

      invalidateApiKeyCache: (provider) => {
        const currentProvider = provider || get().providerType
        apiKeyCache.delete(currentProvider)
        apiKeyCachePromise.delete(currentProvider)
      },
    }),
    {
      name: 'bfosa-settings',
      // Don't persist hasApiKey - it's derived from SQLite
      partialize: (state) => ({
        providerType: state.providerType,
        modelName: state.modelName,
        customBaseUrl: state.customBaseUrl,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
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
