/**
 * edit tool - Single-file text replacement with read-before-edit safety checks.
 */

import { structuredPatch } from 'diff'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import type { ToolContext, ToolDefinition, ToolExecutor } from './tool-types'
import { resolveVfsTarget, withVfsAgentIdHint } from './vfs-resolver'
import { ensureReadFileState, getReadStateKey } from './read-state'
import { toolErrorJson, toolOkJson } from './tool-envelope'
import { rewritePythonMountPathForNonPythonTool } from './path-guards'

// ── Fuzzy matching helpers ──────────────────────────────────────────

/** Curly quote constants — models can't output these directly */
const CURLY_QUOTES = {
  leftSingle: '\u2018',  // '
  rightSingle: '\u2019', // '
  leftDouble: '\u201C',  // "
  rightDouble: '\u201D', // "
} as const

/** Normalize curly quotes to straight quotes for fuzzy matching */
function normalizeQuotes(str: string): string {
  return str
    .replaceAll(CURLY_QUOTES.leftSingle, "'")
    .replaceAll(CURLY_QUOTES.rightSingle, "'")
    .replaceAll(CURLY_QUOTES.leftDouble, '"')
    .replaceAll(CURLY_QUOTES.rightDouble, '"')
}

/** Strip trailing whitespace from each line while preserving line endings */
function stripTrailingWhitespace(str: string): string {
  const lines = str.split(/(\r\n|\n|\r)/)
  let result = ''
  for (let i = 0; i < lines.length; i++) {
    const part = lines[i]
    if (part !== undefined) {
      result += i % 2 === 0 ? part.replace(/\s+$/, '') : part
    }
  }
  return result
}

/** Model sometimes outputs sanitized versions of special tags */
const DESANITIZATIONS: Record<string, string> = {
  '<fnr>': '<function_results>',
  '<n>': '<name>',
  '</n>': '</name>',
  '<o>': '<output>',
  '</o>': '</output>',
  '<e>': '<error>',
  '</e>': '</error>',
  '<s>': '<system>',
  '</s>': '</system>',
  '<r>': '<result>',
  '</r>': '</result>',
}

/** Apply de-sanitization and return which replacements were applied */
function desanitize(str: string): { result: string; applied: Array<{ from: string; to: string }> } {
  let result = str
  const applied: Array<{ from: string; to: string }> = []
  for (const [from, to] of Object.entries(DESANITIZATIONS)) {
    const before = result
    result = result.replaceAll(from, to)
    if (before !== result) applied.push({ from, to })
  }
  return { result, applied }
}

/**
 * Find the actual string in fileContent matching searchString.
 * Tries in order: exact → quote-normalized.
 * Returns the *actual* substring from fileContent (preserving original formatting),
 * or null if nothing matched.
 */
function findActualString(fileContent: string, searchString: string): string | null {
  // 1. Exact match
  if (fileContent.includes(searchString)) return searchString

  // 2. Quote normalization
  const normSearch = normalizeQuotes(searchString)
  const normFile = normalizeQuotes(fileContent)
  const idx = normFile.indexOf(normSearch)
  if (idx !== -1) return fileContent.substring(idx, idx + searchString.length)

  return null
}

/**
 * Normalize input similar to Claude Code's edit preprocessing:
 * - Trim trailing whitespace from new_text for non-markdown files
 * - If old_text is sanitized and exact match fails, de-sanitize old_text and apply
 *   the same replacements to new_text.
 */
function normalizeEditInput(
  path: string,
  fileContent: string,
  oldText: string,
  newText: string
): { oldText: string; newText: string } {
  // Markdown uses trailing spaces for hard line breaks.
  const isMarkdown = /\.(md|mdx)$/i.test(path)
  const normalizedNewText = isMarkdown ? newText : stripTrailingWhitespace(newText)

  // Keep exact match input unchanged.
  if (fileContent.includes(oldText)) {
    return { oldText, newText: normalizedNewText }
  }

  // If model sent sanitized tokens, de-sanitize old_text and mirror replacements in new_text.
  const { result: desanitizedOldText, applied } = desanitize(oldText)
  if (desanitizedOldText === oldText || !fileContent.includes(desanitizedOldText)) {
    return { oldText, newText: normalizedNewText }
  }

  let desanitizedNewText = normalizedNewText
  for (const { from, to } of applied) {
    desanitizedNewText = desanitizedNewText.replaceAll(from, to)
  }

  return { oldText: desanitizedOldText, newText: desanitizedNewText }
}

