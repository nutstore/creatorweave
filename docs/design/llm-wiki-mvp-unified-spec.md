# LLM Wiki 统一技术规格（Concept Coverage 版）

> 状态：Draft  
> 日期：2026-04-14  
> 定位：本文件是 LLM Wiki 主规范（覆盖 Karpathy gist 概念）

## 0. 概念导读：这个 Wiki 是什么，怎么工作

这个 LLM Wiki 可以理解为“会自己长大的知识库”。

1. 它不是一次性问答结果，而是持续积累的长期知识资产。
2. 用户负责提供资料、提出问题；LLM 负责整理、归档、链接和更新页面。
3. 每次 ingest 或 query 都会让 Wiki 变得更完整，而不是只在当前对话里生效。
4. 在本项目中，资料主要来自“映射的本地磁盘目录”，而不是聊天窗口粘贴文本。

它的工作方式是一个三层闭环：

1. Raw Sources（原始资料层）：存放文章、论文、笔记，保持不可变，作为事实来源。
2. Wiki（知识页面层）：LLM 把来源整理成实体页、概念页、摘要页等可导航内容。
3. Schema（规则层）：定义页面规范、更新流程、引用格式、lint 规则，约束 LLM 的维护行为。

一个典型流程如下：

1. 你上传一篇资料到 Raw Sources。
2. 系统触发 ingest，LLM 生成摘要并更新相关 Wiki 页面。
3. 系统同步更新 `index.md`（导航）和 `log.md`（时间线记录）。
4. 你发起 query，LLM 先看 index 再读取相关页面，返回带引用答案。
5. 如果答案有价值，可以回填为新页面（query-note），进入长期知识库。
6. 系统定期 lint，发现断链、冲突、陈旧 claim、数据缺口，推动下一轮完善。

一句话总结：  
LLM Wiki 的核心不是“回答一次问题”，而是“把每次交互沉淀成可持续演进的知识系统”。

## 1. 目标与范围

LLM Wiki 是 creatorweave 的第三面板，用于在对话过程中持续沉淀知识。  
本规格目标是覆盖概念闭环，而不再局限于“简化 MVP”。

必须覆盖：

1. 三层架构：Raw Sources -> Wiki -> Schema。
2. 三类核心操作：Ingest / Query / Lint。
3. `index.md` + `log.md` 双文件机制。
4. Compounding knowledge（query 结果可回填 wiki）。
5. Lint 的结构与语义健康检查（不止断链）。

## 2. 设计原则

1. 人类负责来源与问题，LLM 负责维护与簿记。
2. Raw Sources 不可变，Wiki 可演化，Schema 约束演化方式。
3. 小规模 index-first，大规模可切换 search provider。
4. 所有操作可回溯、可恢复、可审阅。

## 3. 存储结构

### 3.1 OPFS 目录

```text
wiki/
├── raw/                          # 原始来源（不可改写）
│   └── {sourceId}.md
├── wiki/
│   ├── entities/
│   ├── concepts/
│   ├── summaries/
│   ├── comparisons/
│   ├── syntheses/
│   └── query-notes/
├── backup/                       # ingest/merge 失败恢复快照
│   └── {timestamp}-{sourceId}.json
├── WIKI_SCHEMA.md                # 规则与流程
├── index.md                      # 分类索引（标题+摘要+元信息）
└── log.md                        # 时间线日志（grep-friendly）
```

### 3.1.1 页面类型示例

下面给出 6 类页面的最小示例（简化）：

1. `entities/`（实体页）
   - 标题：`RAG`
   - 一句话：`一种将外部知识检索结果注入大模型上下文的范式。`
   - 正文片段：`RAG 通常包含检索器、重排器和生成器。`
   - 相关链接：`[[向量检索]]` `[[上下文窗口]]`
   - 来源：`raw/2026-04-10-rag-survey.md`

2. `concepts/`（概念页）
   - 标题：`向量检索`
   - 一句话：`通过向量相似度在语义空间中查找相关片段。`
   - 正文片段：`常见流程是切分、嵌入、索引、召回。`
   - 相关链接：`[[Embedding]]` `[[RAG]]`
   - 来源：`raw/2026-04-08-retrieval-notes.md`

