# 待同步文件列表和同步预览功能改进 PRD

**文档版本**: v1.0
**创建日期**: 2026-02-13
**状态**: 初稿

---

## 1. 产品概述

### 1.1 背景

CreatorWeave 是一个基于浏览器的文件系统分析工具，用户通过 Python 执行代码生成文件后，需要将 OPFS（Origin Private File System）中的文件同步到本机文件系统。当前的同步预览功能是一个 MVP 版本，存在以下核心问题：

1. **差异对比组件只显示占位符**：FileDiffViewer 组件显示 `[OPFS 内容 - 需要实现实际读取]` 和 `[本机文件系统内容 - 需要实际访问权限]` 等占位文本，未实现真实的文件内容读取和展示功能。

2. **选择性同步功能不完整**：
   - UI 层已有复选框实现（PendingSyncPanel.tsx 和 PendingFileList.tsx）
   - 但同步时未区分选中状态，syncToNative 方法始终传递全部 pendingChanges.changes
   - 用户无法实现真正的选择性同步

3. **缺少自动检测和通知机制**：
   - 需要用户手动点击刷新按钮才能检测新变更
   - 没有变更检测完成后的自动通知
   - 用户无法及时知道是否有新的待同步文件

### 1.2 产品定位

本功能是 CreatorWeave 的核心同步模块，为用户提供：

- **文件变更可视化**：清晰展示新增、修改、删除的文件
- **差异预览**：对比 OPFS 和本机文件系统的内容差异
- **选择性同步**：支持用户选择部分文件进行同步
- **实时状态感知**：自动检测变更并通知用户

### 1.3 目标用户

- 经常执行 Python 代码生成文件的用户
- 需要将浏览器端生成的文件导出到本机的用户
- 对文件同步有精细控制需求的用户

---

## 2. 用户故事

### US1: 查看文件变更概览

**作为**频繁执行 Python 代码的用户，我想要快速了解有哪些文件发生了变更，以便决定是否进行同步。

**验收标准**：
- [ ] 侧边栏显示待同步文件列表
- [ ] 列表显示文件名、变更类型（新增/修改/删除）、文件大小
- [ ] 列表按变更类型分组显示（新增组、修改组、删除组）
- [ ] 统计显示新增/修改/删除的文件数量

### US2: 预览文件差异

**作为**需要精确同步的用户，我想要查看每个文件的具体变更内容，以便决定是否同步。

**验收标准**：
- [ ] 点击文件后显示差异对比视图
- [ ] 支持 Side-by-Side（双栏）视图，对比显示 OPFS 和本机文件系统内容
- [ ] 支持 Inline（单栏）视图，高亮显示变更行
- [ ] 对于新增文件，显示 OPFS 版本内容
- [ ] 对于删除文件，显示将被删除的内容
- [ ] 对于修改文件，高亮显示变更行（绿色新增、红色删除）

### US3: 选择性同步

**作为**有选择性同步需求的用户，我想要只同步部分文件，而不是全部同步。

**验收标准**：
- [ ] 每个文件左侧显示复选框
- [ ] 支持全选/取消全选
- [ ] 点击"同步选中项"按钮时，只同步选中的文件
- [ ] 未选中任何文件时，同步按钮禁用或显示提示
- [ ] 同步成功后，选中的文件从列表中移除

### US4: 自动检测和通知

**作为**希望及时了解变更的用户，我想要在有新变更时自动收到通知，而不需要手动刷新。

**验收标准**：
- [ ] Python 执行完成后自动检测文件变更
- [ ] 检测到变更后，在侧边栏显示徽标/计数
- [ ] 可以通过设置开启/关闭自动检测
- [ ] 变更检测完成后显示 toast 通知

### US5: 移除单个文件

**作为**想要排除特定文件的用户，我想要从待同步列表中移除不需要同步的文件。

**验收标准**：
- [ ] 每个文件显示删除/移除按钮
- [ ] 点击后从待同步列表中移除该文件
- [ ] 不影响其他文件的同步

### US6: 同步历史（可选）

**作为**想要回顾同步操作的用户，我想要查看之前的同步记录。

**验收标准**：
- [ ] 同步成功后，记录同步历史
- [ ] 可以查看历史同步的时间、文件列表
- [ ] 可以查看历史同步的状态（成功/失败）

---

## 3. 功能需求

### 3.1 阶段性划分

#### 阶段一：MVP 完善（P0）

目标：修复核心缺陷，实现基本可用

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| FR1.1 | 修复选择性同步 | 将复选框选中状态传递给 syncToNative 方法 | P0 |
| FR1.2 | 实现文件内容读取 | 从 OPFS 读取文件内容用于差异对比 | P0 |
| FR1.3 | 实现本机文件读取 | 从本机文件系统读取文件内容用于差异对比 | P0 |
| FR1.4 | 差异高亮显示 | 在差异视图中高亮显示变更行 | P0 |

