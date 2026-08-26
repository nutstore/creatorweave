/**
 * Loop Guard - Prevents agents from getting stuck in repeated read/search loops.
 *
 * Features:
 * - Deduplication: if a file hasn't changed since last read, return a lightweight stub
 * - Consecutive counter: counts identical read/search operations
 * - Warning at 3x: adds a _warning hint to results
 * - Hard block at 4x: returns an error instead of real data, forcing the agent to stop
 * - Counter reset: any non-read/non-search tool call resets the counters
 *
 * Hermes Agent reference: tools/file_tools.py
 */

import type { ToolContext } from './tool-types'

// Threshold constants
const WARNING_THRESHOLD = 3
const BLOCK_THRESHOLD = 4
const MAX_READ_CHARS = 100_000 // ~25-35K tokens, safety limit per read

// Per-call metadata for deduplication
interface ReadDedupEntry {
  mtime: number
  contentLength: number
}

// Per-session tracker state
interface LoopGuardState {
  /** Last operation key (tool, path, offset, limit for reads; query+path+glob+offset+limit for search) */
  lastKey: string | null
  /** How many times the exact same key has been called consecutively */
  consecutive: number
  /** Dedup cache: (resolvedPath, offset, limit) → {mtime, contentLength} */
  dedup: Map<string, ReadDedupEntry>
  /** mtime recorded when file was last read (for stale-file detection on write) */
  readTimestamps: Map<string, number>
}

/** Per-context state — isolated per ToolContext (agent run). */
const stateByContext = new WeakMap<ToolContext, LoopGuardState>()

function getState(context: ToolContext): LoopGuardState {
  let state = stateByContext.get(context)
  if (!state) {
    state = {
      lastKey: null,
      consecutive: 0,
      dedup: new Map(),
      readTimestamps: new Map(),
    }
    stateByContext.set(context, state)
  }
  return state
}

/** Reset all counters — call after any non-read/non-search tool */
export function notifyOtherToolCall(context: ToolContext): void {
  const state = getState(context)
  state.lastKey = null
  state.consecutive = 0
}

/** Build a read operation key for deduplication and loop detection */
function buildReadKey(path: string, offset: number, limit: number): string {
  return `read:${path}:${offset}:${limit}`
}

//=============================================================================
// Read Operations
//=============================================================================

export interface ReadLoopCheckResult {
  /** True if this exact read was cached and file unchanged */
  isDedup: boolean
  /** True if the read should be blocked (4+ consecutive) */
  isBlocked: boolean
  /** Warning message if 3 consecutive */
  warning: string | null
  /** Dedup key for later mtime recording */
  dedupKey: string
  /** Consecutive count after this call */
  consecutive: number
}

/**
 * Check if a read operation should be deduped, warned, or blocked.
 * Call BEFORE performing the actual read.
 *
 * @param context - ToolContext for isolated state per agent run
 * @param path - Resolved absolute path
 * @param offset - 1-based start line
 * @param limit - Number of lines
 * @param currentMtime - Current file mtime (from stat)
 */
export function checkReadLoop(
  context: ToolContext,
  path: string,
  offset: number,
  limit: number,
  currentMtime?: number
): ReadLoopCheckResult {
  const state = getState(context)
  const dedupKey = `${path}:${offset}:${limit}`
  const readKey = buildReadKey(path, offset, limit)

  // Check dedup: file mtime unchanged → return stub
  if (currentMtime !== undefined) {
    const cached = state.dedup.get(dedupKey)
    if (cached && cached.mtime === currentMtime) {
      return {
        isDedup: true,
        isBlocked: false,
        warning: null,
        dedupKey,
        consecutive: state.consecutive,
      }
    }
  }

  // Track consecutive count
  let warning: string | null = null
  if (state.lastKey === readKey) {
    state.consecutive++
  } else {
    state.lastKey = readKey
    state.consecutive = 1
  }

  const count = state.consecutive

  if (count >= BLOCK_THRESHOLD) {
    return {
      isDedup: false,
      isBlocked: true,
      warning: null,
      dedupKey,
      consecutive: count,
    }
  }

  if (count >= WARNING_THRESHOLD) {
    warning =
      `You have read this exact file region ${count} times in a row. ` +
      'The content has not changed since your last read. ' +
      'Use the information you already have. ' +
      'If you are stuck in a loop, stop reading and proceed with writing or responding.'
  }

  return {
    isDedup: false,
    isBlocked: false,
    warning,
    dedupKey,
    consecutive: count,
  }
}

/**
 * Record mtime after a successful read (for future dedup and stale-file detection).
 */
