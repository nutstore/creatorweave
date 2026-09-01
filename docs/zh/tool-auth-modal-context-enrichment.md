# 开发文档：授权弹窗结构化信息增强（工具参数 + 文件清单 + 点击查看 Diff）

## 1. 背景与问题

授权弹窗（`ToolAuthModal`）是所有 prompt 级工具授权的唯一确认入口。当前弹窗信息不足：

| 问题 | 根因位置 | 说明 |
|---|---|---|
| 只显示工具名，不显示工具参数 | `web/agent/policy-engine.ts` `authorize()` | `args` 被 `policy.describe(args)` 压扁成一句 i18n 文案后即丢弃，原始参数从未传到 store/modal |
| sync-to-disk 只显示数量，不显示文件清单 | `web/agent/tools/sync-to-disk.tool.ts` | 授权时只传 `{ count: eligibleCount, deletes: deletionPaths }`，路径数据在 tool 层拿得到（`runtime.getPendingChanges()` 返回完整 `PendingChange[]`）但统计完数量就丢弃 |
| call_tool（WebMCP/MCP）不显示调用参数 | `web/agent/external-tool-bridge.ts` | `authorize({ args: { full_tool_name, untrusted } })`，实际 `toolArgs` 未传入授权流程 |

## 2. 现状数据流（重构后）

```
工具执行器
  → authorize({ toolName, args, ... })          // policy-engine.ts
      policy.describe(args) → i18n 文案         // args 在此被消费丢弃 ❌
  → useToolAuthStore.request({ toolName, description, detail? })
  → ToolAuthModal                               // 只拿到文案 ❌
```

关键类型（`web/store/tool-auth.store.ts`）：

- `PendingToolAuth`：`{ id, toolName, description, detail?, memoryKey, conversationId, resolve, ... }`
- `ToolAuthRequestInput`：`{ toolName, description, detail?, memoryKey?, conversationId?, signal? }`
- 无任何结构化 payload 字段。

## 3. 可复用的既有能力

- `web/components/sync/FileDiffViewer.tsx`：接受 `fileChange: FileChange`，内部自行读取 OPFS/disk 内容做 Monaco diff 渲染。**独立组件，不依赖父级 store**（评论功能可选）。
- `web/components/sync/PendingFileList.tsx`：完整文件清单组件（props 见下），但耦合 `ChangeDetectionResult`、快照分组、勾选/同步/清除等操作 —— **对弹窗而言过重，不复用，改为新写轻量清单**。
- 数据源：`runtime.getPendingChanges(): PendingChange[]`（`web/opfs/workspace/workspace-runtime.ts:1403`），含 `path / type / snapshotStatus` 等；`FileDiffViewer` 只需 `FileChange` 形状（`path + type` 等），`PendingChange` 结构兼容（见 §5.4 适配说明）。

## 4. 方案总览

在授权请求通道上新增**可选的结构化 payload 字段**（不破坏现有调用方），由各工具在发起授权时填充，弹窗负责渲染：

```
AuthorizeRequest 增加字段
  toolArgs?: unknown                     // 原始工具参数（call_tool 等通用展示）
  fileChanges?: FileChange[]             // 涉及的文件清单（sync-to-disk）

authorize() 透传 → ToolAuthRequestInput / PendingToolAuth
  → ToolAuthModal 渲染：
     ① 工具参数区：格式化 JSON 展示（可折叠）
     ② 文件清单区：列表（类型图标 + 路径），点击行 → 展开 FileDiffViewer 查看 diff
```

原则：

- **纯增量**：现有 `description/detail/memoryKey` 语义不变；未携带结构化字段的工具，弹窗表现与现状完全一致。
- **性能**：`FileDiffViewer` 懒加载（组件本身已 React.lazy Monaco）；弹窗内选中文件才渲染 diff，未选中只显示清单。
- **安全**：参数展示前做 JSON 序列化截断（防止超大 payload 卡弹窗）；不做任何用户输入交互，仅展示。

## 5. 实施步骤

### 5.1 store 层：`web/store/tool-auth.store.ts`

`PendingToolAuth` 与 `ToolAuthRequestInput` 各新增两个可选字段：

