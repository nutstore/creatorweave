/**
 * Tests for Code Analysis Tool
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  analyze_code_executor,
  find_patterns_executor,
  refactor_suggestions_executor,
} from '../code-analysis.tool'
import type { ToolContext } from '../tool-types'

describe('Code Analysis Tool', () => {
  let mockContext: ToolContext

  beforeEach(() => {
    mockContext = {
      directoryHandle: {} as FileSystemDirectoryHandle,
    }
  })

  describe('analyze_code', () => {
    it('should analyze JavaScript code', async () => {
      const args: Record<string, unknown> = {
        code: 'function add(a, b) { return a + b; }',
        language: 'javascript',
        analysis_type: 'all',
        include_suggestions: true,
      }

      const result = JSON.parse(await analyze_code_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.analysis.lines_of_code).toBe(1)
      expect(result.analysis.estimated_functions).toBe(1)
      expect(result.summary.issues_found).toBe(0)
    })

    it('should detect code smells', async () => {
      const args: Record<string, unknown> = {
        code: `
          function veryLongFunction() {
            var x = 1;
            if (x > 0) {
              if (x > 1) {
                if (x > 2) {
                  console.log('deep nesting');
                }
              }
            }
          }
        `,
        language: 'javascript',
        analysis_type: 'quality',
      }

      const result = JSON.parse(await analyze_code_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.analysis.code_smell_count).toBeGreaterThan(0)
    })

    it('should detect security risks', async () => {
      const args: Record<string, unknown> = {
        code: `
          const userInput = getUserInput();
          eval(userInput);
          document.innerHTML = userInput;
        `,
        language: 'javascript',
        analysis_type: 'security',
      }

      const result = JSON.parse(await analyze_code_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.analysis.security_risk_count).toBeGreaterThan(0)
    })

    it('should calculate complexity', async () => {
      const args: Record<string, unknown> = {
        code: `
          function complex(a, b) {
            if (a) {
              if (b) {
                while (a > 0) {
                  a--;
                }
              }
            }
            return a;
          }
        `,
        language: 'javascript',
        analysis_type: 'complexity',
      }

      const result = JSON.parse(await analyze_code_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.analysis.cyclomatic_complexity).toBeGreaterThan(1)
      expect(result.analysis.complexity_rating).toBe('high')
    })

    it('should include suggestions', async () => {
      const args: Record<string, unknown> = {
        code: 'var x = 10;',
        language: 'javascript',
        analysis_type: 'all',
        include_suggestions: true,
      }

      const result = JSON.parse(await analyze_code_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.analysis.suggestions).toBeDefined()
      expect(Array.isArray(result.analysis.suggestions)).toBe(true)
    })

    it('should handle unknown language', async () => {
      const args: Record<string, unknown> = {
        code: 'print("hello")',
        language: 'unknown',
        analysis_type: 'all',
      }

      const result = JSON.parse(await analyze_code_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.analysis.language).toBe('unknown')
    })
  })

  describe('find_patterns', () => {
    it('should find anti-patterns', async () => {
      const args: Record<string, unknown> = {
        code: 'var x = 1;',
        pattern_type: 'anti-pattern',
      }

      const result = JSON.parse(await find_patterns_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.total_found).toBeGreaterThan(0)
    })

    it('should find security risks', async () => {
      const args: Record<string, unknown> = {
        code: 'eval(userInput);',
        pattern_type: 'security-risk',
      }

      const result = JSON.parse(await find_patterns_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.patterns[0].type).toBe('security-risk')
    })

    it('should detect design patterns', async () => {
      const args: Record<string, unknown> = {
        code: `
          class Singleton {
            private static instance: Singleton;
            private constructor() {}
            static getInstance() {
              if (!Singleton.instance) {
                Singleton.instance = new Singleton();
              }
              return Singleton.instance;
            }
          }
        `,
        pattern_type: 'design-pattern',
      }

      const result = JSON.parse(await find_patterns_executor(args, mockContext))

      expect(result.success).toBe(true)
      const hasSingleton = result.patterns.some((p: { name: string }) => p.name === 'singleton')
      expect(hasSingleton).toBe(true)
    })

    it('should find all patterns', async () => {
      const args: Record<string, unknown> = {
        code: 'var x = 1;',
        pattern_type: 'all',
      }

      const result = JSON.parse(await find_patterns_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.total_found).toBeGreaterThan(0)
    })
  })

  describe('refactor_suggestions', () => {
    it('should suggest refactoring for callbacks', async () => {
      const args: Record<string, unknown> = {
        code: 'somePromise.then(x => x + 1).then(y => y * 2);',
        target_pattern: 'callback',
        style: 'readable',
      }

      const result = JSON.parse(await refactor_suggestions_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.suggestions.length).toBeGreaterThan(0)
      expect(result.suggestions[0].original).toBe('Nested callbacks')
    })

    it('should suggest refactoring for long functions', async () => {
      const args: Record<string, unknown> = {
        code: 'long function code here',
        target_pattern: 'long function',
        style: 'readable',
      }

      const result = JSON.parse(await refactor_suggestions_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.suggestions[0].refactored).toBe('Extract smaller functions')
    })

    it('should suggest refactoring for magic numbers', async () => {
      const args: Record<string, unknown> = {
        code: 'if (status === 1) { return true; }',
        target_pattern: 'magic numbers',
        style: 'concise',
      }

      const result = JSON.parse(await refactor_suggestions_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.suggestions[0].refactored).toBe('Named constants')
    })

    it('should suggest refactoring for nested conditionals', async () => {
      const args: Record<string, unknown> = {
        code: 'nested if statements',
        target_pattern: 'nested conditionals',
        style: 'functional',
      }

      const result = JSON.parse(await refactor_suggestions_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.suggestions[0].refactored).toBe('Guard clauses / early returns')
    })

    it('should include functional style tips', async () => {
      const args: Record<string, unknown> = {
        code: 'code',
        target_pattern: 'conditionals',
        style: 'functional',
      }

      const result = JSON.parse(await refactor_suggestions_executor(args, mockContext))

      expect(result.success).toBe(true)
      const hasFunctionalTips = result.suggestions.some(
        (s: { style?: string }) => s.style === 'functional'
      )
      expect(hasFunctionalTips).toBe(true)
    })

    it('should handle unknown pattern', async () => {
      const args: Record<string, unknown> = {
        code: 'code',
        target_pattern: 'unknown-pattern',
        style: 'readable',
      }

      const result = JSON.parse(await refactor_suggestions_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.suggestions[0].original).toBe('unknown-pattern')
    })
  })
})
