# Browser File System Analyzer - 技术架构文档

## 📋 项目概述

**Browser File System Analyzer** 是一个基于浏览器沙盒的本地文件系统分析器，完全在客户端运行，利用 WebAssembly (WASM) 的高性能计算能力来统计本地文件夹的文件大小和结构信息。

### 核心理念

> **"浏览器即沙盒 (The Browser is the Sandbox)"**

现代浏览器提供了多层级的本地文件系统访问能力，本项目充分利用这些能力，构建一个安全、高效的文件系统分析工具。

---

## 🎯 Phase 1: 基础功能

### 核心任务

1. **用户交互** - 通过浏览器原生弹窗选择本地文件夹
2. **目录遍历** - 递归遍历文件夹及其子文件夹
3. **元数据收集** - 获取每个文件的大小、类型、修改时间等信息
4. **WASM 计算** - 使用 Rust 编译的 WASM 模块进行累加计算
5. **实时显示** - 在网页上显示文件数量和总大小

### 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | React + TypeScript | 现代化 UI 框架，类型安全 |
| 构建工具 | Vite | 快速开发服务器，优化的生产构建 |
| UI 组件 | shadcn/ui + lucide-react | 基于 Radix UI 的组件库 + 图标库 |
| 样式方案 | Tailwind CSS | 实用优先的 CSS 框架 |
| 状态管理 | Zustand | 轻量级状态管理库，支持持久化 |
| 计算层 | Rust + WASM | 高性能计算，通过 wasm-bindgen 与 JS 交互 |
| 浏览器 API | File System Access API | 原生文件系统访问能力 |
| 包管理器 | pnpm | Monorepo 工作区管理 |
| 实时通信 | Socket.IO | Remote Session 的 WebSocket 通信 |
| 加密 | Web Crypto API | E2E 加密 (ECDH + AES-GCM) |

---

## 🏗️ 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────┐
│              用户界面层 (React)              │
│  ┌────────────────────────────────────────┐ │
│  │  UI 组件 (shadcn/ui + Tailwind CSS)   │ │
│  │  - Header / Sidebar / MainContent     │ │
│  │  - FileBrowser / AnalysisPanel        │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│           状态管理层 (Zustand)               │
│  ┌────────────────────────────────────────┐ │
│  │  - filesystemStore (文件系统状态)      │ │
│  │  - analysisStore (分析结果状态)        │ │
│  │  - uiStore (UI 状态)                   │ │
│  │  - historyStore (历史记录)             │ │
│  └────────────────────────────────────────┘ │
│                      ↓                       │
│  ┌────────────────────────────────────────┐ │
│  │  持久化中间件 (persist)                │ │
│  │  - localStorage (UI 偏好)              │ │
│  │  - IndexedDB (文件句柄、缓存)          │ │
│  │  - OPFS (分析结果缓存)                 │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│          业务逻辑层 (Services)               │
│  ┌────────────────────────────────────────┐ │
│  │  - fsAccess.ts (File System API)       │ │
│  │  - traversal.ts (目录遍历)              │ │
│  │  - storage.ts (IndexedDB 封装)         │ │
│  │  - analyzer.ts (分析器)                │ │
│  │  - remote-session.ts (远程会话)        │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│           共享包 (Monorepo)                  │
│  ┌────────────────────────────────────────┐ │
│  │  @browser-fs-analyzer/encryption       │ │
│  │  - E2EEncryption class                 │ │
│  │  - ECDH + AES-GCM 加密                 │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│       浏览器 API 层 (JavaScript)             │
│  ┌────────────────────────────────────────┐ │
│  │  - showDirectoryPicker()               │ │
│  │  - dirHandle.values()                  │ │
│  │  - fileHandle.getFile()                │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│      计算层 (Rust/WebAssembly)              │
│  ┌────────────────────────────────────────┐ │
│  │  WASM Bindings (wasm-bindgen)          │ │
│  │  - FileAnalyzer 类                    │ │
│  │  - add_files() / get_total()           │ │
│  └────────────────────────────────────────┘ │
│                      ↓                       │
│  ┌────────────────────────────────────────┐ │
│  │  Core Library (纯 Rust)                │ │
│  │  - Accumulator (累加器)                │ │
│  │  - FileStats (统计)                    │ │
│  │  - SizeDistribution (分布)             │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 🔍 技术边界划分

