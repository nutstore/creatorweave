/**
 * Python Executor API - Main interface for Python code execution
 *
 * Provides a high-level API for executing Python code using Pyodide worker:
 * - Manages worker lifecycle
 * - Provides promise-based execution interface
 * - Handles file I/O and image output
 * - Supports package loading
 *
 * @example
 * ```ts
 * const executor = new PythonExecutor()
 * const result = await executor.execute({
 *   code: 'print("Hello, World!")',
 *   packages: ['numpy']
 * })
 * ```
 */

//=============================================================================
// Type Definitions
//=============================================================================

import type {
  FileRef,
  FileOutput,
  ImageOutput,
  ExecuteRequest,
  ExecuteResult,
  WorkerResponse,
} from './worker-types'
import { DEFAULT_TIMEOUT } from './constants'
import { generateId, logger, formatTime, isExecutionSuccessful } from './utils'

//=============================================================================
// Python Executor Class
//=============================================================================

export class PythonExecutor {
  private worker: Worker | null = null
  private pendingRequests = new Map<
    string,
    {
      resolve: (response: WorkerResponse) => void
      reject: (error: Error) => void
      timeout: number
    }
  >()

  //=============================================================================
  // Lifecycle Management
  //=============================================================================

  /**
   * Initialize the Pyodide worker
   * Lazily loads the worker on first use
   */
  private ensureWorker(): void {
    if (this.worker) return

    logger('Initializing Pyodide worker...')

    // Create worker from worker.ts file (ESM worker with dynamic import for pyodide)
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

    // Set up message handler
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id } = e.data
      const pending = this.pendingRequests.get(id)

      if (!pending) {
        logger(`Received response for unknown request: ${id}`, 'warn')
        return
      }

      // Clear timeout
      clearTimeout(pending.timeout)

      // Resolve promise
      pending.resolve(e.data)

      // Remove from pending
      this.pendingRequests.delete(id)
    }

    // Set up error handler
    this.worker.onerror = (error) => {
      logger(`Worker error: ${error.message}`, 'error')

      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout)
        pending.reject(new Error(`Worker error: ${error.message}`))
      }
      this.pendingRequests.clear()
    }

    logger('Pyodide worker initialized')
  }

  /**
   * Terminate the worker and clean up resources
   */
  terminate(): void {
    if (!this.worker) return

    logger('Terminating Pyodide worker...')

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Worker terminated'))
    }
    this.pendingRequests.clear()

    // Terminate worker
    this.worker.terminate()
    this.worker = null

    logger('Pyodide worker terminated')
  }

  //=============================================================================
  // Code Execution
  //=============================================================================

  /**
   * Execute Python code
   *
   * @param options - Execution options
   * @returns Promise resolving to execution result
   */
  async execute(options: {
    /** Python code to execute */
    code: string
    /** Optional files to inject into /mnt */
    files?: FileRef[]
    /** Optional packages to load (pandas, numpy, matplotlib, openpyxl) */
    packages?: string[]
    /** Execution timeout in milliseconds (default: 30000) */
    timeout?: number
  }): Promise<ExecuteResult> {
    // Ensure worker is initialized
    this.ensureWorker()

    // Generate unique request ID
    const id = generateId()

    // Create request
    const request: ExecuteRequest = {
      id,
      type: 'execute',
      code: options.code,
      files: options.files || [],
      packages: options.packages || [],
      timeout: options.timeout || DEFAULT_TIMEOUT,
    }

    logger(`Executing Python code (id: ${id})`)
    logger(`  Code length: ${options.code.length} bytes`)
    logger(`  Files: ${options.files?.length || 0}`)
    logger(`  Packages: ${options.packages?.join(', ') || 'none'}`)
    logger(`  Timeout: ${formatTime(options.timeout || DEFAULT_TIMEOUT)}`)

    // Create promise for response
    const responsePromise = new Promise<WorkerResponse>((resolve, reject) => {
      // Set timeout for worker response (add 5s buffer)
      const timeout = setTimeout(
        () => {
          this.pendingRequests.delete(id)
          reject(new Error(`Worker response timeout after ${options.timeout || DEFAULT_TIMEOUT}ms`))
        },
        (options.timeout || DEFAULT_TIMEOUT) + 5000
      ) as unknown as number // NodeJS.Timeout is number-like

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout })
    })

    // Send request to worker
    this.worker!.postMessage(request)

    // Wait for response
    const response = await responsePromise

    logger(`Execution completed (id: ${id})`)
    logger(`  Success: ${response.result.success}`)
    logger(`  Time: ${formatTime(response.result.executionTime)}`)

    if (response.result.error) {
      logger(`  Error: ${response.result.error}`, 'error')
    }

    return response.result
  }

  //=============================================================================
  // Convenience Methods
  //=============================================================================

  /**
   * Execute Python code with automatic error handling
   * Returns formatted result string
   */
  async executeAndFormat(options: {
    code: string
    files?: FileRef[]
    packages?: string[]
    timeout?: number
  }): Promise<string> {
    const result = await this.execute(options)

    if (!isExecutionSuccessful(result)) {
      throw new Error(result.error || 'Execution failed')
    }

    // Format result
    const parts: string[] = []

    if (result.stdout) {
      parts.push(result.stdout)
    }

    if (result.stderr) {
      parts.push(`STDERR:\n${result.stderr}`)
    }

    if (result.result !== undefined && result.result !== null) {
      parts.push(`Result: ${JSON.stringify(result.result)}`)
    }

    if (result.images && result.images.length > 0) {
      parts.push(`\nGenerated ${result.images.length} matplotlib image(s)`)
    }

    if (result.outputFiles && result.outputFiles.length > 0) {
      parts.push(`\nOutput ${result.outputFiles.length} file(s)`)
    }

    parts.push(`\nExecution time: ${formatTime(result.executionTime)}`)

    return parts.join('\n')
  }

  /**
   * Check if worker is ready
   */
  isReady(): boolean {
    return this.worker !== null
  }

  /**
   * Get pending request count
   */
  getPendingCount(): number {
    return this.pendingRequests.size
  }
}

//=============================================================================
// Worker State Enums
//=============================================================================

/**
 * Pyodide initialization states
 */
export enum PyodideState {
  /** Not initialized */
  Idle = 'idle',
  /** Currently initializing */
  Initializing = 'initializing',
  /** Ready for execution */
  Ready = 'ready',
  /** Error during initialization */
  Error = 'error',
}

//=============================================================================
// Re-exports
//=============================================================================

// Re-export types from worker.ts for convenience
export type { FileRef, FileOutput, ImageOutput, ExecuteRequest, ExecuteResult, WorkerResponse }

// Re-export from other modules
export type { PyodideInstance } from './types'
export { DEFAULT_TIMEOUT } from './constants'
export type { PythonPackage } from './constants'
export * from './utils'

// Singleton instance
export const pythonExecutor = new PythonExecutor()
