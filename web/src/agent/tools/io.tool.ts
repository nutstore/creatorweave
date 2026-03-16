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
        max_size: {
          type: 'number',
          description: 'Maximum file size in bytes for batch read. Default: 256KB.',
        },
      },
    },
  },
}

export const readExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const paths = args.paths as string[] | undefined
  const maxSize = args.max_size as number | undefined

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  // Batch mode: multiple files
  if (paths && Array.isArray(paths) && paths.length > 0) {
    return executeBatchRead(paths, maxSize, context.directoryHandle)
  }

  // Single file mode
  if (!path) {
    return JSON.stringify({ error: 'Either path or paths must be provided' })
  }
  return executeSingleRead(path, context.directoryHandle)
}

async function executeSingleRead(path: string, directoryHandle: FileSystemDirectoryHandle): Promise<string> {
  const { readFile } = useOPFSStore.getState()

  try {
    const { content, metadata } = await readFile(path, directoryHandle)

    // Check file size - limit to 1MB for text reading
    if (metadata.size > 1024 * 1024) {
      return JSON.stringify({
        error: `File is too large (${(metadata.size / 1024 / 1024).toFixed(1)}MB). Maximum readable size is 1MB.`,
      })
    }

    if (typeof content === 'string') {
      return content
    } else {
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
  paths: string[],
  maxSize: number | undefined,
  directoryHandle: FileSystemDirectoryHandle
): Promise<string> {
  const { readFile } = useOPFSStore.getState()
  const sizeLimit = maxSize || 262144 // 256KB default
  const results: Array<{ path: string; success: boolean; content?: string; error?: string }> = []
  let successCount = 0
  let errorCount = 0

  for (const filePath of paths) {
    try {
      const { content, metadata } = await readFile(filePath, directoryHandle)

      if (metadata.size > sizeLimit) {
        results.push({ path: filePath, success: false, error: `File size exceeds ${sizeLimit} bytes` })
        errorCount++
        continue
      }

      if (typeof content !== 'string') {
        results.push({ path: filePath, success: false, error: 'Binary file not supported' })
        errorCount++
        continue
      }

      results.push({ path: filePath, success: true, content })
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
    total: paths.length,
    successCount,
    errorCount,
    results,
  })
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

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  // Batch mode: files array
  if (files && Array.isArray(files) && files.length > 0) {
    return executeBatchWrite(files, context.directoryHandle!)
  }

  // Single file mode
  if (!path || content === undefined) {
    return JSON.stringify({ error: 'Either (path + content) or files must be provided' })
  }
  return executeSingleWrite(path, content, context.directoryHandle!)
}

async function executeSingleWrite(
  path: string,
  content: string,
  directoryHandle: FileSystemDirectoryHandle
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
  directoryHandle: FileSystemDirectoryHandle
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