export function recordReadMtime(
  context: ToolContext,
  dedupKey: string,
  mtime: number,
  _contentLength: number
): void {
  const state = getState(context)
  state.dedup.set(dedupKey, { mtime, contentLength: _contentLength })
  state.readTimestamps.set(dedupKey, mtime)
}

/**
 * Check if a file was modified externally since the agent last read it.
 * Call before write/patch operations.
 *
 * @returns Warning string if file is stale, null if fresh or never read
 */
export function checkFileStaleness(
  context: ToolContext,
  resolvedPath: string,
  currentMtime?: number
): string | null {
  const state = getState(context)
  const recordedMtime = state.readTimestamps.get(resolvedPath)
  if (recordedMtime === undefined) return null // Never read

  if (currentMtime !== undefined && currentMtime !== recordedMtime) {
    return (
      `Warning: ${resolvedPath} was modified since you last read it ` +
      '(external edit or concurrent agent). The content you read may be stale. ' +
      'Consider re-reading the file to verify before writing.'
    )
  }
  return null
}

/**
 * Refresh stored timestamp after a successful write (so consecutive edits by the
 * same agent don't trigger false staleness warnings).
 */
export function refreshReadTimestamp(
  context: ToolContext,
  resolvedPath: string,
  mtime: number
): void {
  const state = getState(context)
  state.readTimestamps.set(resolvedPath, mtime)
}

//=============================================================================
// Search Operations
//=============================================================================

export interface SearchLoopCheckResult {
  /** True if the search should be blocked (4+ consecutive) */
  isBlocked: boolean
  /** Warning message if 3 consecutive */
  warning: string | null
  /** Consecutive count after this call */
  consecutive: number
}

/**
 * Build a search operation key for loop detection.
 * Includes pagination params so paging through results doesn't trigger blocks.
 */
function buildSearchKey(
  query: string,
  path: string,
  glob: string | undefined,
  offset: number,
  limit: number
): string {
  return `search:${query}:${path}:${glob ?? ''}:${offset}:${limit}`
}

/**
 * Check if a search operation should be warned or blocked.
 * Call BEFORE performing the actual search.
 */
export function checkSearchLoop(
  context: ToolContext,
  query: string,
  path: string,
  glob: string | undefined,
  offset: number,
  limit: number
): SearchLoopCheckResult {
  const state = getState(context)
  const searchKey = buildSearchKey(query, path, glob, offset, limit)

  if (state.lastKey === searchKey) {
    state.consecutive++
  } else {
    state.lastKey = searchKey
    state.consecutive = 1
  }

  const count = state.consecutive

  if (count >= BLOCK_THRESHOLD) {
    return {
      isBlocked: true,
      warning: null,
      consecutive: count,
    }
  }

  if (count >= WARNING_THRESHOLD) {
    return {
      isBlocked: false,
      warning:
        `You have run this exact search ${count} times consecutively. ` +
        'The results have NOT changed. You already have this information. ' +
        'STOP re-searching and proceed with your task.',
      consecutive: count,
    }
  }

  return {
    isBlocked: false,
    warning: null,
    consecutive: count,
  }
}

//=============================================================================
// Large file helpers
//=============================================================================

/**
 * Check if content exceeds the safety character limit.
 * Hermes Agent reference: tools/file_tools.py _get_max_read_chars
 */
export function checkContentSizeLimit(
  content: string,
  _fileSize: number,
  totalLines?: number
): { ok: true } | { ok: false; error: string; totalLines?: number; suggestedMaxSize: number } {
  if (content.length > MAX_READ_CHARS) {
    const suggestedMaxSize = Math.max(Math.ceil((_fileSize * 2) / 1_048_576) * 1_048_576, 1_048_576)
    return {
      ok: false,
      error:
        `Read produced ${content.length.toLocaleString()} characters which exceeds ` +
        `the safety limit (${MAX_READ_CHARS.toLocaleString()} chars). ` +
        'Use start_line and line_count to read a smaller range.' +
        (totalLines !== undefined ? ` The file has ${totalLines} lines total.` : ''),
      totalLines,
      suggestedMaxSize,
    }
  }
  return { ok: true }
}

/**
 * Generate a hint for large files when the read was truncated.
 */
export function largeFileHint(fileSize: number): string {
  return (
    `This file is large (${fileSize.toLocaleString()} bytes). ` +
    'Consider reading only the section you need with start_line and line_count ' +
    'to keep context usage efficient.'
  )
}

//=============================================================================
// Reset (for testing or session cleanup)
//=============================================================================

/**
 * Clear loop guard state for a specific context.
 * Call when an agent session ends or resets.
 */
export function clearLoopGuard(context: ToolContext): void {
  stateByContext.delete(context)
}
