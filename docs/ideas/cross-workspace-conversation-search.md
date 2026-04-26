# 跨工作区聊天记录搜索功能设计

> **状态**: 提案草稿
> **日期**: 2026-04-26
> **场景**: 用户想继续讨论一个问题，但忘记了是哪个工作区讨论的，需要一种方式来搜索/定位到目标工作区。

---

## 1. 问题分析

### 当前架构约束

| 约束 | 现状 |
|------|------|
| 数据存储 | 所有对话存储在 **同一个 SQLite 数据库** 的 `conversations` 表中 |
| 消息格式 | `messages_json` 是一个 TEXT 字段，存储完整消息数组的 JSON 序列化 |
| 工作区关联 | Conversation ID === Workspace ID（隐式 1:1 绑定，无外键） |
| 项目范围 | Sidebar 已按 Project 过滤工作区，但消息本身没有 project_id 列 |
| 搜索能力 | 仅有文件内容搜索（Web Worker），**无对话消息搜索** |

### 核心挑战

1. **消息存储格式**: `messages_json` 是大 JSON blob，直接 LIKE 搜索性能差且不准确
2. **跨工作区范围**: 需要搜索所有对话，而非仅当前项目的工作区
3. **实时性**: 对话内容频繁更新，搜索索引需要保持同步

---

## 2. 方案设计

### 2.1 推荐方案: SQLite FTS5 全文搜索

利用 SQLite 内建的 [FTS5](https://www.sqlite.org/fts5.html) 扩展（WASM 版本已支持），创建虚拟表索引对话内容。

#### 数据模型

```sql
-- 对话消息全文搜索虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS conversation_search USING fts5(
    conversation_id,    -- 对话/工作区 ID
    message_role,       -- 'user' | 'assistant' | 'system' | 'tool'
    content,            -- 消息文本内容（stripped）
    project_name,       -- 项目名称（冗余存储，方便结果展示）
    workspace_name,     -- 工作区名称（冗余存储，方便结果展示）
    title,              -- 对话标题
    content conversation_search_data,  -- 自定义数据表名
    tokenize='unicode61'               -- Unicode 分词器，支持 CJK 字符
);
```

> **为什么不选择 `tokenize='porter unicode61'`？**
> Porter 词干分析器对英文效果好，但对中文无意义。后续可以切换为 `simple` tokenizer 或引入 Jieba 分词。`unicode61` 是最安全的起步选择，它会把 CJK 字符按单字符拆分，支持基本的中文搜索。

#### 索引更新策略

**方案 A: 触发器同步（推荐）**

在对话保存时，通过应用层 hook 更新 FTS 索引：

```typescript
// conversation.repository.ts 中 save() 方法扩展
async save(conversation: StoredConversation): Promise<void> {
  // ... 原有保存逻辑 ...
  
  // 同步更新 FTS 索引
  await this.syncFTSIndex(conversation.id, conversation.messages, conversation.title)
}

private async syncFTSIndex(
  conversationId: string, 
  messages: unknown[], 
  title: string
): Promise<void> {
  const db = getSQLiteDB()
  
  // 1. 删除旧索引
  await db.execute(
    'DELETE FROM conversation_search WHERE conversation_id = ?',
    [conversationId]
  )
  
  // 2. 获取工作区和项目名称
  const workspace = await db.queryFirst<{ name: string; project_name: string }>(
    `SELECT w.name, p.name as project_name 
     FROM workspaces w 
     JOIN projects p ON w.project_id = p.id 
     WHERE w.id = ?`,
    [conversationId]
  )
  
  // 3. 逐条插入消息到 FTS
  const validRoles = new Set(['user', 'assistant', 'system', 'tool'])
  for (const msg of messages as Message[]) {
    if (!msg.content || typeof msg.content !== 'string') continue
    if (!validRoles.has(msg.role)) continue
    
    // 截断过长内容（FTS 不需要存储完整内容）
    const content = msg.content.slice(0, 2000)
    
    await db.execute(
      `INSERT INTO conversation_search 
       (conversation_id, message_role, content, project_name, workspace_name, title)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [conversationId, msg.role, content, 
       workspace?.project_name || '', workspace?.name || '', title]
    )
  }
}
```

**方案 B: 定时批量重建**

适合已有大量历史数据时首次建索引：

```typescript
async function rebuildFTSIndex(): Promise<void> {
  const db = getSQLiteDB()
  
  await db.execute('DELETE FROM conversation_search')
  
  // 分批加载，避免一次性内存爆炸
  const conversations = await db.queryAll<{
    id: string; title: string; messages_json: string
  }>('SELECT id, title, messages_json FROM conversations')
  
  for (const conv of conversations) {
    const messages = JSON.parse(conv.messages_json || '[]')
    await conversationRepo.syncFTSIndex(conv.id, messages, conv.title)
  }
}
```

#### 搜索 API

```typescript
// 新增: conversation-search.repository.ts

