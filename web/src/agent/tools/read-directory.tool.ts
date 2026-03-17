/**
 * read_directory tool - Unified directory reading tool.
 *
 * Combines glob and list_files functionality:
 * - With pattern: Search for files matching glob pattern
 * - Without pattern: List directory contents in tree format
 *
 * Smart mode detection based on parameters.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import micromatch from 'micromatch'
import {
  getStaticGlobPrefix,
  normalizeSubPath,
  parseBoundedInt,
  parseStringList,
  readDirectoryEntriesSorted,
  resolveDirectoryHandle,
  shouldSkipDirectory,
} from './file-discovery.helpers'

export const readDirectoryDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_directory',
    description:
      'Read directory contents. With pattern: search files matching glob. Without pattern: list tree structure.',
    parameters: {
      type: 'object',
      properties: {
        // Common parameters
        path: {
          type: 'string',
          description: 'Subdirectory to read (default: project root)',
        },
        // Glob mode parameters
        pattern: {
          type: 'string',
          description: 'Glob pattern to match files (e.g. "**/*.ts", "src/**/*.tsx"). If provided, searches for matching files.',
        },
        // List mode parameters
        max_depth: {
          type: 'number',
          description: 'Maximum depth to traverse (default: 2 for list, 20 for glob)',
        },
        maxDepth: {
          type: 'number',
          description: 'Alias of max_depth',
        },
        max_entries: {
          type: 'number',
          description: 'Maximum entries to return. If omitted, no entry-count limit is applied.',
        },
        maxEntries: {
          type: 'number',
          description: 'Alias of max_entries',
        },
        max_results: {
          type: 'number',
          description: 'Maximum results for glob search. If omitted, no result-count limit is applied.',
        },
        maxResults: {
          type: 'number',
          description: 'Alias of max_results',
        },
        include_sizes: {
          type: 'boolean',
          description: 'Include file sizes in list mode (default: false)',
        },
        includeSizes: {
          type: 'boolean',
          description: 'Alias of include_sizes',
        },
        include_ignored: {
          type: 'boolean',
          description: 'Include large ignored directories like node_modules/.git (default: false)',
        },
        includeIgnored: {
          type: 'boolean',
          description: 'Alias of include_ignored',
        },
        exclude_dirs: {
          type: 'array',
          description: 'Extra directory names to skip while traversing',
          items: { type: 'string' },
        },
        excludeDirs: {
          type: 'array',
          description: 'Alias of exclude_dirs',
          items: { type: 'string' },
        },
        deadline_ms: {
          type: 'number',
          description: 'Soft time budget in milliseconds (default: 25000)',
        },
        deadlineMs: {
          type: 'number',
          description: 'Alias of deadline_ms',
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

export const readDirectoryExecutor: ToolExecutor = async (args, context) => {
  const pattern = typeof args.pattern === 'string' ? args.pattern.trim() : ''

  // Smart mode detection: glob mode if pattern provided, list mode otherwise
  if (pattern) {
    return executeGlobMode(args, context, pattern)
  }
  return executeListMode(args, context)
}

/**
 * List mode - directory tree listing (from original list_files)
 */
async function executeListMode(args: Record<string, unknown>, context: unknown): Promise<string> {
  const toolContext = context as { directoryHandle?: FileSystemDirectoryHandle; abortSignal?: AbortSignal }
  const abortSignal = toolContext.abortSignal

  let subPath = ''
  try {
    subPath = normalizeSubPath(args.path)
  } catch {
    return JSON.stringify({ error: 'List failed: path cannot include ".."' })
  }

  const rawMaxDepth = args.max_depth ?? args.maxDepth
  const maxDepth = parseBoundedInt(rawMaxDepth, 2, 1, 10)
  const maxEntriesRaw = args.max_entries ?? args.maxEntries
  const maxEntries =
    typeof maxEntriesRaw === 'number' && Number.isFinite(maxEntriesRaw)
      ? parseBoundedInt(maxEntriesRaw, 200, 1, 50000)
      : undefined
  const deadlineMs = parseBoundedInt(args.deadline_ms ?? args.deadlineMs, 25000, 1000, 28000)
  const includeSizes = args.include_sizes === true || args.includeSizes === true
  const includeIgnored = args.include_ignored === true || args.includeIgnored === true
  const extraExcludes = parseStringList(args.exclude_dirs ?? args.excludeDirs)

  if (!toolContext.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected.' })
  }

  try {
    const { handle: searchHandle } = await resolveDirectoryHandle(toolContext.directoryHandle, subPath)
    const startedAt = Date.now()
    const deadlineAt = startedAt + deadlineMs
    const entries: Array<{ path: string; type: 'file' | 'directory'; size: number; depth: number }> = []
    const queue: Array<{ handle: FileSystemDirectoryHandle; path: string; depth: number }> = [
      { handle: searchHandle, path: '', depth: 0 },
    ]

    let isTruncated = false
    let timedOut = false

    while (queue.length > 0) {
      if (abortSignal?.aborted) {
        return JSON.stringify({ error: 'List failed: operation aborted' })
      }
      const current = queue.shift()!
      if (Date.now() > deadlineAt) {
        timedOut = true
        break
      }

      const handles = await readDirectoryEntriesSorted(current.handle)
      for (const handle of handles) {
        if (abortSignal?.aborted) {
          return JSON.stringify({ error: 'List failed: operation aborted' })
        }
        if (Date.now() > deadlineAt) {
          timedOut = true
          break
        }

        const childDepth = current.depth + 1
        if (childDepth > maxDepth) continue

        const relPath = current.path ? `${current.path}/${handle.name}` : handle.name
        if (handle.kind === 'directory') {
          if (shouldSkipDirectory(handle.name, includeIgnored, extraExcludes)) continue
          entries.push({ path: relPath, type: 'directory', size: 0, depth: childDepth })
          queue.push({
            handle: handle as FileSystemDirectoryHandle,
            path: relPath,
            depth: childDepth,
          })
        } else {
          let size = 0
          if (includeSizes) {
            try {
              if (abortSignal?.aborted) {
                return JSON.stringify({ error: 'List failed: operation aborted' })
              }
              const file = await (handle as FileSystemFileHandle).getFile()
              size = file.size
            } catch {
              size = 0
            }
          }
          entries.push({ path: relPath, type: 'file', size, depth: childDepth })
        }

        if (maxEntries !== undefined && entries.length >= maxEntries) {
          isTruncated = true
          break
        }
      }
      if (isTruncated || timedOut) break
    }

    if (timedOut) {
      return JSON.stringify({
        error: 'deadline_exceeded',
        message: `List scan exceeded deadline ${deadlineMs}ms. Narrow path or increase deadline_ms.`,
        scannedEntries: entries.length,
      })
    }

    if (entries.length === 0) {
      return subPath ? `Directory "${subPath}" is empty` : 'Project directory is empty'
    }

    // Build tree output
    const lines: string[] = []

    for (const entry of entries) {
      const indent = '  '.repeat(entry.depth)
      const name = entry.path.split('/').pop() || entry.path
      if (entry.type === 'directory') {
        lines.push(`${indent}${name}/`)
      } else {
        const size = formatSize(entry.size)
        lines.push(`${indent}${name}${size ? ` (${size})` : ''}`)
      }
    }

    const suffixes: string[] = []
    if (isTruncated && maxEntries !== undefined) {
      suffixes.push(`... (limited to ${maxEntries} entries)`)
    }
    return lines.join('\n') + (suffixes.length > 0 ? `\n${suffixes.join('\n')}` : '')
  } catch (error) {
    return JSON.stringify({
      error: `List failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

/**
 * Glob mode - file pattern search (from original glob)
 */
async function executeGlobMode(
  args: Record<string, unknown>,
  context: unknown,
  pattern: string
): Promise<string> {
  const toolContext = context as { directoryHandle?: FileSystemDirectoryHandle; abortSignal?: AbortSignal }
  const abortSignal = toolContext.abortSignal

  let subPath = ''
  try {
    subPath = normalizeSubPath(args.path)
  } catch {
    return JSON.stringify({ error: 'Glob search failed: path cannot include ".."' })
  }

  const maxResultsRaw = args.max_results ?? args.maxResults ?? args.max_entries ?? args.maxEntries
  const maxResults =
    typeof maxResultsRaw === 'number' && Number.isFinite(maxResultsRaw)
      ? parseBoundedInt(maxResultsRaw, 1, 1, 100000)
      : undefined
  const maxDepth = parseBoundedInt(args.max_depth ?? args.maxDepth, 20, 1, 64)
  const deadlineMs = parseBoundedInt(args.deadline_ms ?? args.deadlineMs, 25000, 1000, 28000)
  const includeIgnored = args.include_ignored === true || args.includeIgnored === true
  const extraExcludes = parseStringList(args.exclude_dirs ?? args.excludeDirs)

  if (!toolContext.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected.' })
  }

  try {
    const staticPrefix = subPath ? '' : getStaticGlobPrefix(pattern)
    const effectiveRoot = subPath || staticPrefix
    const { handle: searchHandle, exists } = await resolveDirectoryHandle(
      toolContext.directoryHandle,
      effectiveRoot,
      { allowMissing: !subPath && !!staticPrefix }
    )
    if (!exists) {
      return `No files matching pattern "${pattern}"`
    }

    const startedAt = Date.now()
    const deadlineAt = startedAt + deadlineMs
    const matches: string[] = []
    const stack: Array<{ handle: FileSystemDirectoryHandle; fullPath: string; localPath: string; depth: number }> =
      [{ handle: searchHandle, fullPath: effectiveRoot, localPath: '', depth: 0 }]
    let isTruncated = false
    let timedOut = false

    while (stack.length > 0) {
      if (abortSignal?.aborted) {
        return JSON.stringify({ error: 'Glob search failed: operation aborted' })
      }
      const current = stack.pop()!
      if (Date.now() > deadlineAt) {
        timedOut = true
        break
      }

      const handles = await readDirectoryEntriesSorted(current.handle)
      for (const handle of handles) {
        if (abortSignal?.aborted) {
          return JSON.stringify({ error: 'Glob search failed: operation aborted' })
        }
        if (Date.now() > deadlineAt) {
          timedOut = true
          break
        }

        const nextDepth = current.depth + 1
        if (nextDepth > maxDepth) continue

        const fullPath = current.fullPath ? `${current.fullPath}/${handle.name}` : handle.name
        const localPath = current.localPath ? `${current.localPath}/${handle.name}` : handle.name

        if (handle.kind === 'directory') {
          if (shouldSkipDirectory(handle.name, includeIgnored, extraExcludes)) continue
          stack.push({
            handle: handle as FileSystemDirectoryHandle,
            fullPath,
            localPath,
            depth: nextDepth,
          })
          continue
        }

        if (micromatch.isMatch(fullPath, pattern) || micromatch.isMatch(localPath, pattern)) {
          matches.push(fullPath)
          if (maxResults !== undefined && matches.length >= maxResults) {
            isTruncated = true
            break
          }
        }
      }
      if (isTruncated || timedOut) break
    }

    if (timedOut) {
      return JSON.stringify({
        error: 'deadline_exceeded',
        message: `Glob scan exceeded deadline ${deadlineMs}ms. Narrow pattern/path or increase deadline_ms.`,
        matchedSoFar: matches.length,
      })
    }

    if (matches.length === 0) {
      return `No files matching pattern "${pattern}"${subPath ? ` in ${subPath}` : ''}`
    }

    const suffixes: string[] = []
    if (isTruncated && maxResults !== undefined) {
      suffixes.push(`... (limited to ${maxResults} results)`)
    }
    return matches.join('\n') + (suffixes.length > 0 ? `\n${suffixes.join('\n')}` : '')
  } catch (error) {
    return JSON.stringify({
      error: `Glob search failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
