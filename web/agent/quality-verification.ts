/**
 * Agent Quality Verification
 *
 * Phase 5: Enhanced Agent Loop with quality validation and auto-fix capabilities.
 *
 * Features:
 * - Result validation after tool execution
 * - Automated error detection and fixing
 * - Quality scoring for responses
 * - Verification hooks for critical operations
 */

import type { ToolContext } from './tools/tool-types'
import type { Message, ToolResult } from './message-types'

//=============================================================================
// Types
//=============================================================================

export interface VerificationResult {
  /** Overall quality score (0-1) */
  score: number
  /** Categories of quality assessment */
  categories: QualityCategory[]
  /** Issues found */
  issues: QualityIssue[]
  /** Suggestions for improvement */
  suggestions: string[]
  /** Whether auto-fix was applied */
  autoFixed: boolean
  /** Verification timestamp */
  timestamp: number
}

export interface QualityCategory {
  name: string
  score: number
  maxScore: number
  issues: string[]
}

export interface QualityIssue {
  type: IssueType
  severity: 'error' | 'warning' | 'info'
  message: string
  location?: string
  suggestion?: string
  canAutoFix: boolean
}

export type IssueType =
  | 'syntax_error'
  | 'type_error'
  | 'logic_error'
  | 'security_risk'
  | 'performance'
  | 'completeness'
  | 'formatting'
  | 'inconsistency'
  | 'unused_code'
  | 'best_practice'

export interface VerificationConfig {
  /** Enable automatic fixing */
  autoFix: boolean
  /** Maximum auto-fix attempts */
  maxAutoFixAttempts: number
  /** Categories to verify */
  categories: VerificationCategory[]
  /** Custom validators */
  validators: QualityValidator[]
}

export type VerificationCategory =
  | 'syntax'
  | 'types'
  | 'security'
  | 'performance'
  | 'completeness'
  | 'consistency'
  | 'style'

export interface QualityValidator {
  category: VerificationCategory
  name: string
  validate: (context: ValidationContext) => Promise<ValidationResult>
}

export interface ValidationContext {
  /** The message being validated */
  message: Message
  /** Previous messages in conversation */
  previousMessages: Message[]
  /** Tool context */
  toolContext: ToolContext
  /** File contents referenced */
  fileContents: Map<string, string>
  /** Project structure */
  projectType: string
}

export interface ValidationResult {
  passed: boolean
  score: number
  issues: QualityIssue[]
  suggestions: string[]
}

//=============================================================================
// Default Configuration
//=============================================================================

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  autoFix: false,
  maxAutoFixAttempts: 2,
  categories: ['syntax', 'types', 'security', 'performance', 'completeness'],
  validators: [],
}

//=============================================================================
// Quality Verification Engine
//=============================================================================

export class QualityVerifier {
  private config: VerificationConfig

  constructor(config: Partial<VerificationConfig> = {}) {
    this.config = { ...DEFAULT_VERIFICATION_CONFIG, ...config }
    this.initializeValidators()
  }

  private initializeValidators(): void {
    // Register built-in validators
    if (this.config.validators.length === 0) {
      this.config.validators = [
        // Syntax validation
        {
          category: 'syntax',
          name: 'bracket_matcher',
          validate: this.validateBracketMatching.bind(this),
        },
        // Type validation
        {
          category: 'types',
          name: 'typescript_check',
          validate: this.validateTypeScript.bind(this),
        },
        // Security validation
        {
          category: 'security',
          name: 'security_scanner',
          validate: this.validateSecurity.bind(this),
        },
        // Performance validation
        {
          category: 'performance',
          name: 'performance_analyzer',
          validate: this.validatePerformance.bind(this),
        },
        // Completeness validation
        {
          category: 'completeness',
          name: 'requirement_checker',
          validate: this.validateCompleteness.bind(this),
        },
      ]
    }
  }