3. `summaries/`（摘要页）
   - 标题：`RAG Survey 2026 - 摘要`
   - 一句话：`总结该综述的核心结论、指标和局限性。`
   - 正文片段：`结论：混合检索在长尾问答上更稳定。`
   - 相关链接：`[[RAG]]` `[[混合检索]]`
   - 来源：`raw/2026-04-10-rag-survey.md`

4. `comparisons/`（对比页）
   - 标题：`RAG vs Long Context`
   - 一句话：`比较两种知识注入路线的成本、延迟和准确率。`
   - 正文片段：`Long Context 简化系统，但 token 成本更高。`
   - 相关链接：`[[RAG]]` `[[长上下文]]`
   - 来源：`raw/2026-04-11-context-strategies.md`

5. `syntheses/`（综合页）
   - 标题：`企业知识问答系统架构建议`
   - 一句话：`整合多篇资料后形成的架构决策建议。`
   - 正文片段：`建议采用“混合检索 + 结果缓存 + 反馈闭环”。`
   - 相关链接：`[[RAG]]` `[[向量检索]]` `[[重排模型]]`
   - 来源：`raw/2026-04-10-rag-survey.md`, `raw/2026-04-12-reranker-report.md`

6. `query-notes/`（问答沉淀页）
   - 标题：`为什么我们当前阶段选 RAG 而不是 Long Context`
   - 一句话：`一次高价值问答的沉淀版本，便于后续复用。`
   - 正文片段：`当前数据规模下，RAG 在成本/可控性上更优。`
   - 相关链接：`[[RAG vs Long Context]]` `[[企业知识问答系统架构建议]]`
   - 来源：本次 query 引用页面集合

### 3.2 SQLite 表

```sql
CREATE TABLE wiki_raw_sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('article','paper','note')),
  path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','processed','failed')),
  ingested_at INTEGER NOT NULL,
  processed_at INTEGER,
  failed_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE wiki_pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN (
    'entity','concept','summary','comparison','synthesis','query-note'
  )),
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  content TEXT NOT NULL,
  outbound_links TEXT NOT NULL DEFAULT '[]',
  inbound_links TEXT NOT NULL DEFAULT '[]',
  sources TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE wiki_claims (
  id TEXT PRIMARY KEY,
  statement TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','contradicted','superseded','uncertain')),
  confidence REAL NOT NULL DEFAULT 0.5,
  page_id TEXT NOT NULL,
  source_ids TEXT NOT NULL DEFAULT '[]',
  superseded_by_claim_id TEXT,
  contradicted_by_claim_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE wiki_log (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (
    'ingest','query','update','create','delete','lint','save-query-note'
  )),
  timestamp INTEGER NOT NULL,
  description TEXT NOT NULL
);

CREATE VIRTUAL TABLE wiki_pages_fts USING fts5(
  title,
  description,
  content,
  content='wiki_pages'
);

CREATE INDEX idx_wiki_raw_sources_status ON wiki_raw_sources(status);
CREATE INDEX idx_wiki_pages_type ON wiki_pages(type);
CREATE INDEX idx_wiki_claims_page_id ON wiki_claims(page_id);
CREATE INDEX idx_wiki_claims_status ON wiki_claims(status);
```

一致性规则：

1. `wiki_pages.content` 与 OPFS 页面正文保持事务一致。
2. `index.md`、`log.md` 为派生视图，可重建，但必须每次操作后增量更新。
3. ingest 失败时必须保留 `backup/` 快照，支持恢复重跑。

## 4. 统一类型定义

