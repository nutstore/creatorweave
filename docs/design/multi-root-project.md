# Multi-Root Project 设计方案

> 状态：实施中（P0+P1+P3 已完成）
> 日期：2026-04-29
> 方案：C 智能路由（无前缀，透明查找 + 写时归属）

## 1. 背景

用户的开发场景中，一个项目往往依赖多个独立的本地项目（如组件库、工具包、共享模块）。Agent 需要同时访问这些项目的文件，才能进行跨项目的分析和修改。

当前限制：一个 Project 只能绑定一个本地文件夹句柄。

## 2. 设计目标

- 一个 Project 可绑定 **N 个本地文件夹句柄**（Root）
- 每个 Root 可以独立设置为**只读**或**读写**
- Agent 能**跨 Root 搜索、分析**文件
- Agent 能**修改非只读 Root** 的文件，并写回磁盘
- Root 名字取自文件夹名称（`handle.name`）

## 3. 概念模型

```
Project "我的项目"
  │
  ├── Root: "my-app"       → DirectoryHandle A  (读写, default)
  ├── Root: "ui-lib"       → DirectoryHandle B  (读写)
  ├── Root: "core-utils"   → DirectoryHandle C  (只读)
  │
  ├── Workspace 1（对话1）
  │     └── files/
  │           ├── my-app/        ← Root A 的缓存
  │           ├── ui-lib/        ← Root B 的缓存
  │           └── core-utils/    ← Root C 的缓存
  │
  └── Workspace 2（对话2）
        └── files/
              ├── my-app/        ← 独立缓存
              ├── ui-lib/
              └── core-utils/
```

**职责分层**：

| 层级 | 持有什么 | 原因 |
|------|---------|------|
| Project | 多个 DirectoryHandle | 句柄是磁盘访问权限，项目内共享 |
| Workspace | 按 Root 分目录的文件缓存 + pending/baseline | 每个对话独立工作区 |

## 4. 数据模型

### 4.1 新增 `project_roots` 表

```sql
CREATE TABLE project_roots (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  name        TEXT NOT NULL,        -- handle.name，如 "my-app"
  is_default  INTEGER DEFAULT 0,    -- 第一个添加的为 default
  read_only   INTEGER DEFAULT 0,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, name),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### 4.2 已有表变更

**`fs_ops`** — path 字段格式变为 `{rootName}/{relativePath}`：

```
旧（单目录）: src/App.tsx
新（多目录）: my-app/src/App.tsx
```

表结构不变，只是 path 值带了 root 前缀。

**`fs_changesets` / `fs_snapshot_files`** — 同理，path 带 root 前缀，表结构不变。

## 5. OPFS 目录结构

```
projects/{pid}/
  ├── agents/{agentId}/
  └── workspaces/{wid}/
        ├── files/
        │   ├── my-app/
        │   │   ├── src/
        │   │   └── package.json
        │   ├── ui-lib/
        │   │   ├── src/
        │   │   └── package.json
        │   └── core-utils/
        │       ├── src/
        │       └── package.json
        ├── .baseline/
        │   ├── my-app/
        │   ├── ui-lib/
        │   └── core-utils/
        └── workspace.json
```

## 6. 模块改造

### 6.1 DirectoryHandleManager

IndexedDB 存储和运行时 Map 都改为复合键 `projectId:rootName`。

```typescript
// 运行时 Map
// 旧: Map<projectId, handle>
// 新: Map<`${projectId}:${rootName}`, handle>

function bindRuntimeDirectoryHandle(
  projectId: string,
  rootName: string,
  handle: FileSystemDirectoryHandle
): void

function getRuntimeDirectoryHandle(
  projectId: string,
  rootName: string
): FileSystemDirectoryHandle | null

function getAllRuntimeHandles(
  projectId: string
): Map<string, FileSystemDirectoryHandle>
```

IndexedDB 的 keyPath 从 `workspaceId` 改为 `compoundKey`（值为 `${projectId}:${rootName}`）。

### 6.2 WorkspaceRuntime

路径解析：所有文件操作统一走 root 前缀路由。

```typescript
interface RootInfo {
  name: string
  readOnly: boolean
  isDefault: boolean
}

