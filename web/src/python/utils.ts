/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Python Execution Utility Functions
 *
 * Helper utilities for Python code execution, result serialization,
 * matplotlib image detection, and Pyodide filesystem management.
 */

import type { ExecuteResult } from './worker-types'

//=============================================================================
// ID Generation
//=============================================================================

/**
 * Generate a unique ID for tracking Python execution requests
 */
export function generateId(): string {
  return `python_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

//=============================================================================
// Time Formatting
//=============================================================================

/**
 * Format execution time in milliseconds to human-readable string
 */
export function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`
  }

  const seconds = ms / 1000
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    const remainingSeconds = Math.floor(seconds % 60)
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`
  }

  if (minutes > 0) {
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${seconds.toFixed(1)}s`
}

//=============================================================================
// Result Serialization
//=============================================================================

/**
 * Serialize Python result to JSON-safe format
 * Handles common Python types that need conversion
 */
export function serializeResult(result: unknown): unknown {
  if (result === null || result === undefined) {
    return result
  }

  // Handle Uint8Array (binary data)
  if (result instanceof Uint8Array) {
    return {
      __type__: 'Uint8Array',
      data: Array.from(result),
    }
  }

  // Handle Array
  if (Array.isArray(result)) {
    return result.map(serializeResult)
  }

  // Handle Object (plain objects and Pyodide proxies)
  if (typeof result === 'object') {
    try {
      // Try to convert to plain object
      const plain: Record<string, unknown> = {}
      for (const key in result) {
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          plain[key] = serializeResult((result as Record<string, unknown>)[key])
        }
      }
      return plain
    } catch {
      // Fallback for Pyodide proxies that can't be iterated
      return String(result)
    }
  }

  // Return primitives as-is
  return result
}

//=============================================================================
// Matplotlib Image Detection
//=============================================================================

/**
 * Detect if Python output contains matplotlib images
 * Checks for common patterns in stdout or result
 */
export function detectMatplotlibImages(result: string): boolean {
  const matplotlibPatterns = ['Figure(', 'matplotlib.figure', 'AxesImage', '<matplotlib']

  return matplotlibPatterns.some((pattern) => result.includes(pattern))
}

//=============================================================================
// Logging
//=============================================================================

/**
 * Simple logger for Python module with consistent prefix
 */
export function logger(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const prefix = '[Python]'
  const timestamp = new Date().toISOString()

  switch (level) {
    case 'info':
      console.log(`${prefix} [${timestamp}] ${message}`)
      break
    case 'warn':
      console.warn(`${prefix} [${timestamp}] ${message}`)
      break
    case 'error':
      console.error(`${prefix} [${timestamp}] ${message}`)
      break
  }
}

//=============================================================================
// Pyodide Filesystem Cleanup
//=============================================================================

/**
 * Clean up temporary files in Pyodide /mnt directory
 * Removes all files and directories under /mnt
 */
export function cleanupTempFiles(pyodide: any): void {
  try {
    if (!pyodide || !pyodide.FS) {
      logger('Pyodide instance not available for cleanup', 'warn')
      return
    }

    const mntPath = '/mnt'

    // Check if /mnt exists
    if (!pyodide.FS.exists(mntPath)) {
      return
    }

    // Read directory contents
    const files = pyodide.FS.readdir(mntPath).filter(
      (name: string) => name !== '.' && name !== '..'
    )

    // Remove each file
    for (const file of files) {
      try {
        const filePath = `${mntPath}/${file}`
        const stat = pyodide.FS.stat(filePath)

        if (stat.mode === 16877) {
          // Directory (16877 = 0o40755 in octal)
          pyodide.FS.rmdir(filePath)
        } else {
          // File
          pyodide.FS.unlink(filePath)
        }
      } catch (error) {
        logger(`Failed to cleanup ${file}: ${error}`, 'warn')
      }
    }

    logger(`Cleaned up ${files.length} temporary files`)
  } catch (error) {
    logger(`Cleanup failed: ${error}`, 'error')
  }
}

//=============================================================================
// Result Formatting
//=============================================================================

/**
 * Format execution result for display
 * Combines stdout, stderr, and result into a readable format
 */
export function formatExecutionResult(result: ExecuteResult): string {
  const parts: string[] = []

  if (result.stdout) {
    parts.push('STDOUT:\n' + result.stdout)
  }

  if (result.stderr) {
    parts.push('STDERR:\n' + result.stderr)
  }

  if (result.error) {
    parts.push('ERROR:\n' + result.error)
  }

  if (result.result !== undefined && result.result !== null) {
    const serialized = serializeResult(result.result)
    parts.push('RESULT:\n' + JSON.stringify(serialized, null, 2))
  }

  if (result.images && result.images.length > 0) {
    parts.push(`\nGenerated ${result.images.length} matplotlib image(s)`)
  }

  if (result.outputFiles && result.outputFiles.length > 0) {
    parts.push(`\nOutput ${result.outputFiles.length} file(s)`)
  }

  parts.push(`\nExecution time: ${formatTime(result.executionTime)}`)

  return parts.join('\n\n')
}

/**
 * Validate execution result for errors
 * Returns true if result is successful
 */
export function isExecutionSuccessful(result: ExecuteResult): boolean {
  return result.success && !result.error
}
