import type { ToolDefinition, ToolExecutor } from './tool-types'
import { getActiveConversation, useConversationContextStore } from '@/store/conversation-context.store'
import { resolveNativeDirectoryHandle } from './tool-utils'

export const forceSyncFilesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'force_sync_files',
    description:
      'Force sync pending file changes to disk, bypassing conflict checks. ' +
      'Use this when you want to overwrite disk files with OPFS versions. ' +
      'IMPORTANT: This will overwrite any local changes without warning. ' +
      'Use detect_conflicts first to check for conflicts.',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to force sync. If not provided, syncs all pending changes.',
        },
        summary: {
          type: 'string',
          description: 'Optional commit message for this sync',
        },
      },
    },
  },
}

export const forceSyncFilesExecutor: ToolExecutor = async (args, context) => {
  const paths = args.paths as string[] | undefined
  const summary = args.summary as string | undefined
  const active = await getActiveConversation()
  if (!active) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  const dirHandle = await resolveNativeDirectoryHandle(context.directoryHandle, context.workspaceId)
  if (!dirHandle) {
    return JSON.stringify({ error: 'No directory handle available. Please select a project directory.' })
  }

  try {
    // First create a snapshot if paths provided
    if (paths && paths.length > 0) {
      await active.conversation.createApprovedSnapshotForPaths(paths, summary, dirHandle)
    }

    // Then force sync
    const result = await active.conversation.syncToDisk(dirHandle, paths, true)
    await useConversationContextStore.getState().updateCurrentCounts()
    await useConversationContextStore.getState().refreshPendingChanges(true)

    if (result.success === 0 && result.failed === 0) {
      return JSON.stringify({
        success: true,
        message: 'No files to sync.',
      })
    }

    return JSON.stringify({
      success: result.failed === 0,
      successCount: result.success,
      failedCount: result.failed,
      conflicts: result.conflicts,
      message: `Synced ${result.success} file(s), ${result.failed} failed.`,
    })
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : 'Force sync failed',
    })
  }
}

export const detectConflictsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'detect_conflicts',
    description:
      'Detect file conflicts between OPFS pending changes and disk files. ' +
      'Use this before force_sync_files to check what conflicts exist.',
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
  const active = await getActiveConversation()
  if (!active) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  const dirHandle = await resolveNativeDirectoryHandle(context.directoryHandle, context.workspaceId)
  if (!dirHandle) {
    return JSON.stringify({ error: 'No directory handle available. Please select a project directory.' })
  }

  try {
    const conflicts = await active.conversation.detectSyncConflicts(dirHandle, paths)

    if (conflicts.length === 0) {
      return JSON.stringify({
        hasConflicts: false,
        conflicts: [],
        message: 'No conflicts detected.',
      })
    }

    return JSON.stringify({
      hasConflicts: true,
      conflicts: conflicts.map((c) => ({
        path: c.path,
        opfsMtime: c.opfsMtime,
        currentFsMtime: c.currentFsMtime,
      })),
      message: `Detected ${conflicts.length} conflict(s). Use force_sync_files to overwrite, or read the disk version to merge changes.`,
    })
  } catch (err) {
    return JSON.stringify({
      hasConflicts: false,
      error: err instanceof Error ? err.message : 'Conflict detection failed',
    })
  }
}

export const createSnapshotDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_snapshot',
    description:
      'Create a snapshot for current file changes. ' +
      'Use this as a review point before approving changes to disk. ' +
      'Important: this does NOT apply changes to native disk.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Optional short note describing this snapshot',
        },
      },
    },
  },
}

export const createSnapshotExecutor: ToolExecutor = async (args) => {
  const summary = args.summary as string | undefined
  const active = await getActiveConversation()
  if (!active) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  const result = await active.conversation.createDraftSnapshot(summary)
  await useConversationContextStore.getState().updateCurrentCounts()
  await useConversationContextStore.getState().refreshPendingChanges(true)

  if (!result) {
    return JSON.stringify({
      success: true,
      created: false,
      message: 'No draft changes to save as snapshot.',
    })
  }

  return JSON.stringify({
    success: true,
    created: true,
    snapshotId: result.snapshotId,
    opCount: result.opCount,
    message: `Saved snapshot ${result.snapshotId} (${result.opCount} change(s)).`,
  })
}

export const rollbackSnapshotDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'rollback_snapshot',
    description:
      'Rollback pending file changes from a snapshot. ' +
      'New files from that snapshot are removed from workspace. ' +
      'Modified/deleted existing files may require a directory handle to restore from disk.',
    parameters: {
      type: 'object',
      properties: {
        snapshot_id: {
          type: 'string',
          description: 'Snapshot id to rollback',
        },
      },
      required: ['snapshot_id'],
    },
  },
}

export const rollbackSnapshotExecutor: ToolExecutor = async (args, context) => {
  const snapshotId = args.snapshot_id as string | undefined
  if (!snapshotId) {
    return JSON.stringify({ error: 'snapshot_id is required' })
  }

  const active = await getActiveConversation()
  if (!active) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  const dirHandle = await resolveNativeDirectoryHandle(context.directoryHandle, context.workspaceId)
  const result = await active.conversation.rollbackSnapshot(snapshotId, dirHandle)
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
        ? `Rolled back ${result.reverted} change(s) from snapshot ${snapshotId}.`
        : `Rolled back ${result.reverted} change(s), ${result.unresolved.length} unresolved.`,
  })
}
