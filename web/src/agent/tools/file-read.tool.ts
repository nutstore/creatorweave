/**
 * file_read tool - Read file contents from the user's local filesystem.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { resolveFileHandle } from '@/services/fsAccess.service'

export const fileReadDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_read',
    description:
      'Read the contents of a file at the given path. Returns the file text content. Use this to understand existing code before making changes.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from the project root (e.g. "src/index.ts")',
        },
      },
      required: ['path'],
    },
  },
}

export const fileReadExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string
  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  try {
    const fileHandle = await resolveFileHandle(context.directoryHandle, path)
    const file = await fileHandle.getFile()

    // Check file size - limit to 1MB for text reading
    if (file.size > 1024 * 1024) {
      return JSON.stringify({
        error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum readable size is 1MB.`,
      })
    }

    const content = await file.text()
    return content
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return JSON.stringify({ error: `File not found: ${path}` })
    }
    return JSON.stringify({
      error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