export interface ConversationSearchResult {
  conversationId: string
  title: string
  workspaceName: string
  projectName: string
  /** 匹配的消息片段 */
  snippet: string
  /** 匹配的消息角色 */
  messageRole: string
  /** BM25 排名分数 */
  rank: number
}

export interface ConversationSearchOptions {
  query: string
  /** 限制搜索的消息角色 */
  roles?: ('user' | 'assistant' | 'system' | 'tool')[]
  /** 限制项目范围 */
  projectId?: string
  /** 最大结果数 */
  limit?: number
  /** 偏移量（分页） */
  offset?: number
}

export class ConversationSearchRepository {
  
  async search(options: ConversationSearchOptions): Promise<{
    results: ConversationSearchResult[]
    total: number
  }> {
    const db = getSQLiteDB()
    const { query, roles, projectId, limit = 50, offset = 0 } = options
    
    // 构建 FTS 查询
    // 对中文友好：将搜索词作为 LIKE 补充
    const ftsQuery = this.buildFTSQuery(query)
    
    let roleFilter = ''
    const params: unknown[] = []
    
    if (roles && roles.length > 0) {
      roleFilter = `AND message_role IN (${roles.map(() => '?').join(',')})`
      params.push(...roles)
    }
    
    let projectFilter = ''
    if (projectId) {
      // 需要通过 conversation_id 关联 workspaces 表
      projectFilter = `AND conversation_id IN (
        SELECT id FROM workspaces WHERE project_id = ?
      )`
      params.push(projectId)
    }
    
    // 主搜索查询（使用 BM25 排名）
    const countResult = await db.queryFirst<{ total: number }>(
      `SELECT COUNT(DISTINCT conversation_id) as total
       FROM conversation_search
       WHERE conversation_search MATCH ? ${roleFilter} ${projectFilter}`,
      [ftsQuery, ...params]
    )
    
    const results = await db.queryAll<ConversationSearchResult & { snippet_raw: string }>(
      `SELECT 
         conversation_id as conversationId,
         title,
         workspace_name as workspaceName,
         project_name as projectName,
         message_role as messageRole,
         snippet(conversation_search, 2, '⟨', '⟩', '...', 32) as snippet_raw,
         bm25(conversation_search) as rank
       FROM conversation_search
       WHERE conversation_search MATCH ? ${roleFilter} ${projectFilter}
       ORDER BY rank
       LIMIT ? OFFSET ?`,
      [ftsQuery, ...params, limit, offset]
    )
    
    return {
      results: results.map(r => ({ ...r, snippet: r.snippet_raw })),
      total: countResult?.total || 0,
    }
  }
  
