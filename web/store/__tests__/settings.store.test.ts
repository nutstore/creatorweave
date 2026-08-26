/**
 * useSettingsStore Unit Tests
 *
 * Tests for the settings store state management
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from '../settings.store'
import type { LLMProviderType } from '@/agent/providers/types'

describe('useSettingsStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSettingsStore.setState({
      providerType: 'glm-coding',
      modelName: 'glm-4.7-flash',
      customBaseUrl: '',
      temperature: 0.7,
      maxTokens: 4096,
      maxIterations: 20,
      hasApiKey: false,
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useSettingsStore.getState()

      expect(state.providerType).toBe('glm-coding')
      expect(state.modelName).toBe('glm-4.7-flash')
      expect(state.customBaseUrl).toBe('')
      expect(state.temperature).toBe(0.7)
      expect(state.maxTokens).toBe(4096)
      expect(state.maxIterations).toBe(20)
      expect(state.hasApiKey).toBe(false)
    })
  })

  describe('setProviderType', () => {
    it('should update provider type', () => {
      const { setProviderType } = useSettingsStore.getState()

      setProviderType('openai' as LLMProviderType)

      expect(useSettingsStore.getState().providerType).toBe('openai')
    })

    it('should support all provider types', () => {
      const { setProviderType } = useSettingsStore.getState()

      setProviderType('anthropic' as LLMProviderType)
      expect(useSettingsStore.getState().providerType).toBe('anthropic')

      setProviderType('openai' as LLMProviderType)
      expect(useSettingsStore.getState().providerType).toBe('openai')

      setProviderType('ollama' as LLMProviderType)
      expect(useSettingsStore.getState().providerType).toBe('ollama')

      setProviderType('glm-coding')
      expect(useSettingsStore.getState().providerType).toBe('glm-coding')
    })
  })

  describe('setModelName', () => {
    it('should update model name', () => {
      const { setModelName } = useSettingsStore.getState()

      setModelName('gpt-4')

      expect(useSettingsStore.getState().modelName).toBe('gpt-4')
    })
  })

  describe('setCustomBaseUrl', () => {
    it('should update custom base URL', () => {
      const { setCustomBaseUrl } = useSettingsStore.getState()

      setCustomBaseUrl('https://api.example.com')

      expect(useSettingsStore.getState().customBaseUrl).toBe('https://api.example.com')
    })

    it('should allow empty string', () => {
      const { setCustomBaseUrl } = useSettingsStore.getState()

      setCustomBaseUrl('https://api.example.com')
      expect(useSettingsStore.getState().customBaseUrl).toBe('https://api.example.com')

      setCustomBaseUrl('')
      expect(useSettingsStore.getState().customBaseUrl).toBe('')
    })
  })

  describe('setTemperature', () => {
    it('should update temperature', () => {
      const { setTemperature } = useSettingsStore.getState()

      setTemperature(0.5)

      expect(useSettingsStore.getState().temperature).toBe(0.5)
    })

    it('should allow temperature from 0 to 1', () => {
      const { setTemperature } = useSettingsStore.getState()

      setTemperature(0)
      expect(useSettingsStore.getState().temperature).toBe(0)

      setTemperature(1)
      expect(useSettingsStore.getState().temperature).toBe(1)

      setTemperature(0.5)
      expect(useSettingsStore.getState().temperature).toBe(0.5)
    })
  })

  describe('setMaxTokens', () => {
    it('should update max tokens', () => {
      const { setMaxTokens } = useSettingsStore.getState()

      setMaxTokens(8192)

      expect(useSettingsStore.getState().maxTokens).toBe(8192)
    })

    it('should allow various token limits', () => {
      const { setMaxTokens } = useSettingsStore.getState()

      setMaxTokens(2048)
      expect(useSettingsStore.getState().maxTokens).toBe(2048)

      setMaxTokens(16384)
      expect(useSettingsStore.getState().maxTokens).toBe(16384)

      setMaxTokens(128000)
      expect(useSettingsStore.getState().maxTokens).toBe(128000)
    })
  })

  describe('setMaxIterations', () => {
    it('should update max iterations', () => {
      const { setMaxIterations } = useSettingsStore.getState()

      setMaxIterations(35)

      expect(useSettingsStore.getState().maxIterations).toBe(35)
    })
  })

  describe('setHasApiKey', () => {
    it('should update API key status', () => {
      const { setHasApiKey } = useSettingsStore.getState()

      setHasApiKey(true)

      expect(useSettingsStore.getState().hasApiKey).toBe(true)
    })

    it('should toggle API key status', () => {
      const { setHasApiKey } = useSettingsStore.getState()

      expect(useSettingsStore.getState().hasApiKey).toBe(false)

      setHasApiKey(true)
      expect(useSettingsStore.getState().hasApiKey).toBe(true)

      setHasApiKey(false)
      expect(useSettingsStore.getState().hasApiKey).toBe(false)
    })
  })

  describe('combined updates', () => {
    it('should handle multiple state updates', () => {
      const { setProviderType, setModelName, setTemperature } = useSettingsStore.getState()

      setProviderType('openai' as LLMProviderType)
      setModelName('gpt-4')
      setTemperature(0.8)

      const state = useSettingsStore.getState()
      expect(state.providerType).toBe('openai')
      expect(state.modelName).toBe('gpt-4')
      expect(state.temperature).toBe(0.8)
    })
  })
})
