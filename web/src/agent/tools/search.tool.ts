import type { ToolDefinition, ToolExecutor } from './tool-types'
import { getActiveConversation } from '@/store/conversation-context.store'
import { getSearchWorkerManager } from '@/workers/search-worker-manager'
import type { PendingFileOverlay } from '@/workers/search-worker-manager'
import { useOPFSStore } from '@/store/opfs.store'
import { getWorkspaceManager } from '@/opfs'

/**
 * Resolve native directory handle from context or workspaceId
 */
async function resolveNativeDirectoryHandle(
  directoryHandle: FileSystemDirectoryHandle | null | undefined,
  workspaceId?: string | null
): Promise<FileSystemDirectoryHandle | null> {
  if (directoryHandle) return directoryHandle
  if (workspaceId) {
    try {
      const { getWorkspaceManager } = await import('@/opfs')
      const manager = await getWorkspaceManager()
      const workspace = await manager.getWorkspace(workspaceId)
      if (workspace) {
        return await workspace.getNativeDirectoryHandle()
      }
    } catch {
      // fallback below
    }
  }
  const active = await getActiveConversation()
  if (!active) return null
  return await active.conversation.getNativeDirectoryHandle()
}

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
  workspaceId?: string | null
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
    const { readFile } = useOPFSStore.getState()

    for (const change of pendingChanges) {
      if (change.type === 'delete') {
        overlays[change.path] = { deleted: true }
        continue
      }

      // For modify/create, read the cached content from OPFS
      try {
        const result = await workspace.readFile(change.path, null)
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
          description: 'Optional subdirectory path to search within.',
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
    return JSON.stringify({ error: 'query is required' })
  }
  const mode = typeof args.mode === 'string' ? args.mode : ''
  if (mode !== 'literal' && mode !== 'regex') {
    return JSON.stringify({
      error: 'mode is required and must be one of: literal, regex',
    })
  }
  const useRegex = mode === 'regex'
  if (!useRegex && looksRegexLikeQuery(query)) {
    return JSON.stringify({
      error:
        'query looks like regex but mode="literal". Use mode="regex" for patterns like "|" or ".*".',
      hint: 'If you intend a regex OR/pattern search, set mode="regex".',
    })
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

  let directoryHandle: FileSystemDirectoryHandle | null = context.directoryHandle

  // OPFS-only fallback: search in active workspace files snapshot.
  if (!directoryHandle) {
    directoryHandle = await resolveNativeDirectoryHandle(context.directoryHandle, context.workspaceId)
  }
  if (!directoryHandle) {
    return JSON.stringify({ error: 'No active workspace' })
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
    const pendingOverlays = await collectPendingOverlays(context.workspaceId)

    const result = await manager.searchInDirectory(directoryHandle, {
      query,
      path: typeof args.path === 'string' ? args.path : undefined,
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

    return JSON.stringify({
      success: true,
      query,
      ...result,
      message: `Found ${result.totalMatches} matches in ${result.scannedFiles} files.`,
    })
  } catch (error) {
    const structured = parseStructuredError(error)
    if (structured?.code === 'path_not_found') {
      return JSON.stringify({
        error: 'path_not_found',
        message:
          typeof structured.message === 'string'
            ? structured.message
            : 'Requested search path was not found under current root.',
        requestedPath: structured.requestedPath,
        resolvedRootName: structured.resolvedRootName,
        hint: 'Try path="src/..." relative to current root, or omit path to search from root.',
      })
    }
    return JSON.stringify({
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