#### 阶段二：体验优化（P1）

目标：提升用户体验，接近竞品水平

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| FR2.1 | 变更类型分组 | 按新增/修改/删除分组显示文件列表 | P1 |
| FR2.2 | 视图模式切换 | 支持 Side-by-Side 和 Inline 两种视图 | P1 |
| FR2.3 | 自动检测优化 | Python 执行后自动检测并更新列表 | P1 |
| FR2.4 | Toast 通知 | 检测到变更后显示 toast 通知 | P1 |

#### 阶段三：高级功能（P2）

目标：增加高级功能，提升竞争力

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| FR3.1 | 行级暂存 | 支持选择特定行进行同步 | P2 |
| FR3.2 | 同步历史 | 记录和查看同步历史 | P2 |
| FR3.3 | 3-Way Merge | 支持三方合并解决冲突 | P2 |

---

### 3.2 详细功能需求

#### FR1.1: 修复选择性同步

**当前问题**：
- PendingSyncPanel.tsx 第 159 行：`workspace.syncToNative(nativeDir, pendingChanges.changes)`
- 始终传递全部变更，未使用 selectedItems

**需求描述**：
1. 当用户选中部分文件时，点击"同步"按钮只同步选中的文件
2. 当用户选中部分文件时，按钮文字从"同步全部"变为"同步选中 (N)"
3. 未选中任何文件时，按钮禁用或显示"请选择文件"提示
4. 同步成功后，从列表中移除已同步的文件

**数据流**：
```
用户选择文件 → selectedItems 状态更新 → 点击同步 →
过滤 pendingChanges.changes → 只传递选中的文件到 syncToNative
```

#### FR1.2 & FR1.3: 文件内容读取

**当前问题**：
- FileDiffViewer.tsx 第 77-78 行：`opfsContent = '[OPFS 内容 - 需要实现实际读取]'`
- 第 86-89 行：`native = '[本机文件系统内容 - 需要实际访问权限]'`

**需求描述**：

1. **OPFS 内容读取**：
   - 使用 FileSystemFileHandle 获取文件内容
   - 支持文本文件（.txt, .js, .ts, .json, .md 等）
   - 对于二进制文件（图片等），显示文件大小和类型信息

2. **本机文件系统内容读取**：
   - 通过 Native Directory Handle 读取文件
   - 使用 FileSystemFileHandle.getFile() 获取 File 对象
   - 使用 File.text() 或 File.arrayBuffer() 读取内容

#### FR1.4: 差异高亮显示

**需求描述**：
1. 使用 diff 算法计算两个版本之间的差异
2. 新增的行显示绿色背景
3. 删除的行显示红色背景
4. 修改的行显示黄色背景

**实现建议**：
- 可以使用 diff 库（如 `diff` npm 包）
- 或实现简单的行级 diff 算法

---

## 4. UI/UX 设计建议

### 4.1 整体布局

```
+----------------------------------------------------------+
|  [Sidebar]                                               |
|  +--------------------------------------------------+   |
|  | 待同步文件                          [刷新] [详情] |   |
|  +--------------------------------------------------+   |
|  | [全部] 新增(2) 修改(3) 删除(1)                     |   |
|  +--------------------------------------------------+   |
|  | + 全选                                             |   |
|  | +------------------------------------------------+|   |
|  | | [x] chart.png         新增     2.4 KB    [x]  |   |
|  | | [ ] data.json        修改     1.1 KB    [x]  |   |
|  | | [x] report.md        删除     0.8 KB    [x]  |   |
|  | +------------------------------------------------+|   |
|  +--------------------------------------------------+   |
|  | [清空]                          [同步选中(2)]     |   |
|  +--------------------------------------------------+   |
+----------------------------------------------------------+
```

### 4.2 差异对比视图

支持两种视图模式：

**Side-by-Side（双栏视图）**：
```
+----------------------------------------------------------+
| report.md - 修改                         [返回] [切换视图] |
+----------------------------------------------------------+
| OPFS 版本                  | 本机文件系统版本              |
+---------------------------+-----------------------------+
| 1. # Report              | 1. # Report                 |
| 2.                       | 2.                          |
| 3. ## Summary            | 3. ## Summary              |
| 4.                       | 4.                          |
| 5. - Item 1         [+]  | 5. - Item 1                 |
| 6. - Item 2         [+]  | 6. - Item 2                |
| 7. - Item 3              | 7. - Item 3         [-]   |
|                          | 8. + Item 4         [+]   |
+---------------------------+-----------------------------+
```

