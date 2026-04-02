import { getActiveConversation } from '@/store/conversation-context.store'

export async function resolveWorkspaceDirectoryHandle(
  workspaceId?: string | null
): Promise<FileSystemDirectoryHandle | null> {
  if (!workspaceId) return null
  try {
    const { getWorkspaceManager } = await import('@/opfs')
    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(workspaceId)
    if (!workspace) return null

    const nativeHandle = await workspace.getNativeDirectoryHandle()
    if (nativeHandle) return nativeHandle

    return await workspace.getFilesDir()
  } catch {
    return null
  }
}

/**
 * Resolve directory handle from context or workspaceId.
 * Falls back to OPFS files/ directory when no native directory is available.
 */
export async function resolveNativeDirectoryHandle(
  directoryHandle: FileSystemDirectoryHandle | null | undefined,
  workspaceId?: string | null
): Promise<FileSystemDirectoryHandle | null> {
  if (directoryHandle) return directoryHandle

  const workspaceHandle = await resolveWorkspaceDirectoryHandle(workspaceId)
  if (workspaceHandle) return workspaceHandle

  const active = await getActiveConversation()
  if (!active) return null

  const nativeHandle = await active.conversation.getNativeDirectoryHandle()
  if (nativeHandle) return nativeHandle

  const activeWorkspaceId = active.conversation.workspaceId
  if (!activeWorkspaceId) return null
  return await resolveWorkspaceDirectoryHandle(activeWorkspaceId)
}
