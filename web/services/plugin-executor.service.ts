/**
 * Plugin Executor Service
 *
 * Executes plugins on files with timeout control and progress tracking
 */

import type { FileEntry, FileInput, FileOutput, Plugin, PluginResult } from '../types/plugin'

import { getPluginLoader } from './plugin-loader.service'

//=============================================================================
// Types
//=============================================================================

/**
 * Execution context for tracking plugin execution
 */
export interface ExecutionContext {
  pluginId: string
  startTime: number
  timeout: number
  memoryLimit: number
  filesProcessed: number
  filesSkipped: number
  filesWithErrors: number
  currentFile?: string
}

/**
 * Execution result for a single file
 */
export interface FileExecutionResult {
  path: string
  success: boolean
  output?: FileOutput
  error?: string
  duration: number
}

/**
 * Plugin execution options
 */
export interface ExecutionOptions {
  timeoutMs?: number
  maxConcurrentFiles?: number
  onProgress?: (progress: ExecutionProgress) => void
}

/**
 * Progress update during execution
 */
export interface ExecutionProgress {
  pluginId: string
  currentFile: string
  processed: number
  total: number
  percentage: number
}

/**
 * Final execution result
 */
export interface PluginExecutionResult {
  pluginId: string
  metadata: {
    name: string
    version: string
  }
  results: FileExecutionResult[]
  finalResult?: PluginResult
  summary: string
  duration: number
  errors: string[]
}

//=============================================================================
// Plugin Executor
//=============================================================================

export class PluginExecutorService {
  private activeExecutions = new Map<string, ExecutionContext>()

  /**
   * Execute a plugin on multiple files
   *
   * @param plugin - Plugin to execute
   * @param files - Files to process
   * @param options - Execution options
   * @returns Execution result
   */
  async execute(
    plugin: Plugin,
    files: FileEntry[],
    options: ExecutionOptions = {}
  ): Promise<PluginExecutionResult> {
    console.log(
      '[PluginExecutor] Starting execution for plugin:',
      plugin.id,
      'files:',
      files.length
    )
    const startTime = Date.now()
    const loader = getPluginLoader()

    // Check plugin is loaded
    const instance = loader.getPlugin(plugin.id)
    if (!instance) {
      throw new Error(`Plugin not loaded: ${plugin.id}`)
    }
    console.log('[PluginExecutor] Plugin instance found, state:', instance.state)

    // Check metadata exists
    if (!instance.metadata) {
      throw new Error(
        `Plugin metadata not available: ${plugin.id}. The plugin may still be loading.`
      )
    }
    console.log('[PluginExecutor] Plugin metadata:', {
      id: instance.metadata.id,
      hasResourceLimits: !!instance.metadata.resource_limits,
      hasCapabilities: !!instance.metadata.capabilities,
    })

    // Get timeout from plugin resource limits or options
    const timeout =
      options.timeoutMs ?? instance.metadata.resource_limits?.max_execution_time ?? 30000
    console.log('[PluginExecutor] Timeout:', timeout, 'ms')

    // Create execution context
    const context: ExecutionContext = {
      pluginId: plugin.id,
      startTime,
      timeout,
      memoryLimit: instance.metadata.resource_limits?.max_memory ?? 16 * 1024 * 1024,
      filesProcessed: 0,
      filesSkipped: 0,
      filesWithErrors: 0,
    }

    this.activeExecutions.set(plugin.id, context)

    try {
      // Process files sequentially (can be parallelized later)
      const results: FileExecutionResult[] = []

      for (const file of files) {
        context.currentFile = file.path
        console.log('[PluginExecutor] Processing file:', file.path)

        // Report progress
        options.onProgress?.({
          pluginId: plugin.id,
          currentFile: file.path,
          processed: results.length,
          total: files.length,
          percentage: Math.round((results.length / files.length) * 100),
        })

        const result = await this.executeFile(plugin, file, timeout)
        results.push(result)
        console.log(
          '[PluginExecutor] File result:',
          file.path,
          'success:',
          result.success,
          'status:',
          result.output?.status
        )

        // Update counters
        if (result.success) {
          if (result.output?.status === 'Skipped') {
            context.filesSkipped++
          } else {
            context.filesProcessed++
          }
        } else {
          context.filesWithErrors++
        }
      }

      // Finalize plugin results
      const outputs = results.filter((r) => r.success && r.output).map((r) => r.output!)

      console.log('[PluginExecutor] Finalizing with', outputs.length, 'outputs')
      const finalResult =
        outputs.length > 0 ? await loader.finalizePlugin(plugin.id, outputs) : null
      console.log('[PluginExecutor] Final result:', finalResult)

      // Build summary
      const duration = Date.now() - startTime
      const summary = this.buildSummary(plugin, results, duration, finalResult)
      console.log('[PluginExecutor] Execution complete:', {
        processed: context.filesProcessed,
        skipped: context.filesSkipped,
        errors: context.filesWithErrors,
        duration,
      })

      return {
        pluginId: plugin.id,
        metadata: {
          name: plugin.metadata.name,
          version: plugin.metadata.version,
        },
        results,
        finalResult: finalResult || undefined,
        summary,
        duration,
        errors: results.filter((r) => !r.success).map((r) => r.error || 'Unknown error'),
      }
    } finally {
      this.activeExecutions.delete(plugin.id)
    }
  }

