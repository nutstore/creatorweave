/**
 * edit tool - Apply diff-based edits to a file using string replacement.
 *
 * Supports two modes:
 * - Single file mode: exact text replacement (old_text/new_text)
 * - Batch mode: regex-based multi-file editing (find/replace with glob pattern)
 *
 * Phase 4 Integration:
 * - Uses OPFS cache for reading file content
 * - Writes edited content to OPFS workspace
 * - Supports undo/redo through OPFS workspace
 * - Broadcasts file changes to remote sessions
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import micromatch from 'micromatch'
import { traverseDirectory } from '@/services/traversal.service'

export const editDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'edit',
    description:
      'Apply text replacements to file(s). ' +
      'Single mode: path + old_text + new_text for exact replacement. ' +
      'Batch mode: file_pattern + find + replace for regex-based multi-file editing. ' +
      'Uses cached content if file has pending modifications.',
    parameters: {
      type: 'object',
      properties: {
        // Common parameters
        path: {
          type: 'string',
          description: 'File path (single mode) or glob pattern (batch mode)',
        },
        // Single file mode
        old_text: {
          type: 'string',
          description: 'Exact text to find and replace (single file mode)',
        },
        new_text: {
          type: 'string',
          description: 'Replacement text (single file mode)',
        },
        // Batch mode
        find: {
          type: 'string',
          description: 'Text or regex pattern to find (batch mode)',
        },
        replace: {
          type: 'string',
          description: 'Replacement text (batch mode)',
        },
        use_regex: {
          type: 'boolean',
          description: 'Treat "find" as regex pattern. Default: false',
          default: false,
        },
        dry_run: {
          type: 'boolean',
          description: 'Preview changes without applying. Default: false',
          default: false,
        },
        max_files: {
          type: 'number',
          description: 'Maximum files to process in batch mode. Default: 50',
          default: 50,
        },
      },
    },
  },
}

export const editExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string
  const oldText = args.old_text as string
  const newText = args.new_text as string

  // Detect batch mode: if find/replace or use_regex is provided, use batch mode
  const find = args.find as string | undefined
  const replace = args.replace as string | undefined
  const useRegex = args.use_regex as boolean | undefined
  const dryRun = args.dry_run as boolean | undefined
  const maxFiles = args.max_files as number | undefined
  const isBatchMode = find !== undefined || useRegex === true || isGlobPattern(path)

  if (isBatchMode) {
    return executeBatchEdit(args, context, { find, replace, useRegex, dryRun, maxFiles })
  }

  // Single file mode (original logic)
  return executeSingleEdit(args, context, { oldText, newText, path })
}

/**
 * Check if path is a glob pattern
 */
function isGlobPattern(path: string): boolean {
  return path.includes('*') || path.includes('?') || path.includes('[')
}

/**
 * Single file edit - original logic
 */
