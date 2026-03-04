/**
 * Folder Access Types - 统一类型定义
 *
 * 单一权限状态管理：解决状态分散、释放不彻底、重新添加失效问题
 */

/**
 * 文件夹访问状态机
 */
export type FolderAccessStatus =
  | 'idle' // 初始状态，未选择文件夹
  | 'checking' // 检查权限中
  | 'ready' // 已选择且权限有效
  | 'needs_user_activation' // 需要用户交互才能恢复权限
  | 'requesting' // 用户交互中（选择/请求权限）
  | 'releasing' // 释放中
  | 'error' // 错误状态

/**
 * 文件夹访问记录
 */
export interface FolderAccessRecord {
  /** 项目 ID */
  projectId: string
  /** 文件夹名称 */
  folderName: string | null
  /** 目录句柄（内存，当前可用） */
  handle: FileSystemDirectoryHandle | null
  /** 持久化句柄（可恢复权限） */
  persistedHandle: FileSystemDirectoryHandle | null
  /** 当前状态 */
  status: FolderAccessStatus
  /** 错误信息 */
  error?: string
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  updatedAt: number
}

/**
 * Store 动作类型
 */
export interface FolderAccessActions {
  /** 设置活动项目 */
  setActiveProject: (projectId: string | null) => Promise<void>
  /** 初始化项目数据（水合） */
  hydrateProject: (projectId: string) => Promise<void>
  /** 选择新文件夹（弹出选择框） */
  pickDirectory: (projectId: string) => Promise<boolean>
  /** 直接设置文件夹句柄（不弹框，用于外部已获取 handle 的场景） */
  setHandle: (projectId: string, handle: FileSystemDirectoryHandle) => Promise<void>
  /** 请求恢复权限（从 pending 状态） */
  requestPermission: (projectId: string) => Promise<boolean>
  /** 彻底释放（删除记录） */
  release: (projectId: string) => Promise<void>
  /** 清除错误状态 */
  clearError: (projectId: string) => void
}

/**
 * 完整的 Store 类型
 */
export interface FolderAccessStore extends FolderAccessActions {
  /** 当前活动项目 ID */
  activeProjectId: string | null
  /** 所有项目的权限记录 */
  records: Record<string, FolderAccessRecord>
  /** 获取当前项目的记录 */
  getRecord: () => FolderAccessRecord | null
  /** 当前项目状态 */
  getCurrentStatus: () => FolderAccessStatus | null
  /** 当前项目的句柄 */
  getCurrentHandle: () => FileSystemDirectoryHandle | null
  /** 当前项目是否可用 */
  isReady: () => boolean
  /** 通知文件树刷新 */
  notifyFileTreeRefresh: () => Promise<void>
}