  /**
   * 构建 FTS5 搜索查询
   * 支持中文：先尝试 FTS5 token 匹配，fallback 到 LIKE
   */
  private buildFTSQuery(input: string): string {
    // 转义 FTS5 特殊字符
    const escaped = input
      .replace(/"/g, '""')
      .replace(/'/g, "''")
    
    // 对短查询（如单个中文词），使用 OR 组合匹配策略
    // FTS5 unicode61 对 CJK 按单字符拆分
    // 所以搜索 "部署" 等价于 "部 AND 署"
    if (/^[\u4e00-\u9fff]+$/.test(escaped)) {
      return `"${escaped}" OR ${escaped}`
    }
    
    return `"${escaped}"`
  }
  
  /**
   * 快速标题搜索（不依赖 FTS，用于无 FTS 索引时的 fallback）
   */
  async searchByTitle(query: string, limit = 20): Promise<ConversationSearchResult[]> {
    const db = getSQLiteDB()
    return db.queryAll<ConversationSearchResult>(
      `SELECT 
         c.id as conversationId,
         c.title,
         w.name as workspaceName,
         p.name as projectName,
         '' as snippet,
         'title' as messageRole,
         0 as rank
       FROM conversations c
       LEFT JOIN workspaces w ON c.id = w.id
       LEFT JOIN projects p ON w.project_id = p.id
       WHERE c.title LIKE ?
       ORDER BY c.updated_at DESC
       LIMIT ?`,
      [`%${query}%`, limit]
    )
  }
}
```

#### 中文搜索增强策略

`unicode61` tokenizer 对中文是**单字拆分**，搜索"部署"会变成 `部 AND 署`，这能工作但不够精确。可选增强：

1. **双字组合（bigram）搜索**: 对中文查询生成 bigram 子查询
2. **简单分词器**: 实现自定义 SQLite tokenizer（WASM 环境中较复杂）
3. **混合策略**: FTS5 + LIKE 兜底

```typescript
// 中文 bigram 搜索增强
private buildChineseQuery(text: string): string {
  if (text.length <= 1) return `"${text}"`
  
  // 生成相邻字符对
  const bigrams: string[] = []
  for (let i = 0; i < text.length - 1; i++) {
    bigrams.push(`"${text[i]}${text[i + 1]}"`)
  }
  
  // FTS5: 所有 bigram 必须出现在同一行
  return bigrams.join(' AND ')
}
```

---

### 2.2 Schema 迁移

```sql
-- Migration v5: conversation_search_fts

-- FTS5 虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS conversation_search USING fts5(
    conversation_id,
    message_role,
    content,
    project_name,
    workspace_name,
    title,
    content conversation_search_data,
    tokenize='unicode61'
);

-- 内容表（用于 snippet 等函数）
-- FTS5 自动创建 conversation_search_data, conversation_search_idx 等辅助表

PRAGMA user_version = 5;
```

**首次部署时需要一次性的全量索引重建**，可以在迁移完成后自动触发。

---

### 2.3 UI 设计

#### 方案: 全局搜索弹窗 (Command Palette 扩展)

在现有的 CommandPalette 组件中增加对话搜索功能，或创建独立的搜索入口。

**交互流程**:

```
1. 用户点击搜索按钮或按 Ctrl/Cmd + K
2. 弹出搜索面板，输入关键词
3. 实时搜索（debounce 300ms）显示匹配结果
4. 结果卡片展示：
   ├── 项目名 / 工作区名
   ├── 匹配的消息片段（高亮关键词）
   ├── 消息角色标识（用户/AI）
   └── 点击 → 跳转到该工作区
5. 跳转逻辑：
   ├── 如果是当前项目 → 直接切换工作区
   └── 如果是其他项目 → 切换项目 → 切换工作区
```

**组件结构**:

```tsx
// components/conversation/ConversationSearchDialog.tsx

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 跳转到指定工作区的回调 */
  onNavigateToWorkspace: (conversationId: string, projectId?: string) => void
}

export function ConversationSearchDialog({ open, onOpenChange, onNavigateToWorkspace }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ConversationSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchScope, setSearchScope] = useState<'all' | 'current_project'>('all')

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const searchRepo = getConversationSearchRepository()
        const { results } = await searchRepo.search({
          query: query.trim(),
          projectId: searchScope === 'current_project' ? currentProjectId : undefined,
          limit: 30,
        })
        setResults(results)
      } finally {
        setLoading(false)
      }
    }, 300)
    
    return () => clearTimeout(timer)
  }, [query, searchScope])

  return (
    <BrandDialog open={open} onOpenChange={onOpenChange}>
      <BrandDialogContent className="max-w-lg">
        {/* 搜索输入 */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 text-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索对话内容..."
            className="flex-1 bg-transparent text-sm outline-none"
            autoFocus
          />
          {/* 搜索范围切换 */}
          <select value={searchScope} onChange={(e) => setSearchScope(e.target.value as any)}>
            <option value="all">所有项目</option>
            <option value="current_project">当前项目</option>
          </select>
        </div>
        
        {/* 搜索结果 */}
        <div className="max-h-96 overflow-y-auto">
          {results.map((result) => (
            <SearchResultCard
              key={`${result.conversationId}-${result.rank}`}
              result={result}
              onClick={() => {
                onNavigateToWorkspace(result.conversationId)
                onOpenChange(false)
              }}
            />
          ))}
        </div>
      </BrandDialogContent>
    </BrandDialog>
  )
}

