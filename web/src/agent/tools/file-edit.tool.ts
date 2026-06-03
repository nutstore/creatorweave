/**
 * edit tool - Single-file text replacement with read-before-edit safety checks.
 *
 * Only accepts an `edits` array of {old_text, new_text} entries.
 * All edits are applied atomically — if any fail, nothing is written.
 */

import { structuredPatch } from 'diff'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import type { ToolContext, ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import { resolveVfsTarget, withVfsAgentIdHint } from './vfs-resolver'
import { ensureReadFileState, getReadStateKey } from './read-state'
import { toolErrorJson, toolOkJson } from './tool-envelope'
import { rewritePythonMountPathForNonPythonTool, validateRootPrefix } from './path-guards'
import { getFormatHandler, buildFormatWriteContext } from './format-registry'

// Ensure format handlers are registered before first use
import './formats'

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
    description: [
      'Apply text replacement to one file.',
      '',
      'WHEN TO USE: When modifying part of an existing file — changing a function, fixing a bug, updating a value, renaming a variable, adjusting a config, etc.',
      'DO NOT use write() for targeted changes to existing files. Always prefer edit() for modifications.',
      '',
      'PREREQUISITE: You MUST call read() on the file first. The edit will fail if the file has not been read.',
      '',
      'WORKFLOW:',
      '1. Call read(path) to load file contents',
      '2. Identify the exact text to change from the read output',
      '3. Call edit(path, edits=[{old_text=<exact snippet from file>, new_text=<replacement>}])',
      '',
      'The `edits` array supports one or more edits applied atomically to the same file.',
      'Each edit is applied atomically — if any edit fails, the entire operation is rolled back.',
      'Example single edit: edit(path, edits=[{old_text:"foo", new_text:"bar"}])',
      'Example multi edit: edit(path, edits=[{old_text:"foo", new_text:"bar"}, {old_text:"baz", new_text:"qux"}])',
      '',
      'TIPS:',
      '- Copy old_text EXACTLY from the read() output — whitespace and line breaks must match',
      '- old_text must be unique in the file (each occurrence must match exactly once)',
      '- For multi-line changes, include enough surrounding context to make old_text unique',
      '- new_text can be an empty string to delete text',
      '- Supports vfs://workspace/... and vfs://agents/{id}/... paths',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to edit (e.g., "src/config.ts", "README.md", or "vfs://agents/default/SOUL.md")',
        },
        edits: {
          type: 'array',
          description: 'Array of edits to apply atomically to the file. Even a single edit must be wrapped in the array. Edits are applied bottom-to-top to avoid offset drift. If any edit fails, all changes are rolled back.',
          items: {
            type: 'object',
            properties: {
              old_text: {
                type: 'string',
                description: 'Exact text to find in the file. Must match exactly including whitespace and indentation. Copy directly from read() output. Must be unique in the file.',
              },
              new_text: {
                type: 'string',
                description: 'Replacement text. Can be empty string to delete the matched text.',
              },
            },
            required: ['old_text', 'new_text'],
          },
        },
      },
      required: ['path', 'edits'],
    },
  },
}

// ── Resolved edit item after parsing ────────────────────────────────
interface ResolvedEdit {
  oldText: string
  newText: string
}

export const editExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const edits = args.edits as Array<{ old_text?: string; new_text?: string }> | undefined

  // Reject legacy batch-edit args
  if (
    args.find !== undefined ||
    args.replace !== undefined ||
    args.use_regex !== undefined ||
    args.dry_run !== undefined ||
    args.max_files !== undefined
  ) {
    return toolErrorJson(
      'edit',
      'invalid_arguments',
      'Batch edit capability has been removed. Use edit with path + edits array.'
    )
  }

  // Reject removed old_text/new_text/replace_all parameters
  if (args.old_text !== undefined || args.new_text !== undefined || args.replace_all !== undefined) {
    return toolErrorJson(
      'edit',
      'invalid_arguments',
      'The old_text, new_text, and replace_all parameters are no longer supported. Use the edits array instead: edit(path, edits=[{old_text, new_text}])'
    )
  }

  if (!path) {
    return toolErrorJson('edit', 'invalid_arguments', 'edit requires path')
  }

  if (!Array.isArray(edits) || edits.length === 0) {
    return toolErrorJson(
      'edit',
      'invalid_arguments',
      'edit requires an edits array with at least one entry: edit(path, edits=[{old_text, new_text}])'
    )
  }

  // Validate edits array entries
  for (let i = 0; i < edits.length; i++) {
    const entry = edits[i]!
    if (entry.old_text === undefined || entry.new_text === undefined) {
      return toolErrorJson(
        'edit',
        'invalid_arguments',
        `edits[${i}] is missing old_text or new_text. Each edit entry must have both.`
      )
    }
  }

  // Validate root prefix before any path rewriting
  const rootError = await validateRootPrefix('edit', path, context)
  if (rootError) return rootError

  const rewrittenPath = rewritePythonMountPathForNonPythonTool(path)
  const effectivePath = rewrittenPath?.rewritten ? rewrittenPath.rewrittenPath : path

  const resolvedEdits: ResolvedEdit[] = edits.map((e) => ({
    oldText: e.old_text!,
    newText: e.new_text!,
  }))

  return executeEdits(context, { path: effectivePath, edits: resolvedEdits })
}

