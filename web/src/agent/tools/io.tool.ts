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

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import { resolveVfsTarget, type AgentTarget } from './vfs-resolver'
import { ensureReadFileState, getReadStateKey } from './read-state'
import { resolveNativeDirectoryHandle } from './tool-utils'

//=============================================================================
// Read Tool
//=============================================================================

export const readDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read',
    description:
      'Read file contents. With path: read single file. With paths: read multiple files. Uses cached version if file has pending modifications. Supports workspace relative paths and vfs://workspace/... or vfs://agents/{id}/....',
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
            'Advanced batch mode: [{ path, start_line?, line_count? }]. ' +
            'Use this when each file needs different read ranges.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              start_line: { type: 'number' },
              line_count: { type: 'number' },
            },
            required: ['path'],
          },
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
  start_line?: number
  line_count?: number
}

interface ReadRangeOptions {
  startLine?: number
  lineCount?: number
}

export const readExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const paths = args.paths as string[] | undefined
  const reads = args.reads as ReadRequest[] | undefined
  const maxSize = args.max_size as number | undefined
  if (args.offset !== undefined || args.limit !== undefined) {
    return JSON.stringify({
      error:
        'offset/limit are no longer supported. Use start_line/line_count instead.',
    })
  }
  const rangeOptions: ReadRangeOptions = {
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
    return executeBatchRead(paths.map((p) => ({ path: p })), maxSize, context)
  }

  if (reads && Array.isArray(reads) && reads.length > 0) {
    for (const read of reads) {
      if (!read.path) {
        return JSON.stringify({ error: 'reads[].path is required' })
      }
      const err = validateReadRange({
        startLine: read.start_line,
        lineCount: read.line_count,
      })
      if (err) return JSON.stringify({ error: `Invalid reads for "${read.path}": ${err}` })
    }
    return executeBatchRead(reads, maxSize, context)
  }

  // Single file mode
  return executeSingleRead(path!, context, rangeOptions, maxSize)
}

function isOPFSWorkspaceMiss(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('File not found in OPFS workspace:') ||
    message.includes('File not found in OPFS cache:')
  )
}

