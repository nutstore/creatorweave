/**
 * IO Tools - Unified file read/write operations.
 *
 * Combines:
 * - read: Read single file or multiple files
 * - write: Write single file or multiple files
 * - edit: Edit file (already unified)
 *
 * Smart mode detection: paths array = batch, single path = single
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import { getUndoManager } from '@/undo/undo-manager'

//=============================================================================
// Read Tool
//=============================================================================

export const readDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read',
    description:
      'Read file contents. With path: read single file. With paths: read multiple files. Uses cached version if file has pending modifications.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Single file path to read',
        },
        paths: {
          type: 'array',
          description: 'Multiple file paths to read (batch mode)',
          items: { type: 'string' },
        },
        reads: {
          type: 'array',
          description:
            'Advanced batch mode: [{ path, offset?, limit?, start_line?, line_count? }]. ' +
            'Use this when each file needs different read ranges.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              offset: { type: 'number' },
              limit: { type: 'number' },
              start_line: { type: 'number' },
              line_count: { type: 'number' },
            },
            required: ['path'],
          },
        },
        offset: {
          type: 'number',
          description: 'Optional 1-based line offset for partial text read (single path mode only)',
        },
        limit: {
          type: 'number',
          description: 'Optional line count for partial text read (single path mode only)',
        },
        start_line: {
          type: 'number',
          description: 'Optional 1-based start line for partial text read (single path mode only)',
        },
        line_count: {
          type: 'number',
          description: 'Optional line count for partial text read (single path mode only)',
        },
        max_size: {
          type: 'number',
          description:
            'Optional hard limit in bytes. If exceeded, returns too_large error (never truncates content).',
        },
      },
    },
  },
}

interface ReadRequest {
  path: string
  offset?: number
  limit?: number
  start_line?: number
  line_count?: number
}

interface ReadRangeOptions {
  offset?: number
  limit?: number
  startLine?: number
  lineCount?: number
}

export const readExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const paths = args.paths as string[] | undefined
  const reads = args.reads as ReadRequest[] | undefined
  const maxSize = args.max_size as number | undefined
  const rangeOptions: ReadRangeOptions = {
    offset: args.offset as number | undefined,
    limit: args.limit as number | undefined,
    startLine: args.start_line as number | undefined,
    lineCount: args.line_count as number | undefined,
  }

  const modeCount = Number(Boolean(path)) + Number(Boolean(paths?.length)) + Number(Boolean(reads?.length))
  if (modeCount !== 1) {
    return JSON.stringify({ error: 'Provide exactly one of: path, paths, reads' })
  }

  const validationError = validateReadRange(rangeOptions)
  if (validationError) {
    return JSON.stringify({ error: validationError })
  }

  // Batch mode: multiple files
  if (paths && Array.isArray(paths) && paths.length > 0) {
    return executeBatchRead(paths.map((p) => ({ path: p })), maxSize, context.directoryHandle)
  }

  if (reads && Array.isArray(reads) && reads.length > 0) {
    for (const read of reads) {
      if (!read.path) {
        return JSON.stringify({ error: 'reads[].path is required' })
      }
      const err = validateReadRange({
        offset: read.offset,
        limit: read.limit,
        startLine: read.start_line,
        lineCount: read.line_count,
      })
      if (err) return JSON.stringify({ error: `Invalid reads for "${read.path}": ${err}` })
    }
    return executeBatchRead(reads, maxSize, context.directoryHandle)
  }

  // Single file mode
  return executeSingleRead(path!, context.directoryHandle, rangeOptions, maxSize)
}

async function executeSingleRead(
  path: string,
  directoryHandle?: FileSystemDirectoryHandle | null,
  options: ReadRangeOptions = {},
  maxSize?: number
): Promise<string> {
  const { readFile } = useOPFSStore.getState()

  try {
    const { content, metadata } = await readFile(path, directoryHandle)
    if (maxSize && metadata.size > maxSize) {
      return JSON.stringify({
        error: 'too_large',
        path,
        fileSize: metadata.size,
        maxSize,
        message: `File size ${metadata.size} exceeds requested max_size ${maxSize}.`,
      })
    }

    if (typeof content === 'string') {
      return applyTextRange(content, options)
    } else {
      if (hasRangeOptions(options)) {
        return JSON.stringify({
          error: 'range_not_supported_for_binary',
          path,
          message: 'offset/limit/start_line/line_count can only be used for text files.',
        })
      }
      // Binary content - return as base64
      const buffer = content instanceof ArrayBuffer ? content : await content.arrayBuffer()
      const uint8Array = new Uint8Array(buffer)
      const base64 = btoa(String.fromCharCode(...uint8Array))
      return JSON.stringify({
        binary: true,
        content: base64,
        size: metadata.size,
        contentType: metadata.contentType,
      })
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return JSON.stringify({ error: `File not found: ${path}` })
    }
    return JSON.stringify({
      error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

async function executeBatchRead(
  reads: ReadRequest[],
  maxSize: number | undefined,
  directoryHandle?: FileSystemDirectoryHandle | null
): Promise<string> {
  const { readFile } = useOPFSStore.getState()
  const results: Array<{ path: string; success: boolean; content?: string; error?: string; metadata?: unknown }> =
    []
  let successCount = 0
  let errorCount = 0

  for (const read of reads) {
    const filePath = read.path
    try {
      const { content, metadata } = await readFile(filePath, directoryHandle)

      if (maxSize && metadata.size > maxSize) {
        results.push({
          path: filePath,
          success: false,
          error: `too_large: file size ${metadata.size} exceeds requested max_size ${maxSize}`,
          metadata: { size: metadata.size, contentType: metadata.contentType },
        })
        errorCount++
        continue
      }

      if (typeof content !== 'string') {
        if (hasRangeOptions({
          offset: read.offset,
          limit: read.limit,
          startLine: read.start_line,
          lineCount: read.line_count,
        })) {
          results.push({
            path: filePath,
            success: false,
            error: 'range_not_supported_for_binary',
            metadata: { size: metadata.size, contentType: metadata.contentType },
          })
          errorCount++
          continue
        }
        const buffer = content instanceof ArrayBuffer ? content : await content.arrayBuffer()
        const uint8Array = new Uint8Array(buffer)
        const base64 = btoa(String.fromCharCode(...uint8Array))
        results.push({
          path: filePath,
          success: true,
          content: JSON.stringify({
            binary: true,
            content: base64,
            size: metadata.size,
            contentType: metadata.contentType,
          }),
          metadata: { size: metadata.size, contentType: metadata.contentType },
        })
        successCount++
        continue
      }

      results.push({
        path: filePath,
        success: true,
        content: applyTextRange(content, {
          offset: read.offset,
          limit: read.limit,
          startLine: read.start_line,
          lineCount: read.line_count,
        }),
        metadata: { size: metadata.size, contentType: metadata.contentType },
      })
      successCount++
    } catch (error) {
      results.push({
        path: filePath,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
      errorCount++
    }
  }

  return JSON.stringify({
    success: true,
    total: reads.length,
    successCount,
    errorCount,
    results,
  })
}

function hasRangeOptions(options: ReadRangeOptions): boolean {
  return (
    options.offset !== undefined ||
    options.limit !== undefined ||
    options.startLine !== undefined ||
    options.lineCount !== undefined
  )
}

function validateReadRange(options: ReadRangeOptions): string | null {
  const hasOffsetRange = options.offset !== undefined || options.limit !== undefined
  const hasLineRange = options.startLine !== undefined || options.lineCount !== undefined

  if (hasOffsetRange && hasLineRange) {
    return 'Cannot mix offset/limit with start_line/line_count in one read request'
  }
  if (options.offset !== undefined && options.offset < 1) {
    return 'offset must be >= 1 (line index)'
  }
  if (options.limit !== undefined && options.limit <= 0) {
    return 'limit must be > 0'
  }
  if (options.startLine !== undefined && options.startLine < 1) {
    return 'start_line must be >= 1'
  }
  if (options.lineCount !== undefined && options.lineCount <= 0) {
    return 'line_count must be > 0'
  }
  return null
}

function applyTextRange(content: string, options: ReadRangeOptions): string {
  const hasOffsetRange = options.offset !== undefined || options.limit !== undefined
  const hasLineRange = options.startLine !== undefined || options.lineCount !== undefined

  if (!hasOffsetRange && !hasLineRange) {
    return content
  }

  // Range reads are line-based.
  // - offset/limit: preferred short form
  // - start_line/line_count: explicit aliases
  const start = (options.startLine ?? options.offset ?? 1) - 1
  const count = options.lineCount ?? options.limit ?? Number.MAX_SAFE_INTEGER
  const lines = content.split('\n')
  return lines.slice(start, start + count).join('\n')
}

//=============================================================================
// Write Tool
//=============================================================================

export const writeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write',
    description:
      'Write content to file(s). Single: path + content. Batch: files array [{path, content}]. Creates directories if needed. Returns confirmation.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Single file path to write',
        },
        content: {
          type: 'string',
          description: 'Content for single file write',
        },
        files: {
          type: 'array',
          description: 'Array of files to write [{path, content}]',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
        },
      },
    },
  },
}

interface FileItem {
  path: string
  content: string
}

export const writeExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const content = args.content as string | undefined
  const files = args.files as FileItem[] | undefined

  // Batch mode: files array
  if (files && Array.isArray(files) && files.length > 0) {
    return executeBatchWrite(files, context.directoryHandle)
  }

  // Single file mode
  if (!path || content === undefined) {
    return JSON.stringify({ error: 'Either (path + content) or files must be provided' })
  }
  return executeSingleWrite(path, content, context.directoryHandle)
}

async function executeSingleWrite(
  path: string,
  content: string,
  directoryHandle?: FileSystemDirectoryHandle | null
): Promise<string> {
  const { writeFile, getPendingChanges, hasCachedFile } = useOPFSStore.getState()

  try {
    const isNew = !hasCachedFile(path)
    await writeFile(path, content, directoryHandle)

    const pendingChanges = getPendingChanges()
    getUndoManager().recordModification(path, isNew ? 'create' : 'modify', isNew ? null : '', content)

    const session = useRemoteStore.getState().session
    if (session) {
      const preview = isNew ? `New file: ${path}` : `Modified: ${path} (${content.length} bytes)`
      session.broadcastFileChange(path, isNew ? 'create' : 'modify', preview)
    }

    return JSON.stringify({
      success: true,
      path,
      action: isNew ? 'created' : 'updated',
      size: content.length,
      status: 'pending',
      pendingCount: pendingChanges.length,
      message: isNew
        ? `File "${path}" created. ${pendingChanges.length} file(s) pending sync.`
        : `File "${path}" updated. ${pendingChanges.length} file(s) pending sync.`,
    })
  } catch (error) {
    return JSON.stringify({
      error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

async function executeBatchWrite(
  files: FileItem[],
  directoryHandle?: FileSystemDirectoryHandle | null
): Promise<string> {
  const { writeFile, getPendingChanges, hasCachedFile } = useOPFSStore.getState()
  const results: Array<{ path: string; success: boolean; error?: string }> = []
  let created = 0
  let updated = 0

  for (const file of files) {
    try {
      const isNew = !hasCachedFile(file.path)
      await writeFile(file.path, file.content, directoryHandle)
      getUndoManager().recordModification(file.path, isNew ? 'create' : 'modify', isNew ? null : '', file.content)

      results.push({ path: file.path, success: true })
      if (isNew) created++
      else updated++
    } catch (error) {
      results.push({
        path: file.path,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const pendingChanges = getPendingChanges()
  const session = useRemoteStore.getState().session
  if (session) {
    session.broadcastFileChange('batch', 'modify', `Batch write: ${created} created, ${updated} updated`)
  }

  return JSON.stringify({
    success: true,
    total: files.length,
    created,
    updated,
    failed: files.length - created - updated,
    results,
    pendingCount: pendingChanges.length,
    message: `${files.length} files processed. ${pendingChanges.length} pending sync.`,
  })
}
