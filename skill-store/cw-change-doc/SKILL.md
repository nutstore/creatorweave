---
name: cw-change-doc
description: Generate a visual, diagram-rich change documentation (直接在对话中输出 Markdown，不写入文件) for uncommitted code on the current branch or a given diff/change set. Use when users ask to explain code changes, document what changed, visualize a diff, summarize a branch's modifications, generate a change report, produce handover/release notes, or understand the impact of a refactor/feature. Produces Mermaid impact graphs, sequence diagrams, flowcharts, and before/after comparisons anchored to real files, functions, and call paths.
version: "1.0.0"
category: coding
tags: [code-change, documentation, mermaid, diff, visual, impact-analysis, handover]
triggers:
  keywords: [代码改动说明, 改动文档, 可视化改动, 改动说明, change doc, change documentation, 代码变更说明, 分支改动, 总结改动, 改动总结, diff说明, 生成改动文档, release notes, 交接文档]
---

# Change Doc Visualizer

Generate a rigorous, visual change documentation that explains **what changed, why, and what the impact is** — not a summary of file contents. Every claim must be anchored to real files, functions, and call paths. Every diagram must use real symbol names.

## When to use

- "帮我生成代码改动说明 / 改动文档"
- "总结一下这个分支的改动"
- "可视化一下这些变更"
- "生成一份交接/发布说明"
- "这些改动做了什么，影响是什么"

## Operating principles

- **Explain behavior change, not mechanics.** Formatting and pure refactors are not the core story. Focus on what behaves differently before vs. after.
- **Anchor every claim to real code.** Use concrete file paths, class/function names, and call relationships. Do not speculate about call paths you cannot verify — mark them "待确认".
- **Read the actual diff before writing.** Do not invent the change set. Gather it from git diff / working tree / the files the user points at.
- **Diagrams are the backbone.** All diagrams use Mermaid, with real symbol names. One diagram = one main question. Keep each diagram ≤ ~12 nodes; split if it grows.
- **Don't draw the whole project.** Only modules touched by this change (and their direct dependencies/callers) belong in the diagrams.
- **Don't fabricate.** If a line number or call path can't be confirmed, omit it or mark "待确认".

## Workflow

### 1. Gather the change set

Determine what "the change" is:

- Uncommitted working-tree changes (default): `git diff` / working-tree status / `git_diff`.
- A specific diff, branch, PR, snapshot, or the files the user names.

Read enough of each changed file (not just the diff hunk) to understand the function's role and its callers/callees. You cannot write an accurate impact graph or sequence diagram without knowing the surrounding context.

### 2. Output directly in the conversation

**直接在对话回复中输出完整的 Markdown 文档，不要调用 `write()` 写入文件。** 用户可以在对话中直接阅读、复制或继续讨论。

Follow the template below. Adapt sections to the change — drop a section only if it genuinely does not apply (state why), never silently.

---

## Document template

### 1. 改动目标

- 本次修改要解决什么问题；
- 修改前的系统行为；
- 修改后的系统行为；
- 用户或调用方能够观察到什么变化。

### 2. 改动范围

列出所有修改文件，并使用表格说明：

| 文件 | 修改类型 | 文件职责 | 本次修改内容 | 是否改变运行行为 |
| -- | ---- | ---- | ------ | -------- |

修改类型使用：新增 / 修改 / 删除 / 重命名 / 仅重构 / 测试 / 配置。

### 3. 改动影响图

使用 Mermaid `flowchart` 生成模块影响图。

- 每个节点必须包含模块名和文件名；
- 标记 `[新增]`、`[修改]`、`[删除]`、`[复用]`；
- 箭头表示依赖或者调用方向；
- 测试代码使用虚线连接到被验证模块；
- 不要展示与本次修改无关的模块；
- 如果节点超过 12 个，拆分为多张图。

### 4. 核心调用时序图

