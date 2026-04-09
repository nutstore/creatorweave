/**
 * edit tool - Single-file text replacement with read-before-edit safety checks.
 */

import { structuredPatch } from 'diff'
import { useOPFSStore } from '@/store/opfs.store'
import { useRemoteStore } from '@/store/remote.store'
import type { ToolContext, ToolDefinition, ToolExecutor } from './tool-types'
import { resolveVfsTarget } from './vfs-resolver'
import { ensureReadFileState, getReadStateKey } from './read-state'

export const editDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'edit',
    description:
      'Apply text replacement to one file. ' +
      'Use path + old_text + new_text for exact replacement. ' +
      'Optional replace_all replaces every occurrence. ' +
      'Supports vfs://workspace/... and vfs://agents/{id}/....',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to edit',
        },
        old_text: {
          type: 'string',
          description: 'Exact text to find',
        },
        new_text: {
          type: 'string',
          description: 'Replacement text',
        },
        replace_all: {
          type: 'boolean',
          description: 'Replace all occurrences. Default: false',
          default: false,
        },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
}

export const editExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const oldText = args.old_text as string | undefined
  const newText = args.new_text as string | undefined
  const replaceAll = args.replace_all === true

  if (
    args.find !== undefined ||
    args.replace !== undefined ||
    args.use_regex !== undefined ||
    args.dry_run !== undefined ||
    args.max_files !== undefined ||
    looksLikeGlob(path)
  ) {
    return JSON.stringify({
      error: 'Batch edit capability has been removed. Use single-file edit with path + old_text + new_text.',
    })
  }

  if (!path || oldText === undefined || newText === undefined) {
    return JSON.stringify({
      error: 'edit requires path + old_text + new_text',
    })
  }

  return executeSingleEdit(context, { path, oldText, newText, replaceAll })
}

function looksLikeGlob(path: string | undefined): boolean {
  if (!path) return false
  return path.includes('*') || path.includes('?') || path.includes('[')
}

async function executeSingleEdit(
  context: ToolContext,
  opts: { path: string; oldText: string; newText: string; replaceAll: boolean }
): Promise<string> {
  const { path, oldText, newText, replaceAll } = opts

  if (oldText.length === 0) {
    return JSON.stringify({
      error: 'old_text cannot be empty. Provide exact existing text to replace.',
    })
  }

  const isNoopEdit = oldText === newText

  try {
    const { readFile, writeFile, getPendingChanges } = useOPFSStore.getState()
    const readFileState = ensureReadFileState(context)
    const target = await resolveVfsTarget(path, context, 'write')
    const readStateKey = getReadStateKey(target)

    let fileContent: string

    if (target.kind === 'workspace') {
      const { content } = await readFile(target.path, context.directoryHandle, context.workspaceId)
      if (typeof content !== 'string') {
        return JSON.stringify({
          error: `Cannot edit binary file: ${path}. Use write to replace the entire file.`,
        })
      }
      fileContent = content
    } else {
      const content = await target.agentManager.readPath(target.agentId, target.path)
      if (content == null) {
        return JSON.stringify({ error: `File not found: ${path}` })
      }
      fileContent = content
    }

    const snapshot = readFileState.get(readStateKey)
    if (!snapshot || snapshot.isPartialView) {
      return JSON.stringify({
        error: 'Read file before editing. Use read(path) first, then retry edit.',
      })
    }

    const isFullRead = snapshot.offset === undefined && snapshot.limit === undefined
    if (isFullRead && snapshot.content !== fileContent) {
      return JSON.stringify({
        error: 'File has been modified since read. Read it again before attempting to write it.',
      })
    }

    const matches = fileContent.split(oldText).length - 1
    if (matches === 0) {
      return JSON.stringify({
        error: 'old_text not found in file. Make sure it matches exactly (including whitespace).',
      })
    }

    if (matches > 1 && !replaceAll && !isNoopEdit) {
      return JSON.stringify({
        error:
          'old_text appears multiple times. Set replace_all=true to replace all occurrences, or provide a more unique snippet.',
      })
    }

    const updatedFile = isNoopEdit
      ? fileContent
      : replaceAll
        ? fileContent.split(oldText).join(newText)
        : fileContent.replace(oldText, newText)

    if (target.kind === 'workspace') {
      await writeFile(target.path, updatedFile, context.directoryHandle, context.workspaceId)
    } else {
      await target.agentManager.writePath(target.agentId, target.path, updatedFile)
    }

    readFileState.set(readStateKey, {
      content: updatedFile,
      timestamp: Date.now(),
      offset: undefined,
      limit: undefined,
      isPartialView: false,
    })

    const pendingCount = getPendingChanges().length
    const status = target.kind === 'workspace' ? 'pending' : 'saved'

    const patch = structuredPatch(path, path, fileContent, updatedFile, '', '', {
      context: 3,
    }).hunks

    const session = useRemoteStore.getState().session
    if (session) {
      const preview = `Edited: ${path} (${newText.length} chars added, ${oldText.length} chars removed)`
      session.broadcastFileChange(path, 'modify', preview)
    }

    return JSON.stringify({
      success: true,
      noop: isNoopEdit,
      path,
      filePath: path,
      action: 'edited',
      oldString: oldText,
      newString: newText,
      originalFile: fileContent,
      updatedFile,
      structuredPatch: patch,
      replaceAll,
      status,
      pendingCount,
      message:
        target.kind === 'workspace'
          ? isNoopEdit
            ? `File "${path}" already matched requested content. ${pendingCount} change(s) pending review.`
            : `File "${path}" edited. ${pendingCount} change(s) pending review.`
          : isNoopEdit
            ? `File "${path}" already matched requested content.`
            : `File "${path}" edited.`,
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
