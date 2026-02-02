# OPFS 系统架构文档

## 概述

OPFS (Origin Private File System) 会话系统是一个为浏览器环境设计的多会话文件管理工作区架构。

## 设计原则

1. **会话隔离**: 每个对话拥有独立的文件工作区
2. **持久化存储**: 所有数据存储在 OPFS，不占用内存
3. **延迟同步**: 文件先缓存后同步，支持撤销
4. **可扩展性**: 模块化设计，易于扩展

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        应用层 (Application)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │Conversation  │  │ SessionStore │  │   OPFSStore     │    │
│  │Store         │  │              │  │                  │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘    │
│         │                  │                  │                │
└─────────┼──────────────────┼──────────────────┼────────────────┘
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼────────────────┐
│                      SessionManager (Singleton)                   │
│  - 管理多个 SessionWorkspace                                          │
│  - 懒加载会话                                                         │
└───────────────────────────┬────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
┌────────▼─────────┐ ┌─────▼──────────┐ ┌───▼─────────────┐
│ SessionWorkspace │ │SessionWorkspace│ │ SessionWorkspace│
│                  │ │                │ │                 │
│ ┌──────────────┐ │ │ ┌────────────┐ │ │ ┌─────────────┐ │
│ │CacheManager  │ │ │ │CacheManager│ │ │ │CacheManager │ │
│ ├──────────────┤ │ │ ├────────────┤ │ │ ├─────────────┤ │
│ │PendingManager│ │ │ │PendingMgr  │ │ │ │PendingMgr   │ │
│ ├──────────────┤ │ │ ├────────────┤ │ │ ├─────────────┤ │
│ │UndoStorage   │ │ │ │UndoStorage │ │ │ │UndoStorage  │ │
│ └──────────────┘ │ │ └────────────┘ │ │ └─────────────┘ │
└──────────────────┘ └─────────────────┘ └─────────────────┘
         │                  │                  │
┌────────▼──────────────────▼──────────────────▼────────────────┐
│                           OPFS Storage                            │
│  /sessions/{sessionId}/cache/{encodedPath}                        │
│  /sessions/{sessionId}/pending.json                               │
│  /sessions/{sessionId}/undo.json                                  │
│  /sessions/{sessionId}/session.json                               │
└───────────────────────────────────────────────────────────────────┘
```

## 核心模块

### SessionManager

**职责**: 多会话生命周期管理

**位置**: `src/opfs/session/session-manager.ts`

**API**:

```typescript
interface SessionManager {
  // 初始化管理器
  initialize(): Promise<void>

  // 创建新会话
  createSession(rootDirectory: string, id?: string): Promise<SessionWorkspace>

  // 获取会话（懒加载）
  getSession(id: string): Promise<SessionWorkspace | null>

  // 删除会话
  deleteSession(id: string): Promise<void>

  // 获取所有会话元数据
  getAllSessions(): SessionMetadata[]

  // 清理内存缓存
  clearMemoryCache(): void

  // 清理旧会话
  cleanupOldSessions(days: number): Promise<number>
}
```

### SessionWorkspace

**职责**: 单个会话的文件操作封装

**位置**: `src/opfs/session/session-workspace.ts`

**API**:

```typescript
interface SessionWorkspace {
  readonly sessionId: string
  readonly rootDirectory: string

  // 文件操作
  readFile(path: string, dirHandle: FileSystemDirectoryHandle): Promise<FileReadResult>
  writeFile(path: string, content: FileContent, dirHandle: FileSystemDirectoryHandle): Promise<void>
  deleteFile(path: string, dirHandle: FileSystemDirectoryHandle): Promise<void>

  // 同步操作
  syncToDisk(dirHandle: FileSystemDirectoryHandle): Promise<SyncResult>

  // 撤销操作
  undo(recordId: string): Promise<void>
  redo(recordId: string): Promise<void>

  // 状态查询
  getPendingChanges(): PendingChange[]
  getUndoRecords(): UndoRecord[]
  getCachedPaths(): string[]
  hasCachedFile(path: string): boolean

  // 清理操作
  clear(): Promise<void>

