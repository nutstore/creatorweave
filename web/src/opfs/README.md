# OPFS Workspace System

## 概述

OPFS (Origin Private File System) Workspace System 是一个多工作区文件管理架构，为每个对话（Conversation）提供独立的文件缓存、待同步队列和撤销历史。

> **💡 新开发者**: 建议先阅读 [存储架构设计文档](../storage/ARCHITECTURE.md) 了解整体存储设计。

### 设计目标

- **工作区隔离**: 每个对话的文件操作完全隔离，互不影响
- **持久化存储**: 所有数据存储在 OPFS 中，不占用内存
- **无限撤销**: 撤销历史存储在 OPFS，支持大量撤销记录
- **延迟同步**: 文件修改先缓存，用户主动同步时写入真实文件系统

---

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Conversation │  │ WorkspaceStore │  │     OPFSStore       │   │
│  │    Store     │  │              │  │                      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                  │                     │               │
└─────────┼──────────────────┼─────────────────────┼───────────────┘
          │                  │                     │
┌─────────▼──────────────────▼─────────────────────▼───────────────┐
│                      WorkspaceManager (Singleton)                      │
│  - 管理多个 WorkspaceRuntime                                               │
│  - 创建/获取/删除工作区                                                         │
│  - 基于 SQLite 元数据定位 project/workspace 目录                              │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
┌────────▼─────────┐ ┌────▼──────────┐ ┌─────▼────────────┐
│ WorkspaceRuntime │ │WorkspaceRuntime│ │ WorkspaceRuntime │
│  (Workspace 1)    │ │ (Workspace 2)    │ │ (Workspace 3)     │
│                  │ │                 │ │                  │
│ ┌──────────────┐ │ │ ┌─────────────┐ │ │ ┌──────────────┐ │
│ │ CacheManager │ │ │ │CacheManager │ │ │ │ CacheManager │ │
│ ├──────────────┤ │ │ ├─────────────┤ │ │ ├──────────────┤ │
│ │PendingManager│ │ │ │PendingManager│ │ │ │PendingManager│ │
│ ├──────────────┤ │ │ ├─────────────┤ │ │ ├──────────────┤ │
│ │ UndoStorage  │ │ │ │ UndoStorage │ │ │ │ UndoStorage  │ │
│ └──────────────┘ │ │ └─────────────┘ │ │ └──────────────┘ │
└──────────────────┘ └─────────────────┘ └──────────────────┘
         │                  │                  │
┌────────▼──────────────────▼──────────────────▼───────────────┐
│                        OPFS Storage                             │
│  /projects/{projectId}/workspaces/{workspaceId}/workspace.json        │
│  /projects/{projectId}/workspaces/{workspaceId}/files/                │
│  /projects/{projectId}/workspaces/{workspaceId}/attachments/          │
└───────────────────────────────────────────────────────────────────┘
```

---

## 核心概念

### Workspace (工作区)

**Workspace = 对话的文件工作区**

每个 Workspace 对应一个 Conversation，包含：

- **ID**: 与 `conversation.id` 相同
- **Root Directory**: 关联的文件系统根目录
- **独立数据**: 缓存、待同步队列、撤销历史

```
Conversation ID: "conv-abc123"
         ↓ 1:1 绑定
OPFS Workspace ID: "conv-abc123"
    ├── files/          # 文件快照
    ├── attachments/    # 工作区附件
    └── workspace.json  # 工作区元数据
```

---

## 模块说明

### WorkspaceManager

**职责**: 多工作区生命周期管理

**位置**: `src/opfs/workspace/workspace-manager.ts`

**主要方法**:

| 方法                          | 说明                         |
| ----------------------------- | ---------------------------- |
| `initialize()`                | 初始化管理器，加载 SQLite 元数据 |
| `createWorkspace(rootDir, id?)` | 创建新工作区                 |
| `getWorkspace(id)`              | 获取工作区（支持懒加载）     |
| `getOrCreateWorkspace(rootDir)` | 获取或创建工作区             |
| `deleteWorkspace(id)`           | 删除工作区及其所有数据       |
| `getAllWorkspaces()`            | 获取所有工作区元数据         |
| `cleanupOldWorkspaces(days)`    | 清理超过指定天数的旧工作区   |

**存储结构**:

```
OPFS Root
└── projects/
    └── {projectId}/
        └── workspaces/
            └── {workspaceId}/
                ├── files/
                └── workspace.json
