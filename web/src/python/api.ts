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

import type { FileRef, ExecuteRequest, ExecuteResult, WorkerResponse } from './worker-types'
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

      // Worker may be in a bad state after an unhandled runtime failure.
      // Force recreation on next execute() instead of keeping a poisoned worker instance.
      try {
        this.worker?.terminate()
      } catch {
        // ignore termination cleanup errors
      }
      this.worker = null
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
   *
   * Note: Pyodide automatically loads packages from import statements in your code.
   * Packages like pandas, numpy, matplotlib, openpyxl, etc. will be loaded automatically.
   */
  async execute(options: {
    /** Python code to execute */
    code: string
    /** Optional files to inject into /mnt (only used when not using mountDir) */
    files?: FileRef[]
    /** Execution timeout in milliseconds (default: 30000) */
    timeout?: number
    /** Optional directory handle to mount at /mnt (File System Access API) */
    mountDir?: FileSystemDirectoryHandle
    /** Optional directory handle to mount at /mnt_assets (File System Access API) */
    assetsDir?: FileSystemDirectoryHandle
    /** Whether to sync changes back to native filesystem after execution */
    syncFs?: boolean
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
      timeout: options.timeout || DEFAULT_TIMEOUT,
      mountDir: options.mountDir,
      assetsDir: options.assetsDir,
      syncFs: options.syncFs,
    }

    logger(`Executing Python code (id: ${id})`)
    logger(`  Code length: ${options.code.length} bytes`)
    logger(`  Files: ${options.files?.length || 0}`)
    logger(`  Mount dir: ${options.mountDir?.name || 'none'}`)
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

  //=============================================================================
  // Native Directory Mounting (mountNativeFS)
  //=============================================================================

  /**
   * Mount OPFS root directory to /mnt using navigator.storage.getDirectory()
   * No user interaction required - uses origin private file system
   *
   * @returns Promise resolving to { handle: FileSystemDirectoryHandle }
   */
  async mountOPFS(): Promise<{ handle: FileSystemDirectoryHandle }> {
    // Check if Storage API is available
    if (typeof navigator.storage === 'undefined' || !navigator.storage.getDirectory) {
      throw new Error('Storage API is not supported in this browser')
    }

    const handle = await navigator.storage.getDirectory()
    await this.mountDir(handle)
    return { handle }
  }

  /**
   * Mount a directory to /mnt using mountNativeFS
   * Uses File System Access API (showDirectoryPicker)
   *
   * @returns Promise resolving to { handle: FileSystemDirectoryHandle } or undefined if cancelled
   */
  async selectAndMountDir(): Promise<{ handle: FileSystemDirectoryHandle } | undefined> {
    // Check if File System Access API is available
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('File System Access API is not supported in this browser')
    }

    try {
      const handle = await window.showDirectoryPicker()
      await this.mountDir(handle)
      return { handle }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return undefined
      }
      throw error
    }
  }

  /**
   * Mount a directory handle to /mnt
   * @param dirHandle - FileSystemDirectoryHandle from showDirectoryPicker
   */
  async mountDir(dirHandle: FileSystemDirectoryHandle): Promise<void> {
    this.ensureWorker()

    const id = generateId()

    logger(`Mounting directory: ${dirHandle.name}`)

    const responsePromise = new Promise<{
      success: boolean
      result: { success: boolean; error?: string }
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error('Mount request timeout'))
      }, 30000) as unknown as number

      this.pendingRequests.set(id, {
        resolve: (/** @type {any} */ res) => {
          clearTimeout(timeout)
          resolve(res)
        },
        reject,
        timeout,
      })
    })

    this.worker!.postMessage({
      id,
      type: 'mount',
      dirHandle,
    })

    const response = await responsePromise

    if (!response.result.success) {
      throw new Error(response.result.error || 'Mount failed')
    }

    logger(`Directory mounted: ${dirHandle.name}`)
  }

  /**
   * Sync changes back to the native filesystem
   */
  async sync(): Promise<void> {
    this.ensureWorker()

    const id = generateId()

    logger('Syncing filesystem...')

    const responsePromise = new Promise<{
      success: boolean
      result: { success: boolean; error?: string }
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error('Sync request timeout'))
      }, 30000) as unknown as number

      this.pendingRequests.set(id, {
        resolve: (/** @type {any} */ res) => {
          clearTimeout(timeout)
          resolve(res)
        },
        reject,
        timeout,
      })
    })

    this.worker!.postMessage({
      id,
      type: 'sync',
    })

    const response = await responsePromise

    if (!response.result.success) {
      throw new Error(response.result.error || 'Sync failed')
    }

    logger('Filesystem synced')
  }

  /**
   * Unmount directory and remove /mnt
   * Called when user releases the folder
   */
  async unmount(): Promise<void> {
    this.ensureWorker()

    const id = generateId()

    logger('Unmounting filesystem and removing /mnt...')

    const responsePromise = new Promise<{
      success: boolean
      result: { success: boolean; error?: string }
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error('Unmount request timeout'))
      }, 30000) as unknown as number

      this.pendingRequests.set(id, {
        resolve: (/** @type {any} */ res) => {
          clearTimeout(timeout)
          resolve(res)
        },
        reject,
        timeout,
      })
    })

    this.worker!.postMessage({
      id,
      type: 'unmount',
    })

    const response = await responsePromise

    if (!response.result.success) {
      throw new Error(response.result.error || 'Unmount failed')
    }

    logger('Filesystem unmounted and /mnt removed')
  }

  /**
   * Check if there are pending changes to sync
   * @returns Promise resolving to true if there are unsaved changes
   */
  async hasPendingChanges(): Promise<boolean> {
    // This is a best-effort check - in a real implementation,
    // we could add a 'status' message type to query the worker
    return false // Placeholder until we implement status query
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
export type {
  FileRef,
  FileOutput,
  ImageOutput,
  ExecuteRequest,
  ExecuteResult,
  WorkerResponse,
  MountRequest,
  MountResult,
  SyncRequest,
  SyncResult,
  UnmountRequest,
  UnmountResult,
} from './worker-types'

// Re-export from other modules
export type { PyodideInstance } from './types'
export { DEFAULT_TIMEOUT } from './constants'
export type { PythonPackage } from './constants'
export * from './utils'

// Singleton instance
export const pythonExecutor = new PythonExecutor()
