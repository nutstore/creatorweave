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
import type { ReadPolicy } from '@/opfs/types/opfs-types'
import { resolveVfsTarget, type AgentTarget, withVfsAgentIdHint } from './vfs-resolver'
import { ensureReadFileState, getReadStateKey } from './read-state'
import { resolveNativeDirectoryHandle } from './tool-utils'
import { toolErrorJson, toolOkJson } from './tool-envelope'
import {
  checkReadLoop,
  recordReadMtime,
  checkFileStaleness,
  refreshReadTimestamp,
  checkContentSizeLimit,
} from './loop-guard'

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
            '⚠️ Default limit is ~100KB. REQUIRED for files likely exceeding 100KB (e.g. logs, CSV, JSON, large source files). Set to a larger value (e.g. 1048576 for 1MB, 10485760 for 10MB) to read bigger files. If a read returns "content_too_large", increase max_size and retry.',
        },
        read_policy: {
          type: 'string',
          description:
            'Optional source strategy: auto (default), prefer_opfs, prefer_native.',
          enum: ['auto', 'prefer_opfs', 'prefer_native'],
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

function isReadPolicy(value: unknown): value is ReadPolicy {
  return value === 'auto' || value === 'prefer_opfs' || value === 'prefer_native'
}

const BASE64_CHUNK_SIZE = 0x8000

/**
 * Build a retry hint string for content_too_large errors.
 * Tells the agent exactly what max_size value to use on retry.
 */
function buildMaxSizeHint(suggestedMaxSize: number): string {
  return `Retry with max_size=${suggestedMaxSize} to read the full file.`
}

function formatToolErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return withVfsAgentIdHint(raw)
}