/** Preserve curly quote style from the file into new_text */
function preserveQuoteStyle(oldString: string, actualOldString: string, newString: string): string {
  if (oldString === actualOldString) return newString

  const hasDouble =
    actualOldString.includes(CURLY_QUOTES.leftDouble) ||
    actualOldString.includes(CURLY_QUOTES.rightDouble)
  const hasSingle =
    actualOldString.includes(CURLY_QUOTES.leftSingle) ||
    actualOldString.includes(CURLY_QUOTES.rightSingle)
  if (!hasDouble && !hasSingle) return newString

  let result = newString
  if (hasDouble) result = applyCurlyQuotes(result, '"', CURLY_QUOTES.leftDouble, CURLY_QUOTES.rightDouble)
  if (hasSingle) result = applyCurlyQuotes(result, "'", CURLY_QUOTES.leftSingle, CURLY_QUOTES.rightSingle)
  return result
}

function isOpeningContext(chars: string[], i: number): boolean {
  if (i === 0) return true
  const prev = chars[i - 1]
  return prev === ' ' || prev === '\t' || prev === '\n' || prev === '\r' ||
    prev === '(' || prev === '[' || prev === '{'
}

function applyCurlyQuotes(str: string, straight: string, open: string, close: string): string {
  const chars = [...str]
  return chars.map((ch, i) => {
    if (ch !== straight) return ch
    // For single quotes, don't convert apostrophes in contractions
    if (straight === "'") {
      const prev = i > 0 ? chars[i - 1] : undefined
      const next = i < chars.length - 1 ? chars[i + 1] : undefined
      if (prev && /\p{L}/u.test(prev) && next && /\p{L}/u.test(next)) {
        return close // apostrophe
      }
    }
    return isOpeningContext(chars, i) ? open : close
  }).join('')
}

/** Format hunks from structuredPatch into a compact unified-diff string */
function formatHunksToDiff(hunks: Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }>): string {
  if (!hunks.length) return ''
  const parts: string[] = []
  for (const hunk of hunks) {
    parts.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)
    for (const line of hunk.lines) {
      parts.push(line)
    }
  }
  return parts.join('\n')
}

export const editDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'edit',
    description:
      'Apply text replacement to one file. ' +
      'Use path + old_text + new_text for exact replacement. ' +
      'Optional replace_all replaces every occurrence. ' +
      'Supports vfs://workspace/... and vfs://agents/{id}/....',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to edit',
        },
        old_text: {
          type: 'string',
          description: 'Exact text to find',
        },
        new_text: {
          type: 'string',
          description: 'Replacement text',
        },
        replace_all: {
          type: 'boolean',
          description: 'Replace all occurrences. Default: false',
          default: false,
        },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
}

export const editExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const oldText = args.old_text as string | undefined
  const newText = args.new_text as string | undefined
  const replaceAll = args.replace_all === true

  if (
    args.find !== undefined ||
    args.replace !== undefined ||
    args.use_regex !== undefined ||
    args.dry_run !== undefined ||
    args.max_files !== undefined ||
    looksLikeGlob(path)
  ) {
    return toolErrorJson(
      'edit',
      'invalid_arguments',
      'Batch edit capability has been removed. Use single-file edit with path + old_text + new_text.'
    )
  }

  if (!path || oldText === undefined || newText === undefined) {
    return toolErrorJson('edit', 'invalid_arguments', 'edit requires path + old_text + new_text')
  }
  const rewrittenPath = rewritePythonMountPathForNonPythonTool(path)
  const effectivePath = rewrittenPath?.rewritten ? rewrittenPath.rewrittenPath : path
  return executeSingleEdit(context, { path: effectivePath, oldText, newText, replaceAll })
}

function looksLikeGlob(path: string | undefined): boolean {
  if (!path) return false
  return path.includes('*') || path.includes('?') || path.includes('[')
}