class WorkspaceRuntime {
  private roots: Map<string, RootInfo>

  /**
   * 解析路径，提取 rootName 和相对路径
   * "ui-lib/src/Button.tsx" → { rootName: "ui-lib", relativePath: "src/Button.tsx" }
   * "src/App.tsx"           → { rootName: defaultRoot, relativePath: "src/App.tsx" }
   */
  resolvePath(path: string): { rootName: string; relativePath: string }

  // readFile / writeFile / deleteFile 内部统一：
  // 1. resolvePath → 得到 rootName + relativePath
  // 2. 拼接 OPFS 路径: files/{rootName}/{relativePath}
  // 3. 获取对应的 DirectoryHandle: getRuntimeDirectoryHandle(projectId, rootName)
}
```

**写入时检查只读**：

```typescript
async writeFile(path: string, content: Uint8Array): Promise<WriteResult> {
  const { rootName } = this.resolvePath(path)
  const root = this.roots.get(rootName)
  if (root?.readOnly) {
    throw new Error(`Root "${rootName}" is read-only`)
  }
  // ... 正常写入
}
```

### 6.3 Python 挂载

```typescript
// 旧:
mountNativeFS('/mnt', opfsFilesDir)

// 新: 每个 root 一个挂载点
for (const rootName of rootNames) {
  const dirHandle = await opfs.getDirectoryHandle(rootName)
  mountNativeFS(`/mnt/${rootName}`, dirHandle)
}
```

Python 中访问：

```python
open('/mnt/my-app/src/App.tsx')
open('/mnt/ui-lib/src/Button.tsx')
open('/mnt/core-utils/src/helpers/format.ts')
```

### 6.4 VFS Resolver

路径规则不变，只是路径格式多了 root 前缀：

```
vfs://workspace/my-app/src/App.tsx       → WorkspaceRuntime → files/my-app/src/App.tsx
vfs://workspace/ui-lib/src/Button.tsx    → WorkspaceRuntime → files/ui-lib/src/Button.tsx
vfs://workspace/src/App.tsx              → 自动补 default root → files/my-app/src/App.tsx
```

### 6.5 Agent 工具

**ls**：

```
ls()                        → 列出 root 列表: ["my-app/", "ui-lib/", "core-utils/"]
ls("ui-lib/src/")           → 列出 ui-lib 下 src 目录
ls("src/")                  → default root 下的 src 目录
```

**read / write / edit**：

```
read("ui-lib/src/Button.tsx")        → 读取
edit("ui-lib/src/Button.tsx", ...)   → 编辑（自动检查只读）
read("src/App.tsx")                  → default root
```

**search**：

```
search("Button")                     → 跨所有 root 搜索
search("Button", scope="ui-lib")     → 只搜索 ui-lib
```

**sync**：

```
sync({ paths: ["src/**/*.ts"], root: "ui-lib" })   → 同步 ui-lib
sync({ paths: ["**/*.ts"] })                        → 同步所有 root（默认行为）
```

### 6.6 syncToDisk 回写

按路径前缀路由到对应的 DirectoryHandle：

```typescript
async syncToDisk(paths: string[]): Promise<SyncResult> {
  // 按root分组
  const grouped = groupBy(paths, path => this.resolvePath(path).rootName)

  for (const [rootName, rootPaths] of grouped) {
    const handle = getRuntimeDirectoryHandle(this.projectId, rootName)
    if (!handle) continue

    for (const path of rootPaths) {
      const { relativePath } = this.resolvePath(path)
      // 写入对应句柄
      await writeToFileHandle(handle, relativePath, content)
    }
  }
}
```

## 7. 用户交互

### 7.1 添加 Root

```
1. 用户在项目设置中点击 "添加项目文件夹"
2. showDirectoryPicker() → 拿到 handle
3. 取 handle.name 作为 root 名（如 "ui-lib"）
4. 检查重名：如果已有同名 root，提示用户
5. 用户可选勾选 "只读"
6. 系统：
   - 存储 handle 到 IndexedDB
   - 写入 project_roots 表
   - 为所有活跃 workspace 创建 files/{rootName}/ 目录
   - 初始同步磁盘文件 → OPFS