export const readExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const paths = args.paths as string[] | undefined
  const reads = args.reads as ReadRequest[] | undefined
  const maxSize = args.max_size as number | undefined
  const readPolicyArg = args.read_policy
  const readPolicy: ReadPolicy | undefined =
    readPolicyArg === undefined ? undefined : (readPolicyArg as ReadPolicy)
  if (readPolicyArg !== undefined && !isReadPolicy(readPolicyArg)) {
    return toolErrorJson(
      'read',
      'invalid_arguments',
      'read_policy must be one of: auto, prefer_opfs, prefer_native'
    )
  }
  if (maxSize !== undefined) {
    if (typeof maxSize !== 'number' || !Number.isFinite(maxSize) || maxSize <= 0) {
      return toolErrorJson('read', 'invalid_arguments', 'max_size must be > 0')
    }
  }
  if (args.offset !== undefined || args.limit !== undefined) {
    return toolErrorJson(
      'read',
      'invalid_arguments',
      'offset/limit are no longer supported. Use start_line/line_count instead.'
    )
  }
  const rangeOptions: ReadRangeOptions = {
    startLine: args.start_line as number | undefined,
    lineCount: args.line_count as number | undefined,
  }

  const modeCount =
    Number(Boolean(path)) + Number(Boolean(paths?.length)) + Number(Boolean(reads?.length))
  if (modeCount !== 1) {
    return toolErrorJson('read', 'invalid_arguments', 'Provide exactly one of: path, paths, reads')
  }

  const validationError = validateReadRange(rangeOptions)
  if (validationError) {
    return toolErrorJson('read', 'invalid_arguments', validationError)
  }

  // Batch mode: multiple files
  if (paths && Array.isArray(paths) && paths.length > 0) {
    return executeBatchRead(
      paths.map((p) => ({ path: p })),
      maxSize,
      readPolicy,
      context
    )
  }

  if (reads && Array.isArray(reads) && reads.length > 0) {
    for (const read of reads) {
      if (!read.path) {
        return toolErrorJson('read', 'invalid_arguments', 'reads[].path is required')
      }
      const err = validateReadRange({
        startLine: read.start_line,
        lineCount: read.line_count,
      })
      if (err)
        return toolErrorJson(
          'read',
          'invalid_arguments',
          `Invalid reads for "${read.path}": ${err}`
        )
    }
    return executeBatchRead(reads, maxSize, readPolicy, context)
  }

  // Single file mode
  return executeSingleRead(path!, context, rangeOptions, maxSize, readPolicy)
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
  maxSize?: number,
  readPolicy?: ReadPolicy
): Promise<string> {
  const { readFile } = useOPFSStore.getState()
  const readFileState = ensureReadFileState(context)

  // Loop guard: check consecutive read counter before reading (defined outside try for scope)
  let loopCheckResult: ReturnType<typeof checkReadLoop> | null = null
  let resolvedPathForLoopGuard: string | null = null

  try {
    const target = await resolveVfsTarget(path, context, 'read')
    const readStateKey = getReadStateKey(target)

    // Loop guard: check consecutive read counter before reading
    resolvedPathForLoopGuard = getResolvedPathForLoopGuard(target)
    loopCheckResult = checkReadLoop(
      context,
      resolvedPathForLoopGuard,
      options.startLine ?? 1,
      options.lineCount ?? 0
    )
    if (loopCheckResult.isBlocked) {
      return toolErrorJson(
        'read',
        'loop_blocked',
        `BLOCKED: You have read this exact file region ${loopCheckResult.consecutive} times in a row. ` +
          'The content has NOT changed. You already have this information. ' +
          'STOP re-reading and proceed with your task.',
        { hint: 'Stop reading and proceed with writing or responding.' }
      )
    }

    const buildMeta = (extra?: Record<string, unknown>) => ({
      ...(loopCheckResult!.warning ? { _warning: loopCheckResult!.warning } : {}),
      ...extra,
    })

    if (target.kind === 'agent') {
      const content = await target.agentManager.readPath(target.agentId, target.path)
      if (content == null) {
        return toolErrorJson('read', 'file_not_found', `File not found: ${path}`)
      }
      const size = new TextEncoder().encode(content).length
      if (maxSize && size > maxSize) {
        return toolErrorJson(
          'read',
          'too_large',
          `File size ${size} exceeds requested max_size ${maxSize}.`,
          { details: { path, fileSize: size, maxSize } }
        )
      }
      const totalLines = content.split('\n').length
      const rendered = applyTextRange(content, options)
      // Safety limit: cap the actual payload returned to the model.
      // For range reads, validate the sliced content instead of full file text.
      const sizeLimitCheck = checkContentSizeLimit(rendered, size, totalLines)
      if (!sizeLimitCheck.ok) {
        return toolErrorJson('read', 'content_too_large', sizeLimitCheck.error, {
          details: { totalLines: sizeLimitCheck.totalLines },
          hint: buildMaxSizeHint(sizeLimitCheck.suggestedMaxSize),
        })
      }
      readFileState.set(readStateKey, buildReadStateEntry(rendered, options, 'agent'))
      // Agent reads don't have real filesystem mtime — use wall clock as approximation
      recordReadMtime(context, loopCheckResult!.dedupKey, Date.now(), size)
      return toolOkJson(
        'read',
        {
          path,
          kind: 'text',
          content: rendered,
          metadata: { size, contentType: 'text' },
          range: {
            start_line: options.startLine,
            line_count: options.lineCount,
          },
        },
        buildMeta({ source: 'agent' })
      )
    }

    const result = readPolicy
      ? await readFile(target.path, context.directoryHandle, context.workspaceId, readPolicy)
      : await readFile(target.path, context.directoryHandle, context.workspaceId)
    const { content, metadata } = result
    if (maxSize && metadata.size > maxSize) {
      return toolErrorJson(
        'read',
        'too_large',
        `File size ${metadata.size} exceeds requested max_size ${maxSize}.`,
        { details: { path, fileSize: metadata.size, maxSize } }
      )
    }

    if (typeof content === 'string') {
      const totalLines = content.split('\n').length
      const formatted = applyTextRange(content, options)
      // Safety limit: cap the actual payload returned to the model.
      const sizeLimitCheck = checkContentSizeLimit(formatted, metadata.size, totalLines)
      if (!sizeLimitCheck.ok) {
        return toolErrorJson('read', 'content_too_large', sizeLimitCheck.error, {
          details: { totalLines: sizeLimitCheck.totalLines },
          hint: buildMaxSizeHint(sizeLimitCheck.suggestedMaxSize),
        })
      }
      readFileState.set(
        readStateKey,
        buildReadStateEntry(formatted, options, result.source || 'workspace')
      )
      // Record mtime for future dedup — OPFS returns metadata.mtime
      recordReadMtime(context, loopCheckResult!.dedupKey, metadata.mtime, metadata.size)
      return toolOkJson(
        'read',
        {
          path,
          kind: 'text',
          content: formatted,
          metadata: { size: metadata.size, contentType: metadata.contentType },
          range: {
            start_line: options.startLine,
            line_count: options.lineCount,
          },
        },
        buildMeta({ source: result.source || 'workspace' })
      )
    }

    if (hasRangeOptions(options)) {
      return toolErrorJson(
        'read',
        'range_not_supported_for_binary',
        'offset/limit/start_line/line_count can only be used for text files.',
        { details: { path } }
      )
    }
    const base64 = await encodeBinaryContentAsBase64(content)
    return toolOkJson(
      'read',
      {
        path,
        kind: 'binary_base64',
        content: base64,
        metadata: { size: metadata.size, contentType: metadata.contentType },
      },
      buildMeta({ source: result.source || 'workspace' })
    )
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
          const result = readPolicy
            ? await readFile(target.path, nativeHandle, context.workspaceId, readPolicy)
            : await readFile(target.path, nativeHandle, context.workspaceId)
          const { content, metadata } = result
          if (maxSize && metadata.size > maxSize) {
            return toolErrorJson(
              'read',
              'too_large',
              `File size ${metadata.size} exceeds requested max_size ${maxSize}.`,
              { details: { path, fileSize: metadata.size, maxSize } }
            )
          }
          if (typeof content === 'string') {
            const totalLines = content.split('\n').length
            const formatted = applyTextRange(content, options)
            // Safety limit: cap the actual payload returned to the model.
            const sizeLimitCheck = checkContentSizeLimit(formatted, metadata.size, totalLines)
            if (!sizeLimitCheck.ok) {
              return toolErrorJson('read', 'content_too_large', sizeLimitCheck.error, {
                details: { totalLines: sizeLimitCheck.totalLines },
                hint: buildMaxSizeHint(sizeLimitCheck.suggestedMaxSize),
              })
            }
            readFileState.set(
              readStateKey,
              buildReadStateEntry(formatted, options, result.source || 'workspace')
            )
            // Record mtime for future dedup
            recordReadMtime(context, loopCheckResult!.dedupKey, metadata.mtime, metadata.size)
            return toolOkJson(
              'read',
              {
                path,
                kind: 'text',
                content: formatted,
                metadata: { size: metadata.size, contentType: metadata.contentType },
                range: {
                  start_line: options.startLine,
                  line_count: options.lineCount,
                },
              },
              {
                ...(loopCheckResult!.warning ? { _warning: loopCheckResult!.warning } : {}),
                source: 'native_fallback',
              }
            )
          }
          if (hasRangeOptions(options)) {
            return toolErrorJson(
              'read',
              'range_not_supported_for_binary',
              'offset/limit/start_line/line_count can only be used for text files.',
              { details: { path } }
            )
          }
          const base64 = await encodeBinaryContentAsBase64(content)
          return toolOkJson(
            'read',
            {
              path,
              kind: 'binary_base64',
              content: base64,
              metadata: { size: metadata.size, contentType: metadata.contentType },
            },
            {
              ...(loopCheckResult!.warning ? { _warning: loopCheckResult!.warning } : {}),
              source: 'native_fallback',
            }
          )
        }
      } catch (fallbackError) {
        // eslint-disable-next-line no-ex-assign -- intentionally propagates to outer error handler
        error = fallbackError
      }
    }
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return toolErrorJson('read', 'file_not_found', `File not found: ${path}`)
    }
    return toolErrorJson(
      'read',
      'internal_error',
      `Failed to read file: ${formatToolErrorMessage(error)}`,
      { retryable: true }
    )
  }
}

