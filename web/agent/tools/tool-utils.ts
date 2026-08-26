/**
 * Workspace directory handle resolution helpers + shared tool utilities.
 *
 * All functions require a valid workspaceId — the agent loop always provides one
 * (= conversationId). If missing, that's a caller bug and should fail fast rather
 * than silently falling through to a global "active" state that may be wrong.
 */

//-----------------------------------------------------------------------------
// Timeout helpers (shared by read / write / delete / search / bash tools)
//-----------------------------------------------------------------------------

/** Error thrown when a tool exceeds its wall-clock timeout. */
export class ToolTimeoutError extends Error {
  readonly toolName: string
  readonly timeoutMs: number

  constructor(toolName: string, timeoutMs: number) {
    super(`${toolName}: timed out after ${timeoutMs}ms`)
    this.name = 'ToolTimeoutError'
    this.toolName = toolName
    this.timeoutMs = timeoutMs
  }
}

/**
 * Wrap an async operation with a wall-clock timeout.
 *
 * Resolves with the original result on success, or rejects with
 * {@link ToolTimeoutError} when the timeout elapses first.
 * The timeout timer is always cleaned up (success / failure / timeout).
 */
export function withToolTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ToolTimeoutError(toolName, timeoutMs)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer!))
}

/** Type guard: is this error a {@link ToolTimeoutError}? */
export function isToolTimeoutError(error: unknown): error is ToolTimeoutError {
  return error instanceof ToolTimeoutError
}

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
