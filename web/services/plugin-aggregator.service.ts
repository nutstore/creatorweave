/**
 * Plugin Result Aggregator Service
 *
 * Aggregates results from multiple plugins and provides
 * unified access to analysis results.
 */

import type { FileOutput, PluginResult, ProcessingStatus } from '../types/plugin'

type MetricsWithFileOutputs = {
  fileOutputs?: unknown
}

type OutputEntry = {
  path: string
  name?: string
  size?: number
  status: 'Success' | 'Skipped' | 'Error'
  data: unknown
  error?: string
}

function isOutputEntry(value: unknown): value is OutputEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  const v = value as Record<string, unknown>
  return (
    typeof v.path === 'string' &&
    (v.status === 'Success' || v.status === 'Skipped' || v.status === 'Error')
  )
}

//=============================================================================
// Types
//=============================================================================

/**
 * Aggregated result for a single file across all plugins
 */
export interface AggregatedFileResult {
  path: string
  name: string
  size: number
  pluginResults: Map<string, FileOutput> // pluginId -> output
}

/**
 * Summary of all plugin execution
 */
export interface AggregationSummary {
  totalPlugins: number
  totalFiles: number
  totalProcessed: number
  totalSkipped: number
  totalErrors: number
  pluginsWithErrors: string[]
  duration: number
}

/**
 * Complete aggregated analysis result
 */
export interface AggregateResult {
  summary: AggregationSummary
  byFile: Map<string, AggregatedFileResult>
  byPlugin: Map<string, PluginResult>
}

/**
 * Merge strategy for conflicting results
 */
export type MergeStrategy =
  | 'all' // Keep all results
  | 'first' // Keep first successful result
  | 'last' // Keep last successful result
  | 'majority' // Keep result agreed by majority

//=============================================================================
// Plugin Aggregator
//=============================================================================

export class PluginResultAggregator {
  /**
   * Aggregate results from multiple plugins
   *
   * @param pluginResults - Map of plugin ID to PluginResult
   * @param fileCount - Total number of files processed
   * @param duration - Total execution time
   * @returns Aggregated result
   */
  aggregate(
    pluginResults: Map<string, PluginResult>,
    fileCount: number,
    duration: number
  ): AggregateResult {
    const byPlugin = new Map(pluginResults)
    const byFile = this.aggregateByFile(pluginResults, fileCount)
    const summary = this.buildSummary(pluginResults, fileCount, duration)

    return {
      summary,
      byFile,
      byPlugin,
    }
  }

  /**
   * Aggregate results by file path
   *
   * @param pluginResults - Map of plugin ID to PluginResult
   * @param fileCount - Total files
   * @returns Map of file path to aggregated result
   */
  aggregateByFile(
    pluginResults: Map<string, PluginResult>,
    _fileCount: number
  ): Map<string, AggregatedFileResult> {
    const byFile = new Map<string, AggregatedFileResult>()

    // For each plugin, collect its per-file results
    // Note: PluginResult has metrics but not per-file outputs
    // We'd need to track this differently in production

    for (const [pluginId, result] of pluginResults) {
      // Extract per-file results from summary/warnings/metrics
      // For now, create placeholder aggregations
      // In production, PluginResult would include a fileOutputs array

      if (result.metrics && typeof result.metrics === 'object') {
        const metrics = result.metrics as MetricsWithFileOutputs
        if (Array.isArray(metrics.fileOutputs)) {
          for (const output of metrics.fileOutputs) {
            if (!isOutputEntry(output)) {
              continue
            }
            if (!byFile.has(output.path)) {
              byFile.set(output.path, {
                path: output.path,
                name: output.name || '',
                size: output.size || 0,
                pluginResults: new Map(),
              })
            }
            byFile.get(output.path)!.pluginResults.set(pluginId, output)
          }
        }
      }
    }

    return byFile
  }

  /**
   * Get results for a specific file across all plugins
   *
   * @param filePath - File path
   * @param aggregateResult - Aggregated results
   * @returns File results from all plugins or undefined
   */
  getFileResults(
    filePath: string,
    aggregateResult: AggregateResult
  ): AggregatedFileResult | undefined {
    return aggregateResult.byFile.get(filePath)
  }