async function executeBatchRead(
  reads: ReadRequest[],
  maxSize: number | undefined,
  readPolicy: ReadPolicy | undefined,
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
  const results: Array<{
    path: string
    success: boolean
    kind?: 'text' | 'binary_base64'
    content?: string
    error?: {
      code: string
      message: string
    }
    metadata?: unknown
  }> = []
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
            error: {
              code: 'too_large',
              message: `file size ${size} exceeds requested max_size ${maxSize}`,
            },
            metadata: { size, contentType: 'text' },
          })
          errorCount++
          continue
        }

        const totalLines = agentContent.split('\n').length
        const rendered = applyTextRange(agentContent, {
          startLine: read.start_line,
          lineCount: read.line_count,
        })
        // Safety limit: cap the actual payload returned to the model.
        const sizeLimitCheck = checkContentSizeLimit(rendered, size, totalLines)
        if (!sizeLimitCheck.ok) {
          results.push({
            path: filePath,
            success: false,
            error: {
              code: 'content_too_large',
              message:
                sizeLimitCheck.error + ' ' + buildMaxSizeHint(sizeLimitCheck.suggestedMaxSize),
            },
            metadata: { size, contentType: 'text' },
          })
          errorCount++
          continue
        }

        results.push({
          path: filePath,
          success: true,
          kind: 'text',
          content: rendered,
          metadata: { size, contentType: 'text' },
          source: 'agent',
        })
        readFileState.set(getReadStateKey(target), {
          ...buildReadStateEntry(rendered, {
            startLine: read.start_line,
            lineCount: read.line_count,
          }, 'agent'),
        })
        successCount++
        continue
      }

      let readResult: Awaited<ReturnType<ReturnType<typeof useOPFSStore.getState>['readFile']>>
      try {
        readResult = readPolicy
          ? await readFile(target.path, context.directoryHandle, context.workspaceId, readPolicy)
          : await readFile(target.path, context.directoryHandle, context.workspaceId)
      } catch (error) {
        if (!isOPFSWorkspaceMiss(error)) {
          throw error
        }
        const fallbackHandle = await getNativeFallbackHandle()
        if (!fallbackHandle) {
          throw error
        }
        readResult = readPolicy
          ? await readFile(target.path, fallbackHandle, context.workspaceId, readPolicy)
          : await readFile(target.path, fallbackHandle, context.workspaceId)
      }
      const { content, metadata } = readResult

      if (maxSize && metadata.size > maxSize) {
        results.push({
          path: filePath,
          success: false,
          error: {
            code: 'too_large',
            message: `file size ${metadata.size} exceeds requested max_size ${maxSize}`,
          },
          metadata: { size: metadata.size, contentType: metadata.contentType },
        })
        errorCount++
        continue
      }

      if (typeof content !== 'string') {
        if (
          hasRangeOptions({
            startLine: read.start_line,
            lineCount: read.line_count,
          })
        ) {
          results.push({
            path: filePath,
            success: false,
            error: {
              code: 'range_not_supported_for_binary',
              message: 'start_line/line_count are not supported for binary files',
            },
            metadata: { size: metadata.size, contentType: metadata.contentType },
          })
          errorCount++
          continue
        }
        const base64 = await encodeBinaryContentAsBase64(content)
        results.push({
          path: filePath,
          success: true,
          kind: 'binary_base64',
          content: base64,
          metadata: { size: metadata.size, contentType: metadata.contentType },
          source: readResult.source || 'workspace',
        })
        successCount++
        continue
      }

      const totalLines = content.split('\n').length
      const rendered = applyTextRange(content, {
        startLine: read.start_line,
        lineCount: read.line_count,
      })
      // Safety limit: cap the actual payload returned to the model.
      const sizeLimitCheck = checkContentSizeLimit(rendered, metadata.size, totalLines)
      if (!sizeLimitCheck.ok) {
        results.push({
          path: filePath,
          success: false,
          error: {
            code: 'content_too_large',
            message: sizeLimitCheck.error + ' ' + buildMaxSizeHint(sizeLimitCheck.suggestedMaxSize),
          },
          metadata: { size: metadata.size, contentType: metadata.contentType },
        })
        errorCount++
        continue
      }

      results.push({
        path: filePath,
        success: true,
        kind: 'text',
        content: rendered,
        metadata: { size: metadata.size, contentType: metadata.contentType },
        source: readResult.source || 'workspace',
      })
      readFileState.set(getReadStateKey(target), {
          ...buildReadStateEntry(rendered, {
            startLine: read.start_line,
            lineCount: read.line_count,
          }, readResult.source || 'workspace'),
      })
      successCount++
    } catch (error) {
      results.push({
        path: filePath,
        success: false,
        error: {
          code: 'internal_error',
          message: error instanceof Error ? error.message : String(error),
        },
      })
      errorCount++
    }
  }

  return toolOkJson('read', {
    total: reads.length,
    successCount,
    errorCount,
    results,
  })
}