### 为什么这样划分？

**核心原则**：WASM **无法直接调用**浏览器 API

```
┌─────────────────────────────────────────┐
│           浏览器运行时                   │
├─────────────────────────────────────────┤
│  JavaScript 层 (可调用所有浏览器 API)    │
│  ✅ File System Access API              │
│  ✅ DOM API                              │
│  ✅ Fetch / XHR                          │
├─────────────────────────────────────────┤
│  WASM 层 (沙盒环境，无浏览器 API)        │
│  ❌ 不能调用 File System Access API     │
│  ❌ 不能直接操作 DOM                     │
│  ✅ 只能执行计算逻辑                     │
└─────────────────────────────────────────┘
```

### 职责分配

#### ✅ 前端 JavaScript 负责

1. **调用浏览器 API**
   - `window.showDirectoryPicker()` - 选择文件夹
   - `dirHandle.values()` - 遍历目录
   - `fileHandle.getFile()` - 获取文件对象

2. **递归遍历目录结构**
   ```typescript
   async function* traverseDirectory(dirHandle) {
     for await (const entry of dirHandle.values()) {
       if (entry.kind === 'file') {
         const file = await entry.getFile();
         yield { size: file.size };
       } else {
         yield* traverseDirectory(entry);  // 递归
       }
     }
   }
   ```

3. **收集和传递数据**
   - 收集文件大小到数组 `[size1, size2, ...]`
   - 传递给 WASM 进行计算

4. **UI 更新和格式化**
   - DOM 操作
   - 数据格式化（MB/GB 单位转换）
   - 用户交互处理

#### ✅ Rust/WASM 负责

1. **累加计算逻辑**
   ```rust
   pub fn add_batch(&mut self, sizes: &[u64]) {
       self.total += sizes.iter().sum::<u64>();
       self.count += sizes.len() as u64;
   }
   ```

2. **状态管理**
   - 维护累加器状态
   - 提供查询接口（`get_total()`, `get_count()`）

3. **数据类型转换**
   - Rust ↔ JS 数值转换
   - 安全的边界处理

---

## 🌊 数据流设计

### 完整数据流

```
用户点击 "选择文件夹" 按钮
         ↓
┌────────────────────────────────────────────┐
│  JavaScript 层                             │
│  ┌──────────────────────────────────────┐ │
│  | 1. 调用浏览器 API                     | │
│  |   window.showDirectoryPicker()       | │
│  |   ↓                                  | │
│  |  返回: FileSystemDirectoryHandle      | │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  | 2. 递归遍历目录                       | │
│  |   for await (entry of dir.values())  | │
│  |   ↓                                  | │
│  |   entry.getFile()                    | │
│  |   ↓                                  | │
│  |   收集: [file1.size, file2.size, ...]| │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  | 3. 传递数据给 WASM                    | │
│  |   analyzer.add_files(fileSizes)      | │
│  |   ↓                                  | │
│  |   数据跨边界: JS Array → Rust Vec   | │
│  └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────┐
│  WASM 层 (Rust)                            │
│  ┌──────────────────────────────────────┐ │
│  | 4. 执行累加计算                       | │
│  |   fn add_batch(&mut self, sizes)     | │
│  |   ↓                                  | │
│  |   for size in sizes {                | │
│  |       self.total += size;            | │
│  |   }                                  | │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  | 5. 返回计算结果                       | │
│  |   self.get_total()                   | │
│  |   ↓                                  | │
│  |   返回: u64 (总字节数)               | │
│  └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────┐
│  JavaScript 层                             │
│  ┌──────────────────────────────────────┐ │
│  | 6. 格式化并显示结果                   | │
│  |   const totalMB = totalSize / 1024^2 | │
│  |   ↓                                  | │
│  |   document.getElementById('size')    | │
│  |     .textContent = `${totalMB} MB`   | │
│  └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

---

## 💾 存储策略

### 三层存储架构

```
┌─────────────────────────────────────┐
│  Zustand + persist (localStorage)    │
│  ✅ UI 偏好（侧边栏、主题、排序）    │
│  ✅ 展开的文件夹                     │
│  ✅ 最近访问路径（名称）             │
│  ✅ 分析历史记录                     │
└─────────────────────────────────────┘
              ↕ 需要句柄时
