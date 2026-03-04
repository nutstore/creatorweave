/**
 * file_batch_write tool - Write multiple files at once.
 *
 * Phase 4 Integration:
 * - Batch file operations using OPFS workspace
 * - All files are written to cache and marked as pending
 * - Returns summary of operations and pending count
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'

export interface FileBatchItem {
  path: string
  content: string
}

export const fileBatchWriteDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_batch_write',
    description:
      'Write multiple files at once. Creates files and any parent directories if they do not exist. All files are written to OPFS cache and marked as pending sync. Returns summary of operations.',
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'Array of files to write',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Relative file path from the project root',
              },
              content: {
                type: 'string',
                description: 'The full content to write to the file',
              },
            },
            required: ['path', 'content'],
          },
        },
      },
      required: ['files'],
    },
  },
}

export const fileBatchWriteExecutor: ToolExecutor = async (args, context) => {
  const files = args.files as FileBatchItem[]

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  if (!Array.isArray(files) || files.length === 0) {
    return JSON.stringify({ error: 'files must be a non-empty array' })
  }

  // Limit batch size to prevent performance issues
  const MAX_BATCH_SIZE = 50
  if (files.length > MAX_BATCH_SIZE) {
    return JSON.stringify({
      error: `Batch size too large. Maximum ${MAX_BATCH_SIZE} files per batch. Split into multiple calls.`,
    })
  }

  try {
    const { writeFile, getPendingChanges } = useOPFSStore.getState()
    const session = useRemoteStore.getState().session

    const results: Array<{
      path: string
      success: boolean
      action: 'created' | 'updated'
      error?: string
    }> = []

    let createdCount = 0
    const updatedCount = 0
    let errorCount = 0

    // Process each file
    for (const file of files) {
      try {
        const { path, content } = file
        await writeFile(path, content, context.directoryHandle)
        results.push({ path, success: true, action: 'created' })
        createdCount++
      } catch (error) {
        results.push({
          path: file.path,
          success: false,
          action: 'created',
          error: error instanceof Error ? error.message : String(error),
        })
        errorCount++
      }
    }

    // Get final pending count
    const pendingChanges = getPendingChanges()

    // Broadcast batch file change to remote sessions
    if (session) {
      const preview = `Batch write: ${files.length} file(s)`
      session.broadcastFileChange('[batch]', 'modify', preview)
    }

    return JSON.stringify({
      success: true,
      summary: {
        total: files.length,
        created: createdCount,
        updated: updatedCount,
        errors: errorCount,
      },
      status: 'pending',
      pendingCount: pendingChanges.length,
      message: `Batch write complete: ${createdCount} created, ${updatedCount} updated, ${errorCount} errors. ${pendingChanges.length} file(s) pending sync.`,
      results,
    })
  } catch (error) {
    return JSON.stringify({
      error: `Failed to execute batch write: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
