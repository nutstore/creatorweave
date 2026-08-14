/**
 * DiskExecutor — native 磁盘执行器抽象层
 *
 * 取代 `FileSystemDirectoryHandle` 在 WorkspaceRuntime 里的三重角色：
 *   ① 授权凭证  — FSAccess: showDirectoryPicker + IDB | NH: pick_folder + scopes.json
 *   ② 路由标识  — rootId（FSAccess: compoundKey | NH: scope_id）
 *   ③ 磁盘执行器 — read / write / delete / stat / listDir
 *
 * 两个实现：
 *   - `FSAccessExecutor`    — 包装现有 File System Access API 逻辑（阶段1，行为不变）
 *   - `NativeHostExecutor`  — 走 Native Messaging → Rust host（阶段3）
 *
 * ⚠️ 范围边界：本接口只抽象 **native 磁盘层**（用户授权的项目目录）。
 * OPFS 内部层（workspaceDir → files/.baseline/assets/）继续用原生 handle，
 * 与 native host 体系无关。详见 STATUS.md §1 & §3。
 */

/** 授权后端类型 — UI 据此渲染后端徽章（见 STATUS.md §6.4） */
export type DiskBackend = 'fsaccess' | 'native-host'

/** 一个已授权的磁盘根 */
export interface DiskRoot {
  /** FSAccess: compoundKey（projectId:rootName）| NH: scope_id */
  readonly id: string
  /** rootName，用于多根路由与 UI 展示 */
  readonly displayName: string
  readonly readOnly: boolean
  /** 区分授权通道，FolderSelector 据此渲染 native-host 徽章 */
  readonly backend: DiskBackend
  readonly permissions: readonly ('read' | 'write' | 'search')[]
}

/** 文件元信息 */
export interface DiskStat {
  mtime: number
  size: number
  contentType: 'text' | 'binary'
  isFile: boolean
}

/** 目录条目 */
export interface DiskEntry {
  name: string
  kind: 'file' | 'directory'
  stat?: DiskStat
}

/**
 * 文件读取结果。
 *
 * content 类型对齐 WorkspaceRuntime 现有 readFromNativeFS 的返回：
 * 文本文件返回 string，二进制返回 ArrayBuffer。
 */
export interface DiskReadResult {
  content: string | ArrayBuffer
  stat: DiskStat
}

/**
 * 文件写入入参类型。对齐 WorkspaceRuntime 的 FileContent。
 */
export type DiskWriteContent = string | ArrayBuffer

/**
 * 磁盘执行器 — 取代 FileSystemDirectoryHandle 的 native 磁盘三重角色。
 *
 * 所有方法按 rootId 寻址：FSAccessExecutor 的 rootId = compoundKey，
 * NativeHostExecutor 的 rootId = scope_id。上层（WorkspaceRuntime）
 * 通过 resolvePath() 拿到 rootName 后，向 executor 查询对应的 rootId。
 */
export interface DiskExecutor {
  readonly backend: DiskBackend

  // —— 授权管理（角色①）——————————————————————————————————

  /**
   * 列出某 project 下所有已授权的磁盘根。
   * 对应 WorkspaceRuntime.getAllNativeDirectoryHandles()。
   */
  listRoots(projectId: string): Promise<DiskRoot[]>

  /**
   * 弹出授权对话框，授权一个新的磁盘根。
   * 返回 null 表示用户取消（不抛错）。
   * 对应 folder-access.store.pickDirectory / addRoot。
   */
  authorizeRoot(projectId: string, opts?: {
    displayName?: string
    readOnly?: boolean
  }): Promise<DiskRoot | null>

  /**
   * 撤销一个磁盘根的授权。
   * 对应 folder-access.store.release / removeRoot。
   */
  revokeRoot(projectId: string, rootId: string): Promise<void>

  /**
   * 重新校验已持久化的授权是否仍然有效（如浏览器重启后权限可能失效）。
   * 返回 true 表示权限仍可用（ready），false 表示需要用户重新激活。
   * 对应 FSAccess 的 queryPermission / NH 的 ping+list_scopes。
   */
  hydrateRoot(projectId: string, rootId: string): Promise<boolean>

  // —— 磁盘执行（角色③；角色②由 rootId 隐式承担）——————————————

  /**
   * 读取文件全部内容 + 元信息。
   * 对应 WorkspaceRuntime.readFromNativeFS(path, dirHandle)。
   *
   * 大文件分块由实现内部处理（NativeHostExecutor 走 read_file_at 分块），
   * 上层无感知。
   */
  read(rootId: string, relativePath: string): Promise<DiskReadResult>

  /**
   * 写入文件（覆盖）。自动创建父目录。
   * 对应 WorkspaceRuntime.writeNativeFile(dirHandle, path, content)。
   */
  write(rootId: string, relativePath: string, content: DiskWriteContent): Promise<DiskStat>

  /**
   * 删除文件或空目录。路径不存在时静默成功（幂等）。
   * 对应 WorkspaceRuntime.deleteFromNativeIfExists / deleteFromNative。
   */
  delete(rootId: string, relativePath: string): Promise<void>

  /**
   * 查询文件/目录元信息。不存在时返回 null（不抛错）。
   * 对应 WorkspaceRuntime.getFileMetadata(dirHandle, path)。
   */
  stat(rootId: string, relativePath: string): Promise<DiskStat | null>

  /**
   * 非递归列举目录的直接子项。
   * 对应 WorkspaceRuntime.scanDirRecursive / search tool 的目录遍历。
   */
  listDir(rootId: string, relativePath: string): Promise<DiskEntry[]>
}

/**
 * 能力探测：判断 native host 是否可用。
 * 检查 window.__agentWeb.nativeHostCall 是否存在（由浏览器扩展注入）。
 */
export function isNativeHostAvailable(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as { __agentWeb?: { nativeHostCall?: unknown } }
  return !!w.__agentWeb?.nativeHostCall && typeof w.__agentWeb.nativeHostCall === 'function'
}