```

---

### WorkspaceRuntime

**职责**: 封装单个工作区的所有 OPFS 操作

**位置**: `src/opfs/workspace/workspace-runtime.ts`

**主要方法**:

| 方法                                  | 说明                         |
| ------------------------------------- | ---------------------------- |
| `readFile(path, dirHandle)`           | 读取文件（缓存优先）         |
| `writeFile(path, content, dirHandle)` | 写入文件（缓存+待同步+撤销） |
| `deleteFile(path, dirHandle)`         | 删除文件                     |
| `syncToDisk(dirHandle)`               | 同步待修改到真实文件系统     |
| `undo(recordId)`                      | 撤销操作                     |
| `redo(recordId)`                      | 重做操作                     |
| `getPendingChanges()`                 | 获取待同步列表               |
| `getUndoRecords()`                    | 获取撤销记录                 |
| `clear()`                             | 清空所有数据                 |

**文件写入流程**:

```
writeFile(path, content)
    │
    ├─→ 1. 读取旧内容（用于撤销）
    ├─→ 2. 记录到 UndoStorage
    ├─→ 3. 写入 CacheManager
    └─→ 4. 添加到 PendingManager
```

---

### files/ Directory (Unified File Storage)

**职责**: 直接的文件存储，无单独缓存层

**位置**: `src/opfs/workspace/workspace-runtime.ts` 中的 `files/` 目录操作

**特性**:

- 所有文件直接存储在 `files/` 目录
- 内存索引 (`filesIndex: Set<string>`) 快速查找
- 支持 mtime 元数据用于变更检测
- 支持文本和二进制文件

**文件读取流程**:

```
readFile(path, dirHandle)
    │
    ├─→ 检查 files/ 目录
    │   ↓
    ├─→ 存在 → 返回 files/ 内容
    │
    └─→ 不存在 → 从 native FS 读取 (如果 dirHandle 存在)
```

---

### WorkspacePendingManager

**职责**: 待同步队列管理

**位置**: `src/opfs/workspace/workspace-pending.ts`

**特性**:

- 只存储元数据（不存储文件内容）
- 支持创建、修改、删除操作
- 同步时自动检测冲突

**PendingChange 结构**:

```typescript
{
  id: string              // 唯一 ID
  path: string            // 文件路径
  type: 'create' | 'modify' | 'delete'
  fsMtime: number         // 真实文件的修改时间（冲突检测）
  timestamp: number       // 操作时间
  agentMessageId?: string // 关联的 Agent 消息
}
```

---

### WorkspaceUndoStorage（概念名）

**职责**: OPFS 持久化的撤销历史

**位置**: 撤销历史已迁移到 SQLite（`undo_records` / `fs_snapshot_files`）

**特性**:

- 撤销内容存储在 OPFS（非内存）
- 支持最多 100 条撤销记录
- 支持 undo/redo 操作

**UndoRecord 结构**:

```typescript
{
  id: string              // 唯一 ID
  path: string            // 文件路径
  type: 'create' | 'modify' | 'delete'
  oldContentPath?: string // 旧内容在 OPFS 中的路径
  newContentPath?: string // 新内容在 OPFS 中的路径
  timestamp: number       // 操作时间
  undone: boolean         // 是否已撤销
}
```

---

## Store 集成

### WorkspaceStore

**职责**: Zustand 状态管理，桥接 WorkspaceManager 和 UI

**位置**: `src/store/workspace.store.ts`

**状态**:

```typescript
{
  activeWorkspaceId: string | null     // 当前活跃工作区
  workspaces: WorkspaceWithStats[]     // 所有工作区列表
  currentPendingCount: number          // 当前工作区待同步数
  currentUndoCount: number             // 当前工作区撤销数
  isLoading: boolean                   // 加载状态
  error: string | null                 // 错误信息
  initialized: boolean                 // 初始化状态
}
```

**使用示例**:

```typescript
import { useWorkspaceStore } from '@/store/workspace.store'

// 创建新工作区
await useWorkspaceStore
  .getState()
  .createWorkspace(conversationId, 'workspaces/' + conversationId, '新对话')

// 切换工作区
await useWorkspaceStore.getState().switchWorkspace(newWorkspaceId)

// 删除工作区
await useWorkspaceStore.getState().deleteWorkspace(workspaceId)
```

---

### OPFSStore

**职责**: 文件操作的统一入口

**位置**: `src/store/opfs.store.ts`

**主要方法**:

```typescript
// 读取文件
const { content, metadata } = await useOPFSStore
  .getState()
  .readFile('/path/to/file.txt', directoryHandle)