// ── Apply edits atomically ──────────────────────────────────────────

/**
 * Apply one or more edits to a single file atomically.
 *
 * Strategy:
 * 1. Load file content (with read-before-edit safety checks).
 * 2. Find each old_text in the file and record its position.
 * 3. Validate no ambiguous or overlapping matches.
 * 4. Sort matches by position descending (bottom-to-top).
 * 5. Apply replacements in that order — later edits don't shift earlier ones.
 * 6. If any edit fails to match, return error without writing.
 */
async function executeEdits(
  context: ToolContext,
  opts: { path: string; edits: ResolvedEdit[] }
): Promise<string> {
  const { path, edits } = opts

  // Validate no empty old_text
  for (let i = 0; i < edits.length; i++) {
    if (edits[i]!.oldText.length === 0) {
      return toolErrorJson(
        'edit',
        'invalid_arguments',
        `edits[${i}].old_text cannot be empty. Provide exact existing text to replace.`
      )
    }
  }

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

    // Check if a format handler exists for this file type
    const formatHandler = getFormatHandler(path)

    try {
      if (formatHandler?.read) {
        const backendResult = await target.backend.readFile(target.path, { encoding: 'binary' })
        const rawData = backendResult.content instanceof ArrayBuffer
          ? new Uint8Array(backendResult.content)
          : backendResult.content instanceof Uint8Array
            ? backendResult.content
            : null
        if (!rawData) {
          return toolErrorJson(
            'edit',
            'binary_not_supported',
            `Cannot edit binary file: ${path}. Use write to replace the entire file.`
          )
        }
        const readResult = await formatHandler.read(rawData, path)
        fileContent = readResult.content
      } else {
        const backendResult = await target.backend.readFile(target.path)
        if (typeof backendResult.content !== 'string') {
          return toolErrorJson(
            'edit',
            'binary_not_supported',
            `Cannot edit binary file: ${path}. Use write to replace the entire file.`
          )
        }
        fileContent = backendResult.content
      }
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

    // ── Phase 1: Resolve all matches ───────────────────────────────
    interface ResolvedMatch {
      index: number           // position in original fileContent
      editIndex: number       // index into edits array
      actualOldText: string   // the actual text from the file (with original quotes etc.)
      actualNewText: string   // new_text adjusted for quote style
    }

    const matches: ResolvedMatch[] = []

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]!
      const normalizedEdit = normalizeEditInput(path, fileContent, edit.oldText, edit.newText)
      const actualOldText = findActualString(fileContent, normalizedEdit.oldText)

      if (!actualOldText) {
        return toolErrorJson(
          'edit',
          'old_text_not_found',
          `edits[${i}].old_text not found in the file. ` +
            'Verify the exact content with the read tool first. ' +
            'Hint: Whitespace and line endings must match exactly.'
        )
      }

      const actualNewText = preserveQuoteStyle(
        normalizedEdit.oldText,
        actualOldText,
        normalizedEdit.newText
      )

      // Check for ambiguous match (multiple occurrences)
      const matchCount = fileContent.split(actualOldText).length - 1
      if (matchCount > 1) {
        return toolErrorJson(
          'edit',
          'ambiguous_match',
          `edits[${i}].old_text appears ${matchCount} times in the file. ` +
            'Provide a more unique snippet for this edit.'
        )
      }

      // Find the actual character offset using the actual old text
      const charOffset = fileContent.indexOf(actualOldText)
      if (charOffset === -1) {
        // Should not happen since findActualString succeeded, but safety check
        return toolErrorJson(
          'edit',
          'old_text_not_found',
          `edits[${i}].old_text could not be located in the file.`
        )
      }

      // Check for overlapping matches
      const overlapWith = matches.find((m) => {
        const mEnd = m.index + m.actualOldText.length
        const thisEnd = charOffset + actualOldText.length
        return charOffset < mEnd && m.index < thisEnd
      })
      if (overlapWith) {
        return toolErrorJson(
          'edit',
          'overlapping_edits',
          `edits[${i}] overlaps with edits[${overlapWith.editIndex}]. Ensure edit regions are non-overlapping.`
        )
      }

      matches.push({
        index: charOffset,
        editIndex: i,
        actualOldText,
        actualNewText,
      })
    }

    // ── Phase 2: Apply bottom-to-top ───────────────────────────────
    // Sort by position descending so later-in-file edits are applied first
    matches.sort((a, b) => b.index - a.index)

    let updatedContent = fileContent
    let noopCount = 0
    let appliedCount = 0

    for (const match of matches) {
      const isNoop = match.actualOldText === match.actualNewText
      if (isNoop) {
        noopCount++
        continue
      }

      // Replace at exact position
      updatedContent =
        updatedContent.substring(0, match.index) +
        match.actualNewText +
        updatedContent.substring(match.index + match.actualOldText.length)
      appliedCount++
    }

    // ── Phase 3: Write result ──────────────────────────────────────
    if (appliedCount > 0) {
      if (formatHandler?.write) {
        const writeContext = await buildFormatWriteContext(target.backend, target.path, context.workspaceId)
        const binaryData = await formatHandler.write(updatedContent, path, writeContext)
        await target.backend.writeFile(target.path, binaryData)
      } else if (formatHandler && !formatHandler.write) {
        return toolErrorJson(
          'edit',
          'no_format_writer',
          `Cannot edit .${formatHandler.extension} files directly with the edit tool. Use the python tool instead if you need to modify this file.`,
          { hint: formatHandler.formatHint ?? `The .${formatHandler.extension} format handler only supports reading.` }
        )
      } else {
        await target.backend.writeFile(target.path, updatedContent)
      }
    }

    // Update read state
    readFileState.set(readStateKey, {
      content: updatedContent,
      timestamp: Date.now(),
      offset: undefined,
      limit: undefined,
      isPartialView: false,
      source: target.backend.label === 'workspace' ? 'opfs' : target.backend.label,
    })

    const pendingCount = getPendingChanges().length
    const status = target.backend.label === 'workspace' ? 'pending' : 'saved'

    // Build diff
    const patchResult = structuredPatch(path, path, fileContent, updatedContent, '', '', {
      context: 3,
    })
    const diffText = formatHunksToDiff(patchResult.hunks)

    const session = useRemoteStore.getState().session
    if (session) {
      const preview = `Edited: ${path} (${appliedCount} regions, ${edits.length - noopCount} edits applied)`
      session.broadcastFileChange(path, 'modify', preview)
    }

    return toolOkJson('edit', {
      noop: appliedCount === 0,
      path,
      action: 'modify',
      totalEdits: edits.length,
      appliedCount,
      noopCount,
      diff: diffText || undefined,
      status,
      pendingCount,
      message:
        target.backend.label === 'workspace'
          ? appliedCount === 0
            ? `File "${path}" already matched all requested content. ${pendingCount} change(s) pending review.`
            : `File "${path}" edited (${appliedCount} of ${edits.length} edits applied). ${pendingCount} change(s) pending review.`
          : appliedCount === 0
            ? `File "${path}" already matched all requested content.`
            : `File "${path}" edited (${appliedCount} of ${edits.length} edits applied).`,
      ...(formatHandler?.formatHint ? { formatHint: formatHandler.formatHint } : {}),
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

export const editPromptDoc: ToolPromptDoc = {
  category: 'file-ops',
  section: '### File Operations',
  lines: [
    '- `edit(path, edits=[{old_text, new_text}])` - Apply one or more text replacements to an existing file. REQUIRES prior read(). All edits are applied atomically. (supports `vfs://workspace/...`, `vfs://agents/{id}/...`)',
  ],
}