```ts
export type RawSourceType = 'article' | 'paper' | 'note'
export type RawSourceStatus = 'pending' | 'processing' | 'processed' | 'failed'

export type WikiPageType =
  | 'entity'
  | 'concept'
  | 'summary'
  | 'comparison'
  | 'synthesis'
  | 'query-note'

export interface RawSource {
  id: string
  title: string
  type: RawSourceType
  path: string
  status: RawSourceStatus
  ingestedAt: number
  processedAt?: number
  failedReason?: string
  retryCount: number
}

export interface WikiPage {
  id: string
  title: string
  type: WikiPageType
  description: string
  tags: string[]
  content: string
  outboundLinks: string[]
  inboundLinks: string[]
  sources: string[]
  createdAt: number
  updatedAt: number
}

export interface Claim {
  id: string
  statement: string
  status: 'active' | 'contradicted' | 'superseded' | 'uncertain'
  confidence: number
  pageId: string
  sourceIds: string[]
  supersededByClaimId?: string
  contradictedByClaimIds: string[]
  createdAt: number
  updatedAt: number
}

export interface LintIssue {
  id: string
  type:
    | 'broken-link'
    | 'orphan-page'
    | 'missing-page'
    | 'missing-crossref'
    | 'claim-contradiction'
    | 'claim-stale'
    | 'data-gap'
  severity: 'info' | 'warning' | 'error'
  pageId?: string
  claimId?: string
  message: string
  suggestedAction?: string
}
```

## 5. Raw Source 状态机

1. `pending -> processing`：触发 ingest。
2. `processing -> processed`：页面更新、claim 更新、index/log 更新完成。
3. `processing -> failed`：任一步失败，记录失败原因并写恢复快照。
4. `failed -> processing`：重试 ingest。
5. `processed -> processing`：允许增量重摄入。

约束：

1. 同一 `sourceId` 不可并发 ingest。
2. 同一时间最多一个任务可持有该 `sourceId` 的写锁。

## 6. WikiManager 接口

```ts
export class WikiManager {
  initialize(): Promise<void>
  dispose(): Promise<void>

  // Raw Sources
  discoverMappedFolderSources(input: {
    folderPaths: string[]
    recursive?: boolean
    includePatterns?: string[]
    excludePatterns?: string[]
  }): Promise<RawSource[]>
  ingestFolder(input: {
    folderPath: string
    recursive?: boolean
    limit?: number
  }): Promise<{
    discovered: number
    ingested: number
    failed: number
  }>
  addRawSource(title: string, type: RawSourceType, content: string): Promise<RawSource>
  getRawSource(id: string): Promise<RawSource | null>
  listRawSources(): Promise<RawSource[]>
  retryIngest(sourceId: string): Promise<WikiPage[]>

  // Wiki Pages
  createPage(data: { title: string; type: WikiPageType; content: string; description?: string }): Promise<WikiPage>
  updatePage(id: string, updates: Partial<Pick<WikiPage, 'title' | 'description' | 'tags' | 'content' | 'sources'>>): Promise<WikiPage>
  deletePage(id: string): Promise<void>
  getPage(id: string): Promise<WikiPage | null>
  getPageByTitle(title: string): Promise<WikiPage | null>
  listPages(type?: WikiPageType): Promise<WikiPage[]>

  // Claims
  listClaims(pageId?: string): Promise<Claim[]>

  // Search / Links
  search(query: string): Promise<WikiPage[]>
  parseLinks(content: string): string[]
  updateLinks(pageId: string): Promise<void>
  getBacklinks(pageId: string): Promise<WikiPage[]>
  getIndex(): Promise<Array<{ id: string; title: string; type: WikiPageType; description: string }>>

  // Core workflows
  ingest(sourceId: string): Promise<{
    updatedPages: WikiPage[]
    updatedClaims: Claim[]
    issues: LintIssue[]
  }>
  query(question: string, options?: { artifactType?: 'markdown' | 'table' }): Promise<{
    answer: string
    artifactType: 'markdown' | 'table'
    citations: Array<{ pageId: string; title: string }>
  }>
  saveQueryAsPage(input: {
    title: string
    answer: string
    citations: Array<{ pageId: string; title: string }>
  }): Promise<WikiPage>
  lint(): Promise<{ issues: LintIssue[] }>

  // Logs
  listLogs(limit?: number): Promise<Array<{ id: string; type: string; timestamp: number; description: string }>>
}
```

## 7. 核心流程

### 7.0 本地磁盘映射场景（本项目默认）

