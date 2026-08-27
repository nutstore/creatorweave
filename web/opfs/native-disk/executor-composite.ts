/**
 * CompositeExecutor — routes to the correct child executor by rootId shape.
 *
 * Solves the "global hijack when native host is available" problem:
 *
 *   Problem: when the native host bridge is available, routing ALL disk
 *   operations through NativeHostExecutor would also hijack the agent's own
 *   workspace (FS Access roots). A compoundKey rootId passed into
 *   NativeHostExecutor makes the Rust side report `unknown scope_id`, which
 *   crashes bootstrap (a chicken-and-egg failure).
 *
 *   Fix: CompositeExecutor routes by rootId shape:
 *     - `scope_xxx` (native-host scope_id) → NativeHostExecutor
 *     - anything else (compoundKey: `projectId:rootName`) → FSAccessExecutor
 *
 * This corresponds one-to-one with WorkspaceRuntime.ensureRootMap()'s rootId
 * generation:
 *   backend === 'native-host' → rootId = root.scopeId         (scope_xxx)
 *   backend === 'fsaccess'    → rootId = buildHandleKey(...)   (compoundKey)
 */

import type {
  DiskExecutor,
  DiskRoot,
  DiskStat,
  DiskEntry,
  DiskReadResult,
  DiskWriteContent,
  DiskBackend,
} from './executor'

/**
 * native-host scope_id shape: `scope_` prefix + a random hex string.
 * See Rust scope.rs: `format!("scope_{}", rand_id())`.
 */
function isScopeId(rootId: string): boolean {
  return rootId.startsWith('scope_')
}

export class CompositeExecutor implements DiskExecutor {
  /**
   * CompositeExecutor itself doesn't belong to a single backend; returned
   * roots come from both child executors and each carries its own `backend`
   * field. This instance property is only read on rare paths (currently no
   * consumers), so 'fsaccess' is set as a conservative default.
   */
  readonly backend: DiskBackend = 'fsaccess'

  constructor(
    private readonly fsAccess: DiskExecutor,
    private readonly nativeHost: DiskExecutor
  ) {}

  /** Route to the correct child executor by rootId. */
  private route(rootId: string): DiskExecutor {
    return isScopeId(rootId) ? this.nativeHost : this.fsAccess
  }

  // —— Authorization management ———————————————————————————————————

  async listRoots(projectId: string): Promise<DiskRoot[]> {
    // Merge roots from both backends.
    // nativeHost.listRoots internally calls list_scopes (full list) without
    // filtering by project, but each root carries its own backend marker;
    // the caller (WorkspaceRuntime) matches scopeIds against the
    // project_roots table, so projects never mix.
    const [fsRoots, nhRoots] = await Promise.all([
      this.fsAccess.listRoots(projectId).catch(() => [] as DiskRoot[]),
      this.nativeHost.listRoots(projectId).catch(() => [] as DiskRoot[]),
    ])
    return [...fsRoots, ...nhRoots]
  }

  /**
   * Authorize a new root: prefers FS Access (the browser-native picker, no
   * extra dependencies).
   *
   * Callers that want native-host authorization should use
   * NativeHostExecutor directly, or extend this method with an opts.backend
   * parameter. Currently folder-access.store's addRoot calls pick_folder
   * directly on the native-host path, bypassing this method.
   */
  async authorizeRoot(
    projectId: string,
    opts?: { displayName?: string; readOnly?: boolean }
  ): Promise<DiskRoot | null> {
    return this.fsAccess.authorizeRoot(projectId, opts)
  }

  async revokeRoot(projectId: string, rootId: string): Promise<void> {
    await this.route(rootId).revokeRoot(projectId, rootId)
  }

  async hydrateRoot(projectId: string, rootId: string): Promise<boolean> {
    return this.route(rootId).hydrateRoot(projectId, rootId)
  }

  // —— Disk execution (routed by rootId) ——————————————————————————

  async read(rootId: string, relativePath: string): Promise<DiskReadResult> {
    return this.route(rootId).read(rootId, relativePath)
  }

  async write(
    rootId: string,
    relativePath: string,
    content: DiskWriteContent
  ): Promise<DiskStat> {
    return this.route(rootId).write(rootId, relativePath, content)
  }

  async delete(
    rootId: string,
    relativePath: string,
    opts?: { pruneEmptyParents?: boolean }
  ): Promise<void> {
    await this.route(rootId).delete(rootId, relativePath, opts)
  }

  async stat(rootId: string, relativePath: string): Promise<DiskStat | null> {
    return this.route(rootId).stat(rootId, relativePath)
  }

  async listDir(rootId: string, relativePath: string): Promise<DiskEntry[]> {
    return this.route(rootId).listDir(rootId, relativePath)
  }
}