async function executeSingleEdit(
  context: ToolContext,
  opts: { path: string; oldText: string; newText: string; replaceAll: boolean }
): Promise<string> {
  const { path, oldText, newText, replaceAll } = opts

  if (oldText.length === 0) {
    return toolErrorJson(
      'edit',
      'invalid_arguments',
      'old_text cannot be empty. Provide exact existing text to replace.'
    )
  }

  const isNoopEdit = oldText === newText

  try {
    const { getPendingChanges } = useOPFSStore.getState()
    const readFileState = ensureReadFileState(context)
    const target = await resolveVfsTarget(path, context, 'write')
    const readStateKey = getReadStateKey(target)
    const snapshot = readFileState.get(readStateKey)

    if (!snapshot || snapshot.isPartialView) {
      return toolErrorJson(
        'edit',
        'read_required',
        'Read file before editing. Use read(path) first, then retry edit.'
      )
    }

    let fileContent: string

    // Read current content via backend (unified for all target kinds)
    try {
      const backendResult = await target.backend.readFile(target.path)
      if (typeof backendResult.content !== 'string') {
        return toolErrorJson(
          'edit',
          'binary_not_supported',
          `Cannot edit binary file: ${path}. Use write to replace the entire file.`
        )
      }
      fileContent = backendResult.content
    } catch (error) {
      if (error instanceof Error && error.message?.includes('not found')) {
        return toolErrorJson('edit', 'file_not_found', `File not found: ${path}`)
      }
      throw error
    }

    const isFullRead = snapshot.offset === undefined && snapshot.limit === undefined
    if (isFullRead && snapshot.content !== fileContent) {
      return toolErrorJson(
        'edit',
        'stale_snapshot',
        'File has been modified since read. Read it again before attempting to write it.'
      )
    }

    const normalizedEdit = normalizeEditInput(path, fileContent, oldText, newText)

    // Use fuzzy matching (quote normalization)
    const actualOldText = findActualString(fileContent, normalizedEdit.oldText)
    if (!actualOldText) {
      return toolErrorJson(
        'edit',
        'old_text_not_found',
        'old_text not found in the file. ' +
          'Verify the exact content with the read tool first. ' +
          'Hint: Whitespace and line endings must match exactly. ' +
          'Consider copying the text directly from the file rather than retyping it.'
      )
    }

    // Preserve curly quote style from the file into new_text
    const actualNewText = preserveQuoteStyle(
      normalizedEdit.oldText,
      actualOldText,
      normalizedEdit.newText
    )

    const matches = fileContent.split(actualOldText).length - 1
    if (matches > 1 && !replaceAll && !isNoopEdit) {
      return toolErrorJson(
        'edit',
        'ambiguous_match',
        'old_text appears multiple times. Set replace_all=true to replace all occurrences, or provide a more unique snippet.'
      )
    }

    const updatedFile = isNoopEdit
      ? fileContent
      : replaceAll
        ? fileContent.split(actualOldText).join(actualNewText)
        : fileContent.replace(actualOldText, actualNewText)

    if (!isNoopEdit) {
      await target.backend.writeFile(target.path, updatedFile)
    }

    readFileState.set(readStateKey, {
      content: updatedFile,
      timestamp: Date.now(),
      offset: undefined,
      limit: undefined,
      isPartialView: false,
      source: target.backend.label === 'workspace' ? 'opfs' : target.backend.label,
    })

    const pendingCount = getPendingChanges().length
    const status = target.backend.label === 'workspace' ? 'pending' : 'saved'

    const patchResult = structuredPatch(path, path, fileContent, updatedFile, '', '', {
      context: 3,
    })
    const diffText = formatHunksToDiff(patchResult.hunks)

    const session = useRemoteStore.getState().session
    if (session) {
      const preview = `Edited: ${path} (${newText.length} chars added, ${oldText.length} chars removed)`
      session.broadcastFileChange(path, 'modify', preview)
    }

    const replacedCount = isNoopEdit ? 0 : replaceAll ? matches : 1
    return toolOkJson('edit', {
      noop: isNoopEdit,
      path,
      action: 'modify',
      replacedCount,
      diff: diffText || undefined,
      replaceAll,
      status,
      pendingCount,
      message:
        target.backend.label === 'workspace'
          ? isNoopEdit
            ? `File "${path}" already matched requested content. ${pendingCount} change(s) pending review.`
            : `File "${path}" edited. ${pendingCount} change(s) pending review.`
          : isNoopEdit
            ? `File "${path}" already matched requested content.`
            : `File "${path}" edited.`,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return toolErrorJson('edit', 'file_not_found', `File not found: ${path}`)
    }
    return toolErrorJson(
      'edit',
      'internal_error',
      `Failed to edit file: ${withVfsAgentIdHint(error instanceof Error ? error.message : String(error))}`,
      { retryable: true }
    )
  }
}
