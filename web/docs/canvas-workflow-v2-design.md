# 可视化 AI 工作流白板 — 从零实现方案

> 状态: **方案设计** · 日期: 2026-08-04
> 灵感来源: Obsidian Lumen 白板工作流
> 前置: 旧 workflow 系统已彻底删除（34 文件 + ~500 行摘除 + DB v13 DROP 迁移）

---

## 0. 一句话定位

**用户在对话里说"搭建一个 XX 工作流"，AI 自动在白板上画出节点和连线；用户拖拽微调、点运行看数据流动；满意后保存为可复用、可定时执行的流程模板。**

---

## 1. 核心设计决策（5 项）

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| **D1** | 白板存哪里？ | **`.flow` 格式文件 + FormatRegistry** | 复用现有文件预览体系，白板就是 workspace 里的一种文件，天然支持编辑/预览/同步 |
| **D2** | 数据模型 | **纯工具调用数据流**（非 LLM 角色流水线） | 节点=工具/LLM 调用，连线=数据管道，Lumen 式 |
| **D3** | 执行引擎 | **新建轻量 DAG 遍历器** | 旧引擎已删；新引擎专为工具数据流设计，~150 行 |
| **D4** | 对话驱动 | **复用 AgentLoop + 新增 `canvas` 工具** | AI 通过工具调用读写 `.flow` 文件，和编辑代码/文档一样自然 |
| **D5** | 定时执行 | **复用 Schedule 体系** | Schedule prompt 引用 `.flow` 文件路径即可 |

### D1 详解：`.flow` 文件 + FormatRegistry

这是最关键的架构选择。白板不做成独立页面/路由，而是做成 workspace 里的一种**文件格式**：

```
我的工作流/
  ├── 每日总结.flow      ← 双击在 FilePreview 里打开可视化编辑器
  ├── 周报复盘.flow
  └── 内容润色.flow
```

**好处**：
- 白板文件参与 workspace 同步（OPFS + native FS 双写）
- FilePreview 自动识别 `.flow` 扩展名并渲染编辑器（复用 `FormatRegistry`）
- agent 的 `read`/`write`/`edit` 工具天然能操作 `.flow` 文件
- 用户可以像管理笔记一样管理工作流

**FormatRegistry 注册**（参照 `.nol` 的 `ui.ts`）：
```ts
// formats/flow/ui.ts
registerFormatUI({
  extension: 'flow',
  viewModes: [
    { id: 'editor', label: '编辑', default: true },
    { id: 'text', label: 'JSON' },
  ],
  PreviewComponent: lazy(() => import('./FlowEditor')),
  renderTextContent: async (data) => new TextDecoder().decode(data),
})
```

### D2 详解：数据模型

```ts
// ── 节点 ──
type NodeKind = 'input' | 'tool' | 'llm' | 'review' | 'output'

interface FlowNode {
  id: string
  kind: NodeKind
  label: string                    // 显示名
  // 工具/LLM 节点配置
  toolName?: string                // 'read' | 'web_search' | 'python' | ...（tool 节点）
  args?: Record<string, unknown>   // 参数，支持 {{var}} 模板
  prompt?: string                  // llm 节点的提示词
  // 输入节点配置
  inputType?: 'file' | 'text' | 'today'  // 输入来源
  inputPath?: string               // 文件路径（支持 {{date}}）
  inputValue?: string              // 手动文本
  // 输出节点配置
  outputPath?: string              // 写入路径（支持 {{date}}）
  // 评审节点配置
  criteria?: string                // 验收标准
  // 通用
  position: { x: number; y: number }  // 画布坐标
  retry?: number                   // 重试次数
}

// ── 边（连线 = 数据流）──
interface FlowEdge {
  from: string                     // 源节点 id
  to: string                       // 目标节点 id
  varName?: string                 // 变量名（默认用源节点 id）
  isLoop?: boolean                 // 是否为回连（Review 重做）
}

// ── .flow 文件格式（纯 JSON）──
interface FlowFile {
  version: 1
  name: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}
```

### D3 详解：执行引擎

新建 `agent/flow/engine.ts`（~150 行），专为工具数据流设计：

```ts
async function runFlow(flow: FlowFile, context: {
  workspaceId: string
  directoryHandle: FileSystemDirectoryHandle | null
  initialInputs?: Record<string, unknown>
  onNodeStart?: (id: string) => void
  onNodeComplete?: (id: string, output: unknown) => void
  onNodeError?: (id: string, error: string) => void
}): Promise<FlowRunResult>
```

核心循环（伪代码）：
```
1. 拓扑排序 nodes
2. 对每个 node 按顺序执行：
   a. 解析 {{var}} 模板：用上游节点的输出替换变量
   b. 根据 kind 执行：
      - input(file) → 读 workspace 文件
      - input(text) → 返回静态文本
      - tool → ToolRegistry.execute(toolName, resolvedArgs, ctx)
      - llm → stream(model, prompt + 上游数据)
      - review → LLM 打分，<80 分则回连重做
      - output(file) → 写 workspace 文件
   c. 存输出到 NodeOutputStore
   d. 回调 onNodeStart/onNodeComplete
3. Review 失败时：找到 isLoop 边，回到上游节点重跑
```