  /**
   * Get results for a specific plugin across all files
   *
   * @param pluginId - Plugin ID
   * @param aggregateResult - Aggregated results
   * @returns Plugin result or undefined
   */
  getPluginResult(pluginId: string, aggregateResult: AggregateResult): PluginResult | undefined {
    return aggregateResult.byPlugin.get(pluginId)
  }

  /**
   * Merge conflicting results from multiple plugins
   *
   * @param outputs - File outputs from different plugins
   * @param strategy - How to merge conflicts
   * @returns Merged output
   */
  mergeConflictingResults(
    outputs: FileOutput[],
    strategy: MergeStrategy = 'first'
  ): FileOutput | null {
    const successful = outputs.filter((o) => o.status === 'Success')

    if (successful.length === 0) {
      return null
    }

    switch (strategy) {
      case 'first':
        return successful[0]

      case 'last':
        return successful[successful.length - 1]

      case 'majority':
        // Group by data and find most common
        {
          const groups = new Map<string, number>()
          for (const output of successful) {
            const key = JSON.stringify(output.data)
            groups.set(key, (groups.get(key) || 0) + 1)
          }

          const majorityKey = Array.from(groups.entries()).sort((a, b) => b[1] - a[1])[0][0]

          return successful.find((o) => JSON.stringify(o.data) === majorityKey) || successful[0]
        }

      default:
        return successful[0]
    }
  }

  /**
   * Search for a specific value across all plugin results
   *
   * @param aggregateResult - Aggregated results
   * @param searchFn - Search function that returns true for match
   * @returns Array of matching results
   */
  searchResults(
    aggregateResult: AggregateResult,
    searchFn: (result: AggregatedFileResult) => boolean
  ): AggregatedFileResult[] {
    const matches: AggregatedFileResult[] = []

    for (const result of aggregateResult.byFile.values()) {
      if (searchFn(result)) {
        matches.push(result)
      }
    }

    return matches
  }

  /**
   * Find files with specific status across all plugins
   */
  findFilesWithStatus(
    aggregateResult: AggregateResult,
    status: ProcessingStatus
  ): AggregatedFileResult[] {
    return this.searchResults(aggregateResult, (result) => {
      return Array.from(result.pluginResults.values()).some((output) => output.status === status)
    })
  }

  /**
   * Get all files that were skipped
   */
  getSkippedFiles(aggregateResult: AggregateResult): AggregatedFileResult[] {
    return this.findFilesWithStatus(aggregateResult, 'Skipped')
  }

  /**
   * Get all files that had errors
   */
  getErrorFiles(aggregateResult: AggregateResult): AggregatedFileResult[] {
    return this.findFilesWithStatus(aggregateResult, 'Error')
  }

  /**
   * Build aggregation summary
   */
  private buildSummary(
    pluginResults: Map<string, PluginResult>,
    fileCount: number,
    duration: number
  ): AggregationSummary {
    let totalProcessed = 0
    let totalSkipped = 0
    let totalErrors = 0
    const pluginsWithErrors: string[] = []

    for (const [pluginId, result] of pluginResults) {
      totalProcessed += result.filesProcessed
      totalSkipped += result.filesSkipped
      totalErrors += result.filesWithErrors

      if (result.filesWithErrors > 0) {
        pluginsWithErrors.push(pluginId)
      }
    }

    return {
      totalPlugins: pluginResults.size,
      totalFiles: fileCount,
      totalProcessed,
      totalSkipped,
      totalErrors,
      pluginsWithErrors,
      duration,
    }
  }

  /**
   * Export results to a format suitable for UI display
   *
   * @param aggregateResult - Aggregated results
   * @param format - Export format ("json" | "csv" | "summary")
   * @returns Formatted results
   */
  exportResults(
    aggregateResult: AggregateResult,
    format: 'json' | 'csv' | 'summary' = 'json'
  ): string | object {
    switch (format) {
      case 'json':
        return JSON.stringify(aggregateResult, null, 2)

      case 'csv':
        return this.exportToCSV(aggregateResult)

      case 'summary':
        return this.exportToSummary(aggregateResult)

      default:
        return JSON.stringify(aggregateResult, null, 2)
    }
  }