function SearchResultCard({ result, onClick }: { result: ConversationSearchResult; onClick: () => void }) {
  return (
    <div
      className="cursor-pointer rounded-lg p-3 hover:bg-muted transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-xs text-tertiary">
        <span className="font-medium">{result.projectName}</span>
        <span>/</span>
        <span>{result.workspaceName}</span>
      </div>
      {result.snippet && (
        <p className="mt-1 text-sm text-secondary line-clamp-2"
           dangerouslySetInnerHTML={{
             __html: result.snippet
               .replace(/⟨/g, '<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">')
               .replace(/⟩/g, '</mark>')
           }}
        />
      )}
      <div className="mt-1 flex items-center gap-2 text-xs text-tertiary">
        <Badge variant={result.messageRole === 'user' ? 'primary' : 'secondary'}>
          {result.messageRole === 'user' ? '用户' : 'AI'}
        </Badge>
      </div>
    </div>
  )
}
```

#### 入口位置

1. **Sidebar 顶部搜索按钮**: 在 "WORKSPACE" 标题旁添加 🔍 图标
2. **Command Palette**: 添加 `search-conversations` 命令
3. **快捷键**: `Ctrl/Cmd + Shift + F`（全局对话搜索）

---

### 2.4 Agent 能力扩展 (Tool)

为 Agent 添加一个 `search_conversations` 工具，使其能够在对话中帮用户查找历史讨论。

```typescript
// agent/tools/search-conversations.tool.ts

export const searchConversationsTool: ToolDefinition = {
  name: 'search_conversations',
  description: '搜索所有工作区的聊天记录，查找包含指定关键词的历史对话。当你需要帮用户回忆之前在哪个工作区讨论过某个话题时使用。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词或短语',
      },
      scope: {
        type: 'string',
        enum: ['all', 'current_project'],
        description: '搜索范围：所有项目或仅当前项目',
        default: 'all',
      },
      limit: {
        type: 'number',
        description: '最大返回结果数',
        default: 10,
      },
    },
    required: ['query'],
  },
  async execute({ query, scope, limit }, context: ToolContext) {
    const searchRepo = getConversationSearchRepository()
    
    const { results } = await searchRepo.search({
      query,
      projectId: scope === 'current_project' ? context.projectId : undefined,
      limit,
    })
    
    if (results.length === 0) {
      return {
        content: `未找到包含 "${query}" 的对话记录。`,
        results: [],
      }
    }
    
    return {
      content: `找到 ${results.length} 个匹配的对话：\n\n${
        results.map((r, i) => 
          `${i + 1}. **${r.projectName} / ${r.workspaceName}**\n` +
          `   标题: ${r.title}\n` +
          `   匹配: "${r.snippet.replace(/⟨|⟩/g, '')}"\n` +
          `   角色: ${r.messageRole}\n`
        ).join('\n')
      }\n\n请告诉我你想跳转到哪个工作区继续讨论。`,
      results: results.map(r => ({
        conversationId: r.conversationId,
        title: r.title,
        workspaceName: r.workspaceName,
        projectName: r.projectName,
      })),
    }
  },
}
```

**用户体验流程**:

```
用户: "我之前跟你在哪个工作区讨论过部署 CI/CD 的事情？"

