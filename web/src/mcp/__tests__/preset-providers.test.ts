/**
 * Preset Providers Tests
 */

import { describe, it, expect } from 'vitest'
import {
  getPresetProviders,
  getProvidersByCategory,
  getProviderById,
  providerToConfig,
  getCategoriesWithCount,
  validateProviderConfig,
  getEnvVarTemplate,
} from '../preset-providers'

describe('Preset Providers', () => {
  describe('getPresetProviders', () => {
    it('should return all preset providers', () => {
      const providers = getPresetProviders()

      expect(providers.length).toBeGreaterThan(0)
      expect(providers.some((p) => p.id === 'figma')).toBe(true)
      expect(providers.some((p) => p.id === 'github')).toBe(true)
      expect(providers.some((p) => p.id === 'gitlab')).toBe(true)
      expect(providers.some((p) => p.id === 'jira')).toBe(true)
      expect(providers.some((p) => p.id === 'database')).toBe(true)
    })
  })

  describe('getProvidersByCategory', () => {
    it('should return development providers', () => {
      const providers = getProvidersByCategory('development')

      expect(providers.length).toBeGreaterThan(0)
      expect(providers.every((p) => p.category === 'development')).toBe(true)
      expect(providers.some((p) => p.id === 'github')).toBe(true)
    })

    it('should return data providers', () => {
      const providers = getProvidersByCategory('data')

      expect(providers.length).toBeGreaterThan(0)
      expect(providers.every((p) => p.category === 'data')).toBe(true)
    })

    it('should return productivity providers', () => {
      const providers = getProvidersByCategory('productivity')

      expect(providers.length).toBeGreaterThan(0)
      expect(providers.every((p) => p.category === 'productivity')).toBe(true)
    })

    it('should return communication providers', () => {
      const providers = getProvidersByCategory('communication')

      expect(providers.length).toBeGreaterThan(0)
      expect(providers.every((p) => p.category === 'communication')).toBe(true)
      expect(providers.some((p) => p.id === 'slack')).toBe(true)
    })
  })

  describe('getProviderById', () => {
    it('should return GitHub provider', () => {
      const provider = getProviderById('github')

      expect(provider).toBeDefined()
      expect(provider!.id).toBe('github')
      expect(provider!.name).toBe('GitHub')
      expect(provider!.category).toBe('development')
    })

    it('should return Figma provider', () => {
      const provider = getProviderById('figma')

      expect(provider).toBeDefined()
      expect(provider!.id).toBe('figma')
      expect(provider!.name).toBe('Figma MCP Remote')
      expect(provider!.config.url).toBe('https://mcp.figma.com/mcp')
      expect(provider!.config.transport).toBe('streamable_http')
    })

    it('should return undefined for unknown provider', () => {
      const provider = getProviderById('unknown-provider')

      expect(provider).toBeUndefined()
    })
  })

  describe('providerToConfig', () => {
    it('should convert provider to MCPServerConfig', () => {
      const provider = getProviderById('github')
      expect(provider).toBeDefined()

      const config = providerToConfig(provider!)

      expect(config.id).toBe('github')
      expect(config.name).toBe('GitHub')
      expect(config.type).toBe('user')
      expect(config.enabled).toBe(false)
    })

    it('should preserve Figma preset transport when converting config', () => {
      const provider = getProviderById('figma')
      expect(provider).toBeDefined()

      const config = providerToConfig(provider!)

      expect(config.id).toBe('figma')
      expect(config.url).toBe('https://mcp.figma.com/mcp')
      expect(config.transport).toBe('streamable_http')
      expect(config.enabled).toBe(false)
    })
  })

  describe('getCategoriesWithCount', () => {
    it('should return categories with counts', () => {
      const categories = getCategoriesWithCount()

      expect(categories.length).toBeGreaterThan(0)
      expect(categories.some((c) => c.category === 'development')).toBe(true)
      expect(categories.some((c) => c.category === 'data')).toBe(true)
      expect(categories.every((c) => c.count > 0)).toBe(true)
    })
  })

  describe('validateProviderConfig', () => {
    it('should validate GitHub provider', () => {
      const provider = getProviderById('github')
      expect(provider).toBeDefined()

      const result = validateProviderConfig(provider!)

      expect(result.missingVars).toContain('GITHUB_TOKEN')
      expect(result.valid).toBe(false)
    })

    it('should validate Figma provider token requirement', () => {
      const provider = getProviderById('figma')
      expect(provider).toBeDefined()

      const result = validateProviderConfig(provider!)

      expect(result.missingVars).toContain('FIGMA_TOKEN')
      expect(result.valid).toBe(false)
    })

    it('should validate Slack provider', () => {
      const provider = getProviderById('slack')
      expect(provider).toBeDefined()

      const result = validateProviderConfig(provider!)

      expect(result.missingVars).toContain('SLACK_BOT_TOKEN')
    })
  })

  describe('getEnvVarTemplate', () => {
    it('should generate environment variable template', () => {
      const provider = getProviderById('github')
      expect(provider).toBeDefined()

      const template = getEnvVarTemplate(provider!)

      expect(template).toContain('# Environment variables for GitHub')
      expect(template).toContain('GITHUB_TOKEN=')
    })

    it('should generate Figma token template', () => {
      const provider = getProviderById('figma')
      expect(provider).toBeDefined()

      const template = getEnvVarTemplate(provider!)

      expect(template).toContain('# Environment variables for Figma MCP Remote')
      expect(template).toContain('FIGMA_TOKEN=')
    })

    it('should include all required env vars', () => {
      const provider = getProviderById('jira')
      expect(provider).toBeDefined()

      const template = getEnvVarTemplate(provider!)

      expect(template).toContain('JIRA_URL=')
      expect(template).toContain('JIRA_EMAIL=')
      expect(template).toContain('JIRA_API_TOKEN=')
    })
  })

  describe('provider structure', () => {
    it('should have required fields for all providers', () => {
      const providers = getPresetProviders()

      for (const provider of providers) {
        expect(provider.id).toBeDefined()
        expect(provider.name).toBeDefined()
        expect(provider.description).toBeDefined()
        expect(provider.category).toBeDefined()
        expect(provider.config).toBeDefined()
        expect(provider.setupInstructions).toBeDefined()
        expect(provider.requiredEnvVars).toBeDefined()
      }
    })

    it('should have valid config URLs', () => {
      const providers = getPresetProviders()

      for (const provider of providers) {
        expect(provider.config.url).toBeDefined()
        expect(provider.config.transport).toMatch(/^(sse|streamable_http)$/)
      }
    })
  })
})
