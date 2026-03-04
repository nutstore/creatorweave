/**
 * file_write tool - Write content to a file, creating directories as needed.
 *
 * Phase 4 Integration:
 * - Uses OPFS session workspace for write operations
 * - Files are cached in OPFS with pending change tracking
 * - Supports undo/redo through OPFS workspace
 * - Broadcasts file changes to remote sessions
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import { getUndoManager } from '@/undo/undo-manager'

export const fileWriteDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_write',
    description:
      'Write content to a file. Creates the file and any parent directories if they do not exist. Overwrites existing content. Files are written to OPFS cache and marked as pending sync. Returns confirmation or error.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from the project root (e.g. "src/utils/helper.ts")',
        },
        content: {
          type: 'string',
          description: 'The full content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
}

export const fileWriteExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string
  const content = args.content as string

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  try {
    // Use OPFS store for write operations (Phase 4 integration)
    const { writeFile, getPendingChanges, hasCachedFile } = useOPFSStore.getState()

    // Check if file is new or modified
    const isNew = !hasCachedFile(path)

    // Write to OPFS workspace (caches content + tracks pending change)
    await writeFile(path, content, context.directoryHandle)

    // Get current pending count for status message
    const pendingChanges = getPendingChanges()

    // Record modification for legacy undo manager (backward compatibility)
    const oldContent = isNew ? null : '' // OPFS handles the actual old content
    getUndoManager().recordModification(path, isNew ? 'create' : 'modify', oldContent, content)

    // Broadcast file change to remote sessions
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
