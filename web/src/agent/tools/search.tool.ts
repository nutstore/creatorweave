import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import { getSearchWorkerManager } from '@/workers/search-worker-manager'
import type { PendingFileOverlay, SearchInDirectoryResult, FileSearchResult, SearchHit } from '@/workers/search-worker-manager'
import { useOPFSStore } from '@/store/opfs.store'
import { getWorkspaceManager } from '@/opfs'
import { resolveNativeDirectoryHandleForPath } from './tool-utils'
import { toolErrorJson, toolOkJson } from './tool-envelope'
import { checkSearchLoop } from './loop-guard'
import { resolveVfsTarget } from './vfs-resolver'
import { rewritePythonMountPathForNonPythonTool, validateRootPrefix } from './path-guards'

function looksRegexLikeQuery(query: string): boolean {
  // Guard against common LLM misuse where regex operators are passed while regex=false.
  return query.includes('|') || query.includes('.*')
}

/**
 * Aggregate raw hit-level results into file-level results.
 *
 * For each file:
 * - Group all hits together
 * - Detect whether the filename matches the query (exact or partial)
 * - Pick the best preview line
 * - Sort: title exact match > title partial match > body-only matches
 *   (ties broken by match count descending)
 */
function aggregateResultsToFiles(
  hits: SearchHit[],
  query: string,
  useRegex: boolean,
  caseSensitive: boolean
): FileSearchResult[] {
  if (hits.length === 0) return []

  // Build a regex to test filename match (same semantics as the search itself)
  let testRegex: RegExp
  try {
    if (useRegex) {
      testRegex = new RegExp(query, caseSensitive ? '' : 'i')
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      testRegex = new RegExp(escaped, caseSensitive ? '' : 'i')
    }
  } catch {
    // If regex construction fails, skip title matching
    testRegex = /^$/ // never matches
  }

  // Group by file path
  const fileMap = new Map<string, SearchHit[]>()
  for (const hit of hits) {
    const arr = fileMap.get(hit.path) ?? []
    arr.push(hit)
    fileMap.set(hit.path, arr)
  }

  const files: FileSearchResult[] = []

  for (const [filePath, fileHits] of fileMap) {
    // Extract filename from path (last segment)
    const fileName = filePath.split('/').pop() ?? filePath

    // Determine title match level
    let titleMatch: FileSearchResult['titleMatch'] = false
    if (testRegex.test(fileName)) {
      // Check exact vs partial: exact = entire filename matches query (ignoring extension)
      const nameWithoutExt = fileName.replace(/\.[^.]+$/, '')
      if (
        nameWithoutExt === query ||
        (!useRegex && nameWithoutExt.toLowerCase() === query.toLowerCase())
      ) {
        titleMatch = 'exact'
      } else {
        titleMatch = 'partial'
      }
      // Reset regex lastIndex for safety
      testRegex.lastIndex = 0
    }

    // Pick best preview: first hit's preview is usually the best match
    // (or the first non-empty one)
    const bestHit = fileHits.find(h => h.preview && h.preview.trim()) ?? fileHits[0]

    files.push({
      path: filePath,
      matchCount: fileHits.length,
      titleMatch,
      bestPreview: bestHit?.preview ?? '',
      bestLine: bestHit?.line ?? 0,
      hits: fileHits,
    })
  }

  // Sort: title exact > title partial > body-only, then by matchCount desc
  const titlePriority = (t: FileSearchResult['titleMatch']): number => {
    if (t === 'exact') return 2
    if (t === 'partial') return 1
    return 0
  }
  files.sort((a, b) => {
    const pa = titlePriority(a.titleMatch)
    const pb = titlePriority(b.titleMatch)
    if (pa !== pb) return pb - pa // higher priority first
    return b.matchCount - a.matchCount // more matches first
  })

  return files
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
    // workspaceId is always provided by the agent loop. If missing, return empty.
    if (!workspaceId) return {}

    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(workspaceId)
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
 * Strip root prefix from overlay keys so they match worker's relative paths.
 *
 * The OPFS store records paths like "creatorweave/web/package.json" (with root prefix),
 * but the search worker traverses files relative to each root handle, producing paths
 * like "package.json". This function filters overlays to only those belonging to the
 * given root and strips the root prefix.
 */
function stripOverlayRootPrefix(
  overlays: Record<string, PendingFileOverlay>,
  rootName: string
): Record<string, PendingFileOverlay> {
  if (!rootName) return overlays
  const prefix = rootName + '/'
  const result: Record<string, PendingFileOverlay> = {}
  for (const [key, value] of Object.entries(overlays)) {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = value
    }
  }
  return result
}

/**
 * Get all root handles for the current project (multi-root aware).
 * workspaceId is always provided by the agent loop.
 */
