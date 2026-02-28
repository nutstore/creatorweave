/**
 * Plugin Stream Service
 *
 * Executes plugins on large files using streaming to avoid
 * memory overflow and enable processing of files larger than
 * available memory.
 */

import type {
  FileEntry,
  FileInput,
  FileOutput,
  Plugin,
  PluginInstance,
  PluginResult,
} from '../types/plugin'

import { getPluginLoader } from './plugin-loader.service'
import { getStreamReader, type StreamChunk } from './stream-reader.service'

//=============================================================================
// Types
//=============================================================================

/**
 * Stream plugin execution configuration
 */
export interface StreamPluginExecution {
  pluginId: string
  plugin: Plugin
  file: File | FileEntry
  chunkSize?: number
  onProgress?: (progress: StreamPluginProgress) => void
  onChunk?: (chunk: StreamChunk) => void
}

/**
 * Progress during stream execution
 */
export interface StreamPluginProgress {
  pluginId: string
  file: string
  bytesProcessed: number
  totalBytes: number
  percentage: number
  currentChunk: number
  totalChunks: number
  status: 'processing' | 'complete' | 'error'
}

/**
 * Stream execution result
 */
export interface StreamPluginResult {
  pluginId: string
  file: string
  chunksProcessed: number
  totalBytes: number
  duration: number
  partialResults: FileOutput[]
  finalResult: PluginResult | null
  errors: string[]
}

//=============================================================================
// Plugin Stream Service
//=============================================================================

export class PluginStreamService {
  private loader = getPluginLoader()
  private reader = getStreamReader()
  private activeStreams = new Map<string, StreamPluginProgress>()

  /**
   * Execute plugin on file using streaming
   *
   * @param execution - Stream execution configuration
   * @returns Stream execution result
   */
  async executeStream(execution: StreamPluginExecution): Promise<StreamPluginResult> {
    const startTime = Date.now()
    const { pluginId, plugin, file, onProgress, onChunk } = execution

    // Get plugin instance
    const instance = this.loader.getPlugin(pluginId)
    if (!instance) {
      return {
        pluginId,
        file: (file as File).name || (file as FileEntry).name,
        chunksProcessed: 0,
        totalBytes: (file as File).size || (file as FileEntry).size,
        duration: Date.now() - startTime,
        partialResults: [],
        finalResult: null,
        errors: [`Plugin not loaded: ${pluginId}`],
      }
    }

    // Check if plugin supports streaming
    if (!this.supportsStreaming(plugin)) {
      return {
        pluginId,
        file: (file as File).name || (file as FileEntry).name,
        chunksProcessed: 0,
        totalBytes: (file as File).size || (file as FileEntry).size,
        duration: Date.now() - startTime,
        partialResults: [],
        finalResult: null,
        errors: [`Plugin does not support streaming: ${pluginId}`],
      }
    }

    // Determine chunk size
    const fileSize = (file as File).size || (file as FileEntry).size
    const chunkSize =
      execution.chunkSize ||
      this.reader.getOptimalChunkSize(
        fileSize,
        instance.metadata.resource_limits?.max_memory ?? 16 * 1024 * 1024
      )

    // Calculate total chunks
    const totalChunks = Math.ceil(fileSize / chunkSize)

    // Initialize progress tracking
    const progress: StreamPluginProgress = {
      pluginId,
      file: (file as File).name || (file as FileEntry).name,
      bytesProcessed: 0,
      totalBytes: fileSize,
      percentage: 0,
      currentChunk: 0,
      totalChunks,
      status: 'processing',
    }

    this.activeStreams.set(pluginId, progress)
    onProgress?.(progress)

    // Process file in chunks
    const partialResults: FileOutput[] = []
    const errors: string[] = []
    let chunksProcessed = 0

    try {
      const fileObj = file instanceof File ? file : await this.fileToFile(file)

      for await (const chunk of this.reader.readStream(fileObj, { chunkSize })) {
        if (chunk.isLast) {
          break
        }

        // Update progress
        progress.currentChunk = chunksProcessed + 1
        progress.bytesProcessed = chunk.offset + chunk.bytes
        progress.percentage = Math.round((progress.bytesProcessed / progress.totalBytes) * 100)
        onProgress?.(progress)
        onChunk?.(chunk)

        // Process chunk with plugin
        const result = await this.processChunk(pluginId, chunk, fileObj)
        if (result) {
          partialResults.push(result)
        }

        chunksProcessed++
      }

      // Finalize plugin
      progress.status = 'processing'
      const finalResult = await this.loader.finalizePlugin(pluginId, partialResults)

      progress.status = 'complete'
      progress.percentage = 100
      onProgress?.(progress)

      return {
        pluginId,
        file: progress.file,
        chunksProcessed,
        totalBytes: fileSize,
        duration: Date.now() - startTime,
        partialResults,
        finalResult,
        errors,
      }
    } catch (error) {
      progress.status = 'error'
      onProgress?.(progress)

      return {
        pluginId,
        file: progress.file,
        chunksProcessed,
        totalBytes: fileSize,
        duration: Date.now() - startTime,
        partialResults,
        finalResult: null,
        errors: [error instanceof Error ? error.message : String(error)],
      }
    } finally {
      this.activeStreams.delete(pluginId)
    }
  }

  /**
   * Check if plugin supports streaming
   *
   * @param plugin - Plugin to check
   * @returns true if streaming supported
   */
  supportsStreaming(plugin: Plugin | PluginInstance): boolean {
    const instance = 'metadata' in plugin ? (plugin as PluginInstance) : (plugin as Plugin)
    return instance.metadata.capabilities.supports_streaming
  }

