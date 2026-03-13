# CreatorWeave 架构总览

> 本文档基于当前仓库代码（`master`）整理，目标是给开发者一个可执行的系统地图：模块边界、关键数据流、启动路径、以及排障入口。

## 1. 系统拓扑

仓库是一个 `pnpm workspace` 单体仓（monorepo），核心运行单元如下：

1. `web/`：桌面端主应用（React + Vite + Zustand + SQLite WASM + OPFS）。
2. `mobile-web/`：移动端遥控页面（加入/控制远程会话）。
3. `relay-server/`：中继服务器（Express + Socket.IO），负责会话转发与会话同步 API。
4. `packages/*`：共享能力包（`ui`、`conversation`、`encryption`、`i18n`、`config`）。
5. `wasm/`：Rust/WASM 模块（由 `web` 构建流程调用）。

## 2. 前端主应用（web）分层

`web/src` 的核心分层可以按“UI -> Store -> 服务/运行时 -> 持久化/外部协议”理解：

1. UI 层：`components/`、`hooks/`、`styles/`。
2. 状态层：`store/`（Zustand），包含会话、工作区、设置、远程状态等。
3. 运行时层：
   `agent/`：AgentLoop、上下文管理、工具系统、LLM provider。
   `mcp/`：MCP manager、tool bridge、elicitation 处理。
   `python/`：Pyodide 执行桥接。
   `services/`：插件加载/执行/监控、文件发现、流式读取等。
4. 数据层：
   `sqlite/`：SQLite WASM worker + repository。
   `opfs/`：OPFS 会话/撤销/缓存能力。
   `storage/`：应用启动时的存储初始化与降级策略。
5. 并行层：`workers/`（文件发现、插件 host、diff 等高负载任务）。

## 3. 启动流程（桌面端）

入口：`web/src/main.tsx` -> `web/src/App.tsx`

初始化顺序（关键路径）：

1. `initStorage()` 初始化 SQLite（优先 OPFS，失败可回退）。
2. `setupAutoSave()` 注册存储收尾逻辑。
3. `workspace.store.initialize()` 加载工作区上下文。
4. `remote.store.attemptReconnect()` 尝试恢复远程会话。
5. `settings.store.checkHasApiKey()` 预热 API key 状态。
6. 首次用户交互后触发：
   申请 Persistent Storage。
   如存在待恢复目录句柄，触发权限恢复。

异常处理：

1. `DATABASE_INACCESSIBLE` 会触发专门刷新对话框。
2. 存储初始化错误在 UI 层给出“可重置数据库”路径。

## 4. Agent 执行路径

主链路在 `conversation.store.sqlite.ts`：

1. 对话消息写入会话 store。
2. 针对每个对话持有独立 `AgentLoop` 实例（而非全局单例）。
3. `AgentLoop` 调用 `ContextManager` + `ToolRegistry` + LLM Provider。
4. 工具调用事件通过 `streaming-bus` 推送到 UI（thinking/tool/status）。
5. 对话结果持久化到 SQLite；运行态字段（流式中间态）不持久化。

关键事实：

1. 对话持久化与运行态是分离设计。
2. 支持 thread/fork/merge 等线程化会话操作。
3. MCP elicitation（例如 binary upload）由 `mcp/elicitation-handler.tsx` 注入处理。

## 5. MCP、插件、Python 三条扩展链路

### 5.1 MCP

1. `MCPManager` 负责服务配置 CRUD、连接生命周期与工具发现缓存。
2. `MCPClientService` 负责协议通信（含 task 轮询逻辑）。
3. `mcp-tool-bridge` 将 MCP 工具注册到 Agent ToolRegistry。
4. `mcp-injection` 生成系统提示中的可用 MCP 服务块。

### 5.2 插件系统

1. `PluginLoaderService` 在 Worker 中加载插件并建立实例。
2. `PluginExecutorService` 负责并行执行与进度回调。
3. `PluginResultAggregator` 聚合多插件结果。
4. `PluginMonitorService` 做资源监控和违规记录。
5. `PluginStreamService` 面向大文件分块处理。
6. UI 渲染由 `PluginResultRenderer` 与 CreatorWeave Plugin API（`CreatorWeavePluginAPI`）承接。

### 5.3 Python（Pyodide）

1. `web/src/python/*` 提供浏览器内 Python 执行入口。
2. 构建阶段 `web` 会将 pyodide 资源复制到产物目录。
3. Agent 工具可通过桥接调用 Python 计算与文件处理能力。

## 6. 远程会话（Desktop <-> Relay <-> Mobile）

1. 桌面端通过 `RemoteSession` 创建/恢复会话。
2. 双端使用 `@creatorweave/encryption` 做密钥交换与消息加密封装。
3. `relay-server` 仅转发和会话管理，不承载业务解密。
4. `relay-server` 暴露：
   `GET /health` 健康检查。
   `/api/*` 会话同步接口。
   `GET /join/:sessionId` 跳转到移动端页面。

## 7. 数据持久化与回退策略

当前存储模式（`storage/init.ts`）：

1. `sqlite-opfs`：默认目标模式。
2. `indexeddb-fallback`：SQLite 初始化失败时可回退。
3. `sqlite-memory`：保留类型定义，用于受限场景扩展。

持久化对象：

1. 会话、技能、插件、工作区、变更记录等入 SQLite。
2. 目录句柄通过独立 IndexedDB（结构化克隆）保存。
3. 文件系统实体读写走 File System Access API / OPFS。

## 8. 开发与质量门禁

以 `web` 为主的日常质量命令：

```bash
pnpm -C web lint
pnpm -C web typecheck
pnpm -C web test
pnpm -C web test:e2e
```

跨工程常用命令：

```bash
pnpm -C relay-server dev
pnpm -C mobile-web dev -- --port 3002
make lint
make test
```

## 9. 设计约束与建议

1. 新能力优先走 `services/` + `store/`，避免在组件层堆业务逻辑。
2. 涉及跨模块协议（Remote/MCP/Plugin）必须先定义类型，再实现传输。
3. 任何持久化变更优先走 `sqlite/repositories`，不要在 UI 层直接拼 SQL。
4. 对话运行态不入库，防止流式中间态污染历史记录。
5. Worker 边界优先用于高频 CPU 密集任务（diff、遍历、插件执行）。

## 10. 结构演进（已确认方向）

当前建议的下一阶段结构是：

1. `Project`：目录句柄、索引、权限恢复边界。
2. `Workspace`：任务/会话/视图边界（属于某个 Project）。

迁移执行细节见：

- [`docs/design/project-workspace-migration-plan.md`](../design/project-workspace-migration-plan.md)

---

最后更新：2026-02-28