async function getAllRootHandles(
  context: { workspaceId?: string | null; directoryHandle?: FileSystemDirectoryHandle | null; projectId?: string | null }
): Promise<Map<string, FileSystemDirectoryHandle>> {
  try {
    const manager = await getWorkspaceManager()
    const workspaceId = context.workspaceId
    if (!workspaceId) {
      // workspaceId is always provided — if missing, that's a caller bug.
      // Return empty rather than guessing from global state.
      return new Map()
    }

    const workspace = await manager.getWorkspace(workspaceId)
    if (workspace) {
      const handles = await workspace.getAllNativeDirectoryHandles(context.projectId)
      if (handles.size > 0) return handles
    }

    // Workspace found but no native handles, or workspace not found.
    // Try projectId as a secondary resolution (not a global fallback).
    if (context.projectId) {
      const { getRuntimeHandlesForProject } = await import('@/native-fs')
      const handles = getRuntimeHandlesForProject(context.projectId)
      if (handles.size > 0) return handles
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
    files: [],
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
      const rootOverlays = stripOverlayRootPrefix(
        (baseOptions.pendingOverlays as Record<string, PendingFileOverlay>) ?? {},
        rootName
      )
      const opts = { ...baseOptions, maxResults: remaining, pendingOverlays: Object.keys(rootOverlays).length > 0 ? rootOverlays : undefined }
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
      'Use this before read() when you need to locate relevant code or text quickly. ' +
      'TIP: Prefer English keywords for search queries (most source code and identifiers use English). ' +
      'If English results are poor, retry with the user\'s language (e.g. Chinese comments).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Required search query (use mode="literal" for plain text or mode="regex" for patterns). Prefer English keywords since source code is typically in English. If no results, try the user\'s native language (e.g. Chinese for comments/docs).',
        },
        path: {
          type: 'string',
          description: 'Optional subdirectory path to search within. MUST include rootName prefix (e.g., "frontend/src"). In multi-root projects, use root prefix to scope search.',
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

  // Validate root prefix before any path rewriting
  if (rawSearchPath) {
    const rootError = await validateRootPrefix('search', rawSearchPath, context)
    if (rootError) return rootError
  }

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
  let resolvedRootName: string | undefined // root name for overlay prefix stripping

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
    // Multi-root aware path resolution (mirrors ls.tool.ts resolveDiscoveryScope logic):
    // 1. Check if first segment of path matches a known root name
    // 2. If so, route to that root's handle directly (avoids fallback to wrong context.directoryHandle)
    // 3. Otherwise fall through to generic resolveNativeDirectoryHandleForPath
    let rootRouted = false
    try {
      const { getRuntimeHandlesForProject } = await import('@/native-fs')
      const projectId = context.projectId
      if (projectId && searchPath) {
        const allHandles = getRuntimeHandlesForProject(projectId)
        if (allHandles.size > 0) {
          const segments = searchPath.split('/')
          const maybeRoot = segments[0]
          if (allHandles.has(maybeRoot)) {
            const rootHandle = allHandles.get(maybeRoot)!
            directoryHandle = rootHandle
            vfsSubPath = segments.slice(1).join('/')
            resolvedRootName = maybeRoot
            rootRouted = true
          }
        }
      }
    } catch { /* fall through to generic resolution */ }

    if (!rootRouted) {
      const { handle, nativePath } = await resolveNativeDirectoryHandleForPath(
        searchPath, context.directoryHandle, context.workspaceId
      )
      directoryHandle = handle
      vfsSubPath = nativePath
    }
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

    // Inflate maxResults for the worker to collect enough raw hits across many files.
    // The user-facing limit is per-file (after aggregation), but the worker limit is
    // per-hit. Without inflation, one high-frequency file could exhaust the budget
    // before other files even appear. We use a generous fixed ceiling so that
    // aggregation can discover as many distinct files as possible.
    const internalMaxResults = 10000

    // Build search options; rootName is used to strip the root prefix from overlay keys
    // so they match the worker's relative file paths.
    const buildSearchOptions = (subPath?: string, rootName?: string) => {
      const rawOverlays = Object.keys(pendingOverlays).length > 0 ? pendingOverlays : undefined
      const strippedOverlays = rootName
        ? (() => {
            const s = stripOverlayRootPrefix(pendingOverlays, rootName)
            return Object.keys(s).length > 0 ? s : undefined
          })()
        : rawOverlays
      return {
        query,
        path: subPath,
        glob: typeof args.glob === 'string' ? args.glob : undefined,
        regex: useRegex,
        caseSensitive: args.case_sensitive === true,
        wholeWord: args.whole_word === true,
        maxResults: internalMaxResults,
        contextLines,
        deadlineMs: typeof args.deadline_ms === 'number' ? args.deadline_ms : 60000,
        maxFileSize: typeof args.max_file_size === 'number' ? args.max_file_size : undefined,
        includeIgnored: args.include_ignored === true,
        excludeDirs: Array.isArray(args.exclude_dirs)
          ? args.exclude_dirs.filter((v): v is string => typeof v === 'string')
          : undefined,
        pendingOverlays: strippedOverlays,
      }
    }

    // Determine whether to search a single root or all roots
    let result: SearchInDirectoryResult

    if (searchPath) {
      // Specific path provided — search single resolved root
      // Use resolvedRootName (the actual root handle name, e.g. "creatorweave")
      // instead of searchPath, so stripOverlayRootPrefix strips only the root prefix,
      // leaving overlay keys that match the worker's relative paths (relative to root handle).
      const rootName = resolvedRootName || searchPath || undefined
      result = await manager.searchInDirectory(directoryHandle, buildSearchOptions(vfsSubPath || undefined, rootName))

      // Prepend root prefix to hit paths so they are fully qualified for the LLM
      // (e.g. "prepared/WS-147951 ...md" instead of bare "WS-147951 ...md")
      if (resolvedRootName) {
        for (const hit of result.results) {
          hit.path = `${resolvedRootName}/${hit.path}`
        }
      }
    } else {
      // No path — search ALL roots and merge results
      const allHandles = await getAllRootHandles(context)
      if (allHandles.size <= 1) {
        // Single root or no multi-root — infer root name from handle map
        const singleRootName = allHandles.size === 1 ? [...allHandles.keys()][0] : undefined
        result = await manager.searchInDirectory(directoryHandle, buildSearchOptions(undefined, singleRootName))
      } else {
        // Multi-root: search each root and merge (searchAllRoots handles prefix stripping per root)
        result = await searchAllRoots(manager, allHandles, buildSearchOptions(), internalMaxResults)
      }
    }

    // Aggregate raw hits into file-level results
    let files = aggregateResultsToFiles(
      result.results,
      query,
      useRegex,
      args.case_sensitive === true
    )

    // Truncate file-level results to the user's requested limit
    // (internalMaxResults was inflated to collect more hits for aggregation)
    const truncatedFiles = files.length > userMaxResults
    if (truncatedFiles) {
      files = files.slice(0, userMaxResults)
    }

    // Decide whether to compact hits (1 per file) or keep all.
    // Compacting is for multi-file searches to keep messages small.
    // Single-file results (e.g. searching a specific file) keep all hits
    // so the LLM gets full context without extra read calls.
    const isSingleFile = files.length === 1

    let filesForLLM: typeof files
    if (isSingleFile) {
      // Keep all hits for single-file results — no compression needed
      filesForLLM = files
    } else {
      // Multi-file: cap to 1 hit per file for compact LLM context
      filesForLLM = files.map(f => ({
        ...f,
        hits: f.hits.slice(0, 1),
        hasMoreHits: f.hits.length > 1,
      }))
    }
    result.files = filesForLLM

    // Clear raw hit-level results to keep the stored message small.
    // The renderer reconstructs detail from files[] and on-demand search.
    result.results = []

    // Pagination hint when results are truncated
    const paginationHint =
      (result.truncated || truncatedFiles) && userMaxResults > 0
        ? ` Hint: Results were truncated. Consider narrowing with path, glob, or more specific patterns, or increase max_results for broader results.`
        : ''

    const fileCount = files.length
    const titleMatchCount = files.filter(f => f.titleMatch).length
    // Hint for the LLM: only shown when results are actually compacted (multi-file).
    const compactHint = !isSingleFile && filesForLLM.some(f => f.hasMoreHits)
      ? ' Results are compacted to 1 line per file (hasMoreHits=true means more lines match). To see all hits in a file, search again with path set to that file.'
      : ''

    return toolOkJson(
      'search',
      {
        query,
        ...result,
        message: `Found ${result.totalMatches} matches across ${fileCount} files.${titleMatchCount > 0 ? ` (${titleMatchCount} title match${titleMatchCount !== 1 ? 'es' : ''})` : ''}.${compactHint}`,
      },
      {
        ...(loopCheck.warning ? { _warning: loopCheck.warning } : {}),
        ...((paginationHint || compactHint) ? { _hint: [paginationHint, compactHint].filter(Boolean).join('') } : {}),
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

export const searchPromptDoc: ToolPromptDoc = {
  category: 'file-ops',
  section: '### Content Search',
  lines: [
    '- `search(query, ...)` - Search text in files and return matched file/line locations. **IMPORTANT**: Always use `max_results` parameter (default 50) to limit results. Use `glob` parameter (e.g., "**/*.ts") to filter file types when searching large codebases.',
  ],
}
