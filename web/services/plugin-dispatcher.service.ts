/**
 * Plugin Dispatcher Service
 *
 * Distributes files to appropriate plugins based on their capabilities
 * and file properties (extension, size, etc.)
 */

import type { FileEntry, Plugin, PluginCapabilities } from '../types/plugin'

//=============================================================================
// Types
//=============================================================================

/**
 * File entry with metadata for plugin processing
 * Re-exported from types/plugin.ts
 */
export type { FileEntry } from '../types/plugin'

/**
 * Dispatch result mapping plugin ID to files to process
 */
export type DispatchPlan = Map<string, FileEntry[]>

/**
 * Filter options for dispatching
 */
export interface DispatchOptions {
  skipLargeFiles?: boolean
  maxFileSize?: number
  skipHiddenFiles?: boolean
}

//=============================================================================
// Plugin Dispatcher
//=============================================================================

export class PluginDispatcher {
  /**
   * Distribute files to plugins based on their capabilities
   *
   * @param files - Files to process
   * @param plugins - Available plugins
   * @param options - Dispatch options
   * @returns Map of plugin ID to files they should process
   */
  dispatch(files: FileEntry[], plugins: Plugin[], options?: DispatchOptions): DispatchPlan {
    const plan = new Map<string, FileEntry[]>()
    const opts: Required<DispatchOptions> = {
      skipLargeFiles: false,
      maxFileSize: Infinity,
      skipHiddenFiles: true,
      ...options,
    }

    for (const plugin of plugins) {
      const filesForPlugin = this.getFilesForPlugin(files, plugin, opts)
      if (filesForPlugin.length > 0) {
        plan.set(plugin.id, filesForPlugin)
      }
    }

    return plan
  }

  /**
   * Get files that a plugin should process
   *
   * @param files - All available files
   * @param plugin - Plugin to check
   * @param options - Dispatch options
   * @returns Filtered list of files
   */
  getFilesForPlugin(
    files: FileEntry[],
    plugin: Plugin,
    options: Required<DispatchOptions>
  ): FileEntry[] {
    let filtered = files

    // Apply metadata-only filter
    filtered = this.filterByCapability(filtered, plugin.metadata.capabilities)

    // Apply extension filter
    filtered = this.filterByExtension(filtered, plugin.metadata.capabilities)

    // Apply size filter
    filtered = this.filterBySize(
      filtered,
      plugin.metadata.capabilities.max_file_size,
      options.maxFileSize
    )

    // Apply hidden files filter
    if (options.skipHiddenFiles) {
      filtered = this.filterHiddenFiles(filtered)
    }

    return filtered
  }

  /**
   * Filter files by plugin capability (metadata vs content)
   */
  private filterByCapability(files: FileEntry[], capabilities: PluginCapabilities): FileEntry[] {
    // If plugin only needs metadata, all files are eligible
    if (capabilities.metadata_only) {
      return files
    }

    // If plugin requires content, all files are eligible
    // (content will be loaded when executing)
    return files
  }

  /**
   * Filter files by extension
   */
  private filterByExtension(files: FileEntry[], capabilities: PluginCapabilities): FileEntry[] {
    // If no extensions specified, accept all files
    if (capabilities.file_extensions.length === 0) {
      return files
    }

    // Filter by allowed extensions
    const allowedExtensions = new Set(capabilities.file_extensions.map((ext) => ext.toLowerCase()))

    return files.filter((file) => {
      const ext = file.extension?.toLowerCase() || ''
      return allowedExtensions.has(ext) || allowedExtensions.has('*')
    })
  }

  /**
   * Filter files by size limit
   */
  private filterBySize(
    files: FileEntry[],
    maxFileSize: number,
    globalMaxFileSize: number
  ): FileEntry[] {
    const limit = Math.min(maxFileSize, globalMaxFileSize)

    if (limit === 0) {
      return files // No limit
    }

    return files.filter((file) => file.size <= limit)
  }

  /**
   * Filter out hidden files
   */
  private filterHiddenFiles(files: FileEntry[]): FileEntry[] {
    return files.filter((file) => {
      // Check if file name starts with dot
      // Also check if any parent directory starts with dot
      const parts = file.path.split('/')
      return !parts.some((part) => part.startsWith('.') && part !== '.')
    })
  }

  /**
   * Count total files to be processed
   */
  getTotalFileCount(plan: DispatchPlan): number {
    let count = 0
    for (const files of plan.values()) {
      count += files.length
    }
    return count
  }

  /**
   * Get plugins that have files to process
   */
  getActivePlugins(plan: DispatchPlan): string[] {
    return Array.from(plan.keys())
  }

  /**
   * Check if any plugin has work to do
   */
  hasWork(plan: DispatchPlan): boolean {
    return plan.size > 0
  }
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Convert File objects to FileEntry format
 * @param files - File objects from file system access
 * @returns FileEntry array
 */
export function filesToFileEntries(files: File[]): FileEntry[] {
  return files.map((file) => {
    const path = file.webkitRelativePath || file.name
    const extension = path.includes('.') ? path.slice(path.lastIndexOf('.')) : ''

    return {
      path,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      lastModified: file.lastModified || 0,
      extension,
      type: 'file' as const,
    }
  })
}

/**
 * Group files by extension
 * @param files - File entries
 * @returns Map of extension to file entries
 */
export function groupByExtension(files: FileEntry[]): Map<string, FileEntry[]> {
  const groups = new Map<string, FileEntry[]>()

  for (const file of files) {
    const ext = file.extension || '(no extension)'
    if (!groups.has(ext)) {
      groups.set(ext, [])
    }
    groups.get(ext)!.push(file)
  }

  return groups
}

/**
 * Get file statistics
 */
export interface FileStats {
  totalFiles: number
  totalSize: number
  byExtension: Map<string, number>
}

export function getFileStats(files: FileEntry[]): FileStats {
  const byExtension = new Map<string, number>()

  let totalSize = 0

  for (const file of files) {
    totalSize += file.size

    const ext = file.extension || '(no extension)'
    byExtension.set(ext, (byExtension.get(ext) || 0) + 1)
  }

  return {
    totalFiles: files.length,
    totalSize,
    byExtension,
  }
}