  /**
   * Export to CSV format
   */
  private exportToCSV(aggregateResult: AggregateResult): string {
    const lines: string[] = []
    lines.push(['Path', 'Size', 'Plugins', 'Statuses'].join(','))

    for (const [path, result] of aggregateResult.byFile) {
      const plugins = Array.from(result.pluginResults.keys()).join(';')
      const statuses = Array.from(result.pluginResults.values())
        .map((o) => o.status)
        .join(';')

      lines.push(`"${path}",${result.size},${plugins},"${statuses}"`)
    }

    return lines.join('\n')
  }

  /**
   * Export to summary format
   */
  private exportToSummary(aggregateResult: AggregateResult): object {
    const summary = aggregateResult.summary

    return {
      overview: {
        totalPlugins: summary.totalPlugins,
        totalFiles: summary.totalFiles,
        totalProcessed: summary.totalProcessed,
        totalErrors: summary.totalErrors,
        duration: summary.duration,
      },
      plugins: Array.from(aggregateResult.byPlugin.entries()).map(([id, result]) => ({
        id,
        summary: result.summary,
        filesProcessed: result.filesProcessed,
        filesSkipped: result.filesSkipped,
        filesWithErrors: result.filesWithErrors,
      })),
    }
  }

  /**
   * Calculate statistics about the aggregation
   */
  getStatistics(aggregateResult: AggregateResult): {
    totalFiles: number
    totalPlugins: number
    successRate: number
    errorRate: number
    avgTimePerFile: number
    mostSuccessfulPlugin: string
  } {
    const summary = aggregateResult.summary

    return {
      totalFiles: summary.totalFiles,
      totalPlugins: summary.totalPlugins,
      successRate: summary.totalFiles > 0 ? summary.totalProcessed / summary.totalFiles : 0,
      errorRate: summary.totalFiles > 0 ? summary.totalErrors / summary.totalFiles : 0,
      avgTimePerFile: summary.totalFiles > 0 ? summary.duration / summary.totalFiles : 0,
      mostSuccessfulPlugin: this.findMostSuccessfulPlugin(aggregateResult.byPlugin),
    }
  }

  /**
   * Find the plugin with most successful results
   */
  private findMostSuccessfulPlugin(byPlugin: Map<string, PluginResult>): string {
    let maxSuccess = -1
    let bestPlugin = ''

    for (const [id, result] of byPlugin) {
      const successRate =
        result.filesProcessed > 0
          ? result.filesProcessed /
            (result.filesProcessed + result.filesSkipped + result.filesWithErrors)
          : 0

      if (successRate > maxSuccess) {
        maxSuccess = successRate
        bestPlugin = id
      }
    }

    return bestPlugin
  }

  /**
   * Compare two aggregations and find differences
   */
  compare(
    before: AggregateResult,
    after: AggregateResult
  ): {
    added: string[]
    removed: string[]
    modified: string[]
  } {
    const beforePaths = new Set(before.byFile.keys())
    const afterPaths = new Set(after.byFile.keys())

    const added: string[] = []
    const removed: string[] = []
    const modified: string[] = []

    for (const path of afterPaths) {
      if (!beforePaths.has(path)) {
        added.push(path)
      }
    }

    for (const path of beforePaths) {
      if (!afterPaths.has(path)) {
        removed.push(path)
      }
    }

    // Find modified files by comparing outputs
    for (const path of afterPaths) {
      if (beforePaths.has(path)) {
        const beforeOutput = before.byFile.get(path)
        const afterOutput = after.byFile.get(path)

        // Simple string comparison of JSON data
        const beforeJson = JSON.stringify(beforeOutput?.pluginResults)
        const afterJson = JSON.stringify(afterOutput?.pluginResults)

        if (beforeJson !== afterJson) {
          modified.push(path)
        }
      }
    }

    return { added, removed, modified }
  }
}