  // 属性
  get pendingCount(): number
  get undoCount(): number
}
```

### CacheManager

**职责**: 文件缓存管理，mtime 变更检测

**位置**: `src/opfs/session/session-cache.ts`

**特性**:

- 基于 mtime 的缓存失效
- 支持文本和二进制文件
- 自动计算哈希和大小

### PendingManager

**职责**: 待同步队列管理

**位置**: `src/opfs/session/session-pending.ts`

**特性**:

- 只存储元数据
- 支持冲突检测
- 自动去重

### UndoStorage

**职责**: OPFS 持久化的撤销历史

**位置**: `src/opfs/session/session-undo.ts`

**特性**:

- 撤销内容存储在 OPFS
- 最多 100 条记录
- 支持 undo/redo

## 数据流

### 写入流程

```
Agent/用户发起写入
         │
         ▼
┌─────────────────┐
│  writeFile()     │
│  - 读取旧内容     │
│  - 记录撤销       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  CacheManager   │
│  - 写入缓存      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PendingManager │
│  - 添加待同步     │
└────────┬────────┘
         │
         ▼
    OPFS Storage
```

### 读取流程

```
用户发起读取
         │
         ▼
┌─────────────────┐
│  hasCachedFile? │
│                 │
│  Yes ──▶ 缓存    │
│   No   ──▶ 文件系统│
└────────┬────────┘
         │
         ▼
    返回内容
```

### 同步流程

```
用户发起同步
         │
         ▼
┌─────────────────┐
│ getPendingChanges│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 遍历待同步列表     │
│ - 检测冲突        │
│ - 写入磁盘        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 清空待同步列表     │
└─────────────────┘
```

## 扩展指南

### 添加新的存储后端

```typescript
// 1. 实现 Workspace 接口
interface CustomWorkspace {
  readFile(path: string): Promise<FileReadResult>
  writeFile(path: string, content: FileContent): Promise<void>
  // ... 其他方法
}

// 2. 在 SessionManager 中注册
const workspace = new CustomWorkspace(sessionId, rootDirectory)
sessions.set(sessionId, workspace)
```

### 自定义缓存策略

```typescript
// 扩展 CacheManager
class CustomCacheManager extends SessionCacheManager {
  // 添加 LRU 缓存
  private lruCache = new LRUCache<string, CachedFile>(100)

  async get(path: string): Promise<CachedFile | null> {
    // 先查 LRU
    const lruResult = this.lruCache.get(path)
    if (lruResult) return lruResult

    // 再查 OPFS
    return await super.get(path)
  }

  async set(path: string, file: CachedFile): Promise<void> {
    this.lruCache.set(path, file)
    await super.set(path, file)
  }
}
```

### 实现新的同步机制

```typescript
// 扩展 syncToDisk 方法
class SyncExtension {
  async syncToCloud(workspace: SessionWorkspace): Promise<void> {
    // 1. 获取待同步文件
    const pending = workspace.getPendingChanges()

    // 2. 上传到云服务
    for (const change of pending) {
      await this.uploadToCloud(change)
    }

    // 3. 清空待同步
    workspace.clearPending()
  }
}
```

## 性能考虑

1. **懒加载**: 会话按需加载，不占用内存
2. **增量同步**: 只同步修改的文件
3. **批量操作**: 支持批量写入优化
4. **配额管理**: 监控 OPFS 存储使用量

## 安全考虑

1. **会话隔离**: 防止跨会话数据泄露
2. **冲突检测**: 同步前检测外部修改
3. **撤销保护**: 撤销内容存储在 OPFS
4. **配额限制**: 防止存储耗尽

## 故障排查

### 常见问题

1. **会话未创建**: 检查 SessionManager 是否初始化
2. **文件同步失败**: 检查 directoryHandle 权限
3. **OPFS 配额不足**: 清理旧会话或撤销历史

### 调试技巧

```typescript
// 检查会话状态
const manager = await getSessionManager()
console.log('Sessions:', manager.getAllSessions())

// 检查 pending 状态
const workspace = await manager.getSession(sessionId)
console.log('Pending:', workspace?.getPendingChanges())

// 检查缓存状态
console.log('Cached:', workspace?.getCachedPaths())
```
