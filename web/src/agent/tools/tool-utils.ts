/**
 * Workspace directory handle resolution helpers.
 *
 * All functions require a valid workspaceId — the agent loop always provides one
 * (= conversationId). If missing, that's a caller bug and should fail fast rather
 * than silently falling through to a global "active" state that may be wrong.
 */

/**
 * Resolve the native or OPFS directory handle for a workspace.
 * Returns null only if the workspace itself doesn't exist or has no handles.
 */
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
 * Resolve directory handle from explicit directoryHandle or workspaceId.
 *
 * workspaceId is always provided by the agent loop. If somehow missing,
 * returns null — callers should treat that as a bug.
 */
export async function resolveNativeDirectoryHandle(
  directoryHandle: FileSystemDirectoryHandle | null | undefined,
  workspaceId?: string | null
): Promise<FileSystemDirectoryHandle | null> {
  if (directoryHandle) return directoryHandle

  return await resolveWorkspaceDirectoryHandle(workspaceId)
}

/**
 * Multi-root: resolve the correct native directory handle for a given path.
 *
 * Uses WorkspaceRuntime.resolvePath() to route the path to the correct root,
 * then returns that root's DirectoryHandle.
 */
export async function resolveNativeDirectoryHandleForPath(
  path: string,
  directoryHandle: FileSystemDirectoryHandle | null | undefined,
  workspaceId?: string | null
): Promise<{ handle: FileSystemDirectoryHandle | null; nativePath: string }> {
  // Try workspace-based path resolution first (handles multi-root routing)
  try {
    if (workspaceId) {
      const { getWorkspaceManager } = await import('@/opfs')
      const manager = await getWorkspaceManager()
      const workspace = await manager.getWorkspace(workspaceId)
      if (workspace) {
        const nativeHandle = await workspace.getNativeDirectoryHandleForPath(path)
        if (nativeHandle) {
          const resolved = await workspace.resolvePath(path)
          return { handle: nativeHandle, nativePath: resolved.relativePath }
        }
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: use provided directoryHandle or resolve from workspaceId
  if (directoryHandle) {
    return { handle: directoryHandle, nativePath: path }
  }
  return { handle: await resolveNativeDirectoryHandle(null, workspaceId), nativePath: path }
}