7. 侧边栏出现新 root 节点
```

### 7.2 移除 Root

```
1. 用户在项目设置中点击 root 旁的 "移除"
2. 检查：该 root 下是否有未同步的 pending changes
   - 有 → 提示用户先同步或丢弃
   - 无 → 继续
3. 删除 project_roots 记录
4. 删除 IndexedDB 中的 handle
5. 删除所有 workspace 下的 files/{rootName}/ 和 .baseline/{rootName}/
6. 删除 fs_ops 中该 root 前缀的 pending 记录
```

### 7.3 侧边栏 UI

```
📁 my-app             [✏️ 默认]
  ├── src/
  ├── package.json
  └── ...
📁 ui-lib             [✏️]
  ├── src/
  ├── package.json
  └── ...
📁 core-utils         [🔒 只读]
  ├── src/
  ├── package.json
  └── ...
```

### 7.4 创建项目流程

创建项目时不强制选择文件夹，默认创建纯 OPFS 项目：

```
1. 输入项目名称
2. 点击 "创建" → 创建纯 OPFS 项目（root 为 _opfs）
3. 可选：在项目设置中随时添加本地文件夹
```

## 8. 约束

### 8.1 每个 Project 至少有一个 Root

- `project_roots` 表**始终有记录**，不存在"没有 root 的项目"
- 单目录 = N=1 的多目录
- 第一个添加的 root 自动成为 **default root**（`is_default = 1`）

### 8.2 纯 OPFS 项目（`_opfs` root）

- 不连接本地磁盘的项目，root name 为 `_opfs`，没有 DirectoryHandle
- 所有数据存在 OPFS 中，`syncToDisk` 时 `_opfs` root 没有 handle，自然跳过

| 项目类型 | project_roots | DirectoryHandle |
|---------|--------------|-----------------|
| 纯 OPFS | `{ name: "_opfs", is_default: 1 }` | 无 |
| 单目录 | `{ name: "my-app", is_default: 1 }` | 有 |
| 多目录 | `{ name: "my-app" }, { name: "ui-lib" }, ...` | 各自持有 |

### 8.3 Default Root 替换（`_opfs` → 本地磁盘）

纯 OPFS 项目后期添加第一个本地磁盘文件夹时，需要替换 `_opfs`：

```
1. 创建新 root: "my-app"（设为 default）
2. OPFS 文件迁移: files/_opfs/* → files/my-app/*
3. Baseline 迁移: .baseline/_opfs/* → .baseline/my-app/*
4. fs_ops 路径更新: _opfs/src/App.tsx → my-app/src/App.tsx
5. fs_changesets 路径更新: 同上
6. 删除 _opfs root 记录
7. 将 OPFS 中的文件同步到本地磁盘（首次 syncToDisk）
```

后续添加更多 root 就是普通的多目录逻辑。

### 8.4 默认 Root 与路径省略

- 每个 Project 有且仅有一个 default root
- Agent 工具中省略 root 前缀的路径，自动路由到 default root
- 这保证了简单场景下 Agent 的使用体验不变

### 8.5 句柄存储统一

- 无论几个 root，DirectoryHandle 统一按 `projectId:rootName` 复合键存储
- 不存在"单目录走旧逻辑，多目录走新逻辑"的分支
- 单目录项目和纯 OPFS 项目的 root 同样有 `project_roots` 记录，同样走多 root 代码路径

## 9. 实施阶段

| 阶段 | 内容 | 改动范围 | 状态 |
|------|------|---------|------|
| **P0: 数据层** | `project_roots` 表、`ProjectRootRepository`、Migration v6 | SQLite schema、Repository | ✅ 完成 |
| **P0: Handle 管理** | `DirectoryHandleManager` 多 root 支持（复合键） | directory-handle-manager.ts | ✅ 完成 |
| **P1: Runtime** | `WorkspaceRuntime` 路径解析、多 root 路由、syncToDisk 多目标 | workspace-runtime.ts | ✅ 完成 |
| **P2: Agent 工具** | VFS resolver、工具路径解析、Python 多挂载 | vfs-resolver.ts、sync tool、python worker | ✅ 完成 |
| **P3: Store** | workspace store、folder-access store 适配 | workspace.store.ts、folder-access.store.ts | ✅ 完成 |
| **P4: UI** | 项目设置页（添加/管理 Root）、侧边栏多 root 展示 | 新增组件 | 🔜 待实施 |

### P1 完成详情

**WorkspaceRuntime 新增方法：**
- `resolvePath(path, projectId?)` — 将路径解析为 `{ rootName, relativePath, readOnly }`
- `getNativeDirectoryHandleForPath(path)` — 按路径返回对应的 native handle
- `getAllNativeDirectoryHandles()` — 获取项目所有 root 的 handle Map
- `ensureRootMap(projectId)` — 从 SQLite 加载并缓存 root 映射
- `isReadOnlyRoot(rootName)` — 检查 root 是否只读
- `invalidateRootCache()` — 清除缓存

**已修改方法（多 root 感知）：**
- `getNativeDirectoryHandle()` — 优先尝试 default root handle，回退到 legacy
- `syncToDisk()` → `syncToDiskSingleRoot()` + `syncToDiskMultiRoot()` — 多 handle 路由
- `detectSyncConflicts()` — 多 handle 聚合冲突检测
- `prepareFiles()` — 按文件路径路由到正确的 root handle
- `rebindPendingBaselinesToNative()` — 按路径解析 handle
- `restorePendingModifyFromNative()` — 按路径解析 handle

**向后兼容：**
- 单 root 项目（无 `project_roots` 记录）→ 所有方法走 legacy 路径，行为不变
- 多 root 项目（有 `project_roots` 记录）→ 自动启用路由
- 路径中无 root 前缀 → 自动路由到 default root

### P3 完成详情

**FolderAccessRecord 类型扩展：**
- 新增 `rootName?: string` 字段
- 默认值 = `handle.name`（文件夹名称）

**folder-access.store.ts 改造：**
- `createEmptyRecord(projectId, rootName?)` — 支持 rootName 参数
- `hydrateProject` — bind 时使用 `rootName ?? handle.name`
- `pickDirectory` — record 带 `rootName: handle.name`，bind 用三参数 API
- `setHandle` — 同上
- `requestPermission` — bind 用 `record.rootName ?? handle.name`
- `release` — unbind 用 `record.rootName`
- `refreshFilePaths` — 多 root 遍历，路径前缀为 `{rootName}/{path}`

**workspace.store.ts 改造：**
- `requestDirectoryAccess` — `bindRuntimeDirectoryHandle(projectId, handle.name, handle)`
- `refreshForWorkspace` — 保持 legacy fallback
- `syncUnsyncedSnapshots` — `syncToDisk` 内部自动路由

**types/folder-access.ts 改造：**
- `FolderAccessRecord.rootName` — 可选字段

### P2 完成详情

**核心发现：Python 不需要改挂载逻辑。** OPFS `files/` 是扁平 VFS，多 root 内容已存储在 `files/{rootName}/` 子目录下。`/mnt/` 挂载 OPFS `files/` 后，Python 代码可直接通过 `/mnt/{rootName}/path` 访问各 root 文件。`resolvePath()` 在 WorkspaceRuntime 层已处理 root 前缀路由。

**sync-opfs.tool.ts 改造：**
- 从单 handle 同步改为多 handle 遍历：`getAllNativeDirectoryHandles()` 获取所有 root handle
- 按 root 分组文件路径，每组 glob 展开在自己的 handle 上执行
- 写入 OPFS 时带 root 前缀：`syncSingleFile(nativeHandle, filesDir, filePath, opfsDestPath)`
- 向后兼容：`context.directoryHandle` 存在时走 legacy 单 handle 路径

**execute.tool.ts 改造：**
- Python 工具描述增加多 root 说明：`/mnt/{rootName}/path/to/file`

**workspace-runtime.ts 改造（readFile/writeFile/deleteFile）：**
- 三个核心方法内部新增 `nativeHandle` 解析：`directoryHandle ?? await this.getNativeDirectoryHandleForPath(normalizedPath)`
- 替换所有 `directoryHandle` 引用为 `nativeHandle`，确保 native FS 操作路由到正确的 root handle
- 涵盖：prefer_native 读取、conflict 检测（disk mtime > baseline mtime）、非 pending 文件的 native 读取、prefer_opfs 回退、writeFile 基线检测、deleteFile 基线检测

**无需修改的工具：**
- `io.tool.ts` — 通过 `resolveVfsTarget()` → `WorkspaceBackend` → `useOPFSStore` → `WorkspaceRuntime.readFile/writeFile` 间接使用多 root 路由
- `ls.tool.ts` — 扫描 OPFS `files/` 目录（自然包含所有 root 子目录）+ native handle
- `search.tool.ts` — VFS 路径走 `WorkspaceBackend.getDirectoryHandle()` 返回 OPFS handle
- `vfs-resolver.ts` — namespace 路由逻辑不变，workspace 路径自然包含 root 前缀

## 10. 待修复问题（审查发现）

> 2026-05-06 审查

### 10.1 去掉 "default root" 概念

**现状**：`resolvePath()` 和 `ensureRootMap()` 依赖 `is_default` 标记和 `_defaultRootName` 字段，无 root 前缀的路径会路由到 default root。

**目标**：所有 root 平权，不存在 default。单 root 项目是 N=1 的特例。

**改动**：
- `project_roots` 表保留 `is_default` 列但仅用于"无前缀路径时取第一个 root"的兼容，不暴露给用户
- `resolvePath()` 无前缀路径：单 root → 直接路由到唯一 root；多 root → 路由到第一个 root + console 提示建议带前缀
- `setDefaultRoot` action 移除
- `RootInfo.isDefault` 字段内部保留，不暴露到 UI

### 10.2 FolderSelector 改造（统一入口）

**现状**：
- 顶部 `FolderSelector` 走旧 `pickDirectory()` → 不写 `project_roots` 表 → 多 root 系统看不到
- 设置里 `RootManagementPanel` 走 `addRoot()` → 写 `project_roots` → 但不更新 `agent.store` → FileTreePanel 不刷新
- 两个入口数据不同步

**目标**：去掉设置里的 RootManagementPanel，改造顶部 FolderSelector 为多 root 管理入口。

**改动**：
- 删除 `SettingsDialog` 中的 projectRoots tab
- 改造 `FolderSelector`：显示已添加的所有 root（chip/badge 形式），支持添加/移除
- `pickDirectory()` 改为写 `project_roots` 表（与 `addRoot()` 统一）
- 添加 root 后同步更新 `agent.store` 中的 handle 信息
- 移除 root 时检查 pending changes

### 10.3 ls 工具多 root 支持

**现状**：`ls.tool.ts` 只用 `toolContext.directoryHandle`（单个 handle），多 root 下只能列出一个 root。

**改动**：
- `ls()` 无参数时：列出所有 root 名称（如 `["my-app/", "ui-lib/", "core-utils/"]`）
- `ls("ui-lib/src/")`：列出指定 root 的目录
- 需要 `ToolContext` 能获取所有 root handles

### 10.4 ToolContext 扩展

**现状**：`ToolContext.directoryHandle` 只有单个 handle。

**改动**：新增 `ToolContext.allDirectoryHandles?: Map<string, FileSystemDirectoryHandle>` 或让工具直接通过 runtime 获取。