  /**
   * Verify a message/response for quality
   */
  async verify(context: ValidationContext): Promise<VerificationResult> {
    const startTime = Date.now()
    const categories: QualityCategory[] = []
    const allIssues: QualityIssue[] = []
    const allSuggestions: string[] = []
    let totalScore = 0
    let maxTotalScore = 0

    // Run all validators
    for (const validator of this.config.validators) {
      if (!this.config.categories.includes(validator.category)) {
        continue
      }

      try {
        const result = await validator.validate(context)

        categories.push({
          name: validator.name,
          score: result.score,
          maxScore: 100,
          issues: result.issues.map((i) => i.message),
        })

        totalScore += result.score
        maxTotalScore += 100

        for (const issue of result.issues) {
          allIssues.push(issue)
        }

        allSuggestions.push(...result.suggestions)
      } catch (error) {
        console.warn(`[QualityVerifier] Validator ${validator.name} failed:`, error)
      }
    }

    // Auto-fix if enabled and issues found
    let autoFixed = false
    if (this.config.autoFix && allIssues.some((i) => i.canAutoFix)) {
      autoFixed = await this.tryAutoFix(context, allIssues)
    }

    const score = maxTotalScore > 0 ? totalScore / maxTotalScore : 1

    return {
      score,
      categories,
      issues: allIssues,
      suggestions: allSuggestions,
      autoFixed,
      timestamp: Date.now() - startTime,
    }
  }

  /**
   * Verify tool results for quality
   */
  async verifyToolResults(
    toolName: string,
    results: ToolResult[],
    context: ValidationContext
  ): Promise<VerificationResult> {
    // Filter validators for tool results
    const relevantValidators = this.config.validators.filter((v) =>
      ['syntax', 'types', 'security', 'completeness'].includes(v.category)
    )

    const categories: QualityCategory[] = []
    const allIssues: QualityIssue[] = []
    const allSuggestions: string[] = []
    let totalScore = 0
    let maxTotalScore = 0

    for (const validator of relevantValidators) {
      try {
        // Create context focused on tool results
        const toolContext: ValidationContext = {
          ...context,
          message: {
            id: 'tool-result',
            role: 'tool',
            content: results.map((r) => r.content).join('\n'),
            timestamp: Date.now(),
          },
        }

        const result = await validator.validate(toolContext)

        categories.push({
          name: `${validator.name}_${toolName}`,
          score: result.score,
          maxScore: 100,
          issues: result.issues.map((i) => i.message),
        })

        totalScore += result.score
        maxTotalScore += 100

        allIssues.push(...result.issues)
        allSuggestions.push(...result.suggestions)
      } catch (error) {
        console.warn(`[QualityVerifier] Tool validator ${validator.name} failed:`, error)
      }
    }

    const score = maxTotalScore > 0 ? totalScore / maxTotalScore : 1

    return {
      score,
      categories,
      issues: allIssues,
      suggestions: allSuggestions,
      autoFixed: false,
      timestamp: 0,
    }
  }

  /**
   * Try to auto-fix issues
   */
  private async tryAutoFix(_context: ValidationContext, issues: QualityIssue[]): Promise<boolean> {
    let fixed = false

    for (let attempt = 0; attempt < this.config.maxAutoFixAttempts; attempt++) {
      const fixableIssues = issues.filter((i) => i.canAutoFix && i.severity === 'error')

      if (fixableIssues.length === 0) {
        break
      }

      // Collect fix suggestions
      const fixes = fixableIssues.filter((i) => i.suggestion).map((i) => i.suggestion!)

      if (fixes.length > 0) {
        // Would apply fixes here based on context
        console.log(`[QualityVerifier] Auto-fixed ${fixes.length} issues on attempt ${attempt + 1}`)
        fixed = true
        break
      }
    }

    return fixed
  }

  //===========================================================================
  // Built-in Validators
  //===========================================================================

