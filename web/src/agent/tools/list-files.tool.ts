/**
 * list_files tool - List directory contents in tree format.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { traverseDirectory } from '@/services/traversal.service'

export const listFilesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_files',
    description:
      'List files and directories in a tree format. Shows the directory structure with file sizes. Useful for understanding project layout.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Subdirectory to list (default: project root)',
        },
        max_depth: {
          type: 'number',
          description: 'Maximum depth to traverse (default: 3)',
        },
      },
    },
  },
}

function formatSize(bytes: number): string {
  if (bytes === 0) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export const listFilesExecutor: ToolExecutor = async (args, context) => {
  const subPath = (args.path as string) || ''
  const maxDepth = (args.max_depth as number) || 3

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected.' })
  }

  try {
    let searchHandle = context.directoryHandle
    if (subPath) {
      const parts = subPath.split('/').filter(Boolean)
      for (const part of parts) {
        searchHandle = await searchHandle.getDirectoryHandle(part)
      }
    }

    const entries: Array<{ path: string; type: string; size: number }> = []
    const MAX_ENTRIES = 500

    for await (const entry of traverseDirectory(searchHandle)) {
      // Check depth
      const depth = entry.path.split('/').length
      if (depth > maxDepth) continue

      entries.push({ path: entry.path, type: entry.type, size: entry.size })
      if (entries.length >= MAX_ENTRIES) break
    }

    if (entries.length === 0) {
      return subPath ? `Directory "${subPath}" is empty` : 'Project directory is empty'
    }

    // Build tree output
    const lines: string[] = []
    const rootName = subPath || context.directoryHandle.name
    lines.push(`${rootName}/`)

    for (const entry of entries) {
      const depth = entry.path.split('/').length
      const indent = '  '.repeat(depth)
      const name = entry.path.split('/').pop() || entry.path
      if (entry.type === 'directory') {
        lines.push(`${indent}${name}/`)
      } else {
        const size = formatSize(entry.size)
        lines.push(`${indent}${name}${size ? ` (${size})` : ''}`)
      }
    }

    const truncated =
      entries.length >= MAX_ENTRIES ? `\n... (limited to ${MAX_ENTRIES} entries)` : ''
    return lines.join('\n') + truncated
  } catch (error) {
    return JSON.stringify({
      error: `List failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