// 写入文件
await useOPFSStore.getState().writeFile('/path/to/file.txt', 'content', directoryHandle)

// 删除文件
await useOPFSStore.getState().deleteFile('/path/to/file.txt', directoryHandle)

// 同步到磁盘
const result = await useOPFSStore.getState().syncPendingChanges(directoryHandle)

// 撤销操作
await useOPFSStore.getState().undo(recordId)
```

---

## 与 Conversation 的集成

### 自动生命周期管理

```typescript
// conversation.store.ts

// 创建新对话时自动创建 Workspace
createNew: (title?: string) => {
  const conversation = createConversation(title)

  // 自动创建对应的 OPFS Workspace
  useWorkspaceStore
    .getState()
    .createWorkspace(conversation.id, `workspaces/${conversation.id}`, title)

  return conversation
}

// 切换对话时自动切换 Workspace
setActive: async (id) => {
  // 切换 Conversation
  state.activeConversationId = id

  // 切换对应的 OPFS Workspace
  await useWorkspaceStore.getState().switchWorkspace(id)
}

// 删除对话时自动删除 Workspace
deleteConversation: (id) => {
  // 删除 Conversation
  state.conversations = state.conversations.filter((c) => c.id !== id)

  // 删除对应的 OPFS Workspace
  await useWorkspaceStore.getState().deleteWorkspace(id)
}
```

---

## 类型定义

### 核心类型

```typescript
// 文件内容类型
type FileContent = string | ArrayBuffer | Blob

// 文件元数据
interface FileMetadata {
  path: string
  mtime: number // 修改时间（变更检测）
  size: number
  contentType: 'text' | 'binary'
  hash?: string
}

// 工作区元数据
interface WorkspaceMetadata {
  id: string // 对应 conversation.id
  name: string // 工作区名称
  createdAt: number
  lastActiveAt: number
  cacheSize: number
  pendingCount: number // 待同步数量
  undoCount: number // 撤销记录数
  modifiedFiles: number // 修改的文件数
  status: 'active' | 'archived'
}

// 待同步记录
interface PendingChange {
  id: string
  path: string
  type: 'create' | 'modify' | 'delete'
  fsMtime: number // 真实文件 mtime（冲突检测）
  timestamp: number
  agentMessageId?: string
}

// 撤销记录
interface UndoRecord {
  id: string
  path: string
  type: 'create' | 'modify' | 'delete'
  oldContentPath?: string // OPFS 中的旧内容路径
  newContentPath?: string // OPFS 中的新内容路径
  timestamp: number
  undone: boolean
}

// 同步结果
interface SyncResult {
  success: number // 成功数
  failed: number // 失败数
  skipped: number // 跳过数（冲突等）
  conflicts: ConflictInfo[] // 冲突列表
}
```

---

## 使用示例

### 基础文件操作

```typescript
import { useOPFSStore } from '@/store/opfs.store'
import { useWorkspaceStore } from '@/store/workspace.store'

// 1. 确保 Workspace 已初始化
const { activeWorkspaceId } = useWorkspaceStore.getState()

// 2. 读取文件
const { content, metadata } = await useOPFSStore
  .getState()
  .readFile('/src/components/App.tsx', directoryHandle)

// 3. 修改文件
await useOPFSStore.getState().writeFile('/src/components/App.tsx', 'new content', directoryHandle)

// 4. 查看待同步列表
const pendingChanges = useOPFSStore.getState().getPendingChanges()

// 5. 同步到磁盘
const result = await useOPFSStore.getState().syncPendingChanges(directoryHandle)
```

### 撤销操作

```typescript
// 获取撤销记录
const undoRecords = useOPFSStore.getState().getUndoRecords()

// 撤销最新操作
if (undoRecords.length > 0) {
  await useOPFSStore.getState().undo(undoRecords[0].id)
}

// 重做操作
const undoneRecord = undoRecords.find((r) => r.undone)
if (undoneRecord) {
  await useOPFSStore.getState().redo(undoneRecord.id)
}
```

### 工作区切换

```typescript
// 获取所有工作区
const { workspaces } = useWorkspaceStore.getState()

// 切换到指定工作区
await useWorkspaceStore.getState().switchWorkspace(workspaces[0].id)

// 删除工作区
await useWorkspaceStore.getState().deleteWorkspace(workspaceId)