function hasRangeOptions(options: ReadRangeOptions): boolean {
  return options.startLine !== undefined || options.lineCount !== undefined
}

async function encodeBinaryContentAsBase64(content: ArrayBuffer | Blob): Promise<string> {
  const buffer = content instanceof ArrayBuffer ? content : await content.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (bytes.length === 0) return ''

  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE))
  }
  return btoa(binary)
}

function buildReadStateEntry(
  content: string,
  options: ReadRangeOptions,
  source: 'workspace' | 'native' | 'opfs' | 'agent' = 'workspace'
) {
  const hasRange = hasRangeOptions(options)
  return {
    content,
    timestamp: Date.now(),
    offset: hasRange ? (options.startLine ?? 1) : undefined,
    limit: hasRange ? options.lineCount : undefined,
    isPartialView: false,
    source,
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

type PendingChangeType = 'create' | 'modify' | 'delete'
type PendingChangeLike = { path: string; type: PendingChangeType }

function normalizePendingComparePath(inputPath: string): string {
  let normalized = inputPath.replace(/\\/g, '/').trim()
  if (normalized.startsWith('/mnt/')) {
    normalized = normalized.slice('/mnt/'.length)
  } else if (normalized === '/mnt') {
    normalized = ''
  }
  return normalized.replace(/^\/+/, '')
}

function getPendingWriteTypeForPath(
  pendingChanges: PendingChangeLike[],
  path: string
): Exclude<PendingChangeType, 'delete'> | null {
  const target = normalizePendingComparePath(path)
  for (let i = pendingChanges.length - 1; i >= 0; i--) {
    const pending = pendingChanges[i]
    if (normalizePendingComparePath(pending.path) !== target) continue
    if (pending.type === 'delete') continue
    return pending.type
  }
  return null
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
    return toolErrorJson(
      'write',
      'invalid_arguments',
      'Either (path + content) or files must be provided'
    )
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
    const resolvedPath = getResolvedPathForLoopGuard(target)

    // Staleness check: warn if file was modified externally since last read
    let stalenessWarning: string | null = null
    if (target.kind === 'workspace') {
      try {
        const nativeHandle = await resolveNativeDirectoryHandle(
          context.directoryHandle,
          context.workspaceId
        )
        if (nativeHandle) {
          const fileHandle = await nativeHandle
            .getFileHandle(target.path.split('/').pop()!, { create: false })
            .catch(() => null)
          if (fileHandle) {
            // getFile() returns a File object with lastModified
            const file = await fileHandle.getFile()
            stalenessWarning = checkFileStaleness(context, resolvedPath, file.lastModified)
          }
        }
      } catch {
        // Staleness check is best-effort — proceed with write if it fails
      }
    }

    let isNew = false
    let pendingCount = 0
    let status: 'pending' | 'saved' = 'saved'
    let message = ''

    const buildMeta = (extra?: Record<string, unknown>) => ({
      ...(stalenessWarning ? { _warning: stalenessWarning } : {}),
      ...extra,
    })

    if (target.kind === 'workspace') {
      const wasCachedBeforeWrite = hasCachedFile(target.path)
      const writeDirectoryHandle = await resolveNativeDirectoryHandle(
        context.directoryHandle,
        context.workspaceId
      )
      await writeFile(target.path, content, writeDirectoryHandle, context.workspaceId)
      const pendingChanges = getPendingChanges()
      pendingCount = pendingChanges.length
      const pendingType = getPendingWriteTypeForPath(pendingChanges, target.path)
      isNew = pendingType ? pendingType === 'create' : !wasCachedBeforeWrite
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

    // Refresh timestamp after successful write to avoid false staleness on consecutive edits
    refreshReadTimestamp(context, resolvedPath, Date.now())

    return toolOkJson(
      'write',
      {
        path,
        action: isNew ? 'create' : 'modify',
        size: content.length,
        status,
        pendingCount,
        message,
      },
      buildMeta()
    )
  } catch (error) {
    return toolErrorJson(
      'write',
      'internal_error',
      `Failed to write file: ${formatToolErrorMessage(error)}`,
      { retryable: true }
    )
  }
}

async function executeBatchWrite(files: FileItem[], context: ToolContext): Promise<string> {
  const { writeFile, getPendingChanges, hasCachedFile } = useOPFSStore.getState()
  const results: Array<{
    path: string
    success: boolean
    error?: { code: string; message: string }
  }> = []
  let created = 0
  let updated = 0
  let hasWorkspaceWrites = false
  const ensuredAgentIds = new Set<string>()
  const writeDirectoryHandle = await resolveNativeDirectoryHandle(
    context.directoryHandle,
    context.workspaceId
  )

  for (const file of files) {
    try {
      const target = await resolveVfsTarget(file.path, context, 'write')
      const resolvedPath = getResolvedPathForLoopGuard(target)

      // Staleness check (best-effort)
      if (target.kind === 'workspace') {
        try {
          const fileHandle = await writeDirectoryHandle
            ?.getFileHandle(target.path.split('/').pop()!, { create: false })
            .catch(() => null)
          if (fileHandle) {
            // getFile() returns a File object with lastModified
            const file = await fileHandle.getFile()
            const warning = checkFileStaleness(context, resolvedPath, file.lastModified)
            if (warning) {
              results.push({
                path: target.path,
                success: false,
                error: { code: 'file_stale', message: warning },
              })
              continue
            }
          }
        } catch {
          // Staleness check is best-effort — proceed if it fails
        }
      }

      let isNew = false

      if (target.kind === 'workspace') {
        const wasCachedBeforeWrite = hasCachedFile(target.path)
        await writeFile(target.path, file.content, writeDirectoryHandle, context.workspaceId)
        const pendingType = getPendingWriteTypeForPath(getPendingChanges(), target.path)
        isNew = pendingType ? pendingType === 'create' : !wasCachedBeforeWrite
        hasWorkspaceWrites = true
      } else {
        await ensureAgentExistsForWrite(target, ensuredAgentIds)
        const existing = await target.agentManager.readPath(target.agentId, target.path)
        isNew = existing == null
        await target.agentManager.writePath(target.agentId, target.path, file.content)
      }

      // Refresh timestamp after successful write
      refreshReadTimestamp(context, resolvedPath, Date.now())
      results.push({ path: file.path, success: true })
      if (isNew) created++
      else updated++
    } catch (error) {
      results.push({
        path: file.path,
        success: false,
        error: {
          code: 'internal_error',
          message: formatToolErrorMessage(error),
        },
      })
    }
  }

  const pendingChanges = getPendingChanges()
  const session = useRemoteStore.getState().session
  if (session) {
    session.broadcastFileChange(
      'batch',
      'modify',
      `Batch write: ${created} created, ${updated} updated`
    )
  }

  return toolOkJson('write', {
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

/**
 * Extract a stable resolved path string for loop guard tracking.
 * For workspace targets: uses the resolved absolute path.
 * For agent targets: constructs a synthetic path for tracking.
 */
function getResolvedPathForLoopGuard(target: Awaited<ReturnType<typeof resolveVfsTarget>>): string {
  if (target.kind === 'workspace') {
    return target.path
  }
  return `vfs://agents/${target.agentId}/${target.path}`
}
