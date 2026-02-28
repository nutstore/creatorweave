/**
 * Code Analysis Tool
 *
 * Analyze code for complexity, patterns, and potential issues.
 * Supports JavaScript, TypeScript, Python, and other languages.
 *
 * @module code-analysis-tool
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'

// ============================================================================
// Tool Definitions
// ============================================================================

export interface AnalyzeCodeArgs {
  /** Code to analyze */
  code: string
  /** Programming language */
  language: 'javascript' | 'typescript' | 'python' | 'java' | 'cpp' | 'go' | 'rust' | 'unknown'
  /** Analysis type */
  analysis_type?: 'complexity' | 'quality' | 'security' | 'all'
  /** Include suggestions */
  include_suggestions?: boolean
}

export interface FindPatternsArgs {
  /** Code to search */
  code: string
  /** Pattern type */
  pattern_type: 'anti-pattern' | 'design-pattern' | 'code-smell' | 'security-risk' | 'all'
  /** Programming language */
  language?: string
}

export interface RefactorSuggestionsArgs {
  /** Code to refactor */
  code: string
  /** Target pattern to refactor */
  target_pattern: string
  /** Preferred style */
  style?: 'functional' | 'imperative' | 'concise' | 'readable'
}

export const analyze_code: ToolDefinition = {
  type: 'function',
  function: {
    name: 'analyze_code',
    description:
      'Analyze code for complexity, quality, and security issues. Detects code smells, anti-patterns, and potential bugs. Supports multiple programming languages.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Source code to analyze',
        },
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python', 'java', 'cpp', 'go', 'rust', 'unknown'],
          description: 'Programming language of the code',
        },
        analysis_type: {
          type: 'string',
          enum: ['complexity', 'quality', 'security', 'all'],
          description: 'Type of analysis to perform',
        },
        include_suggestions: {
          type: 'boolean',
          description: 'Include improvement suggestions',
        },
      },
      required: ['code'],
    },
  },
}

export const find_patterns: ToolDefinition = {
  type: 'function',
  function: {
    name: 'find_patterns',
    description:
      'Find code patterns including anti-patterns, design patterns, code smells, and security risks.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to search',
        },
        pattern_type: {
          type: 'string',
          enum: ['anti-pattern', 'design-pattern', 'code-smell', 'security-risk', 'all'],
          description: 'Type of pattern to find',
        },
        language: {
          type: 'string',
          description: 'Programming language',
        },
      },
      required: ['code', 'pattern_type'],
    },
  },
}

export const refactor_suggestions: ToolDefinition = {
  type: 'function',
  function: {
    name: 'refactor_suggestions',
    description:
      'Get refactoring suggestions for improving code structure, readability, and maintainability.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to refactor',
        },
        target_pattern: {
          type: 'string',
          description: 'Specific pattern or code smell to address',
        },
        style: {
          type: 'string',
          enum: ['functional', 'imperative', 'concise', 'readable'],
          description: 'Preferred coding style',
        },
      },
      required: ['code', 'target_pattern'],
    },
  },
}

// ============================================================================
// Helper Functions
// ============================================================================

function countLines(code: string): number {
  return code.split('\n').length
}