async function executeSingleRead(
  path: string,
  context: ToolContext,
  options: ReadRangeOptions = {},
  maxSize?: number
): Promise<string> {
  const { readFile } = useOPFSStore.getState()
  const readFileState = ensureReadFileState(context)

  try {
    const target = await resolveVfsTarget(path, context, 'read')
    const readStateKey = getReadStateKey(target)

    if (target.kind === 'agent') {
      const content = await target.agentManager.readPath(target.agentId, target.path)
      if (content == null) {
        return JSON.stringify({ error: `File not found: ${path}` })
      }
      const size = new TextEncoder().encode(content).length
      if (maxSize && size > maxSize) {
        return JSON.stringify({
          error: 'too_large',
          path,
          fileSize: size,
          maxSize,
          message: `File size ${size} exceeds requested max_size ${maxSize}.`,
        })
      }
      const rendered = applyTextRange(content, options)
      readFileState.set(readStateKey, buildReadStateEntry(rendered, options))
      return rendered
    }

    const result = await readFile(target.path, context.directoryHandle, context.workspaceId)
    const { content, metadata } = result
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
      const formatted = applyTextRange(content, options)
      readFileState.set(readStateKey, buildReadStateEntry(formatted, options))
      return formatted
    }

    if (hasRangeOptions(options)) {
      return JSON.stringify({
        error: 'range_not_supported_for_binary',
        path,
        message: 'offset/limit/start_line/line_count can only be used for text files.',
      })
    }
    const buffer = content instanceof ArrayBuffer ? content : await content.arrayBuffer()
    const uint8Array = new Uint8Array(buffer)
    const base64 = btoa(String.fromCharCode(...uint8Array))
    return JSON.stringify({
      binary: true,
      content: base64,
      size: metadata.size,
      contentType: metadata.contentType,
    })
  } catch (error) {
    if (isOPFSWorkspaceMiss(error)) {
      try {
        const target = await resolveVfsTarget(path, context, 'read')
        if (target.kind !== 'workspace') {
          throw error
        }
        const readStateKey = getReadStateKey(target)
        const nativeHandle = await resolveNativeDirectoryHandle(
          context.directoryHandle,
          context.workspaceId
        )
        if (nativeHandle) {
          const result = await readFile(target.path, nativeHandle, context.workspaceId)
          const { content, metadata } = result
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
            const formatted = applyTextRange(content, options)
            readFileState.set(readStateKey, buildReadStateEntry(formatted, options))
            return formatted
          }
          if (hasRangeOptions(options)) {
            return JSON.stringify({
              error: 'range_not_supported_for_binary',
              path,
              message: 'offset/limit/start_line/line_count can only be used for text files.',
            })
          }
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
      } catch (fallbackError) {
        error = fallbackError
      }
    }
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
  context: ToolContext
): Promise<string> {
  const { readFile } = useOPFSStore.getState()
  const readFileState = ensureReadFileState(context)
  let nativeFallbackHandle: FileSystemDirectoryHandle | null | undefined
  const getNativeFallbackHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
    if (nativeFallbackHandle !== undefined) return nativeFallbackHandle
    try {
      nativeFallbackHandle = await resolveNativeDirectoryHandle(
        context.directoryHandle,
        context.workspaceId
      )
    } catch {
      nativeFallbackHandle = null
    }
    return nativeFallbackHandle
  }
  const results: Array<{ path: string; success: boolean; content?: string; error?: string; metadata?: unknown }> =
    []
  let successCount = 0
  let errorCount = 0

  for (const read of reads) {
    const filePath = read.path
    try {
      const target = await resolveVfsTarget(filePath, context, 'read')

      if (target.kind === 'agent') {
        const agentContent = await target.agentManager.readPath(target.agentId, target.path)
        if (agentContent == null) {
          throw new Error(`File not found: ${filePath}`)
        }
        const size = new TextEncoder().encode(agentContent).length

        if (maxSize && size > maxSize) {
          results.push({
            path: filePath,
            success: false,
            error: `too_large: file size ${size} exceeds requested max_size ${maxSize}`,
            metadata: { size, contentType: 'text' },
          })
          errorCount++
          continue
        }

        const rendered = applyTextRange(agentContent, {
          startLine: read.start_line,
          lineCount: read.line_count,
        })
        results.push({
          path: filePath,
          success: true,
          content: rendered,
          metadata: { size, contentType: 'text' },
        })
        readFileState.set(getReadStateKey(target), {
          ...buildReadStateEntry(rendered, {
            startLine: read.start_line,
            lineCount: read.line_count,
          }),
        })
        successCount++
        continue
      }

      let readResult: Awaited<ReturnType<ReturnType<typeof useOPFSStore.getState>['readFile']>>
      try {
        readResult = await readFile(target.path, context.directoryHandle, context.workspaceId)
      } catch (error) {
        if (!isOPFSWorkspaceMiss(error)) {
          throw error
        }
        const fallbackHandle = await getNativeFallbackHandle()
        if (!fallbackHandle) {
          throw error
        }
        readResult = await readFile(target.path, fallbackHandle, context.workspaceId)
      }
      const { content, metadata } = readResult

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

      const rendered = applyTextRange(content, {
        startLine: read.start_line,
        lineCount: read.line_count,
      })
      results.push({
        path: filePath,
        success: true,
        content: rendered,
        metadata: { size: metadata.size, contentType: metadata.contentType },
      })
      readFileState.set(getReadStateKey(target), {
        ...buildReadStateEntry(rendered, {
          startLine: read.start_line,
          lineCount: read.line_count,
        }),
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
  return options.startLine !== undefined || options.lineCount !== undefined
}

function buildReadStateEntry(content: string, options: ReadRangeOptions) {
  const hasRange = hasRangeOptions(options)
  return {
    content,
    timestamp: Date.now(),
    offset: hasRange ? (options.startLine ?? 1) : undefined,
    limit: hasRange ? options.lineCount : undefined,
    isPartialView: false,
  }
}

function validateReadRange(options: ReadRangeOptions): string | null {
  if (options.startLine !== undefined && options.startLine < 1) {
    return 'start_line must be >= 1'
  }
  if (options.lineCount !== undefined && options.lineCount <= 0) {
    return 'line_count must be > 0'
  }
  return null
}

function applyTextRange(content: string, options: ReadRangeOptions): string {
  const hasLineRange = options.startLine !== undefined || options.lineCount !== undefined
  if (!hasLineRange) {
    return content
  }

  const start = (options.startLine ?? 1) - 1
  const count = options.lineCount ?? Number.MAX_SAFE_INTEGER
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
      'Write content to file(s). Single: path + content. Batch: files array [{path, content}]. Creates directories if needed. Returns confirmation. Supports workspace relative paths and vfs://workspace/... or vfs://agents/{id}/....',
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
    return executeBatchWrite(files, context)
  }

  // Single file mode
  if (!path || content === undefined) {
    return JSON.stringify({ error: 'Either (path + content) or files must be provided' })
  }
  return executeSingleWrite(path, content, context)
}

async function executeSingleWrite(
  path: string,
  content: string,
  context: ToolContext
): Promise<string> {
  const { writeFile, getPendingChanges, hasCachedFile } = useOPFSStore.getState()

  try {
    const target = await resolveVfsTarget(path, context, 'write')
    let isNew = false
    let pendingCount = 0
    let status: 'pending' | 'saved' = 'saved'
    let message = ''

    if (target.kind === 'workspace') {
      isNew = !hasCachedFile(target.path)
      await writeFile(target.path, content, context.directoryHandle, context.workspaceId)
      pendingCount = getPendingChanges().length
      status = 'pending'
      message = isNew
        ? `File "${path}" created. ${pendingCount} change(s) pending review.`
        : `File "${path}" updated. ${pendingCount} change(s) pending review.`
    } else {
      await ensureAgentExistsForWrite(target)
      const existing = await target.agentManager.readPath(target.agentId, target.path)
      isNew = existing == null
      await target.agentManager.writePath(target.agentId, target.path, content)
      pendingCount = getPendingChanges().length
      status = 'saved'
      message = isNew ? `File "${path}" created.` : `File "${path}" updated.`
    }

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
      status,
      pendingCount,
      message,
    })
  } catch (error) {
    return JSON.stringify({
      error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

async function executeBatchWrite(
  files: FileItem[],
  context: ToolContext
): Promise<string> {
  const { writeFile, getPendingChanges, hasCachedFile } = useOPFSStore.getState()
  const results: Array<{ path: string; success: boolean; error?: string }> = []
  let created = 0
  let updated = 0
  let hasWorkspaceWrites = false
  const ensuredAgentIds = new Set<string>()

  for (const file of files) {
    try {
      const target = await resolveVfsTarget(file.path, context, 'write')
      let isNew = false

      if (target.kind === 'workspace') {
        isNew = !hasCachedFile(target.path)
        await writeFile(target.path, file.content, context.directoryHandle, context.workspaceId)
        hasWorkspaceWrites = true
      } else {
        await ensureAgentExistsForWrite(target, ensuredAgentIds)
        const existing = await target.agentManager.readPath(target.agentId, target.path)
        isNew = existing == null
        await target.agentManager.writePath(target.agentId, target.path, file.content)
      }

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
    status: hasWorkspaceWrites ? 'pending' : 'saved',
    pendingCount: pendingChanges.length,
    message: `${files.length} files processed. ${pendingChanges.length} change(s) pending review.`,
  })
}

async function ensureAgentExistsForWrite(target: AgentTarget, cache?: Set<string>): Promise<void> {
  const cacheKey = `${target.projectId}:${target.agentId}`
  if (cache?.has(cacheKey)) return

  const exists = await target.agentManager.hasAgent(target.agentId)
  if (!exists) {
    await target.agentManager.createAgent(target.agentId)
  }

  cache?.add(cacheKey)
}