**Inline（单栏视图）**：
```
+----------------------------------------------------------+
| report.md - 修改                         [返回] [切换视图] |
+----------------------------------------------------------+
| # Report                                                |
|                                                        |
| ## Summary                                             |
|                                                        |
| - Item 1                                               |
| - Item 2                                               |
| - Item 3                                    [-]       |
| + Item 4                                    [+]       |
+----------------------------------------------------------+
```

### 4.3 组件设计规范

**颜色编码**：
- 新增（add）：绿色 `#22c55e`，背景 `#dcfce7`
- 修改（modify）：蓝色 `#3b82f6`，背景 `#dbeafe`
- 删除（delete）：红色 `#ef4444`，背景 `#fee2e2`

**字体**：
- 界面文字：系统字体，14px
- 代码/路径：等宽字体，13px

**交互**：
- 鼠标悬停：背景色变化
- 点击选中：高亮显示
- 选中文件：自动显示差异对比

---

## 5. 技术实现方案

### 5.1 核心架构

```
+-------------------------------------------------------------+
|                     React Components                        |
+-------------------------------------------------------------+
|  PendingSyncPanel     SyncPreviewPanel    FileDiffViewer   |
|  (侧边栏列表)          (预览主面板)        (差异对比)        |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                     State Management                        |
+-------------------------------------------------------------+
|              workspace.store (Zustand)                      |
|  - pendingChanges: ChangeDetectionResult                    |
|  - selectedItems: Set<string>                              |
|  - refreshPendingChanges(): Promise<void>                 |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                    Business Logic                           |
+-------------------------------------------------------------+
|  session-workspace.ts                                       |
|  - refreshPendingChanges(): Promise<ChangeDetectionResult>|
|  - syncToNative(dir, changes): Promise<SyncResult>       |
|  - readOPFSContent(path): Promise<string>                  |
|  - readNativeContent(path): Promise<string>               |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                    File System Layer                       |
+-------------------------------------------------------------+
|  OPFS API                    Native FS API                 |
|  - getFileHandle()          - getFileHandle()             |
|  - File.getFile()           - File.getFile()              |
|  - File.text()              - File.text()                |
+-------------------------------------------------------------+
```

### 5.2 关键代码修改

#### 5.2.1 修复选择性同步

**文件**: PendingSyncPanel.tsx

**修改点**：handleSync 方法

```typescript
// 修改后
// 获取选中的文件，如果没有选中任何文件则同步全部
const filesToSync = selectedItems.size > 0
  ? pendingChanges.changes.filter(c => selectedItems.has(c.path))
  : pendingChanges.changes

if (filesToSync.length === 0) {
  setSyncError('请选择要同步的文件')
  return
}

const result = await workspace.syncToNative(nativeDir, filesToSync)
```

**同步按钮显示逻辑**：
```typescript
const buttonText = selectedItems.size > 0
  ? `同步选中 (${selectedItems.size})`
  : '同步全部'
```

#### 5.2.2 实现文件内容读取

**文件**: session-workspace.ts

**新增方法**：

```typescript
/**
 * 读取 OPFS 中的文件内容
 */
async readOPFSContent(path: string): Promise<string | null> {
  const filesDir = await this.getFilesDir()
  const parts = path.split('/')
  const fileName = parts[parts.length - 1]

  let current = filesDir
  for (let i = 0; i < parts.length - 1; i++) {
    if (!parts[i]) continue
    current = await current.getDirectoryHandle(parts[i])
  }

  const fileHandle = await current.getFileHandle(fileName)
  const file = await fileHandle.getFile()

  return await file.text()
}

/**
 * 读取本机文件系统中的文件内容
 */
async readNativeContent(
  nativeDir: FileSystemDirectoryHandle,
  path: string
): Promise<string | null> {
  const parts = path.split('/')
  const fileName = parts[parts.length - 1]

  let current = nativeDir
  for (let i = 0; i < parts.length - 1; i++) {
    if (!parts[i]) continue
    try {
      current = await current.getDirectoryHandle(parts[i])
    } catch {
      return null
    }
  }

  try {
    const fileHandle = await current.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return null
  }
}
```

#### 5.2.3 更新 FileDiffViewer

**文件**: FileDiffViewer.tsx

**修改内容**：

1. 接收 nativeDir 作为 props 或从 store 获取
2. 在 useEffect 中调用 session-workspace 的读取方法
3. 实现差异计算和高亮显示

