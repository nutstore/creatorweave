/**
 * Error Classification and Intelligent Recovery System
 *
 * Classifies errors into categories and provides recovery strategies.
 */

//=============================================================================
// Error Categories
//=============================================================================

export enum ErrorCategory {
  /** Temporary errors that can be retried */
  RETRYABLE = 'retryable',
  /** Permission-related errors */
  PERMISSION = 'permission',
  /** File not found or path errors */
  NOT_FOUND = 'not_found',
  /** Format/parsing errors */
  FORMAT = 'format',
  /** Resource limit errors (too large, timeout, etc.) */
  RESOURCE_LIMIT = 'resource_limit',
  /** Unknown/uncategorized errors */
  UNKNOWN = 'unknown',
}

//=============================================================================
// Error Types
//=============================================================================

export interface ClassifiedError {
  category: ErrorCategory
  userMessage: string
  technicalMessage: string
  canRetry: boolean
  suggestedActions?: string[]
  retryStrategy?: RetryStrategy
}

export enum RetryStrategy {
  /** No retry - error is not recoverable */
  NONE = 'none',
  /** Immediate retry - for transient network issues */
  IMMEDIATE = 'immediate',
  /** Retry with backoff - for rate limiting */
  BACKOFF = 'backoff',
  /** Retry with different parameters */
  DIFFERENT_PARAMS = 'different_params',
}

//=============================================================================
// Error Patterns and Classification
//=============================================================================

interface ErrorPattern {
  patterns: RegExp[]
  category: ErrorCategory
  userMessage: string
  canRetry: boolean
  retryStrategy?: RetryStrategy
  suggestedActions?: string[]
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Permission Errors
  {
    patterns: [
      /permission denied/i,
      /access denied/i,
      /not allowed/i,
      /unauthorized/i,
      /no permission/i,
    ],
    category: ErrorCategory.PERMISSION,
    userMessage:
      "You don't have permission to access this file or folder. Please check if you've granted the necessary permissions.",
    canRetry: false,
    suggestedActions: [
      'Re-select the folder and grant permission',
      'Check if the file is in a protected location',
      'Try a different file or folder',
    ],
  },
  // Not Found Errors
  {
    patterns: [/not found/i, /does not exist/i, /no such file/i, /file not found/i, /NotFound/i],
    category: ErrorCategory.NOT_FOUND,
    userMessage:
      'The file or folder could not be found. It may have been moved, renamed, or deleted.',
    canRetry: false,
    suggestedActions: [
      'Use the file search to locate the file',
      'Check if the file name or path is correct',
      'Refresh the file tree to see current files',
    ],
  },
  // Format Errors
  {
    patterns: [
      /malformed/i,
      /invalid format/i,
      /parse error/i,
      /syntax error/i,
      /unexpected token/i,
    ],
    category: ErrorCategory.FORMAT,
    userMessage: 'The file format could not be understood or the content has formatting issues.',
    canRetry: false,
    suggestedActions: [
      'Check if the file is corrupted',
      'Try opening the file in a different editor',
      'For code files, check for syntax errors',
    ],
  },
  // Resource Limit Errors
  {
    patterns: [/too large/i, /size limit/i, /timeout/i, /out of memory/i, /quota exceeded/i],
    category: ErrorCategory.RESOURCE_LIMIT,
    userMessage: 'The operation exceeded a resource limit (file size, memory, or time).',
    canRetry: true,
    retryStrategy: RetryStrategy.NONE,
    suggestedActions: [
      'Try a smaller file',
      'Break the operation into smaller parts',
      'For data analysis, consider sampling or filtering',
    ],
  },
  // Temporary/Retryable Errors
  {
    patterns: [
      /network error/i,
      /connection lost/i,
      /temporarily unavailable/i,
      /try again/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
    ],
    category: ErrorCategory.RETRYABLE,
    userMessage: 'A temporary error occurred. The operation can be retried.',
    canRetry: true,
    retryStrategy: RetryStrategy.BACKOFF,
  },
  // Python-specific errors
  {
    patterns: [/Python environment is loading/i, /Pyodide.*loading/i],
    category: ErrorCategory.RETRYABLE,
    userMessage: 'The Python environment is still loading. Please wait a moment and try again.',
    canRetry: true,
    retryStrategy: RetryStrategy.BACKOFF,
  },
  {
    patterns: [/no files parameter/i, /files parameter provided/i, /file.*not found/i, /no such file/i],
    category: ErrorCategory.FORMAT,
    userMessage:
      'When working with files in Python, first locate the file, then read it from your code using the resolved path.',
    canRetry: true,
    retryStrategy: RetryStrategy.DIFFERENT_PARAMS,
    suggestedActions: [
      'First search for the file using read_directory()',
      'Then use the resolved path directly in execute(language="python", code="...")',
    ],
  },
]

