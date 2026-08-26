/**
 * WASM Bridge Tool - bridges existing WASM plugins as Agent tools.
 *
 * Converts PluginMetadata → ToolDefinition automatically,
 * and wraps PluginExecutorService execution as a ToolExecutor.
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'
import type { PluginMetadata, PluginInstance, FileEntry, Plugin } from '@/types/plugin'
import { getPluginLoader } from '@/services/plugin-loader.service'
import { PluginExecutorService } from '@/services/plugin-executor.service'
import { traverseDirectory } from '@/services/traversal.service'
import { resolveNativeDirectoryHandleForPath } from './tool-utils'

/**
 * Convert a WASM plugin's metadata into an OpenAI-compatible ToolDefinition.
 */
export function pluginToToolDefinition(metadata: PluginMetadata): ToolDefinition {
  const extensions = metadata.capabilities.file_extensions
  const extList = extensions.length > 0 ? extensions.join(', ') : 'All files'

  return {
    type: 'function',
    function: {
      name: `wasm_plugin_${metadata.id}`,
      description: [
        `[WASM Plugin] ${metadata.name} (v${metadata.version})`,
        metadata.description,
        `Supported file types: ${extList}`,
      ].join(' — '),
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            description: 'List of file paths to process',
            items: { type: 'string' },
          },
          pattern: {
            type: 'string',
            description: 'File glob pattern (e.g. "src/**/*.ts"), mutually exclusive with paths',
          },
        },
      },
    },
  }
}

/**
 * Create a ToolExecutor that bridges to the existing PluginExecutorService.
 */
export function createPluginBridgeExecutor(pluginId: string): ToolExecutor {
  return async (args: Record<string, unknown>, context: ToolContext): Promise<string> => {
    const loader = getPluginLoader()
    const instance = loader.getPlugin(pluginId)
    if (!instance) {
      return JSON.stringify({ error: `Plugin not loaded: ${pluginId}` })
    }
    if (instance.state !== 'Loaded' && instance.state !== 'Active') {
      return JSON.stringify({ error: `Plugin not ready (state: ${instance.state})` })
    }

    const { handle: dirHandle } = await resolveNativeDirectoryHandleForPath('', context.directoryHandle, context.workspaceId)
    if (!dirHandle) {
      return JSON.stringify({ error: 'No project folder selected, cannot execute plugin' })
    }

    // Resolve file list from paths or pattern
    const files = await resolveFiles(args, dirHandle, instance)
    if (files.length === 0) {
      return JSON.stringify({ error: 'No matching files found' })
    }

    // Execute via PluginExecutorService
    const executor = new PluginExecutorService()
    const plugin: Plugin = { id: pluginId, metadata: instance.metadata }

    const result = await executor.execute(plugin, files, {
      timeoutMs: instance.metadata.resource_limits?.max_execution_time ?? 30000,
    })

    // Format result for Agent consumption
    return formatExecutionResult(result, instance.metadata)
  }
}

/**
 * Resolve file list from args (paths array or glob pattern).
 */
async function resolveFiles(
  args: Record<string, unknown>,
  dirHandle: FileSystemDirectoryHandle,
  instance: PluginInstance
): Promise<FileEntry[]> {
  const paths = args.paths as string[] | undefined
  const pattern = args.pattern as string | undefined
  const capabilities = instance.metadata.capabilities
  const extensions = capabilities.file_extensions

  if (paths && Array.isArray(paths) && paths.length > 0) {
    // Resolve specific paths to FileEntry
    const entries: FileEntry[] = []
    for (const path of paths) {
      try {
        const entry = await pathToFileEntry(dirHandle, path)
        if (entry) entries.push(entry)
      } catch {
        // Skip files that can't be resolved
      }
    }
    return entries
  }

  if (pattern || extensions.length > 0) {
    // Traverse directory and filter by pattern/extensions
    const allFiles: FileEntry[] = []
    const micromatch = await import('micromatch')

    for await (const item of traverseDirectory(dirHandle)) {
      if (item.type !== 'file') continue

      // Check extension filter from plugin capabilities
      if (extensions.length > 0) {
        const ext = item.name.split('.').pop()?.toLowerCase() || ''
        if (!extensions.some((e: string) => e.replace('.', '') === ext)) continue
      }

      // Check glob pattern if provided
      if (pattern && !micromatch.isMatch(item.path, pattern)) continue

      allFiles.push({
        name: item.name,
        path: item.path,
        size: item.size ?? 0,
        type: 'file',
        lastModified: item.lastModified ?? Date.now(),
      })

      // Limit to 500 files
      if (allFiles.length >= 500) break
    }
    return allFiles
  }

  return []
}

/**
 * Convert a file path to a FileEntry by resolving through directory handles.
 */
async function pathToFileEntry(
  dirHandle: FileSystemDirectoryHandle,
  path: string
): Promise<FileEntry | null> {
  const parts = path.split('/').filter(Boolean)
  let current: FileSystemDirectoryHandle = dirHandle

  for (let i = 0; i < parts.length - 1; i++) {
    try {
      current = await current.getDirectoryHandle(parts[i])
    } catch {
      return null
    }
  }

  const fileName = parts[parts.length - 1]
  try {
    const fileHandle = await current.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return {
      name: file.name,
      path,
      size: file.size,
      type: 'file',
      lastModified: file.lastModified,
    }
  } catch {
    return null
  }
}

/**
 * Format PluginExecutionResult into a readable string for the Agent.
 */
function formatExecutionResult(
  result: import('@/services/plugin-executor.service').PluginExecutionResult,
  metadata: PluginMetadata
): string {
  const lines: string[] = [
    `## ${metadata.name} Plugin Execution Result`,
    '',
    `- Files processed: ${result.results.length}`,
    `- Duration: ${result.duration}ms`,
  ]

  if (result.errors.length > 0) {
    lines.push(`- Errors: ${result.errors.length}`)
  }

  if (result.finalResult) {
    const fr = result.finalResult
    lines.push('')
    lines.push(`### Summary`)
    lines.push(fr.summary)
    lines.push('')
    lines.push(`- Success: ${fr.filesProcessed}`)
    lines.push(`- Skipped: ${fr.filesSkipped}`)
    lines.push(`- Failed: ${fr.filesWithErrors}`)

    if (fr.metrics) {
      lines.push('')
      lines.push('### Metrics')
      lines.push('```json')
      lines.push(JSON.stringify(fr.metrics, null, 2))
      lines.push('```')
    }

    if (fr.warnings.length > 0) {
      lines.push('')
      lines.push('### Warnings')
      for (const w of fr.warnings) {
        lines.push(`- ${w}`)
      }
    }
  }

  // Include per-file results summary (up to 20)
  const fileResults = result.results.filter((r) => r.output)
  if (fileResults.length > 0) {
    lines.push('')
    lines.push('### File Details (first 20)')
    for (const fr of fileResults.slice(0, 20)) {
      const status = fr.success ? '✓' : '✗'
      lines.push(`${status} ${fr.path} (${fr.duration}ms)`)
    }
    if (fileResults.length > 20) {
      lines.push(`... ${fileResults.length - 20} more files`)
    }
  }

  return lines.join('\n')
}