### D4 详解：对话驱动（杀手锏）

新增 `canvas` 工具族，让 AI 能操作 `.flow` 文件：

```ts
// canvas.tool.ts
1. create_workflow(name) → 创建空白 .flow 文件
2. add_node(filePath, kind, config) → 加节点
3. connect_nodes(filePath, fromId, toId) → 连线
4. remove_node(filePath, nodeId) → 删节点
5. update_node(filePath, nodeId, patch) → 改配置
6. run_workflow(filePath) → 运行（走 runFlow 引擎）
```

**用户体验**：
> 用户：「搭建一个每日总结工作流：读今天的日记，提取3个要点控制在200字内，检查通过后保存」
>
> AI：
> 1. `create_workflow("每日总结")`
> 2. `add_node("每日总结.flow", "input", {type:"today"})` → n1
> 3. `add_node("每日总结.flow", "llm", {prompt:"提取3个要点..."})` → n2
> 4. `add_node("每日总结.flow", "review", {criteria:"不超过200字"})` → n3
> 5. `add_node("每日总结.flow", "output", {path:"总结/{{date}}.md"})` → n4
> 6. `connect_nodes(..., "n1","n2")` → `connect_nodes(..., "n2","n3")` → `connect_nodes(..., "n3","n4")`
> 7. `connect_nodes(..., "n3","n2", {isLoop:true})` ← 回连重做
> 8. 白板自动打开，节点和连线全部就位

---

## 2. 文件结构

```
web/src/
├── agent/
│   ├── flow/                          # 新建：流程引擎 + 类型
│   │   ├── types.ts                   # FlowFile / FlowNode / FlowEdge
│   │   ├── engine.ts                  # DAG 遍历 + 工具执行（~150 行）
│   │   ├── template-resolver.ts       # {{var}} 变量解析
│   │   └── __tests__/
│   │       └── engine.test.ts
│   └── tools/
│       └── formats/flow/              # 新建：FormatRegistry 注册
│           ├── ui.ts                  # registerFormatUI（参照 nol/ui.ts）
│           └── handler.ts             # FormatHandler（read/write JSON）
├── components/
│   └── flow-editor/                   # 新建：React Flow UI
│       ├── FlowEditor.tsx             # 主容器（FormatPreviewProps 接口）
│       ├── FlowCanvas.tsx             # xyflow 画布
│       ├── FlowNodeCard.tsx           # 自定义节点卡片
│       ├── FlowEdgeCustom.tsx         # 自定义连线（含 loop 标签）
│       ├── NodePropertiesPanel.tsx    # 右侧属性面板
│       ├── ToolArgForm.tsx            # JSONSchema → 参数表单
│       ├── RunProgress.tsx            # 运行进度叠层
│       └── constants.ts               # 节点类型配色/图标
├── agent/tools/
│   └── canvas.tool.ts                 # 新建：对话驱动工具族
└── i18n/locales/                      # 新增 flowEditor.* 翻译 key
```

---

## 3. 分阶段实施计划

### Phase 1：地基（2 天）

**目标**：`.flow` 文件能创建、打开、显示空白画布。

| 任务 | 文件 | 说明 |
|---|---|---|
| 类型定义 | `agent/flow/types.ts` | FlowFile / FlowNode / FlowEdge |
| FormatHandler | `agent/tools/formats/flow/handler.ts` | read/write JSON |
| FormatUI | `agent/tools/formats/flow/ui.ts` | 注册扩展名 + viewModes |
| 注册 import | `agent/tools/formats/index.ts` | 确保 `import './flow/ui'` |
| i18n key | `i18n/locales/*.json` | flowEditor 命名空间 |

**验收**：在 workspace 里手动创建一个 `.flow` 文件，FilePreview 能识别并显示编辑器框架。

### Phase 2：可视化编辑器（3 天）

**目标**：用户能拖拽节点、连线、编辑属性。

| 任务 | 文件 | 说明 |
|---|---|---|
| 画布容器 | `FlowCanvas.tsx` | ReactFlow + Background/Controls/MiniMap |
| 节点卡片 | `FlowNodeCard.tsx` | 5 种 kind 的图标/配色/Handle |
| 连线 | `FlowEdgeCustom.tsx` | 贝塞尔曲线 + loop 红色虚线 + 动画 |
| 属性面板 | `NodePropertiesPanel.tsx` | 选中节点后显示配置表单 |
| 工具参数表单 | `ToolArgForm.tsx` | 从 ToolRegistry 读 JSONSchema 自动生成 |
| 数据转换 | `flow ↔ xyflow` 双向 | FlowFile ↔ ReactFlow nodes/edges |
| 保存 | FlowEditor.tsx | Ctrl+S 或 debounce 自动保存到 `.flow` 文件 |