┌─────────────────────────────────────┐
│  IndexedDB (idb 库)                 │
│  ✅ FileSystemDirectoryHandle       │
│  ✅ 文件树缓存（避免重复遍历）       │
│  ✅ 大型分析结果                     │
└─────────────────────────────────────┘
              ↕ 高性能缓存
┌─────────────────────────────────────┐
│  OPFS (Origin Private File System)  │
│  ✅ 分析结果缓存                     │
│  ✅ 文件索引                         │
│  ✅ 临时中间结果                     │
└─────────────────────────────────────┘
```

### 存储对比

| 存储方式 | 容量 | 性能 | 持久化 | 适用场景 |
|---------|------|------|--------|----------|
| **localStorage** | ~5MB | 同步 | ✅ | UI 偏好、配置 |
| **IndexedDB** | ~50MB+ | 异步 | ✅ | 文件句柄、大型数据 |
| **OPFS** | 动态配额 | 同步+异步 | ✅ | 高性能缓存、索引 |

---

## 🗂️ Zustand Store 设计

### 文件系统 Store

```typescript
interface FileSystemState {
  // 状态
  currentDirHandle: FileSystemDirectoryHandle | null;
  fileTree: FileNode[];
  selectedFiles: Set<string>;
  expandedDirs: Set<string>;
  recentPaths: string[];

  // 操作
  setCurrentDirHandle: (handle) => void;
  setFileTree: (tree) => void;
  toggleFileSelection: (id) => void;
  toggleDirExpansion: (id) => void;
  addRecentPath: (path) => void;
}
```

**持久化策略**：
- ✅ 持久化：`expandedDirs`, `recentPaths`
- ❌ 不持久化：`currentDirHandle` (句柄无法序列化)
- ❌ 不持久化：`fileTree` (通过 IndexedDB 缓存)

### 分析 Store

```typescript
interface AnalysisState {
  isAnalyzing: boolean;
  progress: number;
  result: AnalysisResult | null;
  error: string | null;

  startAnalysis: () => void;
  updateProgress: (progress) => void;
  completeAnalysis: (result) => void;
  setError: (error) => void;
}
```

**持久化策略**：
- ❌ 不持久化：分析状态是临时的

### UI Store

```typescript
interface UIState {
  sidebarOpen: boolean;
  viewMode: 'tree' | 'list';
  sortBy: 'name' | 'size' | 'type';
  theme: 'light' | 'dark';

  toggleSidebar: () => void;
  setViewMode: (mode) => void;
  setSortBy: (by) => void;
  setTheme: (theme) => void;
}
```

**持久化策略**：
- ✅ 持久化：所有 UI 偏好

---

## 🔐 File System Access API 详解

### 核心方法

| 方法 | 功能 | 返回值 | 权限要求 |
|------|------|--------|----------|
| `showDirectoryPicker()` | 选择文件夹 | `FileSystemDirectoryHandle` | 用户授权 |
| `dirHandle.values()` | 遍历目录 | `AsyncIterable<Handle>` | 读取 |
| `fileHandle.getFile()` | 获取文件对象 | `File` | 读取 |
| `handle.queryPermission()` | 查询权限 | `'granted'\|'prompt'\|'denied'` | - |
| `handle.requestPermission()` | 请求权限 | `'granted'\|'prompt'\|'denied'` | 用户手势 |

### 使用示例

```typescript
// 1. 选择文件夹
const dirHandle = await window.showDirectoryPicker({
  mode: 'read',
  startIn: 'documents'
});

