/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Python Execution Module - Pyodide integration for browser-based Python
 *
 * This module provides Python code execution capabilities in the browser using Pyodide:
 * - Main API through PythonExecutor class
 * - Web Worker for non-blocking Python execution
 * - Type definitions for execution interfaces
 * - Configuration constants
 * - Package management for Python dependencies
 * - Utility functions for result handling
 *
 * @example
 * ```ts
 * import { pythonExecutor } from '@/python'
 *
 * // Execute simple Python code
 * const result = await pythonExecutor.execute({
 *   code: 'print("Hello, World!")'
 * })
 * ```
 */

//=============================================================================
// Main Python Execution API
//=============================================================================

/**
 * PythonExecutor - Main class for Python code execution
 *
 * Provides a high-level API for executing Python code using Pyodide worker.
 * Manages worker lifecycle, file I/O, package loading, and image output.
 */
export { PythonExecutor } from './api'
export type { PyodideState } from './api'
export type {
  ExecuteRequest,
  ExecuteResult,
  FileRef,
  FileOutput,
  ImageOutput,
  WorkerResponse,
} from './worker-types'

export type { PyodideWorkerManagerOptions } from './manager'

export {
  createTextFile,
  createFileFromBlob,
  createFileFromFile,
  fileOutputToBlob,
  fileOutputToText,
  fileOutputToDataUrl,
  downloadFileOutput,
} from './manager'

//=============================================================================
// Utility Functions
//=============================================================================

/**
 * Utility functions for Python execution
 *
 * - generateId: Generate unique execution IDs
 * - formatTime: Format execution time
 * - serializeResult: Serialize Python results to JSON
 * - detectMatplotlibImages: Detect matplotlib output
 * - logger: Module logging
 * - cleanupTempFiles: Clean up Pyodide filesystem
 * - formatExecutionResult: Format execution results
 * - isExecutionSuccessful: Check result status
 */
export * from './utils'

//=============================================================================
// Core types (for file bridge layer)
//=============================================================================

export type {
  FileRef as CoreFileRef,
  PyodideFileMeta,
  BridgeResult,
  PyodideInstance,
} from './types'

// Constants
export {
  PYODIDE_CDN_URL,
  DEFAULT_TIMEOUT,
  MOUNT_POINT,
  MAX_FILE_SIZE,
  PYTHON_PACKAGES,
  type PythonPackage,
  MAX_CODE_SIZE,
  MAX_FILE_COUNT,
  MAX_OUTPUT_SIZE,
} from './constants'

// Package management
export { PackageManager } from './packages'

// File operations and bridge layer
export {
  readFileFromHandle,
  readFileFromOPFS,
  validateFileSize,
  injectFile,
  readFileFromPyodide,
  listPyodideFiles,
  fileToFileRef,
  readFileAsBinary,
  isTextFile,
} from './files'

export {
  getActiveFiles,
  bridgeFilesToPyodide,
  bridgeOutputFiles,
  clearPyodideFiles,
  getPyodideFileStats,
} from './bridge'

//=============================================================================
// Singleton Instance
//=============================================================================

/**
 * Global Python executor singleton
 *
 * Pre-configured instance ready for use throughout the application.
 * Automatically manages worker lifecycle on first use.
 *
 * @example
 * ```ts
 * import { pythonExecutor } from '@/python'
 *
 * // Execute code
 * const result = await pythonExecutor.execute({
 *   code: 'print("Hello!")'
 * })
 * ```
 */
export { pythonExecutor } from './api'

//=============================================================================
// Window Binding (for Agent Tool Integration)
//=============================================================================

/**
 * Bind pythonExecutor to window object for Agent tool access
 * This allows the Agent to execute Python code through the global scope.
 */
import { pythonExecutor as executorInstance } from './api'

if (typeof window !== 'undefined') {
  (window as any).pythonExecutor = executorInstance

  // Convenience function for Agent tool integration
  // Note: Using loose file type to match FileRef interface expectations
  ;(window as any).__executePython = async (
    code: string,
    options?: {
      files?: Array<{ name: string; content: string | ArrayBuffer }>
      packages?: string[]
      timeout?: number
    }
  ) => {
    // Convert string content to ArrayBuffer for FileRef compatibility
    const convertedFiles = options?.files?.map((f) => ({
      ...f,
      content:
        typeof f.content === 'string' ? new TextEncoder().encode(f.content).buffer : f.content,
    }))

    return executorInstance.execute({
      code,
      files: convertedFiles as any,
      timeout: options?.timeout,
    })
  }
}
