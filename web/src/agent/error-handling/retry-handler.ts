/**
 * Retry Handler - Intelligent retry mechanism for tool execution
 *
 * Provides automatic retry with different strategies based on error type.
 */

import type { RetryStrategy } from './error-classifier'
import { getErrorClassifier, getRetryDelay } from './error-classifier'

//=============================================================================
// Types
//=============================================================================

export interface RetryConfig {
  maxAttempts: number
  strategy: RetryStrategy
  onRetry?: (attempt: number, error: Error) => void
}

export interface RetryResult<T> {
  success: boolean
  data?: T
  error?: Error
  attempts: number
}

export type RetryableFunction<T> = () => Promise<T>

//=============================================================================
// Default Configurations
//=============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  strategy: 'none' as RetryStrategy,
}

//=============================================================================
// Retry Handler
//=============================================================================

export class RetryHandler {
  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    fn: RetryableFunction<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        const data = await fn()
        return { success: true, data, attempts: attempt }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Check if we should retry
        const classifier = getErrorClassifier()
        const classified = classifier.classify(lastError)

        if (!classified.canRetry || attempt >= finalConfig.maxAttempts) {
          return { success: false, error: lastError, attempts: attempt }
        }

        // Determine delay
        const strategy = classified.retryStrategy || finalConfig.strategy
        const delay = getRetryDelay(strategy, attempt)

        // Notify retry callback
        finalConfig.onRetry?.(attempt, lastError)

        // Wait before retry
        if (delay > 0) {
          await this.delay(delay)
        }
      }
    }

    return { success: false, error: lastError, attempts: finalConfig.maxAttempts }
  }

  /**
   * Execute with automatic retry detection
   * Uses the error classifier to determine if retry is needed
   */
  async executeAuto<T>(fn: RetryableFunction<T>): Promise<RetryResult<T>> {
    let lastError: Error | undefined
    let attempt = 0

    while (attempt < 5) {
      attempt++
      try {
        const data = await fn()
        return { success: true, data, attempts: attempt }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Check if we should retry
        const classifier = getErrorClassifier()
        const classified = classifier.classify(lastError)

        if (!classified.canRetry || attempt >= 5) {
          return { success: false, error: lastError, attempts: attempt }
        }

        // Get retry delay from error classification
        const strategy: RetryStrategy = (classified.retryStrategy || 'exponential') as RetryStrategy
        const delay = getRetryDelay(strategy, attempt)

        if (delay > 0) {
          await this.delay(delay)
        }
      }
    }

    return { success: false, error: lastError, attempts: attempt }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let instance: RetryHandler | null = null

export function getRetryHandler(): RetryHandler {
  if (!instance) {
    instance = new RetryHandler()
  }
  return instance
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Execute a function with automatic retry
 */
export async function withRetry<T>(
  fn: RetryableFunction<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const handler = getRetryHandler()
  const result = await handler.execute(fn, config)

  if (!result.success) {
    throw result.error
  }

  return result.data!
}

/**
 * Execute a function with intelligent auto-retry
 */
export async function withAutoRetry<T>(fn: RetryableFunction<T>): Promise<T> {
  const handler = getRetryHandler()
  const result = await handler.executeAuto(fn)

  if (!result.success) {
    throw result.error
  }

  return result.data!
}