async function executeSingleEdit(
  _args: Record<string, unknown>,
  context: unknown,
  opts: { oldText: string; newText: string; path: string }
): Promise<string> {
  const { oldText, newText, path } = opts
  const toolContext = context as { directoryHandle?: FileSystemDirectoryHandle }

  try {
    const { readFile, writeFile, getPendingChanges } = useOPFSStore.getState()

    const { content } = await readFile(path, toolContext.directoryHandle)

    if (typeof content !== 'string') {
      return JSON.stringify({
        error: `Cannot edit binary file: ${path}. Use write to replace the entire file.`,
      })
    }

    const fileContent = content

    const firstIndex = fileContent.indexOf(oldText)
    if (firstIndex === -1) {
      return JSON.stringify({
        error: `old_text not found in file. Make sure you have the exact text including whitespace and indentation.`,
      })
    }

    const secondIndex = fileContent.indexOf(oldText, firstIndex + 1)
    if (secondIndex !== -1) {
      return JSON.stringify({
        error: `old_text appears multiple times in the file. Provide a larger, more unique text snippet to match.`,
      })
    }

    const newContent = fileContent.replace(oldText, newText)

    await writeFile(path, newContent, toolContext.directoryHandle)

    const pendingChanges = getPendingChanges()

    const session = useRemoteStore.getState().session
    if (session) {
      const preview = `Edited: ${path} (${newText.length} chars added, ${oldText.length} chars removed)`
      session.broadcastFileChange(path, 'modify', preview)
    }

    return JSON.stringify({
      success: true,
      path,
      action: 'edited',
      status: 'pending',
      pendingCount: pendingChanges.length,
      message: `File "${path}" edited. ${pendingChanges.length} change(s) pending review.`,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return JSON.stringify({ error: `File not found: ${path}` })
    }
    return JSON.stringify({
      error: `Failed to edit file: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

/**
 * Batch edit - from batch-operations.tool.ts logic
 */
async function executeBatchEdit(
  args: Record<string, unknown>,
  context: unknown,
  opts: { find?: string; replace?: string; useRegex?: boolean; dryRun?: boolean; maxFiles?: number }
): Promise<string> {
  const filePattern = args.path as string
  const { find, replace, useRegex, dryRun, maxFiles } = opts
  const toolContext = context as { directoryHandle?: FileSystemDirectoryHandle }

  if (!toolContext.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  if (!find || replace === undefined) {
    return JSON.stringify({
      error: 'Batch mode requires "find" and "replace" parameters, or use single file mode with "old_text" and "new_text".',
    })
  }

  try {
    const { readFile, writeFile, getPendingChanges } = useOPFSStore.getState()
    const session = useRemoteStore.getState().session

    // Compile search pattern
    let searchPattern: RegExp | string
    if (useRegex) {
      try {
        searchPattern = new RegExp(find, 'gm')
      } catch (error) {
        return JSON.stringify({
          error: `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    } else {
      searchPattern = find
    }

    // Find matching files
    const matchingFiles: string[] = []
    const limit = maxFiles || 50

    for await (const entry of traverseDirectory(toolContext.directoryHandle)) {
      if (entry.type !== 'file') continue
      if (matchingFiles.length >= limit) break

      if (
        micromatch.isMatch(entry.path, filePattern) ||
        micromatch.isMatch(entry.name, filePattern)
      ) {
        matchingFiles.push(entry.path)
      }
    }

    if (matchingFiles.length === 0) {
      return JSON.stringify({
        success: true,
        message: `No files found matching pattern: ${filePattern}`,
        results: [],
      })
    }

    // Process each file
    const results: Array<{ path: string; success: boolean; matched: boolean; preview?: { old: string; new: string; line: number }; error?: string }> = []
    let totalMatches = 0
    let totalReplacements = 0

    for (const filePath of matchingFiles) {
      try {
        const { content } = await readFile(filePath, toolContext.directoryHandle)

        if (typeof content !== 'string') {
          results.push({
            path: filePath,
            success: false,
            matched: false,
            error: 'Cannot edit binary file',
          })
          continue
        }

        const fileContent = content
        let matched = false
        let preview: { old: string; new: string; line: number } | undefined

        if (useRegex) {
          const regex = searchPattern as RegExp
          const matches = fileContent.match(regex)
          matched = matches !== null && matches.length > 0

          if (matched && matches) {
            totalMatches += matches.length
            const newContent = fileContent.replace(regex, replace)

            const firstMatch = regex.exec(fileContent)
            if (firstMatch) {
              const lines = fileContent.split('\n')
              let lineNum = 0
              let charCount = 0
              for (let i = 0; i < lines.length; i++) {
                if (charCount + lines[i].length >= firstMatch.index) {
                  lineNum = i + 1
                  break
                }
                charCount += lines[i].length + 1
              }
              preview = { old: firstMatch[0], new: replace, line: lineNum }
            }

            if (!dryRun) {
              await writeFile(filePath, newContent, toolContext.directoryHandle)
              totalReplacements++
            }
          }
        } else {
          const lowerContent = fileContent.toLowerCase()
          const lowerFind = find.toLowerCase()
          const idx = lowerContent.indexOf(lowerFind)
          matched = idx !== -1

          if (matched) {
            totalMatches++
            const newContent = fileContent.split(find).join(replace)

            const lines = fileContent.split('\n')
            let lineNum = 0
            let charCount = 0
            for (let i = 0; i < lines.length; i++) {
              if (charCount + lines[i].length >= idx) {
                lineNum = i + 1
                break
              }
              charCount += lines[i].length + 1
            }
            preview = { old: find, new: replace, line: lineNum }

            if (!dryRun) {
              await writeFile(filePath, newContent, toolContext.directoryHandle)
              totalReplacements++
            }
          }
        }

        results.push({
          path: filePath,
          success: true,
          matched,
          preview,
        })
      } catch (err) {
        results.push({
          path: filePath,
          success: false,
          matched: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const pendingChanges = getPendingChanges()

    if (session && !dryRun) {
      session.broadcastFileChange(filePattern, 'modify', `Batch edit: ${totalReplacements} files`)
    }

    return JSON.stringify({
      success: true,
      mode: dryRun ? 'dry_run' : 'applied',
      totalMatches,
      totalReplacements: dryRun ? 0 : totalReplacements,
      filesScanned: matchingFiles.length,
      pendingCount: pendingChanges.length,
      results,
      message: dryRun
        ? `Dry run: ${totalMatches} matches found in ${matchingFiles.length} files`
        : `Edited ${totalReplacements} of ${matchingFiles.length} files. ${pendingChanges.length} change(s) pending review.`,
    })
  } catch (error) {
    return JSON.stringify({
      error: `Batch edit failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