  /**
   * Execute plugin on a single file
   *
   * @param plugin - Plugin to execute
   * @param file - File to process
   * @param timeout - Execution timeout in ms
   * @returns File execution result
   */
  async executeFile(
    plugin: Plugin,
    file: FileEntry,
    _timeout: number
  ): Promise<FileExecutionResult> {
    const startTime = Date.now()
    console.log(
      '[PluginExecutor] executeFile:',
      plugin.id,
      file.path,
      'size:',
      file.size,
      'hasContent:',
      !!file.content
    )
    const loader = getPluginLoader()

    try {
      // Convert FileEntry to FileInput
      const fileInput: FileInput = {
        name: file.name,
        path: file.path,
        size: file.size,
        mimeType: file.mimeType,
        lastModified: file.lastModified,
        content: file.content, // Use content from FileEntry if available
      }

      // Check if plugin needs content and verify content is available
      if (plugin.metadata.capabilities.requires_content) {
        console.log('[PluginExecutor] Plugin requires content')
        if (!file.content) {
          console.log('[PluginExecutor] Skipping file without content:', file.path)
          // Return a skipped result instead of an error
          return {
            path: file.path,
            success: true,
            output: {
              path: file.path,
              status: 'Skipped',
              data: {},
              error: undefined,
            },
            duration: 0,
          }
        }
        // Check size limit
        const maxSize = plugin.metadata.capabilities.max_file_size || 100 * 1024 * 1024
        if (file.size > maxSize && maxSize > 0) {
          console.warn('[PluginExecutor] File too large:', file.size, '>', maxSize)
          return {
            path: file.path,
            success: true,
            output: {
              path: file.path,
              status: 'Skipped',
              data: {},
              error: undefined,
            },
            duration: 0,
          }
        }
      }

      // Execute plugin
      console.log(
        '[PluginExecutor] Calling loader.executePlugin, content length:',
        fileInput.content?.length || 0
      )
      const output = await loader.executePlugin(plugin.id, fileInput)
      const duration = Date.now() - startTime
      console.log('[PluginExecutor] Plugin executed, status:', output.status, 'duration:', duration)

      return {
        path: file.path,
        success: output.status !== 'Error',
        output,
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      console.error('[PluginExecutor] executeFile error:', error)
      return {
        path: file.path,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      }
    }
  }

  /**
   * Get execution context for a plugin
   */
  getExecutionContext(pluginId: string): ExecutionContext | undefined {
    return this.activeExecutions.get(pluginId)
  }

  /**
   * Cancel an active execution
   */
  cancelExecution(pluginId: string): boolean {
    // In a real implementation, this would signal the worker to stop
    return this.activeExecutions.delete(pluginId)
  }

  /**
   * Check if a plugin is currently executing
   */
  isExecuting(pluginId: string): boolean {
    return this.activeExecutions.has(pluginId)
  }

  /**
   * Get all active plugin IDs
   */
  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys())
  }

  /**
   * Build execution summary
   */
  private buildSummary(
    plugin: Plugin,
    results: FileExecutionResult[],
    duration: number,
    finalResult: PluginResult | null
  ): string {
    const success = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length
    const skipped = results.filter((r) => r.success && r.output?.status === 'Skipped').length

    const parts: string[] = [`Processed ${results.length} files`]

    if (success > 0) parts.push(`${success} successful`)
    if (failed > 0) parts.push(`${failed} failed`)
    if (skipped > 0) parts.push(`${skipped} skipped`)

    parts.push(`in ${duration}ms`)

    if (finalResult) {
      parts.push(`"${finalResult.summary}"`)
    }

    return `${plugin.metadata.name}: ${parts.join(', ')}`
  }

  /**
   * Execute multiple plugins in parallel
   *
   * @param plugins - Plugins to execute
   * @param files - Files to process
   * @param options - Execution options
   * @returns Map of plugin ID to execution result wrapper
   */
  async executeParallel(
    plugins: Plugin[],
    files: FileEntry[],
    options: ExecutionOptions = {}
  ): Promise<Map<string, { pluginId: string; result: PluginExecutionResult }>> {
    const results = new Map<string, { pluginId: string; result: PluginExecutionResult }>()

    const executions = plugins.map((plugin) =>
      this.execute(plugin, files, options).then((result) => ({
        pluginId: plugin.id,
        result,
      }))
    )

    const settled = await Promise.allSettled(executions)

    for (const [index, outcome] of settled.entries()) {
      const plugin = plugins[index]
      const pluginId = plugin?.id || 'unknown'

      if (outcome.status === 'fulfilled') {
        results.set(outcome.value.pluginId, outcome.value)
      } else {
        const reason = outcome.reason
        const message =
          reason instanceof Error
            ? reason.message
            : typeof reason === 'object' &&
                reason !== null &&
                typeof (reason as { message?: unknown }).message === 'string'
              ? (reason as { message: string }).message
              : 'Unknown error'

        const failedResult: PluginExecutionResult = {
          pluginId,
          metadata: {
            name: plugin?.metadata.name || pluginId,
            version: plugin?.metadata.version || 'unknown',
          },
          results: [],
          summary: 'Execution failed',
          duration: 0,
          errors: [message],
        }

        results.set(pluginId, {
          pluginId,
          result: failedResult,
        })
      }
    }

    return results
  }
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Convert FileEntry to FileInput
 * @param file - File entry
 * @param includeContent - Whether to include file content
 * @returns FileInput for plugin
 */
export async function fileToFileInput(
  file: FileEntry,
  includeContent: boolean = false
): Promise<FileInput> {
  const input: FileInput = {
    name: file.name,
    path: file.path,
    size: file.size,
    mimeType: file.mimeType,
    lastModified: file.lastModified,
  }

  if (includeContent) {
    // Would load file content here
    // For now, leave content undefined
    // The loader service would handle actual content loading
  }

  return input
}

/**
 * Check if execution should stop based on error rate
 */
export function shouldStopOnError(results: FileExecutionResult[]): boolean {
  const errorRate = results.filter((r) => !r.success).length / results.length
  return errorRate > 0.5 // Stop if >50% errors
}

/**
 * Calculate estimated time remaining
 */
export function estimateTimeRemaining(
  processed: number,
  total: number,
  avgTimePerFile: number
): number {
  if (processed === 0) return 0
  return (total - processed) * avgTimePerFile
}
