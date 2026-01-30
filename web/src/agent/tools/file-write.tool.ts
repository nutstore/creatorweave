/**
 * file_write tool - Write content to a file, creating directories as needed.
 * Records modifications for undo support.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { resolveFileHandle, createFileWithDirs } from '@/services/fsAccess.service'
import { getUndoManager } from '@/undo/undo-manager'

export const fileWriteDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_write',
    description:
      'Write content to a file. Creates the file and any parent directories if they do not exist. Overwrites existing content. Returns confirmation or error.',
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
    // Try to read existing content for undo support
    let oldContent: string | null = null
    try {
      const existingHandle = await resolveFileHandle(context.directoryHandle, path)
      const existingFile = await existingHandle.getFile()
      oldContent = await existingFile.text()
    } catch {
      // File doesn't exist yet - that's fine
    }

    // Create file (and directories) then write
    const fileHandle = await createFileWithDirs(context.directoryHandle, path)
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()

    const isNew = oldContent === null
    // Record modification for undo
    getUndoManager().recordModification(path, isNew ? 'create' : 'modify', oldContent, content)

    return JSON.stringify({
      success: true,
      path,
      action: isNew ? 'created' : 'updated',
      size: content.length,
    })
  } catch (error) {
    return JSON.stringify({
      error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
