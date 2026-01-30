/**
 * Settings store - manages LLM configuration and user preferences.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LLMProviderType } from '@/agent/providers/types'

interface SettingsState {
  // LLM settings
  providerType: LLMProviderType
  modelName: string
  customBaseUrl: string
  temperature: number
  maxTokens: number

  // API key status (actual key stored encrypted in IndexedDB)
  hasApiKey: boolean

  // Actions
  setProviderType: (type: LLMProviderType) => void
  setModelName: (name: string) => void
  setCustomBaseUrl: (url: string) => void
  setTemperature: (temp: number) => void
  setMaxTokens: (tokens: number) => void
  setHasApiKey: (has: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'bfosa-settings',
    }
  )
)
