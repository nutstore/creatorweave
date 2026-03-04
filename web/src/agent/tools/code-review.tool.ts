/**
 * Code Review Tool
 *
 * Static code analysis tool for detecting code quality issues.
 * Checks for style, performance, security, and best practices.
 *
 * @module code-review-tool
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'

// ============================================================================
// Types
// ============================================================================

export interface CodeReviewArgs {
  /** Code content to review */
  code: string
  /** File path for context */
  file: string
  /** Programming language */
  language:
    | 'javascript'
    | 'typescript'
    | 'python'
    | 'java'
    | 'cpp'
    | 'go'
    | 'rust'
    | 'html'
    | 'css'
    | 'json'
    | 'unknown'
  /** Categories to check */
  categories?: ('style' | 'performance' | 'security' | 'best-practice')[]
  /** Rule IDs to include (empty = all) */
  rule_ids?: string[]
}

export interface CodeReviewIssue {
  line: number
  column: number
  severity: 'error' | 'warning' | 'info'
  category: 'style' | 'performance' | 'security' | 'best-practice'
  message: string
  rule: string
  suggestion?: string
}

export interface CodeReviewResult {
  file: string
  issues: CodeReviewIssue[]
  summary: {
    errors: number
    warnings: number
    suggestions: number
  }
}

export interface BatchReviewArgs {
  /** Array of { file, code, language } to review */
  files: Array<{
    file: string
    code: string
    language?: string
  }>
  /** Categories to check */
  categories?: ('style' | 'performance' | 'security' | 'best-practice')[]
}

export interface BatchReviewResult {
  results: CodeReviewResult[]
  total: {
    files: number
    errors: number
    warnings: number
    suggestions: number
  }
}

// ============================================================================
// Review Rules
// ============================================================================

interface ReviewRule {
  id: string
  category: 'style' | 'performance' | 'security' | 'best-practice'
  severity: 'error' | 'warning' | 'info'
  description: string
  suggestion: string
  check: (lines: string[], file: string, language: string) => CodeReviewIssue[]
}