1. 用户在设置中配置一个或多个映射目录（例如项目文档目录）。
2. 智能体在以下时机主动扫描目录并发现新/变更文件：
   - 用户明确要求“整理分析这个文件夹并生成 wiki”。
   - 会话开始且该目录自上次扫描后有变更。
   - 定时任务触发（例如每 24 小时）。
3. 对新增或变更文件创建/更新 RawSource 记录（状态置为 `pending`）。
4. 系统按批次执行 ingest，生成或更新 Wiki 页面。
5. 扫描结果和 ingest 结果写入 `log.md`，并在面板展示。

### 7.0.1 二进制 Raw 入库命令（Phase 1）

为避免大文件/二进制内容进入 LLM 上下文，定义专用入库命令：

`cp_to_wiki_raw(src_path, source_type?, title?)`

输入：

1. `src_path`：源文件路径（必须位于已授权映射目录内）
2. `source_type`：`article | paper | note`（可选，默认自动推断）
3. `title`：显示标题（可选，默认使用文件名）

输出：

1. `source_id`
2. `raw_path`（例如 `wiki/raw/{source_id}.pdf`）
3. `size`
4. `mime`
5. `checksum`（sha256）
6. `status`（默认 `pending`）

执行流程：

1. 校验路径权限（仅允许 mapped folder -> `wiki/raw/`）。
2. 流式读取源文件并计算 `checksum`。
3. 先写临时文件：`wiki/raw/.tmp/{uuid}.part`。
4. 写入完成后原子重命名到 `wiki/raw/{source_id}.{ext}`。
5. 写入 `wiki_raw_sources` 元数据记录（`status='pending'`）。
6. 返回元数据，不返回文件正文。

去重与恢复：

1. 若 `checksum` 已存在，则复用已有 `source_id`，不重复复制。
2. 若复制失败，删除 `.part` 并记录失败日志。
3. 若文件写入成功但元数据写入失败，标记为 `orphan_raw`，等待修复任务补登记。

### 7.1 Ingest（多页联动）

1. RawSource 进入 `processing`。
2. 读取原始来源，生成 summary 页面。
3. 增量更新实体/概念页；必要时新增 comparison/synthesis 页。
4. 抽取 claims 并与历史 claims 比较，标记 `contradicted/superseded`。
5. 重算 links，更新 index。
6. 写 `log.md` 和 `wiki_log`。
7. 成功标记 `processed`；失败标记 `failed` 并写 `backup/`。

### 7.2 Query（可回填）

1. 优先读 `index.md` 选候选页。
2. 需要时走 `search provider` 扩展检索。
3. 汇总回答并附页面级引用。
4. 用户可“保存为 query-note 页面”，系统写入 page/index/log。

### 7.3 Lint（结构 + 语义）

结构类：

1. 断链 `[[Title]]`。
2. 孤儿页（零 inbound）。
3. 提及但未建页概念。
4. 缺失交叉引用。

语义类：

1. claim 冲突（互相矛盾）。
2. claim 陈旧（被新来源 supersede）。
3. 数据缺口（建议补充来源）。

### 7.4 Lint 修复策略（分级执行）

1. `auto_fix`（自动修复，低风险）
   - 断链重定向（高置信同名/近似名页面）
   - 补充缺失双向链接
   - 同步 `index.md` / `log.md` 的轻量不一致
2. `require_confirmation`（需要用户确认，中风险）
   - 新建缺失概念页
   - 合并重复页面
   - query-note 升级为正式页面
3. `manual_only`（仅人工决策，高风险）
   - claim 冲突裁决
   - 删除核心内容或大段改写
   - 改变关键结论

修复闭环：

1. 执行 `lint` 生成问题清单。
2. 先应用 `auto_fix`。
3. 对 `require_confirmation` 项逐条请求确认。
4. `manual_only` 只给建议，不自动执行。
5. 修复后重新执行 `lint`，直到问题收敛。

## 8. Index / Log 规范

### 8.1 index.md

1. 按页面类型分组。
2. 每条目含：标题、一句话摘要、更新时间、关键标签。
3. 供 query 的第一跳检索使用。

