/**
 * DiskExecutor — abstraction layer for native disk executors.
 *
 * Replaces the triple role `FileSystemDirectoryHandle` used to play in
 * WorkspaceRuntime:
 *   ① authorization credential — FSAccess: showDirectoryPicker + IDB | NH: pick_folder + scopes.json
 *   ② routing identifier       — rootId (FSAccess: compoundKey | NH: scope_id)
 *   ③ disk executor            — read / write / delete / stat / listDir
 *
 * Two implementations:
 *   - `FSAccessExecutor`    — wraps the existing File System Access API logic (phase 1, behavior unchanged)
 *   - `NativeHostExecutor`  — goes through Native Messaging → Rust host (phase 3)
 *
 * ⚠️ Scope boundary: this interface abstracts ONLY the **native disk layer**
 * (user-authorized project directories). The OPFS internal layer
 * (workspaceDir → files/.baseline/assets/) keeps using native handles and is
 * unrelated to the native host system.
 */

/** Authorized backend type — the UI renders a backend badge from this. */
export type DiskBackend = 'fsaccess' | 'native-host'

/** An authorized disk root. */
export interface DiskRoot {
  /** FSAccess: compoundKey (projectId:rootName) | NH: scope_id */
  readonly id: string
  /** rootName — used for multi-root routing and UI display */
  readonly displayName: string
  readonly readOnly: boolean
  /** Distinguishes the authorization channel; FolderSelector renders the native-host badge from this */
  readonly backend: DiskBackend
  readonly permissions: readonly ('read' | 'write' | 'search')[]
}

/** File metadata. */
export interface DiskStat {
  mtime: number
  size: number
  contentType: 'text' | 'binary'
  isFile: boolean
}

/** Directory entry. */
export interface DiskEntry {
  name: string
  kind: 'file' | 'directory'
  stat?: DiskStat
}

/**
 * File read result.
 *
 * The content type mirrors WorkspaceRuntime's existing readFromNativeFS
 * return: string for text files, ArrayBuffer for binary.
 */
export interface DiskReadResult {
  content: string | ArrayBuffer
  stat: DiskStat
}

/**
 * File write input type. Mirrors WorkspaceRuntime's FileContent.
 */
export type DiskWriteContent = string | ArrayBuffer

/**
 * Disk executor — replaces FileSystemDirectoryHandle's triple native-disk role.
 *
 * All methods address by rootId: FSAccessExecutor's rootId = compoundKey,
 * NativeHostExecutor's rootId = scope_id. Upper layers (WorkspaceRuntime)
 * resolve rootName via resolvePath() and then ask the executor for the
 * corresponding rootId.
 */
export interface DiskExecutor {
  readonly backend: DiskBackend

  // —— Authorization management (role ①) ———————————————————

  /**
   * List all authorized disk roots for a project.
   * Mirrors WorkspaceRuntime.getAllNativeDirectoryHandles().
   */
  listRoots(projectId: string): Promise<DiskRoot[]>

  /**
   * Show the authorization dialog and authorize a new disk root.
   * Returns null when the user cancels (no error thrown).
   * Mirrors folder-access.store.pickDirectory / addRoot.
   */
  authorizeRoot(projectId: string, opts?: {
    displayName?: string
    readOnly?: boolean
  }): Promise<DiskRoot | null>

  /**
   * Revoke authorization for a disk root.
   * Mirrors folder-access.store.release / removeRoot.
   */
  revokeRoot(projectId: string, rootId: string): Promise<void>

  /**
   * Re-validate that a persisted authorization is still valid (permissions
   * may be lost after a browser restart).
   * Returns true when the permission is still usable (ready), false when the
   * user must re-activate it.
   * Mirrors FSAccess's queryPermission / NH's ping+list_scopes.
   */
  hydrateRoot(projectId: string, rootId: string): Promise<boolean>

  // —— Disk execution (role ③; role ② is carried implicitly by rootId) ——

  /**
   * Read a file's full content + metadata.
   * Mirrors WorkspaceRuntime.readFromNativeFS(path, dirHandle).
   *
   * Large-file chunking is handled internally by implementations
   * (NativeHostExecutor chunks via read_file_at) — invisible to callers.
   */
  read(rootId: string, relativePath: string): Promise<DiskReadResult>

  /**
   * Write a file (overwrite). Creates parent directories automatically.
   * Mirrors WorkspaceRuntime.writeNativeFile(dirHandle, path, content).
   */
  write(rootId: string, relativePath: string, content: DiskWriteContent): Promise<DiskStat>

  /**
   * Delete a file or empty directory. Silently succeeds when the path does
   * not exist (idempotent).
   * Mirrors WorkspaceRuntime.deleteFromNativeIfExists / deleteFromNative.
   *
   * pruneEmptyParents: after deletion, prune the now-empty chain of parent
   * directories on the disk side (up to the rootId root, or until a
   * non-empty directory is met). Enabled when syncing deletes to disk, to
   * avoid "file deleted but empty dir left behind" or even ghost
   * directories resurrected by a later flush.
   */
  delete(rootId: string, relativePath: string, opts?: { pruneEmptyParents?: boolean }): Promise<void>

  /**
   * Query file/directory metadata. Returns null when it doesn't exist (no
   * error thrown).
   * Mirrors WorkspaceRuntime.getFileMetadata(dirHandle, path).
   */
  stat(rootId: string, relativePath: string): Promise<DiskStat | null>

  /**
   * List the direct children of a directory (non-recursive).
   * Mirrors WorkspaceRuntime.scanDirRecursive / the search tool's directory
   * traversal.
   */
  listDir(rootId: string, relativePath: string): Promise<DiskEntry[]>
}

/**
 * Capability probe: check whether the native host is available.
 * Checks whether window.__agentWeb.nativeHostCall exists (injected by the
 * browser extension).
 */
export function isNativeHostAvailable(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { __agentWeb?: { nativeHostCall?: unknown } }
  return !!w.__agentWeb?.nativeHostCall && typeof w.__agentWeb.nativeHostCall === 'function'
}