// 清理旧工作区（30 天未活跃）
const manager = await getWorkspaceManager()
const cleaned = await manager.cleanupOldWorkspaces(30)
```

---

## 存储配额管理

### 配额阈值

```typescript
const STORAGE_THRESHOLDS = {
  WARNING: 0.7, // 70% - 显示通知
  URGENT: 0.8, // 80% - 阻止大文件
  CRITICAL: 0.95, // 95% - 阻止大部分操作
  FULL: 1.0, // 100% - 必须清理
}
```

### 检查存储

```typescript
import { getStorageEstimate, getStorageStatus } from '@/opfs'

// 获取存储估算
const estimate = await getStorageEstimate()
console.log(`已使用: ${estimate.usage} / ${estimate.quota}`)

// 检查存储状态
const status = await getStorageStatus(estimate)
if (status === 'warning') {
  // 显示警告
}
```

---

## 注意事项

### 1. Workspace ID 与 Conversation ID

Workspace ID **必须**与 Conversation ID 保持一致，这是 1:1 映射关系：

```typescript
// 正确 ✅
const workspaceId = conversation.id

// 错误 ❌
const workspaceId = 'some-other-id'
```

### 2. 目录句柄

所有文件操作都需要传入真实的 `FileSystemDirectoryHandle`：

```typescript
const directoryHandle = await window.showDirectoryPicker()
await workspace.readFile('/path/to/file.txt', directoryHandle)
```

### 3. 异步初始化

WorkspaceManager 是懒加载的，使用前需要初始化：

```typescript
const manager = await getWorkspaceManager() // 自动初始化
```

### 4. 内存缓存清理

`clearMemoryCache()` 只清理内存缓存，**不会删除** OPFS 中的数据：

```typescript
manager.clearMemoryCache() // 仅清空 Map，OPFS 数据保留
```

---

## 故障排查

### 工作区未创建成功

```typescript
// 检查 WorkspaceManager 是否初始化
const manager = await getWorkspaceManager()
console.log('Workspace count:', manager.workspaceCount)

// 检查当前活跃工作区
const { activeWorkspaceId } = useWorkspaceStore.getState()
console.log('Active workspace:', activeWorkspaceId)
```

### 文件同步失败

```typescript
const result = await workspace.syncToDisk(directoryHandle)
console.log('Success:', result.success)
console.log('Failed:', result.failed)
console.log('Conflicts:', result.conflicts)
```

### OPFS 配额不足

```typescript
const estimate = await navigator.storage.estimate()
const usageRatio = estimate.usage / estimate.quota

if (usageRatio > 0.9) {
  // 清理旧工作区或撤销历史
  await manager.cleanupOldWorkspaces(30)
}
```

---

## 用户指南

### 快速开始

1. **选择项目文件夹**
   - 点击工具栏的"打开文件夹"按钮
   - 选择要操作的项目目录

2. **编辑文件**
   - 使用 Agent 工具编辑文件 (`write`, `edit`)
   - 文件会自动缓存到 OPFS
   - 文件树会显示待同步状态（🟡 修改、🟢 新建）

3. **同步到磁盘**
   - 点击"同步"按钮写入真实文件系统
   - 查看同步结果（成功/失败/跳过）

4. **撤销修改**
   - 在撤销面板中点击撤销按钮
   - 或使用 Agent 的 `undo` 工具

### 常见问题

**Q: 为什么文件没有立即保存到磁盘？**

A: OPFS 系统采用"延迟同步"策略：

- 文件首先写入浏览器缓存（OPFS）
- 需要手动点击"同步"按钮才写入真实文件系统
- 这样可以在同步前撤销或检查所有修改

**Q: 如何撤销文件修改？**

A: 有两种方式：

- 在左侧撤销面板中点击撤销按钮
- 使用 Agent 的 `undo` 工具指定操作 ID

**Q: 如何切换工作区？**

A: 工作区与对话自动关联：

- 切换对话时自动切换对应工作区
- 每个工作区的文件修改完全隔离
- 点击顶部工作区徽章可查看当前状态

**Q: 待同步是什么意思？**

A: "待同步"表示文件已修改但还未写入磁盘：

- 🟢 新建：新创建的文件
- 🟡 修改：已修改的文件
- 🔴 删除：已删除的文件

**Q: 如何清理缓存？**

A:

- 切换到目标工作区
- 点击"清空缓存"按钮
- 或删除工作区自动清理所有数据

---

## 相关文档

- [Architecture Overview](../docs/architecture/overview.md)
- [OPFS Workspace Implementation](../docs/implementation/opfs-workspace-implementation.md)
- [Remote Session Architecture](../docs/remote-session-architecture.md)