//=============================================================================
// Error Classifier
//=============================================================================

export class ErrorClassifier {
  /**
   * Classify an error into a category with recovery information
   */
  classify(error: Error | string): ClassifiedError {
    const errorMessage = typeof error === 'string' ? error : error.message
    const technicalMessage = errorMessage

    // Try to match against known patterns
    for (const pattern of ERROR_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(errorMessage)) {
          return {
            category: pattern.category,
            userMessage: pattern.userMessage,
            technicalMessage,
            canRetry: pattern.canRetry,
            retryStrategy: pattern.retryStrategy || RetryStrategy.NONE,
            suggestedActions: pattern.suggestedActions,
          }
        }
      }
    }

    // Default classification
    return {
      category: ErrorCategory.UNKNOWN,
      userMessage:
        'An unexpected error occurred. Please try again or contact support if the problem persists.',
      technicalMessage,
      canRetry: false,
      retryStrategy: RetryStrategy.NONE,
    }
  }

  /**
   * Get a user-friendly message for an error
   */
  getUserMessage(error: Error | string): string {
    return this.classify(error).userMessage
  }

  /**
   * Check if an error is retryable
   */
  isRetryable(error: Error | string): boolean {
    return this.classify(error).canRetry
  }

  /**
   * Get retry strategy for an error
   */
  getRetryStrategy(error: Error | string): RetryStrategy {
    const classified = this.classify(error)
    return classified.retryStrategy || RetryStrategy.NONE
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let instance: ErrorClassifier | null = null

export function getErrorClassifier(): ErrorClassifier {
  if (!instance) {
    instance = new ErrorClassifier()
  }
  return instance
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Format error for display to user
 */
export function formatErrorForUser(error: Error | string): string {
  const classifier = getErrorClassifier()
  const classified = classifier.classify(error)

  let message = classified.userMessage

  // Add suggested actions if available
  if (classified.suggestedActions && classified.suggestedActions.length > 0) {
    message += '\n\nSuggestions:\n' + classified.suggestedActions.map((a) => `• ${a}`).join('\n')
  }

  return message
}

/**
 * Check if error should trigger automatic retry
 */
export function shouldAutoRetry(error: Error | string): boolean {
  const classifier = getErrorClassifier()
  const classified = classifier.classify(error)
  return classified.canRetry && classified.retryStrategy !== RetryStrategy.NONE
}

/**
 * Get delay for retry based on strategy
 */
export function getRetryDelay(strategy: RetryStrategy, attempt: number): number {
  switch (strategy) {
    case RetryStrategy.IMMEDIATE:
      return 0
    case RetryStrategy.BACKOFF:
      // Exponential backoff: 1s, 2s, 4s, 8s...
      return Math.min(1000 * Math.pow(2, attempt - 1), 10000)
    case RetryStrategy.DIFFERENT_PARAMS:
      return 500 // Short delay for user to adjust
    default:
      return 0
  }
}
