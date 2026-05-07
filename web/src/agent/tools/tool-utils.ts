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

/**
 * Multi-root: resolve the correct native directory handle for a given path.
 *
 * Uses WorkspaceRuntime.resolvePath() to route the path to the correct root,
 * then returns that root's DirectoryHandle.
 *
 * Falls back to resolveNativeDirectoryHandle() when no workspace is available.
 */
export async function resolveNativeDirectoryHandleForPath(
  path: string,
  directoryHandle: FileSystemDirectoryHandle | null | undefined,
  workspaceId?: string | null
): Promise<{ handle: FileSystemDirectoryHandle | null; nativePath: string }> {
  // Always try resolvePath first — handles multi-root routing by stripping root prefix
  try {
    const { getWorkspaceManager } = await import('@/opfs')
    const manager = await getWorkspaceManager()
    const workspace = workspaceId
      ? await manager.getWorkspace(workspaceId)
      : null

    if (workspace) {
      const nativeHandle = await workspace.getNativeDirectoryHandleForPath(path)
      if (nativeHandle) {
        const resolved = await workspace.resolvePath(path)
        // relativePath may be empty when path matches a root name exactly (e.g. "creatorweave")
        return { handle: nativeHandle, nativePath: resolved.relativePath }
      }
    }

    // Fallback: try active conversation's workspace
    const active = await getActiveConversation()
    if (active) {
      const activeWorkspace = active.conversation.workspaceId
        ? await manager.getWorkspace(active.conversation.workspaceId)
        : null
      if (activeWorkspace) {
        const nativeHandle = await activeWorkspace.getNativeDirectoryHandleForPath(path)
        if (nativeHandle) {
          const resolved = await activeWorkspace.resolvePath(path)
          return { handle: nativeHandle, nativePath: resolved.relativePath }
        }
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Final fallback: use provided directoryHandle or resolve from store
  if (directoryHandle) {
    return { handle: directoryHandle, nativePath: path }
  }
  return { handle: await resolveNativeDirectoryHandle(null, workspaceId), nativePath: path }
}