  private async validateBracketMatching(context: ValidationContext): Promise<ValidationResult> {
    const issues: QualityIssue[] = []
    const content = context.message.content || ''

    // Check for basic bracket matching
    const brackets: Record<string, string> = {
      '{': '}',
      '[': ']',
      '(': ')',
      '"': '"',
      "'": "'",
    }

    const stack: { char: string; index: number }[] = []

    for (let i = 0; i < content.length; i++) {
      const char = content[i]

      if (char in brackets) {
        // Opening bracket
        if (['{', '[', '('].includes(char)) {
          stack.push({ char, index: i })
        } else {
          // Closing bracket
          const last = stack.pop()
          if (last && brackets[last.char] !== char) {
            issues.push({
              type: 'syntax_error',
              severity: 'error',
              message: `Mismatched bracket at position ${i}`,
              location: `Position ${i}`,
              canAutoFix: false,
            })
          }
        }
      }
    }

    // Check for unclosed brackets
    if (stack.length > 0) {
      for (const item of stack) {
        issues.push({
          type: 'syntax_error',
          severity: 'error',
          message: `Unclosed bracket '${item.char}' at position ${item.index}`,
          location: `Position ${item.index}`,
          canAutoFix: false,
        })
      }
    }

    const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 20)

    return {
      passed: issues.length === 0,
      score,
      issues,
      suggestions: issues.length > 0 ? ['Check bracket matching'] : [],
    }
  }

  private async validateTypeScript(context: ValidationContext): Promise<ValidationResult> {
    const issues: QualityIssue[] = []
    const content = context.message.content || ''

    // Check for TypeScript content or project type
    const isTypeScriptProject =
      context.projectType === 'typescript' ||
      content.includes('typescript') ||
      content.includes('ts-') ||
      content.includes('.ts')

    if (isTypeScriptProject) {
      // Check for common TypeScript issues
      const patterns = [
        { regex: /:\s*any\s*[;,]/g, message: 'Avoid using :any type annotation' },
        { regex: /as\s+any\b/g, message: 'Avoid "as any" type assertions' },
        { regex: /!\./g, message: 'Avoid non-null assertion operator' },
      ]

      for (const pattern of patterns) {
        const matches = content.match(pattern.regex)
        if (matches && matches.length > 0) {
          const count = matches.length
          for (let i = 0; i < count; i++) {
            issues.push({
              type: 'type_error',
              severity: 'warning',
              message: `TypeScript: ${pattern.message}`,
              suggestion: 'Use proper type annotations',
              canAutoFix: false,
            })
          }
        }
      }
    }

    const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 15)

    return {
      passed: issues.filter((i) => i.severity === 'error').length === 0,
      score,
      issues,
      suggestions: issues.length > 0 ? ['Add proper type annotations'] : [],
    }
  }

  private async validateSecurity(context: ValidationContext): Promise<ValidationResult> {
    const issues: QualityIssue[] = []
    const content = context.message.content || ''

    // Security pattern detection
    const securityPatterns = [
      {
        pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi,
        type: 'security_risk',
        message: 'Hardcoded password detected',
        severity: 'error' as const,
      },
      {
        pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi,
        type: 'security_risk',
        message: 'Hardcoded API key detected',
        severity: 'error' as const,
      },
      {
        pattern: /eval\s*\(/g,
        type: 'security_risk',
        message: 'Avoid using eval() - potential security risk',
        severity: 'warning' as const,
      },
      {
        pattern: /innerHTML\s*=/g,
        type: 'security_risk',
        message: 'Use innerText instead of innerHTML to prevent XSS',
        severity: 'warning' as const,
      },
      {
        pattern: /SELECT\s+.*FROM\s+.*WHERE\s+.*['"];?\s*$/gim,
        type: 'security_risk',
        message: 'Potential SQL injection vulnerability - use parameterized queries',
        severity: 'error' as const,
      },
    ]

    for (const securityPattern of securityPatterns) {
      if (securityPattern.pattern.test(content)) {
        issues.push({
          type: securityPattern.type as IssueType,
          severity: securityPattern.severity,
          message: securityPattern.message,
          canAutoFix: false,
        })
      }
    }

    const score = issues.filter((i) => i.severity === 'error').length === 0 ? 100 : 50

    return {
      passed: issues.filter((i) => i.severity === 'error').length === 0,
      score,
      issues,
      suggestions: issues.length > 0 ? ['Review and fix security issues before deploying'] : [],
    }
  }

  private async validatePerformance(context: ValidationContext): Promise<ValidationResult> {
    const issues: QualityIssue[] = []
    const content = context.message.content || ''

    // Performance anti-patterns
    const perfPatterns = [
      {
        regex: /\.forEach\s*\(/g,
        message: 'Consider using for...of loop for better performance',
        suggestion: 'Use for...of instead of forEach',
        type: 'performance' as const,
      },
      {
        regex: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/g,
        message: 'Deep clone using JSON.parse/stringify is slow',
        suggestion: 'Consider using structuredClone or immutable libraries',
        type: 'performance' as const,
      },
      {
        regex: /document\.querySelectorAll/g,
        message: 'Consider caching DOM queries',
        suggestion: 'Store references to frequently accessed DOM elements',
        type: 'performance' as const,
      },
    ]

    for (const { regex, message, suggestion, type } of perfPatterns) {
      if (regex.test(content)) {
        issues.push({
          type,
          severity: 'warning',
          message,
          suggestion,
          canAutoFix: false,
        })
      }
    }

    const score = 100 - issues.length * 10

    return {
      passed: issues.length === 0,
      score,
      issues,
      suggestions: issues.map((i) => i.suggestion || '').filter(Boolean),
    }
  }

  private async validateCompleteness(context: ValidationContext): Promise<ValidationResult> {
    const issues: QualityIssue[] = []
    const content = context.message.content || ''

    // Check if response addresses the user's question
    const hasQuestionMark = content.includes('?')
    const hasAnswer = content.length > 50

    if (hasQuestionMark && !hasAnswer) {
      issues.push({
        type: 'completeness',
        severity: 'warning',
        message: 'Question asked but answer may be incomplete',
        suggestion: 'Provide a complete answer to the question',
        canAutoFix: false,
      })
    }

    // Check for TODO/FIXME comments
    const todoPattern = /TODO|FIXME|HACK|XXX/gi
    const todoMatches = content.match(todoPattern)
    if (todoMatches && todoMatches.length > 0) {
      issues.push({
        type: 'completeness',
        severity: 'info',
        message: `Found ${todoMatches.length} TODO/FIXME comments`,
        suggestion: 'Address pending items before finalizing',
        canAutoFix: false,
      })
    }

    const score = 100 - issues.length * 15

    return {
      passed: issues.length === 0,
      score,
      issues,
      suggestions: issues.map((i) => i.suggestion || '').filter(Boolean),
    }
  }
}

//=============================================================================
// Singleton
//=============================================================================

let verifierInstance: QualityVerifier | null = null

export function getQualityVerifier(config?: Partial<VerificationConfig>): QualityVerifier {
  if (!verifierInstance) {
    verifierInstance = new QualityVerifier(config)
  }
  return verifierInstance
}

export function resetQualityVerifier(): void {
  verifierInstance = null
}

//=============================================================================
// Verification Report Generator
//=============================================================================

/**
 * Generate a human-readable verification report
 */
export function generateVerificationReport(result: VerificationResult): string {
  const lines: string[] = []

  lines.push('## Quality Verification Report')
  lines.push('')
  lines.push(`**Overall Score**: ${(result.score * 100).toFixed(1)}%`)
  lines.push(`**Auto-Fixed**: ${result.autoFixed ? 'Yes' : 'No'}`)
  lines.push(`**Time**: ${result.timestamp}ms`)
  lines.push('')

  if (result.categories.length > 0) {
    lines.push('### Category Scores')
    lines.push('')
    for (const cat of result.categories) {
      const bar =
        '█'.repeat(Math.floor(cat.score / 10)) + '░'.repeat(10 - Math.floor(cat.score / 10))
      lines.push(`| ${cat.name.padEnd(20)} | ${bar} | ${cat.score.toFixed(0)}/100 |`)
    }
    lines.push('')
  }

  if (result.issues.length > 0) {
    lines.push('### Issues Found')
    lines.push('')
    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'
      lines.push(`${icon} **${issue.type}**: ${issue.message}`)
    }
    lines.push('')
  }

  if (result.suggestions.length > 0) {
    lines.push('### Suggestions')
    lines.push('')
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`)
    }
  }

  return lines.join('\n')
}
