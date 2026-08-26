import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { resolveNativeDirectoryHandleForPath } from './tool-utils'
import { toolErrorJson, toolOkJson } from './tool-envelope'

/**
 * Resolve the conversation-like object from tool context.
 * workspaceId is always provided by the agent loop. If missing, returns undefined (caller bug).
 */
async function resolveConversation(context: { workspaceId?: string | null }) {
  if (!context.workspaceId) return undefined
  const { getWorkspaceManager } = await import('@/opfs')
  const manager = await getWorkspaceManager()
  const workspace = await manager.getWorkspace(context.workspaceId)
  if (workspace) {
    return { conversation: workspace, conversationId: context.workspaceId }
  }
  return undefined
}

export const detectConflictsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'detect_conflicts',
    description:
      'Detect file conflicts between OPFS pending changes and disk files. ' +
      'Use this to check if any files have been modified on disk since the pending changes were created.',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to check. If not provided, checks all pending changes.',
        },
      },
    },
  },
}

export const detectConflictsExecutor: ToolExecutor = async (args, context) => {
  const paths = args.paths as string[] | undefined
  const active = await resolveConversation(context)
  if (!active) {
    return toolErrorJson('detect_conflicts', 'no_active_workspace', 'No active workspace')
  }

  // TODO: detectSyncConflicts needs per-path handle resolution for multi-root
  const { handle: dirHandle } = await resolveNativeDirectoryHandleForPath('', context.directoryHandle, context.workspaceId)
  if (!dirHandle) {
    return toolErrorJson(
      'detect_conflicts',
      'no_directory_handle',
      'No directory handle available. Please select a project directory.'
    )
  }

  try {
    const conflicts = await active.conversation.detectSyncConflicts(dirHandle, paths)

    if (conflicts.length === 0) {
      return toolOkJson('detect_conflicts', {
        hasConflicts: false,
        conflicts: [],
        message: 'No conflicts detected.',
      })
    }

    return toolOkJson('detect_conflicts', {
      hasConflicts: true,
      conflicts: conflicts.map((c) => ({
        path: c.path,
        conflictType: 'mtime_or_marker',
        resolvableByEdit: true,
        opfsMtime: c.opfsMtime,
        currentFsMtime: c.currentFsMtime,
      })),
      message:
        `Detected ${conflicts.length} conflict(s). ` +
        'Text conflicts are materialized with <<<<<<< / ======= / >>>>>>> markers in OPFS. ' +
        'Please resolve markers with edit, then re-run detect_conflicts.',
    }, { requiresResolution: true })
  } catch (err) {
    return toolErrorJson(
      'detect_conflicts',
      'internal_error',
      err instanceof Error ? err.message : 'Conflict detection failed',
      { retryable: true }
    )
  }
}

export const createCheckpointDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_checkpoint',
    description:
      'Create a checkpoint for current OPFS file changes during the agent loop. ' +
      'Use this to save a safe point after making significant modifications — if subsequent changes go wrong, you can rollback to this checkpoint and restore OPFS files to that state. ' +
      'Important: this does NOT apply changes to native disk. ' +
      'This is NOT the same as a snapshot (which is a committed change set synced to disk).',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Optional short note describing this checkpoint',
        },
      },
    },
  },
}

export const createCheckpointExecutor: ToolExecutor = async (args, context) => {
  const summary = args.summary as string | undefined
  const active = await resolveConversation(context)
  if (!active) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  const { handle: dirHandle } = await resolveNativeDirectoryHandleForPath('', context.directoryHandle, context.workspaceId)
  const result = await active.conversation.createDraftSnapshot(summary, dirHandle)
  await useConversationContextStore.getState().updateCurrentCounts()
  await useConversationContextStore.getState().refreshPendingChanges(true)

  if (!result) {
    return JSON.stringify({
      success: true,
      created: false,
      message: 'No draft changes to save as checkpoint.',
    })
  }

  return JSON.stringify({
    success: true,
    created: true,
    checkpointId: result.snapshotId,
    opCount: result.opCount,
    message: `Saved checkpoint ${result.snapshotId} (${result.opCount} change(s)).`,
  })
}

export const rollbackCheckpointDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'rollback_checkpoint',
    description:
      'Rollback OPFS file changes to a previously created checkpoint. ' +
      'OPFS files will be restored to the state they were in when the checkpoint was created. ' +
      'New files created after the checkpoint are removed from the OPFS workspace. ' +
      'Modified/deleted existing files may require a directory handle to restore from disk.',
    parameters: {
      type: 'object',
      properties: {
        checkpoint_id: {
          type: 'string',
          description: 'Checkpoint id to rollback to',
        },
      },
      required: ['checkpoint_id'],
    },
  },
}

export const rollbackCheckpointExecutor: ToolExecutor = async (args, context) => {
  const checkpointId = args.checkpoint_id as string | undefined
  if (!checkpointId) {
    return JSON.stringify({ error: 'checkpoint_id is required' })
  }

  const active = await resolveConversation(context)
  if (!active) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  const { handle: dirHandle } = await resolveNativeDirectoryHandleForPath('', context.directoryHandle, context.workspaceId)
  const result = await active.conversation.rollbackSnapshot(checkpointId, dirHandle)
  await useConversationContextStore.getState().updateCurrentCounts()
  await useConversationContextStore.getState().refreshPendingChanges(true)
  const hasUnresolved = result.unresolved.length > 0

  return JSON.stringify({
    success: !hasUnresolved,
    reverted: result.reverted,
    unresolved: result.unresolved,
    hint:
      hasUnresolved && !dirHandle
        ? '当前未连接本机目录，无法恢复已存在文件；请先选择目录后重试。'
        : hasUnresolved
          ? '部分文件在当前目录中不存在，无法自动恢复，请手动处理。'
          : undefined,
    message:
      !hasUnresolved
        ? `Rolled back ${result.reverted} change(s) to checkpoint ${checkpointId}.`
        : `Rolled back ${result.reverted} change(s), ${result.unresolved.length} unresolved.`,
  })
}

export const changesetPromptDoc: ToolPromptDoc = {
  category: 'changeset',
  section: '### Checkpoint & Sync Tools',
  lines: [
    '- `create_checkpoint(summary?)` - Create a checkpoint for current OPFS file changes (save point for rollback during agent loop)',
    '- `rollback_checkpoint(checkpoint_id)` - Rollback OPFS files to a previously created checkpoint state',
    '- `detect_conflicts(paths?)` - Detect file conflicts between OPFS pending changes and disk files',
  ],
}