使用 Mermaid `sequenceDiagram`，从真实入口开始展示完整执行顺序。必须包含：

- 用户操作、API、消息或定时任务入口；
- Controller、Handler 或入口函数；
- Service 或核心业务函数；
- Repository、数据库、缓存；
- 外部 API、消息队列或事件系统；
- 关键参数；
- 关键返回值；
- 异常和失败返回；
- 数据库写入和副作用。

每个参与者格式：`模块名：函数名()`（如 `OrderService：cancel()`）。

使用 `alt`、`else`、`opt` 展示主要条件分支。如果存在多个互不相关的入口，分别生成时序图。

### 5. 关键函数流程图

为本次修改中最重要的 1～3 个函数生成 Mermaid `flowchart`。

- 从函数入口开始；
- 展示所有关键条件判断、提前返回、异常抛出、循环、数据库写入、外部调用、最终返回值；
- 每个判断节点说明判断条件；
- 每条分支线标明"是""否"或具体条件。

### 6. 修改前后流程对比

分别生成：(1) 修改前的主要执行流程；(2) 修改后的主要执行流程。使用 `[新增]`、`[修改]`、`[删除]` 标出行为变化。

随后说明：

- 新增了哪些步骤；
- 删除了哪些步骤；
- 哪些步骤顺序发生变化；
- 哪些步骤产生了新的副作用；
- 哪些旧调用方可能受到影响。

### 7. 数据流说明

说明核心数据如何变化：

| 阶段 | 所在函数 | 输入数据 | 数据变化 | 输出数据 |
| -- | ---- | ---- | ---- | ---- |

至少覆盖：入口参数；参数校验后的数据；业务层使用的数据；数据库存储的数据；返回给调用方的数据。

对于重要对象，给出简化后的数据示例，但不要复制无关字段。

### 8. 代码与图的对应关系

为时序图和流程图中的每个主要节点建立映射表：

| 图中节点 | 文件 | 类或函数 | 本次是否修改 | 作用 |
| ---- | -- | ---- | ------ | -- |

引用具体文件路径和函数名。如果能确定代码行号可以添加；不能确定不要编造。

### 9. 关键设计决策

说明：

- 为什么使用当前实现；
- 为什么在这个模块修改；
- 是否考虑过其他方案；
- 当前方案依赖哪些前置条件；
- 当前实现有哪些隐含假设；
- 当前实现有哪些限制。

### 10. 风险和边界条件

列出：可能影响的旧功能；空值和非法输入；重复请求；并发调用；事务失败；数据库更新成功但事件发送失败；外部接口超时；兼容性问题；性能变化；尚未处理的情况。

仅列出与本次改动实际相关的内容，不要机械地罗列通用风险。

### 11. 测试覆盖图

使用 Mermaid `flowchart` 表示测试与代码分支之间的对应关系（测试用例 → 被测函数 → 被覆盖分支 → 未覆盖分支）。

| 代码分支 | 对应测试 | 是否覆盖 | 验证内容 |
| ---- | ---- | ---- | ---- |

没有测试覆盖的分支必须明确标记为"未覆盖"。

### 12. 推荐阅读顺序

根据本次代码改动，给出具体阅读顺序（例如：入口函数 → 核心业务函数 → 数据访问层 → 异常定义 → 测试）。每一步列出具体文件和函数，并说明为什么先看这里。

---

## 输出要求

- **直接在对话中输出，不要调用 `write()` 或任何工具写入文件。** 完整文档作为一个 Markdown 回复发出；
- 所有图使用 Mermaid；图中节点必须尽量使用真实函数名和文件名；
- 不要把整个项目都画进去；每张图只表达一个主要问题；单张图尽量不超过 12 个节点；
- 复杂流程拆成"主流程"和"异常流程"；
- 图表后必须有简短文字说明；
- 不确定的调用关系必须标记为"待确认"，不要推测；
- 重点解释行为变化，不要把格式化和机械重构当成核心改动。