// 2. 递归遍历
async function* traverseDirectory(dirHandle) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      yield { size: file.size };
    } else {
      yield* traverseDirectory(entry);
    }
  }
}

// 3. 收集数据
const fileSizes = [];
for await (const file of traverseDirectory(dirHandle)) {
  fileSizes.push(file.size);
}

// 4. 调用 WASM
const totalSize = wasmAnalyzer.add_files(fileSizes);
```

### 浏览器兼容性

| 浏览器 | 版本支持 | File System Access API |
|--------|----------|----------------------|
| Chrome | 86+ | ✅ 完整支持 |
| Edge | 86+ | ✅ 完整支持 |
| Opera | 72+ | ✅ 完整支持 |
| Firefox | ❌ 不支持 | ❌ 需要降级方案 |
| Safari | ❌ 不支持 | ❌ 需要降级方案 |

---

## 🚀 OPFS (Origin Private File System)

### 什么是 OPFS？

**Origin Private File System** 是一个为网站源站提供**私有、优化的文件系统接口**。

**核心特点**：
- **私有性**：只有页面源站可以访问，对用户不可见
- **高性能**：提供同步读写能力（`FileSystemSyncAccessHandle`）
- **沙箱隔离**：每个源站有独立的文件系统

### OPFS vs File System Access API

| 特性 | OPFS | File System Access API |
|------|------|----------------------|
| 可见性 | 完全私有 | 用户可见 |
| 权限要求 | 无需权限 | 需要用户授权 |
| 读写机制 | 同步+异步 | 仅异步 |
| 适用场景 | 缓存、配置、索引 | 用户文件编辑 |

### 在项目中的应用

```typescript
// 使用 OPFS 缓存分析结果
class AnalysisCache {
  async saveResult(filePath, data) {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(
      `cache_${this.hash(filePath)}.json`,
      { create: true }
    );

    // 高性能同步写入
    const syncHandle = await fileHandle.createSyncAccessHandle();
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    syncHandle.write(encoded);
    await syncHandle.close();
  }

  async getResult(filePath) {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`cache_${this.hash(filePath)}.json`);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  }
}
```

---

## 🛠️ 开发工作流

### 环境准备

```bash
# 1. 安装 Rust (1.75+)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. 安装 wasm-pack
cargo install wasm-pack

# 3. 安装 Node.js (18+)
# 下载: https://nodejs.org/

# 4. 安装项目依赖
pnpm install
```

### 开发命令

```bash
# 构建所有项目
make build

# 启动开发服务器
make dev

# 运行测试
make test

# 清理构建产物
make clean
```

### 构建流程

```bash
# 1. 构建 WASM
cd wasm && wasm-pack build --target web --out-dir ../web/public/wasm crates/wasm-bindings

# 2. 构建前端
cd web && pnpm run build

# 3. 产物输出到
# - web/dist/
#   ├── index.html
#   ├── assets/
#   └── wasm/
#       ├── analyzer_bg.wasm
#       ├── analyzer.js
#       └── analyzer.d.ts
```

---

## 📊 性能优化

### WASM 性能优势

| 操作 | JS | WASM | 提升 |
|------|----|----|----- |
| 简单累加 | 1ms | 0.8ms | 1.25x |
| MD5 计算 | 100ms | 25ms | 4x |
| 文件压缩 | 500ms | 80ms | 6.25x |

**结论**：Phase 1 的累加计算更多是**架构示范**，为 Phase 2 铺路。

### 优化策略

1. **并行获取文件元数据**
   ```typescript
   const promises = [];
   for await (const entry of dirHandle.values()) {
     if (entry.kind === 'file') {
       promises.push(entry.getFile());
     }
   }
   const files = await Promise.all(promises);
   ```

2. **OPFS 缓存分析结果**
   - 避免重复分析相同文件
   - 同步读写，性能更高

3. **增量加载**
   - 大目录分批加载
   - 虚拟滚动列表

---

## 🧪 测试策略

### 测试层级

```
┌─────────────────────────────────────────┐
│         E2E 测试（Playwright）           │
│  测试完整用户流程                        │
└─────────────────────────────────────────┘
                    ↑