const RULES: ReviewRule[] = [
  // ==================== Style Rules ====================
  {
    id: 'style/indent',
    category: 'style',
    severity: 'warning',
    description: 'Inconsistent indentation',
    suggestion: 'Use consistent indentation (2 or 4 spaces)',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      const tabCount = lines.filter((l) => l.includes('\t') && !l.trim().startsWith('//')).length
      const spaceCount = lines.filter((l) => /\d\s{2,}/.test(l) && !l.includes('\t')).length

      if (tabCount > 0 && spaceCount > 0) {
        lines.forEach((line, idx) => {
          const leadingSpace = line.match(/^(\s*)/)?.[1] ?? ''
          const hasTabs = leadingSpace.includes('\t')
          const hasSpaces = /\s{2,}/.test(leadingSpace)
          if (hasTabs && hasSpaces) {
            issues.push({
              line: idx + 1,
              column: 1,
              severity: 'warning',
              category: 'style',
              message: 'Mixed tabs and spaces in indentation',
              rule: 'style/indent',
              suggestion: 'Use either tabs or spaces consistently',
            })
          }
        })
      }
      return issues
    },
  },
  {
    id: 'style/line-length',
    category: 'style',
    severity: 'warning',
    description: 'Line exceeds recommended length',
    suggestion: 'Keep lines under 120 characters for readability',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        if (line.length > 120 && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
          issues.push({
            line: idx + 1,
            column: 121,
            severity: 'warning',
            category: 'style',
            message: `Line exceeds 120 characters (${line.length} chars)`,
            rule: 'style/line-length',
            suggestion: 'Consider breaking this line into multiple lines',
          })
        }
      })
      return issues
    },
  },
  {
    id: 'style/camel-case',
    category: 'style',
    severity: 'warning',
    description: 'Variable/function name should use camelCase',
    suggestion: 'Use camelCase for variables and functions',
    check: (lines, _file, language) => {
      const issues: CodeReviewIssue[] = []
      if (language === 'javascript' || language === 'typescript') {
        lines.forEach((line, idx) => {
          // Check for snake_case variable declarations
          const snakeVarMatch = line.match(/(?:const|let|var)\s+([a-z]+_[a-z_]+)\s*[=:]/)
          if (snakeVarMatch) {
            issues.push({
              line: idx + 1,
              column: line.indexOf(snakeVarMatch[1]) + 1,
              severity: 'warning',
              category: 'style',
              message: `Variable '${snakeVarMatch[1]}' uses snake_case instead of camelCase`,
              rule: 'style/camel-case',
              suggestion:
                'Use camelCase: ' +
                snakeVarMatch[1].replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
            })
          }
        })
      }
      return issues
    },
  },
  {
    id: 'style/trailing-newline',
    category: 'style',
    severity: 'info',
    description: 'File should end with a newline',
    suggestion: 'Add a trailing newline at the end of the file',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1]
        if (lastLine.trim() !== '' && !lastLine.endsWith('\n')) {
          issues.push({
            line: lines.length,
            column: lastLine.length + 1,
            severity: 'info',
            category: 'style',
            message: 'File does not end with a newline',
            rule: 'style/trailing-newline',
            suggestion: 'Add a trailing newline',
          })
        }
      }
      return issues
    },
  },

  // ==================== Performance Rules ====================
  {
    id: 'perf/dom-in-loop',
    category: 'performance',
    severity: 'error',
    description: 'DOM query inside loop causes performance issues',
    suggestion: 'Query DOM outside the loop and reuse the reference',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const nextLine = lines[i + 1] ?? ''

        // Check for for/while/do loops with getElementById, querySelector, etc.
        if (
          (line.includes('for') || line.includes('while')) &&
          (line.includes('{') || nextLine.includes('{')) &&
          (line.includes('getElementById') ||
            line.includes('querySelector') ||
            line.includes('getElementsByClassName') ||
            line.includes('getElementsByTagName') ||
            nextLine.includes('getElementById') ||
            nextLine.includes('querySelector'))
        ) {
          issues.push({
            line: i + 1,
            column: 1,
            severity: 'error',
            category: 'performance',
            message: 'DOM query detected inside a loop',
            rule: 'perf/dom-in-loop',
            suggestion: 'Move DOM queries outside the loop for better performance',
          })
        }
      }
      return issues
    },
  },
  {
    id: 'perf/array-push-loop',
    category: 'performance',
    severity: 'warning',
    description: 'Consider using array methods instead of manual loops',
    suggestion: 'Use map, filter, reduce for better readability and performance',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        // Detect manual array building in loops
        if (
          /\bfor\s*\(/i.test(line) &&
          (line.includes('.push(') ||
            lines[idx + 1]?.includes('.push(') ||
            lines[idx + 2]?.includes('.push('))
        ) {
          issues.push({
            line: idx + 1,
            column: 1,
            severity: 'warning',
            category: 'performance',
            message: 'Array.push() in loop detected - consider using map/filter/reduce',
            rule: 'perf/array-push-loop',
            suggestion:
              'Consider using array.map(), array.filter(), or array.reduce() for better performance',
          })
        }
      })
      return issues
    },
  },
  {
    id: 'perf/inner-html-loop',
    category: 'performance',
    severity: 'error',
    description: 'innerHTML in loop causes reflow issues',
    suggestion: 'Build content in memory and set innerHTML once',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const nextLine = lines[i + 1] ?? ''

        if (
          (line.includes('for') || line.includes('while') || line.includes('.forEach')) &&
          (line.includes('innerHTML') ||
            line.includes('.innerHTML =') ||
            nextLine.includes('innerHTML') ||
            nextLine.includes('.innerHTML ='))
        ) {
          issues.push({
            line: i + 1,
            column: 1,
            severity: 'error',
            category: 'performance',
            message: 'innerHTML assignment inside a loop detected',
            rule: 'perf/inner-html-loop',
            suggestion: 'Build HTML string in memory and assign once after the loop',
          })
        }
      }
      return issues
    },
  },
  {
    id: 'perf/event-listener-dup',
    category: 'performance',
    severity: 'warning',
    description: 'Same event listener may be added multiple times',
    suggestion: 'Consider removing duplicate event listeners',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      const addEventListenerCalls: Array<{ line: number; selector: string; handler: string }> = []

      lines.forEach((line, idx) => {
        const match = line.match(/addEventListener\s*\(\s*['"]?(\w+)['"]?\s*,\s*(\w+)/)
        if (match) {
          addEventListenerCalls.push({
            line: idx + 1,
            selector: match[1],
            handler: match[2],
          })
        }
      })

      // Check for duplicates
      const seen = new Map<string, number>()
      addEventListenerCalls.forEach((call) => {
        const key = `${call.selector}:${call.handler}`
        if (seen.has(key)) {
          issues.push({
            line: call.line,
            column: 1,
            severity: 'warning',
            category: 'performance',
            message: `Duplicate addEventListener for '${call.selector}' event with handler '${call.handler}'`,
            rule: 'perf/event-listener-dup',
            suggestion:
              'Event listener may be added multiple times - consider checking before adding',
          })
        } else {
          seen.set(key, call.line)
        }
      })

      return issues
    },
  },

  // ==================== Security Rules ====================
  {
    id: 'sec/hardcoded-secret',
    category: 'security',
    severity: 'error',
    description: 'Potential hardcoded secret detected',
    suggestion: 'Use environment variables or secure configuration for secrets',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      const secretPatterns = [
        {
          regex: /['"]?(?:api[_-]?key|apikey)['"]?\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/i,
          name: 'API key',
        },
        {
          regex: /['"]?(?:password|passwd|pwd)['"]?\s*[:=]\s*['"][^'"]{8,}['"]/i,
          name: 'password',
        },
        {
          regex: /['"]?(?:secret|token|auth)['"]?\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/i,
          name: 'secret/token',
        },
        { regex: /['"]?AWS[_-]?SECRET['"]?\s*[:=]/i, name: 'AWS secret' },
        { regex: /['"]?PRIVATE[_-]?KEY['"]?\s*[:=]\s*['"]-----/i, name: 'private key' },
      ]

      lines.forEach((line, idx) => {
        secretPatterns.forEach((pattern) => {
          if (pattern.regex.test(line) && !line.includes('process.env')) {
            issues.push({
              line: idx + 1,
              column: 1,
              severity: 'error',
              category: 'security',
              message: `Potential hardcoded ${pattern.name} detected`,
              rule: 'sec/hardcoded-secret',
              suggestion: 'Use environment variables instead of hardcoded secrets',
            })
          }
        })
      })
      return issues
    },
  },
  {
    id: 'sec/sql-injection',
    category: 'security',
    severity: 'error',
    description: 'Potential SQL injection vulnerability',
    suggestion: 'Use parameterized queries or prepared statements',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        // Check for string concatenation in SQL queries
        if (
          /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(line) &&
          /\+\s*[a-zA-Z_]/.test(line) &&
          !/\$\{.*\}/.test(line)
        ) {
          issues.push({
            line: idx + 1,
            column: 1,
            severity: 'error',
            category: 'security',
            message: 'String concatenation in SQL query detected - SQL injection risk',
            rule: 'sec/sql-injection',
            suggestion: 'Use parameterized queries or an ORM to prevent SQL injection',
          })
        }
      })
      return issues
    },
  },
  {
    id: 'sec/eval-usage',
    category: 'security',
    severity: 'error',
    description: 'Use of eval() is dangerous',
    suggestion: 'Avoid eval() - it can execute arbitrary code and is a security risk',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        if (/\beval\s*\(/.test(line)) {
          issues.push({
            line: idx + 1,
            column: line.indexOf('eval') + 1,
            severity: 'error',
            category: 'security',
            message: 'Use of eval() detected - security risk',
            rule: 'sec/eval-usage',
            suggestion:
              'Avoid eval() - consider alternatives like JSON.parse() or Function constructor with validated input',
          })
        }
      })
      return issues
    },
  },
  {
    id: 'sec/innerHTML-xss',
    category: 'security',
    severity: 'error',
    description: 'Direct innerHTML with user input may cause XSS',
    suggestion: 'Use textContent or sanitize HTML before setting innerHTML',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        if (
          /\.innerHTML\s*=/.test(line) &&
          (line.includes('user') ||
            line.includes('input') ||
            line.includes('params') ||
            line.includes('query') ||
            line.includes('data') ||
            line.includes('response'))
        ) {
          issues.push({
            line: idx + 1,
            column: line.indexOf('.innerHTML') + 1,
            severity: 'error',
            category: 'security',
            message: 'innerHTML assignment with potentially user-controlled data - XSS risk',
            rule: 'sec/innerHTML-xss',
            suggestion:
              'Use textContent for text data, or sanitize HTML with a library like DOMPurify',
          })
        }
      })
      return issues
    },
  },
  {
    id: 'sec/weak-random',
    category: 'security',
    severity: 'warning',
    description: 'Math.random() is not cryptographically secure',
    suggestion: 'Use crypto.getRandomValues() for security-sensitive random values',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        if (/\bMath\.random\s*\(/.test(line)) {
          issues.push({
            line: idx + 1,
            column: line.indexOf('Math.random') + 1,
            severity: 'warning',
            category: 'security',
            message: 'Math.random() is not cryptographically secure',
            rule: 'sec/weak-random',
            suggestion: 'Use crypto.getRandomValues() for security-sensitive random values',
          })
        }
      })
      return issues
    },
  },

  // ==================== Best Practice Rules ====================
  {
    id: 'best/no-error-handling',
    category: 'best-practice',
    severity: 'warning',
    description: 'Missing error handling for async operation',
    suggestion: 'Add try-catch or error handling for async operations',
    check: (lines, _file, language) => {
      const issues: CodeReviewIssue[] = []
      if (language === 'javascript' || language === 'typescript') {
        lines.forEach((line, idx) => {
          // Detect .then() without .catch()
          if (/\.then\s*\(/.test(line) && !line.includes('.catch')) {
            const nextLines = lines.slice(idx, idx + 5).join('\n')
            if (!nextLines.includes('.catch')) {
              issues.push({
                line: idx + 1,
                column: 1,
                severity: 'warning',
                category: 'best-practice',
                message: '.then() without .catch() - missing error handling',
                rule: 'best/no-error-handling',
                suggestion: 'Add .catch() or use try-catch with async/await',
              })
            }
          }
        })
      }
      return issues
    },
  },
  {
    id: 'best/console-log',
    category: 'best-practice',
    severity: 'info',
    description: 'Console.log statement found in code',
    suggestion: 'Remove console.log statements or use a proper logging library',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        if (/\bconsole\.(log|debug|info)\s*\(/.test(line) && !line.includes('//')) {
          issues.push({
            line: idx + 1,
            column: line.indexOf('console') + 1,
            severity: 'info',
            category: 'best-practice',
            message: 'Console statement found - consider removing in production',
            rule: 'best/console-log',
            suggestion:
              'Remove console.log statements or use a proper logging library with configurable levels',
          })
        }
      })
      return issues
    },
  },
  {
    id: 'best/empty-catch',
    category: 'best-practice',
    severity: 'warning',
    description: 'Empty catch block - errors are silently ignored',
    suggestion: 'At minimum, log the error or rethrow it',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        if (
          /catch\s*\([^)]*\)\s*\{\s*\}/.test(line) ||
          /catch\s*\([^)]*\)\s*\{\s*\/\//.test(line)
        ) {
          issues.push({
            line: idx + 1,
            column: line.indexOf('catch') + 1,
            severity: 'warning',
            category: 'best-practice',
            message: 'Empty catch block - errors are silently ignored',
            rule: 'best/empty-catch',
            suggestion: 'At minimum, log the error or add a comment explaining why it is empty',
          })
        }
      })
      return issues
    },
  },
  {
    id: 'best/typeof-check',
    category: 'best-practice',
    severity: 'warning',
    description: 'Consider using more precise type checking',
    suggestion: 'Use Array.isArray() for arrays, instanceof for prototypes',
    check: (lines, _file, language) => {
      const issues: CodeReviewIssue[] = []
      if (language === 'javascript' || language === 'typescript') {
        lines.forEach((line, idx) => {
          if (/typeof\s+\w+\s*===?\s*['"]array['"]/i.test(line)) {
            issues.push({
              line: idx + 1,
              column: line.indexOf('typeof') + 1,
              severity: 'warning',
              category: 'best-practice',
              message: 'typeof check for "array" - typeof returns "object" for arrays',
              rule: 'best/typeof-check',
              suggestion: 'Use Array.isArray() instead of typeof for array checking',
            })
          }
        })
      }
      return issues
    },
  },
  {
    id: 'best/magic-number',
    category: 'best-practice',
    severity: 'info',
    description: 'Magic number detected',
    suggestion: 'Extract magic numbers into named constants for better readability',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        // Detect magic numbers (3+ consecutive digits not in strings or comments)
        const match = line.match(/[^0-9a-zA-Z_](\d{3,})[^0-9a-zA-Z_]/)
        if (match && !line.includes('0x') && !line.includes('0o') && !line.includes('0b')) {
          issues.push({
            line: idx + 1,
            column: line.indexOf(match[1]) + 1,
            severity: 'info',
            category: 'best-practice',
            message: `Magic number ${match[1]} detected`,
            rule: 'best/magic-number',
            suggestion: 'Extract into a named constant with a descriptive name',
          })
        }
      })
      return issues
    },
  },
  {
    id: 'best/debugger-statement',
    category: 'best-practice',
    severity: 'warning',
    description: 'Debugger statement found in code',
    suggestion: 'Remove debugger statements before committing',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        if (/\bdebugger\b/.test(line)) {
          issues.push({
            line: idx + 1,
            column: line.indexOf('debugger') + 1,
            severity: 'warning',
            category: 'best-practice',
            message: 'debugger statement found - remove before production',
            rule: 'best/debugger-statement',
            suggestion: 'Remove debugger statements or use a debugging flag',
          })
        }
      })
      return issues
    },
  },
  {
    id: 'best/no-await-loop',
    category: 'best-practice',
    severity: 'warning',
    description: 'Await inside a loop may cause performance issues',
    suggestion: 'Consider using Promise.all() to run iterations in parallel',
    check: (lines) => {
      const issues: CodeReviewIssue[] = []
      lines.forEach((line, idx) => {
        if (
          /\bfor\s*\(/.test(line) &&
          (line.includes('await') || lines[idx + 1]?.includes('await'))
        ) {
          issues.push({
            line: idx + 1,
            column: 1,
            severity: 'warning',
            category: 'best-practice',
            message: 'await inside a loop - iterations run sequentially',
            rule: 'best/no-await-loop',
            suggestion: 'Consider using Promise.all() with map() to run iterations in parallel',
          })
        }
      })
      return issues
    },
  },
]

