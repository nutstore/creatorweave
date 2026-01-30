/**
 * file_edit tool - Apply diff-based edits to a file using string replacement.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { resolveFileHandle } from '@/services/fsAccess.service'
import { getUndoManager } from '@/undo/undo-manager'

export const fileEditDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_edit',
    description:
      'Apply a text replacement to a file. Finds the exact old_text in the file and replaces it with new_text. The old_text must be unique in the file. Use file_read first to see the current content.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from the project root',
        },
        old_text: {
          type: 'string',
          description: 'The exact text to find and replace (must be unique in the file)',
        },
        new_text: {
          type: 'string',
          description: 'The text to replace old_text with',
        },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
}

export const fileEditExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string
  const oldText = args.old_text as string
  const newText = args.new_text as string

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  try {
    const fileHandle = await resolveFileHandle(context.directoryHandle, path)
    const file = await fileHandle.getFile()
    const content = await file.text()

    // Check that old_text exists and is unique
    const firstIndex = content.indexOf(oldText)
    if (firstIndex === -1) {
      return JSON.stringify({
        error: `old_text not found in file. Make sure you have the exact text including whitespace and indentation.`,
      })
    }

    const secondIndex = content.indexOf(oldText, firstIndex + 1)
    if (secondIndex !== -1) {
      return JSON.stringify({
        error: `old_text appears multiple times in the file. Provide a larger, more unique text snippet to match.`,
      })
    }

    // Apply replacement
    const newContent = content.replace(oldText, newText)

    const writable = await fileHandle.createWritable()
    await writable.write(newContent)
    await writable.close()

    // Record modification for undo
    getUndoManager().recordModification(path, 'modify', content, newContent)

    return JSON.stringify({
      success: true,
      path,
      action: 'edited',
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