```typescript
useEffect(() => {
  if (!fileChange) return

  const loadContents = async () => {
    setContent(prev => ({ ...prev, loading: true, error: null }))

    try {
      const activeWorkspace = await getActiveWorkspace()
      if (!activeWorkspace) throw new Error('未激活的工作区')

      const { workspace } = activeWorkspace
      const nativeDir = await workspace.getNativeDirectoryHandle()

      let opfsContent: string | null = null
      let nativeContent: string | null = null

      if (fileChange.type !== 'add') {
        opfsContent = await workspace.readOPFSContent(fileChange.path)
      }

      if (fileChange.type !== 'delete' && nativeDir) {
        nativeContent = await workspace.readNativeContent(nativeDir, fileChange.path)
      }

      setContent({ opfs: opfsContent, native: nativeContent, loading: false, error: null })
    } catch (err) {
      setContent({ opfs: null, native: null, loading: false, error: err.message })
    }
  }

  loadContents()
}, [fileChange])
```

#### 5.2.4 实现自动检测和通知

**文件**: workspace.store.ts 或 conversation.store.ts

```typescript
async function onPythonExecutionComplete() {
  const { refreshPendingChanges } = useWorkspaceStore.getState()

  await refreshPendingChanges()

  const newChanges = useWorkspaceStore.getState().pendingChanges

  if (newChanges && newChanges.changes.length > 0) {
    showToast({
      type: 'info',
      title: '检测到文件变更',
      message: `${newChanges.changes.length} 个文件待同步`,
    })
  }
}
```

### 5.3 数据模型

```typescript
// 文件变更类型
type ChangeType = 'add' | 'modify' | 'delete'

// 文件变更项
interface FileChange {
  type: ChangeType
  path: string
  size?: number
  mtime?: number
}

// 变更检测结果
interface ChangeDetectionResult {
  changes: FileChange[]
  added: number
  modified: number
  deleted: number
}

// 文件内容状态
interface FileContentState {
  opfs: string | null
  native: string | null
  loading: boolean
  error: string | null
}

// 同步结果
interface SyncResult {
  synced: number
  failed: number
  errors?: Array<{ path: string; error: string }>
}
```

---

## 6. 验收标准

### 6.1 阶段一验收标准

| ID | 功能 | 验收条件 |
|----|------|----------|
| AC1.1 | 选择性同步 | 选中部分文件后点击同步按钮，只同步选中的文件 |
| AC1.2 | OPFS 内容读取 | FileDiffViewer 能正确显示 OPFS 中的文件内容 |
| AC1.3 | 本机内容读取 | FileDiffViewer 能正确显示本机文件系统中的文件内容 |
| AC1.4 | 差异高亮 | 对于修改的文件，能高亮显示变更行 |

**测试用例**：

1. **选择性同步测试**：
   - 打开待同步文件列表，选中 2 个文件
   - 点击"同步选中 (2)"按钮
   - 验证只有选中的 2 个文件被同步
   - 验证未选中的文件仍在列表中

2. **差异对比测试**：
   - 选择一个修改过的文件
   - 验证 OPFS 版本和本机版本都显示正确内容
   - 验证变更行有正确的颜色高亮

### 6.2 阶段二验收标准

| ID | 功能 | 验收条件 |
|----|------|----------|
| AC2.1 | 分组显示 | 文件列表按新增/修改/删除分组显示 |
| AC2.2 | 视图切换 | 可以切换 Side-by-Side 和 Inline 视图 |
| AC2.3 | 自动检测 | Python 执行后自动更新待同步列表 |
| AC2.4 | Toast 通知 | 检测到变更后显示 toast 通知 |

**测试用例**：

1. **分组显示测试**：
   - 执行生成多个文件的代码
   - 验证列表中新增、修改、删除的文件分开展示
   - 验证每个分组有对应的计数

2. **自动检测测试**：
   - 手动删除一个待同步文件
   - 执行 Python 代码生成新文件
   - 验证列表自动更新，无需手动刷新

### 6.3 阶段三验收标准

| ID | 功能 | 验收条件 |
|----|------|----------|
| AC3.1 | 行级暂存 | 可以选择特定的变更行进行同步 |
| AC3.2 | 同步历史 | 可以查看历史同步记录 |

---

## 7. 风险与限制

### 7.1 技术限制

1. **文件大小限制**：大文件（>10MB）可能影响读取性能
2. **二进制文件**：图片等二进制文件无法在差异视图中显示内容
3. **权限限制**：需要用户授权本机文件系统访问权限

### 7.2 已知问题

1. **首次授权**：用户首次同步时需要授权目录访问权限
2. **并发同步**：当前不支持并发同步操作

---

## 8. 后续迭代方向

1. **性能优化**：大文件采用流式读取或分页加载
2. **冲突解决**：支持 3-Way Merge 解决同步冲突
3. **云同步**：支持同步到云存储服务

---

## 9. 参考资料

- 竞品分析：
  - VS Code: Inline + Side-by-Side diff 视图
  - GitHub Desktop: 简洁变更列表，颜色编码
  - JetBrains: Changelist 分组管理