// ============================================================================
// Helper Functions
// ============================================================================

function detectLanguage(file: string, _content: string): string {
  const ext = file.split('.').pop()?.toLowerCase()
  const languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'cpp',
    hpp: 'cpp',
    go: 'go',
    rs: 'rust',
    html: 'html',
    htm: 'html',
    css: 'css',
    json: 'json',
  }
  return languageMap[ext ?? ''] ?? 'unknown'
}

export function runReview(
  code: string,
  file: string,
  language: string,
  categories?: string[]
): CodeReviewResult {
  const lines = code.split('\n')
  const issues: CodeReviewIssue[] = []

  const filteredRules = categories
    ? RULES.filter((rule) => categories.includes(rule.category))
    : RULES

  for (const rule of filteredRules) {
    try {
      const ruleIssues = rule.check(lines, file, language)
      issues.push(...ruleIssues)
    } catch {
      // Skip rule if it throws - don't break the entire review
    }
  }

  // Sort issues by line number
  issues.sort((a, b) => a.line - b.line)

  return {
    file,
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      suggestions: issues.filter((i) => i.severity === 'info').length,
    },
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const code_review: ToolDefinition = {
  type: 'function',
  function: {
    name: 'code_review',
    description:
      'Review code for quality issues including style, performance, security, and best practices. Analyzes code and returns a detailed report with issues, severity levels, and improvement suggestions.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Source code to review',
        },
        path: {
          type: 'string',
          description: 'File path for context (used for language detection)',
        },
        language: {
          type: 'string',
          enum: [
            'javascript',
            'typescript',
            'python',
            'java',
            'cpp',
            'go',
            'rust',
            'html',
            'css',
            'json',
            'unknown',
          ],
          description: 'Programming language of the code',
        },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['style', 'performance', 'security', 'best-practice'],
          },
          description: 'Categories to check (all if not specified)',
        },
        rule_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific rule IDs to run (all if not specified)',
        },
      },
      required: ['code', 'path'],
    },
  },
}