### 8.2 log.md

采用统一 header：

```text
## [YYYY-MM-DD] <operation> | <title>
```

每条日志至少记录：

1. 操作类型。
2. 涉及页面或来源。
3. 变更摘要（新增/更新/冲突/失败）。

## 9. Schema（WIKI_SCHEMA.md）必须项

1. 页面类型和命名规则。
2. ingest/query/lint 的标准步骤。
3. 引用规范（页面引用 + source 引用）。
4. claim 状态判定与迁移规则。
5. optional capability 开关（images/marp/dataview/search-provider）。
6. 映射目录扫描规则（include/exclude、递归、批处理上限）。
7. 智能体路由策略（何时 ingest/query/lint，何时只回答不落库）。
8. lint 修复权限策略（auto_fix / require_confirmation / manual_only）。
9. Schema 优先规则（进入 wiki_pipeline 必须先读取 `WIKI_SCHEMA.md`）。
10. 二进制 Raw 入库契约（`cp_to_wiki_raw` 的输入/输出/权限边界）。

### 9.1 智能体系统提示词（通用助手 + Wiki 子协议）

本项目的智能体是通用助手，不应被设计为“只做 Wiki”。  
Wiki 能力应作为一个按需触发的子协议（sub-protocol）注入。

下面模板用于约束“何时进入 Wiki 子协议”：

```text
你是一个通用 AI 助手，负责处理代码、文档、分析、文件操作等多类任务。
Wiki 只是你的一个子能力，不是唯一职责。

[总路由]
每轮先判定 task_domain：
- general_assistant：普通问答、代码修改、文档编辑、数据分析等
- wiki_pipeline：需要构建/更新/检查 Wiki 的任务

仅当命中 wiki_pipeline 时，再判定 wiki_intent ∈ {ingest, query, lint}。

[Schema 优先规则]
- 一旦进入 wiki_pipeline，本轮先读取 `WIKI_SCHEMA.md`。
- ingest/query/lint 必须遵循 `WIKI_SCHEMA.md` 的页面规范、引用规范和修复权限规则。
- 若 `WIKI_SCHEMA.md` 缺失或读取失败，不执行 wiki 写操作；先报告问题并请求用户修复。

[进入 wiki_pipeline 的触发条件]
1) 用户明确要求“整理/分析某个映射目录并生成/更新 wiki”。
2) 用户问题明确要求“基于现有 wiki 知识回答”。
3) 用户明确要求“检查 wiki 质量/一致性/冲突”。
4) 系统策略触发（如定时或阈值）且不会干扰当前高优先级任务。

[wiki_intent 判定]
1) ingest：映射目录有新增/变更文件，或用户要求批量整理目录。
2) query：用户基于 wiki 提问或要求引用 wiki 页面回答。
3) lint：用户要求体检；或 ingest 批次完成后按策略触发。

[执行约束]
- general_assistant 任务优先保持原能力，不强制进入 wiki_pipeline。
- ingest：更新页面、index.md、log.md，并记录成功/失败统计。
- query：返回 citations；答案可沉淀时询问是否保存为 query-note。
- lint：输出 issues（type、severity、suggestedAction）。
- 未 ingest 的新文件不可当作已入库 wiki 知识引用。

[二进制入库规则]
- 对 pdf/docx/图片/大文件，不得将原始内容直接注入对话上下文。
- 必须先调用 `cp_to_wiki_raw` 完成 Raw 入库，再进入 ingest 分析流程。
- `cp_to_wiki_raw` 仅返回元数据（source_id/path/size/checksum），不返回正文。

[lint 修复权限]
- auto_fix：允许自动修复低风险项（断链、交叉链接、索引日志轻量同步）。
- require_confirmation：中风险项必须先征求用户确认（新建页、合并页、结构改写）。
- manual_only：高风险项禁止自动执行（claim 冲突裁决、删除核心内容、改变结论）。
- 执行顺序：lint -> auto_fix -> 用户确认项 -> lint（复检）。

[冲突处理]
若同轮既有通用任务又有 wiki 任务，先完成用户显式优先目标；
除非用户要求“先建 wiki 再回答”，否则不要强制执行 ingest。
```

