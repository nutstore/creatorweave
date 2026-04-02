import type { ToolDefinition, ToolExecutor } from './tool-types'
import { getActiveConversation, useConversationContextStore } from '@/store/conversation-context.store'
import { resolveNativeDirectoryHandle } from './tool-utils'

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