```ts
/** Raw tool arguments for display in the modal (pretty-printed JSON). */
toolArgs?: unknown
/** Structured file-change list for sync-like tools (clickable → diff). */
fileChanges?: FileChange[]
```

`request()` 中透传到 `PendingToolAuth`。需 `import type { FileChange } from '@/opfs/types/opfs-types'`。

### 5.2 policy-engine：`web/agent/policy-engine.ts`

- `AuthorizeRequest` 新增 `toolArgs?: unknown` 与 `fileChanges?: FileChange[]`。
- `authorize()` 第 5 步调用 `useToolAuthStore.request()` 时透传这两个字段。
- **注意**：当命中 session-memory / yolo / auto 短路时不会有弹窗，字段自然不消费 —— 无需改动短路逻辑。
- 现有 `describe()` 文案保留（弹窗顶部仍显示一句话描述，结构化信息是补充）。

### 5.3 sync-to-disk：`web/agent/tools/sync-to-disk.tool.ts`

在 `authorize()` 调用处新增 `fileChanges`：把已计算的 eligible（create/modify）+ deletion 的 `PendingChange[]` 映射为 `FileChange[]`（`type: 'create'→'add'`，其余透传 `path/type`）一起传入。现有 `args: { count, deletes }` 保留（describe 文案与 memoryKey 判定依赖它）。

### 5.4 call_tool：`web/agent/external-tool-bridge.ts`

`authorize()` 调用处新增 `toolArgs`（即实际调用参数对象）。现有 `args: { full_tool_name, untrusted }` 保留。

### 5.5 弹窗 UI：`web/components/agent/ToolAuthModal.tsx`

body 区在 description/detail 之后追加两个展示区块：

**① 参数区**（`pending.toolArgs` 存在时）：

- 新子组件 `ArgsBlock`：`JSON.stringify(args, null, 2)`，超长（>2000 字符）截断加 `…`；样式复用 exec detail 的代码块样式；默认折叠为「查看调用参数」toggle，点击展开（`max-h-48 overflow-auto`）。

**② 文件清单区**（`pending.fileChanges` 存在时）：

- 新子组件 `FileChangeList`：轻量列表（≤ 50 条，超出显示 `+N more`），每行 = 类型徽标（add 绿 / modify 黄 / delete 红）+ 等宽路径。
- 点击行 → `selectedPath` state，行下方懒渲染 `FileDiffViewer`（一次只展开一个文件）。`FileChange.type` 取值差异适配：`PendingChange` 为 `create/modify/delete`，`FileChange` 为 `add/modify/delete` —— 在构造 `fileChanges` 时（5.3）即完成映射，弹窗内只处理 `FileChange`。
- 现有 `isExecLike`（exec detail）逻辑不变；执行命令类授权仍走 `detail` 块。

### 5.6 i18n：`packages/i18n/src/locales/*/agent.ts`

`agent.toolAuth` 下新增（4 个语言文件 en-US / zh-CN / ja-JP / ko-KR 同步）：

- `viewArgs` / `hideArgs`（查看调用参数 / 收起）
- `fileChangesTitle`（涉及 N 个文件变更）
- `moreFiles`（+{count} more）

## 6. 测试

- `web/agent/__tests__/policy-engine.test.ts`：补充断言 —— `authorize()` prompt 路径把 `toolArgs` / `fileChanges` 透传到 `useToolAuthStore.request`；短路路径（auto/yolo/memory）不调用 request。
- `web/agent/tools/__tests__/sync-to-disk.tool.test.ts`：授权请求中 `fileChanges` 包含 create/modify/delete 完整清单且 type 已映射。
- `ToolAuthModal` 如无现成组件测试则不新增（现有测试基建为准），以手测为主。

## 7. 影响面与风险

- 纯增量改动，所有现有调用方（exec、page-write、snapshot_restore）行为不变。
- 弹窗最大高度已有 `max-h-[85vh]` + body 独立滚动，新增区块不会破坏按钮可达性。
- `FileDiffViewer` 依赖运行时 workspace 读取文件；若 pending change 对应文件内容已被清理，其内部已有 error/loading 态处理，可接受。