┌─────────────────────────────────────────┐
│      集成测试（Rust ↔ JS Bridge）        │
│    验证 WASM 与 JavaScript 正确交互      │
└─────────────────────────────────────────┘
                    ↑
┌──────────────────┬──────────────────────┐
│   Rust 单元测试   │   前端单元测试        │
│  (Cargo test)    │   (Vitest)          │
└──────────────────┴──────────────────────┘
```

### 测试覆盖率目标

- Rust 核心逻辑: ≥90%
- WASM 绑定层: ≥80%
- 前端业务逻辑: ≥75%
- E2E 关键路径: 100%

---

## 📱 Remote Session (远程控制)

### 架构概览

Remote Session 允许从移动设备远程控制 BFOSA，采用端到端加密确保通信安全。

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│     Host        │         │   Relay Server  │         │     Remote      │
│  (Desktop Web)  │         │   (Node.js)     │         │  (Mobile Web)   │
├─────────────────┤         ├─────────────────┤         ├─────────────────┤
│ • Vite Dev      │◄───────►│ • Socket.IO     │◄───────►│ • Socket.IO     │
│ • React + TS    │  WebSocket│ • Express      │  WebSocket│ • React + TS    │
│ • E2EEncryption │         │ • Room Mgmt     │         │ • E2EEncryption │
└─────────────────┘         └─────────────────┘         └─────────────────┘
       :3000                       :3001                       :3002
```

### 组件说明

| 组件 | 目录 | 端口 | 说明 |
|------|------|------|------|
| Host | `web/` | 3000 | 主应用，可创建远程会话 |
| Relay | `relay-server/` | 3001 | WebSocket 消息中继服务器 |
| Remote | `mobile-web/` | 3002 | 移动端控制界面 |

### E2E 加密

使用共享包 `@browser-fs-analyzer/encryption` 实现：

- **密钥交换**: ECDH P-256
- **加密算法**: AES-GCM 256-bit
- **密钥派生**: HKDF

**详细文档**: [Remote Session Architecture](../remote-session-architecture.md)

### 快速启动

```bash
# 方式 1: 使用 Make
make dev-all

# 方式 2: 手动启动
cd web && pnpm run dev
cd relay-server && PORT=3001 pnpm run dev
cd mobile-web && pnpm run dev --port 3002
```

---

## 🎯 Phase 2: 插件系统 ✅

### 动态插件系统（已完成）

**已实现**：
- ✅ 插件 API (`crates/plugin-api`)
- ✅ 插件 SDK (`crates/plugin-sdk`)
- ✅ 示例插件：MD5 计算、行数统计、HTML 演示
- ✅ 插件管理 UI（上传、启用、禁用）
- ✅ 并行执行多插件

**文档**：[插件系统架构](../plugin-system-architecture.md) | [插件开发指南](../../plugins/README.md)

### 计划中的功能

**方向 B: 安全内容预览**
- 使用 `sandbox` iframe 预览 HTML/MD 文件
- 通过 CSP 限制脚本执行

**方向 C: 批量文件处理器**
- 批量重命名、添加版权头
- 使用 `createWritable()` 获取写流

---

## 📚 参考资料

### 外部资源
- [File System Access API - Chrome Developers](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [OPFS - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [wasm-bindgen - GitHub](https://github.com/rustwasm/wasm-bindgen)
- [Zustand - GitHub](https://github.com/pmndrs/zustand)
- [shadcn/ui - Official Site](https://ui.shadcn.com/)

### 项目内部文档
- [OPFS 使用场景指南](./opfs-guide.md) - OPFS 技术应用场景和实现建议
- [插件系统架构](../plugin-system-architecture.md) - 动态插件系统设计
- [远程会话架构](../remote-session-architecture.md) - 移动端远程控制设计

---

## 📄 License

MIT License - 详见 [LICENSE](../../LICENSE)
