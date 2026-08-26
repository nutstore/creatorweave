/**
 * CompositeExecutor — 按 rootId 格式路由到正确的子 executor
 *
 * 解决"native host 可用时全局劫持"问题（STATUS.md §15）：
 *
 *   问题：当 native host bridge 可用时，如果把所有磁盘操作都走
 *   NativeHostExecutor，agent 自己的 workspace（FS Access root）
 *   也会被劫持，导致 compoundKey rootId 传入 NativeHostExecutor →
 *   Rust 侧报 `unknown scope_id` → bootstrap 鸡生蛋崩溃。
 *
 *   修复：CompositeExecutor 按 rootId 格式路由：
 *     - `scope_xxx`（native-host scope_id）→ NativeHostExecutor
 *     - 其他（compoundKey: `projectId:rootName`）→ FSAccessExecutor
 *
 * 这与 WorkspaceRuntime.ensureRootMap() 的 rootId 生成逻辑一一对应：
 *   backend === 'native-host' → rootId = root.scopeId         （scope_xxx）
 *   backend === 'fsaccess'    → rootId = buildHandleKey(...)   （compoundKey）
 *
 * 详见 STATUS.md §15。
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
 * native-host scope_id 格式：`scope_` 前缀 + 十六进制随机串。
 * 见 Rust scope.rs: `format!("scope_{}", rand_id())`。
 */
function isScopeId(rootId: string): boolean {
  return rootId.startsWith('scope_')
}

export class CompositeExecutor implements DiskExecutor {
  /**
   * CompositeExecutor 本身不属于单一后端；返回的 roots 来自两个子 executor，
   * 每个子 root 携带自己的 `backend` 字段。这里的实例属性仅在极少路径
   * 被读取（当前无消费方），设为 'fsaccess' 作为保守默认值。
   */
  readonly backend: DiskBackend = 'fsaccess'

  constructor(
    private readonly fsAccess: DiskExecutor,
    private readonly nativeHost: DiskExecutor
  ) {}

  /** 按 rootId 路由到正确的子 executor */
  private route(rootId: string): DiskExecutor {
    return isScopeId(rootId) ? this.nativeHost : this.fsAccess
  }

  // —— 授权管理 ————————————————————————————————————————————

  async listRoots(projectId: string): Promise<DiskRoot[]> {
    // 合并两个后端的 roots。
    // nativeHost.listRoots 内部调 list_scopes（全量），不区分 project，
    // 但每条 root 自带 backend 标记，调用方（WorkspaceRuntime）按 scopeId
    // 匹配 project_roots 表，不会串项目。
    const [fsRoots, nhRoots] = await Promise.all([
      this.fsAccess.listRoots(projectId).catch(() => [] as DiskRoot[]),
      this.nativeHost.listRoots(projectId).catch(() => [] as DiskRoot[]),
    ])
    return [...fsRoots, ...nhRoots]
  }

  /**
   * 授权新根：优先走 FS Access（浏览器原生 picker，无需额外依赖）。
   *
   * 调用方如果想走 native host 授权，应直接用 NativeHostExecutor，
   * 或在此方法加 opts.backend 参数扩展。当前 folder-access.store 的
   * addRoot 在 native-host 路径直接调 pick_folder，不经此方法。
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

  // —— 磁盘执行（按 rootId 路由）——————————————————————————

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