### 9.2 与当前系统提示分层实现对齐

为避免和现有架构冲突，Wiki 规则应以“增量块”注入，而不是替换基础提示词：

1. Base 层：`UNIVERSAL_SYSTEM_PROMPT`（通用能力与工具规则）。
2. Personality 层：Agent 配置（SOUL/IDENTITY/AGENTS/USER/MEMORY）。
3. Runtime 增强层：场景增强、智能推荐、MCP、skills、workflow。
4. Wiki 子协议层：统一注入，但仅在相关任务中由模型自行激活。

实现原则：

1. 保留 Base 层工具规则，不覆盖。
2. Wiki 子协议只约束 Wiki 相关回合，不污染其他任务。
3. 当用户任务不是 Wiki 时，智能体按通用助手路径执行。

## 10. 检索演进策略

1. `pages <= 500`：index-first + sqlite FTS。
2. `pages > 500`：启用 `WikiSearchProvider`（混合检索）。
3. provider 可替换，但 query 接口保持稳定。

## 11. UX 统一规格

1. Desktop（>=1024）：三栏布局，Wiki 面板默认 360px。
2. Tablet（768-1023）：Drawer。
3. Mobile（<768）：全屏 Wiki。
4. 面板必须展示：
   - Raw Sources 状态（pending/processing/processed/failed）
   - Pages 分组（含新增 comparison/synthesis/query-note）
   - Issues（lint 数量与等级）
   - query 结果回填入口（保存为页面）

## 12. 实施阶段（概念覆盖版）

### Phase A（基础）

1. 三层存储、基础 CRUD、index/log、基础 ingest/query。

### Phase B（概念覆盖核心）

1. claim 模型与冲突/陈旧检测。
2. 增强 lint（结构 + 语义）。
3. query 回填页面能力。
4. comparison/synthesis/query-note 页面类型。

### 12.1 Phase B 细化：RLM 模式（长上下文递归处理）

目标：在超长文档/多文档场景下，避免一次性塞入上下文，改为“分段检索 + 递归汇总”。

触发条件：

1. 单文件或候选上下文超过阈值（例如 `> 200k tokens`）。
2. 同轮涉及大量来源文件且无法在单轮上下文容纳。

RLM 工作流：

1. Root 调度：先读取 `WIKI_SCHEMA.md`，再拆解任务并规划所需片段。
2. 外部环境检索：通过 chunk 索引挑选相关片段，而不是加载全文。
3. Sub-call 执行：针对单个子问题 + 片段集合做局部分析。
4. Root 汇总：合并各 sub-call 输出，去重冲突，形成最终页面更新。
5. 写回：更新 `wiki_pages`、`wiki_claims`、`index.md`、`log.md`。

外部环境接口（建议）：

1. `list_sources()`
2. `list_chunks(source_id)`
3. `peek_chunk(source_id, chunk_id)`
4. `grep_chunks(source_id, query, top_k)`
5. `load_chunk_window(source_id, start, count)`

执行边界（第一版）：

1. 仅启用 `depth=1` 递归（Root -> Sub-call），先不做更深层级。
2. 预算控制：`max_subcalls`、`max_cost`、`max_latency`。
3. 早停策略：信息增益不足时停止继续扩展 sub-call。

可观测性：

1. 记录每次 RLM run 的 chunk 选择轨迹。
2. 记录 sub-call 数量、耗时、token、成本。
3. 记录最终采用/丢弃的 claim 与原因。

### Phase C（规模化与扩展）

1. SearchProvider 抽象与阈值切换。
2. 可选能力（Marp/Dataview/images）接入。

## 13. 验收标准

1. ingest 能一次更新多类页面并记录 index/log。
2. query 回答有引用，且可回填成页面。
3. lint 能稳定识别结构 + 语义问题。
4. 能输出数据缺口建议与后续来源方向。
5. schema 可实际约束 LLM 行为，不是仅说明文档。
6. 长上下文任务可在预算内完成（RLM 模式），无需全文注入模型上下文。
