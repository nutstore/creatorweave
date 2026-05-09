import type { ToolDefinition, ToolExecutor } from './tool-types'
import { getSearchWorkerManager } from '@/workers/search-worker-manager'
import type { PendingFileOverlay, SearchInDirectoryResult } from '@/workers/search-worker-manager'
import { useOPFSStore } from '@/store/opfs.store'
import { getWorkspaceManager } from '@/opfs'
import { resolveNativeDirectoryHandleForPath } from './tool-utils'
import { toolErrorJson, toolOkJson } from './tool-envelope'
import { checkSearchLoop } from './loop-guard'
import { resolveVfsTarget } from './vfs-resolver'
import { rewritePythonMountPathForNonPythonTool } from './path-guards'

function looksRegexLikeQuery(query: string): boolean {
  // Guard against common LLM misuse where regex operators are passed while regex=false.
  return query.includes('|') || query.includes('.*')
}

function parseStructuredError(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof Error) || !error.message) return null
  try {
    const parsed = JSON.parse(error.message) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Collect pending file overlays from OPFS for the current workspace.
 * This ensures search results are consistent with the read tool,
 * which reads from OPFS cache for files with pending modifications.
 */
async function collectPendingOverlays(
  workspaceId?: string | null,
  projectId?: string | null
): Promise<Record<string, PendingFileOverlay>> {
  try {
    const pendingChanges = useOPFSStore.getState().getPendingChanges()
    if (!pendingChanges || pendingChanges.length === 0) return {}

    // Get workspace to read cached content
    let targetWorkspaceId = workspaceId
    if (!targetWorkspaceId) {
      const { useWorkspaceStore } = await import('@/store/workspace.store')
      targetWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
    }
    if (!targetWorkspaceId) return {}

    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(targetWorkspaceId)
    if (!workspace) return {}

    const overlays: Record<string, PendingFileOverlay> = {}

    for (const change of pendingChanges) {
      if (change.type === 'delete') {
        overlays[change.path] = { deleted: true }
        continue
      }

      // For modify/create, read the cached content from OPFS
      try {
        const result = await workspace.readFile(change.path, null, { projectId })
        if (typeof result.content === 'string') {
          overlays[change.path] = { content: result.content }
        }
      } catch {
        // If we can't read the cached content, skip the overlay
        // and let the worker fall back to disk content
      }
    }

    return overlays
  } catch {
    // Non-critical: if overlay collection fails, search still works from disk
    return {}
  }
}

/**
 * Get all root handles for the current project (multi-root aware).
 */
async function getAllRootHandles(
  context: { workspaceId?: string | null; directoryHandle?: FileSystemDirectoryHandle | null; projectId?: string | null }
): Promise<Map<string, FileSystemDirectoryHandle>> {
  try {
    const manager = await getWorkspaceManager()
    const workspaceId = context.workspaceId
    if (workspaceId) {
      const workspace = await manager.getWorkspace(workspaceId)
      if (workspace) {
        const handles = await workspace.getAllNativeDirectoryHandles(context.projectId)
        if (handles.size > 0) return handles
      }
    }
  } catch {
    // Fall through
  }
  // Fallback: single root from context
  if (context.directoryHandle) {
    return new Map([['', context.directoryHandle]])
  }
  return new Map()
}

/**
 * Search all roots sequentially and merge results.
 * Prepends root prefix to each hit's path for correct routing.
 */
async function searchAllRoots(
  manager: ReturnType<typeof getSearchWorkerManager>,
  rootHandles: Map<string, FileSystemDirectoryHandle>,
  baseOptions: Omit<Parameters<typeof manager.searchInDirectory>[1], never>,
  maxResults: number
): Promise<SearchInDirectoryResult> {
  const merged: SearchInDirectoryResult = {
    results: [],
    totalMatches: 0,
    scannedFiles: 0,
    skippedFiles: 0,
    truncated: false,
    deadlineExceeded: false,
  }
  let remaining = maxResults

  for (const [rootName, handle] of rootHandles) {
    if (remaining <= 0) {
      merged.truncated = true
      break
    }

    try {
      const opts = { ...baseOptions, maxResults: remaining }
      const rootResult = await manager.searchInDirectory(handle, opts)

      // Prepend root prefix to paths
      if (rootName) {
        for (const hit of rootResult.results) {
          hit.path = `${rootName}/${hit.path}`
        }
      }

      merged.results.push(...rootResult.results)
      merged.totalMatches += rootResult.totalMatches
      merged.scannedFiles += rootResult.scannedFiles
      merged.skippedFiles += rootResult.skippedFiles
      if (rootResult.truncated) merged.truncated = true
      if (rootResult.deadlineExceeded) merged.deadlineExceeded = true

      remaining -= rootResult.results.length
    } catch {
      // Skip roots that fail (e.g., permission denied)
    }
  }

  return merged
}

export const searchDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search',
    description:
      'Search keyword/pattern in file contents and return matched file/line locations. ' +
      'Use this before read() when you need to locate relevant code or text quickly.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Required search query (use mode="literal" for plain text or mode="regex" for patterns).',
        },
        path: {
          type: 'string',
          description: 'Optional subdirectory path to search within. In multi-root projects, use root prefix (e.g., "frontend/src").',
        },
        glob: {
          type: 'string',
          description: 'Optional file filter glob (example: "**/*.{ts,tsx}").',
        },
        mode: {
          type: 'string',
          enum: ['literal', 'regex'],
          description: 'Search mode: "literal" for plain text, "regex" for regular expressions.',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Case-sensitive matching. Default false.',
        },
        whole_word: {
          type: 'boolean',
          description: 'Match whole word only. Default false.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum matches to return. Default 50.',
        },
        context_lines: {
          type: 'number',
          description: 'Context lines before/after matched line in preview. Default 0.',
        },
        deadline_ms: {
          type: 'number',
          description: 'Search time budget in milliseconds. Default 25000.',
        },
        max_file_size: {
          type: 'number',
          description: 'Skip files larger than this byte size. Default 1MB.',
        },
        include_ignored: {
          type: 'boolean',
          description: 'Include ignored directories like node_modules/.git. Default false.',
        },
        exclude_dirs: {
          type: 'array',
          description: 'Extra directory names to exclude.',
          items: { type: 'string' },
        },
      },
      required: ['query', 'mode'],
    },
  },
}

