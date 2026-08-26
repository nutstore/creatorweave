/**
 * Quality Verification Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { QualityVerifier, generateVerificationReport } from '../quality-verification'
import type { ValidationContext } from '../quality-verification'
import type { ToolContext } from '@/agent/tools/tool-types'

describe('Quality Verifier', () => {
  let verifier: QualityVerifier

  beforeEach(() => {
    verifier = new QualityVerifier({ autoFix: false })
  })

  describe('bracket matching validation', () => {
    it('should pass for properly matched brackets', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-1',
          role: 'assistant',
          content: 'const test = true',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'javascript',
      }

      const result = await verifier.verify(context)

      // Should have no errors from syntax validation
      expect(result.issues.filter((i) => i.type === 'syntax_error')).toHaveLength(0)
    })

    it('should detect unmatched brackets', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-2',
          role: 'assistant',
          content: 'function test() { return { key: "value"',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'typescript',
      }

      const result = await verifier.verify(context)

      expect(result.score).toBeLessThan(1)
      expect(result.issues.some((i) => i.type === 'syntax_error')).toBe(true)
    })
  })

  describe('security validation', () => {
    it('should detect hardcoded passwords', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-3',
          role: 'assistant',
          content: 'const password = "admin123";',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'javascript',
      }

      const result = await verifier.verify(context)

      expect(result.issues.some((i) => i.type === 'security_risk')).toBe(true)
      expect(result.issues.some((i) => i.message.includes('password'))).toBe(true)
    })

    it('should detect hardcoded API keys', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-4',
          role: 'assistant',
          content: 'const apiKey = "sk-1234567890abcdef"',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'javascript',
      }

      const result = await verifier.verify(context)

      expect(result.issues.some((i) => i.type === 'security_risk')).toBe(true)
      expect(result.issues.some((i) => i.message.includes('API key'))).toBe(true)
    })

    it('should detect eval usage', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-5',
          role: 'assistant',
          content: 'eval(userInput)',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'javascript',
      }

      const result = await verifier.verify(context)

      expect(result.issues.some((i) => i.message.includes('eval'))).toBe(true)
    })

    it('should detect potential SQL injection', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-6',
          role: 'assistant',
          content: 'SELECT * FROM users WHERE name = \'" + userName + "\'',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'sql',
      }

      const result = await verifier.verify(context)

      expect(result.issues.some((i) => i.message.includes('SQL injection'))).toBe(true)
    })
  })

  describe('TypeScript validation', () => {
    it('should detect TypeScript project type', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-7',
          role: 'assistant',
          content: 'function test(): void { return; }',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'typescript',
      }

      const result = await verifier.verify(context)

      // Should have categories related to typescript validation
      expect(result.categories.length).toBeGreaterThan(0)
    })

    it('should handle non-TypeScript content', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-8',
          role: 'assistant',
          content: 'This is a regular response without code.',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'general',
      }

      const result = await verifier.verify(context)

      expect(result.score).toBeGreaterThan(0.8)
    })
  })

  describe('performance validation', () => {
    it('should warn about forEach usage', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-9',
          role: 'assistant',
          content: 'items.forEach(item => console.log(item))',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'typescript',
      }

      const result = await verifier.verify(context)

      expect(result.issues.some((i) => i.type === 'performance')).toBe(true)
    })

    it('should warn about JSON.parse/stringify deep clone', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-10',
          role: 'assistant',
          content: 'const copy = JSON.parse(JSON.stringify(original))',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'typescript',
      }

      const result = await verifier.verify(context)

      expect(result.issues.some((i) => i.type === 'performance')).toBe(true)
    })
  })

  describe('completeness validation', () => {
    it('should warn about incomplete answers', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-11',
          role: 'assistant',
          content: 'How about we try...?',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'general',
      }

      const result = await verifier.verify(context)

      expect(result.issues.some((i) => i.type === 'completeness')).toBe(true)
    })

    it('should detect TODO comments', async () => {
      const context: ValidationContext = {
        message: {
          id: 'msg-12',
          role: 'assistant',
          content: '// TODO: Implement error handling\n// FIXME: Fix memory leak',
          timestamp: Date.now(),
        },
        previousMessages: [],
        toolContext: {} as ToolContext,
        fileContents: new Map(),
        projectType: 'typescript',
      }

      const result = await verifier.verify(context)

      expect(result.issues.some((i) => i.message.includes('TODO'))).toBe(true)
    })
  })

  describe('generateVerificationReport', () => {
    it('should generate a readable report', () => {
      const result = {
        score: 0.85,
        categories: [
          { name: 'bracket_matcher', score: 100, maxScore: 100, issues: [] },
          { name: 'security_scanner', score: 80, maxScore: 100, issues: ['Issue 1'] },
        ],
        issues: [
          {
            type: 'security_risk' as const,
            severity: 'warning' as const,
            message: 'Test issue',
            canAutoFix: false,
          },
        ],
        suggestions: ['Fix the security issue'],
        autoFixed: false,
        timestamp: 50,
      }

      const report = generateVerificationReport(result)

      expect(report).toContain('Quality Verification Report')
      expect(report).toContain('85')
      expect(report).toContain('Test issue')
    })
  })
})