  /**
   * Get optimal chunk size for a file and plugin
   *
   * @param fileSize - Size of file
   * @param plugin - Plugin instance
   * @returns Optimal chunk size in bytes
   */
  getOptimalChunkSize(fileSize: number, plugin: PluginInstance): number {
    const memoryLimit = plugin.metadata.resource_limits?.max_memory ?? 16 * 1024 * 1024
    // Use 1/8 of memory limit, ensure minimum 4KB
    return this.reader.getOptimalChunkSize(fileSize, memoryLimit)
  }

  /**
   * Check if streaming is recommended for a file
   *
   * @param fileSize - Size of file
   * @param plugin - Plugin instance
   * @returns true if streaming recommended
   */
  shouldStream(fileSize: number, plugin: PluginInstance): boolean {
    // Stream if file > 10% of memory limit
    const memoryLimit = plugin.metadata.resource_limits?.max_memory ?? 16 * 1024 * 1024
    return this.reader.shouldStream(fileSize, memoryLimit)
  }

  /**
   * Get current progress for an active stream
   *
   * @param pluginId - Plugin ID
   * @returns Progress or undefined
   */
  getProgress(pluginId: string): StreamPluginProgress | undefined {
    return this.activeStreams.get(pluginId)
  }

  /**
   * Get all active streams
   *
   * @returns Array of active stream IDs
   */
  getActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys())
  }

  /**
   * Cancel an active stream
   *
   * @param pluginId - Plugin ID
   * @returns true if cancelled
   */
  cancelStream(pluginId: string): boolean {
    const progress = this.activeStreams.get(pluginId)
    if (progress) {
      progress.status = 'error'
      this.activeStreams.delete(pluginId)
      return true
    }
    return false
  }

  /**
   * Process a single chunk with the plugin
   *
   * @param pluginId - Plugin ID
   * @param chunk - Stream chunk
   * @param file - Original file
   * @returns File output or null
   */
  private async processChunk(
    pluginId: string,
    chunk: StreamChunk,
    file: File
  ): Promise<FileOutput | null> {
    try {
      // Convert string chunk data to Uint8Array for FileInput
      const encoder = new TextEncoder()
      const contentBytes = encoder.encode(chunk.data)

      const fileInput: FileInput = {
        name: file.name,
        path: file.webkitRelativePath || file.name,
        size: chunk.bytes,
        mimeType: file.type,
        lastModified: file.lastModified || 0,
        content: contentBytes,
        metadata: {
          isChunk: true,
          chunkIndex: chunk.index,
          chunkOffset: chunk.offset,
          totalSize: file.size,
        },
      }

      return await this.loader.executePlugin(pluginId, fileInput)
    } catch (error) {
      console.error(`Error processing chunk ${chunk.index}:`, error)
      return null
    }
  }

  /**
   * Convert FileEntry to File
   *
   * @param entry - File entry
   * @returns File object
   */
  private async fileToFile(entry: FileEntry): Promise<File> {
    // For browser FileSystemHandle, we'd read the file
    // For now, return a mock File
    return new File([], entry.name, {
      type: entry.mimeType || 'application/octet-stream',
      lastModified: entry.lastModified,
    })
  }
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Execute multiple plugins on a file with streaming
 *
 * @param plugins - Plugins to execute
 * @param file - File to process
 * @param onProgress - Progress callback
 * @returns Map of plugin ID to result
 */
export async function executeMultipleStreaming(
  plugins: Plugin[],
  file: File,
  onProgress?: (progress: StreamPluginProgress) => void
): Promise<Map<string, StreamPluginResult>> {
  const results = new Map<string, StreamPluginResult>()
  const streamService = new PluginStreamService()

  // Execute plugins in parallel
  const executions = plugins.map((plugin) =>
    streamService.executeStream({
      pluginId: plugin.id,
      plugin,
      file,
      onProgress,
    })
  )

  const settled = await Promise.allSettled(executions)

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]
    const pluginId = plugins[i].id

    if (outcome.status === 'fulfilled') {
      results.set(pluginId, outcome.value)
    } else {
      // Handle failed execution
      results.set(pluginId, {
        pluginId,
        file: file.name,
        chunksProcessed: 0,
        totalBytes: file.size,
        duration: 0,
        partialResults: [],
        finalResult: null,
        errors: [outcome.reason?.message || 'Unknown error'],
      })
    }
  }

  return results
}

/**
 * Estimate processing time for streaming
 *
 * @param fileSize - Size of file
 * @param chunkSize - Chunk size
 * @param avgTimePerChunk - Average time per chunk
 * @returns Estimated time in ms
 */
export function estimateStreamingTime(
  fileSize: number,
  chunkSize: number,
  avgTimePerChunk: number
): number {
  const totalChunks = Math.ceil(fileSize / chunkSize)
  return totalChunks * avgTimePerChunk
}

/**
 * Format stream progress for display
 *
 * @param progress - Stream progress
 * @returns Formatted string
 */
export function formatStreamProgress(progress: StreamPluginProgress): string {
  const percentage = progress.percentage.toFixed(1)
  const mbProcessed = (progress.bytesProcessed / 1024 / 1024).toFixed(2)
  const mbTotal = (progress.totalBytes / 1024 / 1024).toFixed(2)

  return [
    `Plugin: ${progress.pluginId}`,
    `File: ${progress.file}`,
    `Progress: ${percentage}% (${mbProcessed}/${mbTotal} MB)`,
    `Chunk: ${progress.currentChunk}/${progress.totalChunks}`,
    `Status: ${progress.status}`,
  ].join(' | ')
}

//=============================================================================
// Singleton Instance
//=============================================================================

let streamServiceInstance: PluginStreamService | null = null

export function getPluginStreamService(): PluginStreamService {
  if (!streamServiceInstance) {
    streamServiceInstance = new PluginStreamService()
  }
  return streamServiceInstance
}