function countFunctions(code: string): number {
  const functionRegex =
    /(?:function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|=>\s*{|def\s+\w+|class\s+\w+)/
  const matches = code.match(functionRegex)
  return matches ? matches.length : 0
}

function countBranches(code: string): number {
  const branchKeywords = /\b(if|else|switch|case|for|while|try|catch|&&|\|\|)\b/g
  const matches = code.match(branchKeywords)
  return matches ? matches.length : 0
}

function calculateCyclomaticComplexity(code: string): number {
  const branches = countBranches(code)
  return branches + 1
}

function detectCodeSmells(
  code: string
): Array<{ type: string; line: number; description: string }> {
  const smells: Array<{ type: string; line: number; description: string }> = []
  const lines = code.split('\n')

  lines.forEach((line, index) => {
    // Long line
    if (line.length > 100) {
      smells.push({
        type: 'long-line',
        line: index + 1,
        description: `Line exceeds 100 characters (${line.length} chars)`,
      })
    }

    // Deep nesting
    const indent = line.search(/\S/)
    if (indent > 8) {
      smells.push({
        type: 'deep-nesting',
        line: index + 1,
        description: `Deep indentation detected (${indent} spaces)`,
      })
    }

    // Magic numbers
    if (/[^0-9a-zA-Z_](\d{3,})[^0-9a-zA-Z_]/.test(line)) {
      smells.push({
        type: 'magic-number',
        line: index + 1,
        description: 'Magic number detected - consider using named constant',
      })
    }

    // Long function (heuristic)
    if (lines.length > 200 && index > 200) {
      smells.push({
        type: 'long-file',
        line: 1,
        description: `File exceeds 200 lines (${lines.length} lines)`,
      })
      return
    }
  })

  // Check for callback hell
  const thenCount = (code.match(/\.then\s*\(/g) || []).length
  if (thenCount > 2) {
    smells.push({
      type: 'callback-hell',
      line: 0,
      description: 'Nested callbacks detected - consider using async/await or Promise composition',
    })
  }

  // Check for var usage
  if (/\bvar\b/.test(code)) {
    smells.push({
      type: 'var-usage',
      line: 0,
      description: 'Using "var" instead of "let" or "const"',
    })
  }

  return smells.slice(0, 20) // Limit results
}

function detectSecurityRisks(
  code: string
): Array<{ type: string; severity: string; line: number; description: string }> {
  const risks: Array<{ type: string; severity: string; line: number; description: string }> = []
  const lines = code.split('\n')

  const patterns = [
    {
      regex: /\beval\s*\(/,
      severity: 'high',
      type: 'eval-usage',
      desc: 'Use of eval() - security risk',
    },
    {
      regex: /\binnerHTML\s*=/,
      severity: 'medium',
      type: 'innerhtml',
      desc: 'Direct innerHTML assignment - XSS risk',
    },
    {
      regex: /\bdocument\.write\s*\(/,
      severity: 'medium',
      type: 'document-write',
      desc: 'document.write() - performance and security issue',
    },
    {
      regex: /\$\{[^}]*\}/,
      severity: 'low',
      type: 'template-injection',
      desc: 'Template literal with user input - validate',
    },
    {
      regex: /\bpassword\s*[:=]|secret\s*[:=]|api[_-]?key\s*[:=]/i,
      severity: 'info',
      type: 'hardcoded-credentials',
      desc: 'Potential hardcoded credentials',
    },
    {
      regex: /\bexec\s*\(/,
      severity: 'high',
      type: 'command-injection',
      desc: 'Command execution - injection risk',
    },
    {
      regex: /SELECT.*FROM.*WHERE.*\+/i,
      severity: 'high',
      type: 'sql-injection',
      desc: 'Potential SQL injection - use parameterized queries',
    },
    {
      regex: /\bMath\.random\s*\(/,
      severity: 'low',
      type: 'weak-random',
      desc: 'Math.random() for security purposes - use crypto.getRandomValues()',
    },
  ]

  lines.forEach((line, index) => {
    patterns.forEach((pattern) => {
      if (pattern.regex.test(line)) {
        risks.push({
          type: pattern.type,
          severity: pattern.severity,
          line: index + 1,
          description: pattern.desc,
        })
      }
    })
  })

  return risks.slice(0, 15)
}

function generateSuggestions(
  code: string,
  language: string
): Array<{ category: string; suggestion: string }> {
  const suggestions: Array<{ category: string; suggestion: string }> = []

  // Complexity suggestions
  const complexity = calculateCyclomaticComplexity(code)
  if (complexity > 10) {
    suggestions.push({
      category: 'complexity',
      suggestion: `Cyclomatic complexity (${complexity}) is high. Consider breaking into smaller functions.`,
    })
  }

  // Language-specific suggestions
  if (language === 'javascript' || language === 'typescript') {
    if (/\bvar\b/.test(code)) {
      suggestions.push({
        category: 'modern-js',
        suggestion: 'Replace "var" with "let" or "const" for better scoping.',
      })
    }
    const promiseThenCount = (code.match(/\.then\s*\(/g) || []).length
    if (!/\basync\s+|\bawait\b/.test(code) && promiseThenCount > 1) {
      suggestions.push({
        category: 'async',
        suggestion: 'Consider using async/await instead of nested promises for better readability.',
      })
    }
    if (!code.includes('//') && !code.includes('/*') && code.length > 500) {
      suggestions.push({
        category: 'documentation',
        suggestion: 'Consider adding comments to explain complex logic.',
      })
    }
  }

  if (language === 'python') {
    if (/ {3} {4,}/.test(code)) {
      suggestions.push({
        category: 'python-style',
        suggestion: 'Deep indentation detected (>4 levels). Consider refactoring.',
      })
    }
  }

  // General suggestions
  if (!/\btest\b|\bspec\b/i.test(code) && code.length > 200) {
    suggestions.push({
      category: 'testing',
      suggestion: 'No test references found. Consider adding unit tests.',
    })
  }

  return suggestions
}

// ============================================================================
// Tool Executors
// ============================================================================

export const analyze_code_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const code = args.code as string
    const language = (args.language as string) || 'unknown'
    const analysis_type =
      (args.analysis_type as 'complexity' | 'quality' | 'security' | 'all') || 'all'
    const include_suggestions = (args.include_suggestions as boolean) ?? true

    const analysis: Record<string, unknown> = {
      language,
      lines_of_code: countLines(code),
      estimated_functions: countFunctions(code),
    }

    if (analysis_type === 'complexity' || analysis_type === 'all') {
      analysis.cyclomatic_complexity = calculateCyclomaticComplexity(code)
      analysis.branch_count = countBranches(code)

      const complexity = calculateCyclomaticComplexity(code)
      if (complexity > 10) {
        analysis.complexity_rating = 'high'
      } else if (complexity > 5) {
        analysis.complexity_rating = 'medium'
      } else {
        analysis.complexity_rating = 'low'
      }
    }

    if (analysis_type === 'quality' || analysis_type === 'all') {
      analysis.code_smells = detectCodeSmells(code)
      analysis.code_smell_count = detectCodeSmells(code).length
    }

    if (analysis_type === 'security' || analysis_type === 'all') {
      analysis.security_risks = detectSecurityRisks(code)
      analysis.security_risk_count = detectSecurityRisks(code).length
    }

    if (include_suggestions) {
      analysis.suggestions = generateSuggestions(code, language)
    }

    const riskCount = (analysis.security_risk_count as number) || 0
    const smellCount = (analysis.code_smell_count as number) || 0

    return JSON.stringify({
      success: true,
      analysis,
      summary: {
        overall_health:
          riskCount === 0 && smellCount === 0
            ? 'good'
            : riskCount > 2
              ? 'needs-attention'
              : 'acceptable',
        issues_found: riskCount + smellCount,
        complexity_rating: analysis.complexity_rating || 'unknown',
      },
      message: `Analyzed ${analysis.lines_of_code} lines of ${language} code. Found ${riskCount} security risks and ${smellCount} code smells.`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export const find_patterns_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const code = args.code as string
    const pattern_type = args.pattern_type as string

    let patterns: Array<Record<string, unknown>> = []

    if (pattern_type === 'anti-pattern' || pattern_type === 'all') {
      const smells = detectCodeSmells(code)
      patterns = patterns.concat(
        smells.map((smell) => ({
          type: 'anti-pattern',
          name: smell.type,
          line: smell.line,
          description: smell.description,
          severity: 'medium',
        }))
      )
    }

    if (pattern_type === 'security-risk' || pattern_type === 'all') {
      const risks = detectSecurityRisks(code)
      patterns = patterns.concat(
        risks.map((risk) => ({
          type: 'security-risk',
          name: risk.type,
          line: risk.line,
          description: risk.description,
          severity: risk.severity,
        }))
      )
    }

    // Common design patterns detection
    if (pattern_type === 'design-pattern' || pattern_type === 'all') {
      const patternsFound: Array<Record<string, unknown>> = []

      // Singleton pattern
      if (/class\s+\w+[\s\S]*?static\s+instance[\s\S]*?constructor[\s\S]*?private/i.test(code)) {
        patternsFound.push({
          type: 'design-pattern',
          name: 'singleton',
          description: 'Singleton pattern detected',
        })
      }

      // Observer pattern
      if (/\.on\s*\(|\.addEventListener|\.subscribe/i.test(code)) {
        patternsFound.push({
          type: 'design-pattern',
          name: 'observer',
          description: 'Observer/event listener pattern detected',
        })
      }

      // Factory pattern
      if (/class\s+\w+[\s\S]*?(static\s+)?create|factory/i.test(code)) {
        patternsFound.push({
          type: 'design-pattern',
          name: 'factory',
          description: 'Factory pattern detected',
        })
      }

      patterns = patterns.concat(patternsFound)
    }

    // Code smell detection
    if (pattern_type === 'code-smell' || pattern_type === 'all') {
      const smells = detectCodeSmells(code)
      patterns = patterns.concat(
        smells.map((smell) => ({
          type: 'code-smell',
          name: smell.type,
          line: smell.line,
          description: smell.description,
          severity: 'low',
        }))
      )
    }

    return JSON.stringify({
      success: true,
      patterns: patterns.slice(0, 30),
      total_found: patterns.length,
      message: `Found ${patterns.length} ${pattern_type} patterns.`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export const refactor_suggestions_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    // code parameter reserved for future pattern-specific analysis
    const _code = args.code
    void _code
    const target_pattern = args.target_pattern as string
    const style = (args.style as 'functional' | 'imperative' | 'concise' | 'readable') || 'readable'

    const suggestions: Array<Record<string, unknown>> = []

    // Generate suggestions based on target pattern
    switch (target_pattern.toLowerCase()) {
      case 'callback':
      case 'callback hell':
        suggestions.push({
          original: 'Nested callbacks',
          refactored: 'Async/await pattern',
          explanation: 'Replace nested .then() calls with async/await for better readability',
          example: `// Before:\nPromise.then(result => {\n  process(result);\n}).catch(handleError);\n\n// After:\nasync function process() {\n  try {\n    const result = await promise;\n    await process(result);\n  } catch (e) {\n    handleError(e);\n  }\n}`,
        })
        break

      case 'long function':
      case 'long method':
        suggestions.push({
          original: 'Long function',
          refactored: 'Extract smaller functions',
          explanation: 'Break down into focused single-responsibility functions',
          example: 'Extract validation, transformation, and output logic into separate functions',
        })
        break

      case 'duplicate':
      case 'duplication':
        suggestions.push({
          original: 'Duplicate code',
          refactored: 'Extract to function/class',
          explanation: 'Create reusable function to eliminate duplication',
          example: 'Extract common logic into utility functions or base classes',
        })
        break

      case 'naming':
      case 'bad names':
        suggestions.push({
          original: 'Unclear variable/function names',
          refactored: 'Descriptive naming',
          explanation: 'Use names that clearly indicate purpose and content',
          example: `// Before:\nconst d = new Date();\nconst fn = () => {};\n\n// After:\nconst currentDate = new Date();\nconst calculateTotal = () => {};`,
        })
        break

      case 'magic numbers':
        suggestions.push({
          original: 'Magic numbers',
          refactored: 'Named constants',
          explanation: 'Replace magic numbers with meaningful named constants',
          example: `// Before:\nif (status === 1) { ... }\n\n// After:\nconst ACTIVE_STATUS = 1;\nif (status === ACTIVE_STATUS) { ... }`,
        })
        break

      case 'conditionals':
      case 'nested conditionals':
        suggestions.push({
          original: 'Deeply nested conditionals',
          refactored: 'Guard clauses / early returns',
          explanation: 'Use guard clauses to reduce nesting and improve readability',
          example: `// Before:\nif (user) {\n  if (user.isActive) {\n    save(user);\n  }\n}\n\n// After:\nif (!user || !user.isActive) return;\nsave(user);`,
        })
        break

      case 'var':
        suggestions.push({
          original: 'var usage',
          refactored: 'let/const',
          explanation: 'Replace var with let or const for proper scoping',
          example: `// Before:\nvar x = 10;\n\n// After:\nconst x = 10; // or let if reassignment needed`,
        })
        break

      default:
        suggestions.push({
          original: target_pattern,
          refactored: 'Review and refactor',
          explanation: `Consider addressing the "${target_pattern}" pattern in your code`,
          suggestions: [
            'Break down complex logic into smaller functions',
            'Use meaningful variable and function names',
            'Add comments for complex sections',
            'Consider extracting reusable logic',
          ],
        })
    }

    // Add style-specific suggestions
    if (style === 'functional') {
      suggestions.push({
        style: 'functional',
        tips: [
          'Prefer immutable data structures',
          'Use array methods (map, filter, reduce) instead of loops',
          'Prefer pure functions with no side effects',
          'Use function composition over imperative steps',
        ],
      })
    } else if (style === 'concise') {
      suggestions.push({
        style: 'concise',
        tips: [
          'Use ternary operators for simple conditionals',
          'Use optional chaining (?.) and nullish coalescing (??)',
          'Use arrow functions for short callbacks',
          'Use destructuring for cleaner parameter handling',
        ],
      })
    }

    return JSON.stringify({
      success: true,
      target_pattern,
      preferred_style: style,
      suggestions,
      message: `Generated ${suggestions.length} refactoring suggestions for "${target_pattern}" with ${style} style.`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