export const searchExecutor: ToolExecutor = async (args, context) => {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    return toolErrorJson('search', 'invalid_arguments', 'query is required')
  }
  const mode = typeof args.mode === 'string' ? args.mode : ''
  if (mode !== 'literal' && mode !== 'regex') {
    return toolErrorJson('search', 'invalid_arguments', 'mode is required and must be one of: literal, regex')
  }
  const useRegex = mode === 'regex'
  if (!useRegex && looksRegexLikeQuery(query)) {
    return toolErrorJson(
      'search',
      'invalid_arguments',
      'query looks like regex but mode="literal". Use mode="regex" for patterns like "|" or ".*".',
      { hint: 'If you intend a regex OR/pattern search, set mode="regex".' }
    )
  }

  // 根据 contextUsage 智能调整 max_results
  let userMaxResults = typeof args.max_results === 'number' ? args.max_results : 50

  // 如果上下文已经用了 50% 以上，进一步减少默认结果数量
  if (context.contextUsage && args.max_results === undefined) {
    const usageRatio = context.contextUsage.usedTokens / context.contextUsage.maxTokens
    if (usageRatio > 0.6) {
      userMaxResults = 25
    } else if (usageRatio > 0.4) {
      userMaxResults = 35
    }
  }

  // Loop guard: check consecutive search counter before searching
  const rawSearchPath = typeof args.path === 'string' ? args.path : ''
  const rewrittenSearchPath = rewritePythonMountPathForNonPythonTool(rawSearchPath)
  const searchPath = rewrittenSearchPath?.rewritten ? rewrittenSearchPath.rewrittenPath : rawSearchPath
  const searchGlob = typeof args.glob === 'string' ? args.glob : undefined
  const loopCheck = checkSearchLoop(context, query, searchPath, searchGlob, 0, userMaxResults)
  if (loopCheck.isBlocked) {
    return toolErrorJson(
      'search',
      'loop_blocked',
      `BLOCKED: You have run this exact search ${loopCheck.consecutive} times in a row. ` +
        'The results have NOT changed. You already have this information. ' +
        'STOP re-searching and proceed with your task.',
      { hint: 'Stop searching and proceed with your task using the results you already have.' }
    )
  }

  let directoryHandle: FileSystemDirectoryHandle | null = null
  let vfsSubPath = '' // sub-path within the resolved VFS namespace

  // VFS path support: resolve vfs:// URIs to directory handles via backends
  if (searchPath.startsWith('vfs://')) {
    try {
      const resolved = await resolveVfsTarget(searchPath, context, 'list', { allowEmptyPath: true })
      vfsSubPath = resolved.path
      const backendHandle = await resolved.backend.getDirectoryHandle?.()
      if (!backendHandle) {
        return toolErrorJson('search', 'no_active_workspace', `VFS backend '${resolved.kind}' does not support directory handles`)
      }
      directoryHandle = backendHandle
    } catch (error) {
      return toolErrorJson('search', 'path_not_found', `Failed to resolve VFS path: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    // Multi-root aware path resolution: always resolve to handle path prefix stripping
    const { handle, nativePath } = await resolveNativeDirectoryHandleForPath(
      searchPath, context.directoryHandle, context.workspaceId
    )
    directoryHandle = handle
    vfsSubPath = nativePath
  }

  if (!directoryHandle) {
    return toolErrorJson('search', 'no_active_workspace', 'No active workspace')
  }

  try {
    const manager = getSearchWorkerManager()
    const userContextLines = typeof args.context_lines === 'number' ? args.context_lines : 0

    // 当结果数量多时，自动减少上下文行数以控制返回大小
    let contextLines = userContextLines
    if (userMaxResults > 100 && userContextLines > 3) {
      // 结果很多且上下文很多时，降低上下文行数
      contextLines = Math.min(userContextLines, 3)
    }

    // Collect pending overlays from OPFS to ensure search consistency with read tool
    const pendingOverlays = await collectPendingOverlays(context.workspaceId, context.projectId)

    // Build search options (shared across all roots)
    const buildSearchOptions = (subPath?: string) => ({
      query,
      path: subPath,
      glob: typeof args.glob === 'string' ? args.glob : undefined,
      regex: useRegex,
      caseSensitive: args.case_sensitive === true,
      wholeWord: args.whole_word === true,
      maxResults: userMaxResults,
      contextLines,
      deadlineMs: typeof args.deadline_ms === 'number' ? args.deadline_ms : undefined,
      maxFileSize: typeof args.max_file_size === 'number' ? args.max_file_size : undefined,
      includeIgnored: args.include_ignored === true,
      excludeDirs: Array.isArray(args.exclude_dirs)
        ? args.exclude_dirs.filter((v): v is string => typeof v === 'string')
        : undefined,
      pendingOverlays: Object.keys(pendingOverlays).length > 0 ? pendingOverlays : undefined,
    })

    // Determine whether to search a single root or all roots
    let result: SearchInDirectoryResult

    if (searchPath) {
      // Specific path provided — search single resolved root
      result = await manager.searchInDirectory(directoryHandle, buildSearchOptions(vfsSubPath || undefined))
    } else {
      // No path — search ALL roots and merge results
      const allHandles = await getAllRootHandles(context)
      if (allHandles.size <= 1) {
        // Single root or no multi-root — search normally
        result = await manager.searchInDirectory(directoryHandle, buildSearchOptions())
      } else {
        // Multi-root: search each root and merge
        result = await searchAllRoots(manager, allHandles, buildSearchOptions(), userMaxResults)
      }
    }

    // Pagination hint when results are truncated
    const paginationHint =
      result.truncated && userMaxResults > 0
        ? ` Hint: Results were truncated. Consider narrowing with path, glob, or more specific patterns, or increase max_results for broader results.`
        : ''

    return toolOkJson(
      'search',
      {
        query,
        ...result,
        message: `Found ${result.totalMatches} matches in ${result.scannedFiles} files.`,
      },
      {
        ...(loopCheck.warning ? { _warning: loopCheck.warning } : {}),
        ...(paginationHint ? { _hint: paginationHint } : {}),
      }
    )
  } catch (error) {
    const structured = parseStructuredError(error)
    if (structured?.code === 'path_not_found') {
      return toolErrorJson(
        'search',
        'path_not_found',
        typeof structured.message === 'string'
          ? structured.message
          : 'Requested search path was not found under current root.',
        {
          details: {
            requestedPath: structured.requestedPath as string | undefined,
            resolvedRootName: structured.resolvedRootName as string | undefined,
          },
          hint: 'Try path="src/..." relative to current root, or omit path to search from root.',
        }
      )
    }
    return toolErrorJson(
      'search',
      'internal_error',
      `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      { retryable: true }
    )
  }
}