**验收**：手动添加 input→llm→output 节点，连线，编辑参数，保存后重新打开数据还在。

### Phase 3：执行引擎 + 运行（3 天）

**目标**：点运行按钮，节点逐个执行，数据沿连线流动。

| 任务 | 文件 | 说明 |
|---|---|---|
| 引擎核心 | `agent/flow/engine.ts` | 拓扑排序 + 按序执行 + NodeOutputStore |
| 模板解析 | `template-resolver.ts` | `{{date}}`/`{{today}}`/`{{nodeId}}` 替换 |
| 工具执行 | engine.ts | 接入 `ToolRegistry.execute` |
| Review 循环 | engine.ts | 打分 + 回连重做 |
| 运行 UI | `RunProgress.tsx` | 节点高亮 + 连线流动 + 日志 |

**验收**：input(读文件) → llm(总结) → output(写文件) 全流程跑通，产出文件正确。

### Phase 4：对话驱动（2 天）

**目标**：用户聊天生成工作流。

| 任务 | 文件 | 说明 |
|---|---|---|
| canvas 工具族 | `canvas.tool.ts` | 6 个工具 + tool description |
| 工具注册 | `tool-registry.ts` | 注册 canvas 工具 |
| 自动打开 | FlowEditor 通信 | 工具操作后白板实时更新 |

**验收**：对话里说"搭建每日总结流程"，AI 自动创建节点连线，白板实时显示。

### Phase 5：定时执行（1 天）

**目标**：白板能定时跑。

| 任务 | 文件 | 说明 |
|---|---|---|
| Schedule 集成 | `schedule-runner.ts` | prompt 含 `.flow` 路径时走 runFlow |
| UI | ScheduleDrawer | 可选择引用 .flow 文件 |

**验收**：设置每天 9 点跑"每日总结.flow"，自动执行并产出。

---

## 4. 技术约束 & 注意事项

### 必须遵守的现有约定
- **配色**：只用 dist 已有的 Tailwind 色阶（`primary`/`neutral`/`success`/`warning`/`danger`/`gray`），不要用 `brand-muted` 等 dist 未构建的 key（MEMORY 有记录）
- **动画**：优先 `framer-motion`（已装 `^12.40.0`），不用手写 CSS keyframes
- **UI 组件**：从 `@creatorweave/ui` 取 shadcn 组件（Button/Dialog/Select/Input/Textarea/Popover 等）
- **状态管理**：Zustand（如需要独立 store）或 React Flow 内置状态（推荐，减少 store 膨胀）
- **路径**：所有工具调用路径含 rootName 前缀

### 设计约束（来自 Lumen 研究的教训）
- **编排与排程分离**：`.flow` 文件只定义"做什么"，Schedule 定义"何时跑"
- **不做重型框架**：节点就 5 种，连线就是数据流，不搞复杂条件分支/并行/子流程
- **工具节点优先**：input/output/llm 是基础设施，tool 节点才是日常工作自动化的核心

### 与旧系统的区别（避免重蹈覆辙）
| 旧系统 | 新系统 |
|---|---|
| LLM 角色流水线（plan/produce/review） | 工具调用数据流（read/web_search/python） |
| 存 SQLite（custom_workflows 表） | 存 `.flow` 文件（参与 workspace 同步） |
| 专用 Dialog 入口 | FormatRegistry 文件类型（双击即开） |
| `run_workflow` 单一工具 | `canvas` 工具族（6 个细粒度工具） |
| dry-run + real-run 两套路径 | 统一 runFlow（无 dry-run 概念） |

---

## 5. 工作量评估

| Phase | 内容 | 估算 |
|---|---|---|
| 1 | 地基（类型 + FormatRegistry） | 2 天 |
| 2 | 可视化编辑器 | 3 天 |
| 3 | 执行引擎 + 运行 | 3 天 |
| 4 | 对话驱动 | 2 天 |
| 5 | 定时执行 | 1 天 |
| **合计** | | **~11 天** |

---

## 6. 待确认的设计细节

1. **节点自动布局**：对话生成时用简单分层算法（拓扑排序 + 按层级排列），还是让 AI 在 `add_node` 时指定坐标？
   - 建议：引擎自动布局（参考旧 `workflow-to-flow.ts` 的 `computeLayers` 算法），AI 不需要管坐标

2. **运行结果展示**：在白板内显示每个节点的输出摘要（节点下方展开），还是在对话里生成运行日志？
   - 建议：两者都做——白板内节点状态高亮 + 运行日志浮窗

3. **.flow 文件 vs 数据库**：是否需要额外的 SQLite 表存运行历史/定时任务关联？
   - 建议：Phase 1-4 纯文件存储，Phase 5 视需要再加

4. **多模型路由**：是否支持每个节点指定不同模型（Lumen 特色）？
   - 建议：Phase 2 在 llm 节点配置里加 `modelConfig`，但执行引擎 Phase 3 再接入