Agent: [调用 search_conversations tool]
  → query: "部署 CI/CD"
  → scope: "all"

Agent: "我在以下工作区中找到了相关讨论：

1. **前端项目 / CI配置** 
   标题: GitHub Actions 部署配置
   匹配: "...关于部署 CI/CD 流程的配置，我们需要..."

2. **DevOps / 生产环境部署**
   标题: 生产环境部署策略
   匹配: "...CI/CD pipeline 需要包含测试阶段..."

你想跳转到哪个工作区继续讨论？"
```

---

## 3. 实现计划

### Phase 1: 核心搜索能力（基础版）

| 任务 | 文件 | 优先级 |
|------|------|--------|
| Schema 迁移 (v5) | `sqlite/migrations/` | P0 |
| FTS 索引维护 | `conversation.repository.ts` | P0 |
| 搜索 Repository | 新建 `conversation-search.repository.ts` | P0 |
| 首次全量索引重建 | `sqlite/migrations/` | P0 |
| 标题搜索 fallback | `conversation-search.repository.ts` | P1 |

### Phase 2: UI 搜索面板

| 任务 | 文件 | 优先级 |
|------|------|--------|
| 搜索弹窗组件 | 新建 `ConversationSearchDialog.tsx` | P1 |
| Sidebar 搜索入口 | `Sidebar.tsx` | P1 |
| Command Palette 集成 | `command-palette-commands.tsx` | P1 |
| 跨项目跳转逻辑 | `conversation.store.sqlite.ts` | P1 |

### Phase 3: Agent Tool

| 任务 | 文件 | 优先级 |
|------|------|--------|
| search_conversations tool | 新建 `search-conversations.tool.ts` | P2 |
| Tool 注册 | agent tool registry | P2 |
| i18n 支持 | `i18n/` | P2 |

---

## 4. 性能考量

### 存储开销

- FTS 索引约为原始文本的 **30-50%** 大小
- 假设平均每条对话 50KB 的 `messages_json`，100 条对话 ≈ 5MB 原始数据
- FTS 索引预计 ≈ 1.5-2.5MB，完全可接受

### 查询性能

- FTS5 在 10 万条记录内搜索延迟 < 50ms
- `snippet()` 函数会增加约 10-20ms 开销
- 建议限制返回结果数为 50 条以内

### 写入性能

- 每次对话保存时需重建该对话的 FTS 索引
- 对于 100 条消息的对话，索引重建耗时 < 100ms
- 已通过 fire-and-forget 方式调用 `persistConversation`，不会阻塞 UI

---

## 5. 备选方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **SQLite FTS5** ✅ | 内建支持、无需外部依赖、性能好 | 中文分词不够精确 | ⭐⭐⭐⭐⭐ |
| **LIKE 搜索** | 实现最简单 | 大 JSON blob 上性能极差，无法高亮 | ⭐⭐ |
| **消息表拆分** | 规范化存储、索引灵活 | 大规模 schema 重构、迁移复杂 | ⭐⭐⭐ |
| **外部搜索服务** | 功能强大 | 浏览器端不可行 | ⭐ |
| **内存索引** | 无需 DB 变更 | 启动时需全量加载、内存开销大 | ⭐⭐ |

---

## 6. 后续优化方向

1. **更好的中文分词**: 集成 [jieba-wasm](https://github.com/nicross/jieba-wasm) 或使用 bigram tokenizer
2. **增量索引**: 仅在消息变更时更新对应的 FTS 行（而非整个对话）
3. **搜索历史**: 记录用户常用的搜索查询
4. **时间范围筛选**: 支持按日期范围过滤搜索结果
5. **语义搜索**: 集成 embedding 模型实现相似度搜索（长期目标）