export const batch_code_review: ToolDefinition = {
  type: 'function',
  function: {
    name: 'batch_code_review',
    description:
      'Review multiple files for quality issues. Returns a combined report with statistics across all files.',
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
              code: { type: 'string', description: 'Source code' },
              language: {
                type: 'string',
                enum: [
                  'javascript',
                  'typescript',
                  'python',
                  'java',
                  'cpp',
                  'go',
                  'rust',
                  'html',
                  'css',
                  'json',
                  'unknown',
                ],
                description: 'Programming language (auto-detected if not provided)',
              },
            },
            required: ['path', 'code'],
          },
          description: 'Array of files to review',
        },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['style', 'performance', 'security', 'best-practice'],
          },
          description: 'Categories to check (all if not specified)',
        },
      },
      required: ['files'],
    },
  },
}

// ============================================================================
// Tool Executors
// ============================================================================

export const code_review_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const code = args.code as string
    const file = (args.path as string) || 'unknown'
    const language = (args.language as string) || detectLanguage(file, code)
    const categories = args.categories as
      | ('style' | 'performance' | 'security' | 'best-practice')[]
      | undefined

    const result = runReview(code, file, language, categories)

    return JSON.stringify({
      success: true,
      result,
      message: `Reviewed ${file} (${language}). Found ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.suggestions} suggestions.`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during code review',
    })
  }
}

export const batch_code_review_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const files = args.files as Array<{
      path: string
      code: string
      language?: string
    }>
    const categories = args.categories as
      | ('style' | 'performance' | 'security' | 'best-practice')[]
      | undefined

    const results: CodeReviewResult[] = []
    let totalErrors = 0
    let totalWarnings = 0
    let totalSuggestions = 0

    for (const fileEntry of files) {
      const filePath = fileEntry.path
      const language = fileEntry.language || detectLanguage(filePath, fileEntry.code)
      const result = runReview(fileEntry.code, filePath, language, categories)
      results.push(result)
      totalErrors += result.summary.errors
      totalWarnings += result.summary.warnings
      totalSuggestions += result.summary.suggestions
    }

    return JSON.stringify({
      success: true,
      results,
      total: {
        files: files.length,
        errors: totalErrors,
        warnings: totalWarnings,
        suggestions: totalSuggestions,
      },
      message: `Reviewed ${files.length} files. Found ${totalErrors} errors, ${totalWarnings} warnings, ${totalSuggestions} suggestions.`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during batch code review',
    })
  }
}

// ============================================================================
// Export Rules for Testing/Inspection
// ============================================================================

export { RULES as CODE_REVIEW_RULES }
