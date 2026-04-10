# 文档入口 - 实施计划

**需求**: `docs/requirements/documentation-entry-rfd.md`
**设计**: `docs/design/documentation-entry-design.md`
**状态**: 规划完成

---

## 实施概览

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| Phase 1 | 路由系统 + 基础组件 | P0 |
| Phase 2 | 文档渲染 + 内容加载 | P0 |
| Phase 3 | 侧边栏导航 | P1 |
| Phase 4 | 完善样式 + 文档内容 | P1 |

---

## Phase 1: 路由系统 + 基础组件

### 任务 1.1: 修改 App.tsx 路由系统

**文件**: `web/src/App.tsx`

```typescript
// 1. 新增路由类型
type AppRoute =
  | { kind: 'projectsHome' }
  | { kind: 'projectWorkspace'; projectId: string; workspaceId?: string }
  | { kind: 'legacyWorkspace' }
  | { kind: 'webcontainerPreview' }
  | { kind: 'filePreview'; path: string }
  | { kind: 'docs'; category?: 'user' | 'developer'; page?: string }  // 新增
  | { kind: 'unknown' }

// 2. resolveRoute() 新增
if (segments[0] === 'docs') {
  return {
    kind: 'docs',
    category: segments[1] as 'user' | 'developer' | undefined,
    page: segments[2],
  }
}

// 3. toPath() 新增
if (route.kind === 'docs') {
  const parts = ['docs', route.category, route.page].filter(Boolean)
  return '/' + parts.join('/')
}

// 4. 路由渲染新增
import { DocsPage } from '@/pages/docs/DocsPage'

const rootView = currentRoute.kind === 'projectsHome' ? (
  // ...
) : currentRoute.kind === 'docs' ? (
  <DocsPage
    category={currentRoute.category}
    page={currentRoute.page}
    onBack={() => navigateToRoute({ kind: 'projectsHome' })}
  />
) : currentRoute.kind === 'webcontainerPreview' ? (
  // ...
)
```

### 任务 1.2: 创建 DocsPage 组件

**文件**: `web/src/pages/docs/DocsPage.tsx`

```typescript
import { useEffect, useState } from 'react'
import { useT } from '@/i18n'

interface DocsPageProps {
  category?: 'user' | 'developer'
  page?: string
  onBack?: () => void
}

interface DocIndex {
  title: string
  pages: Array<{ slug: string; title: string; file: string }>
}

export function DocsPage({ category, page, onBack }: DocsPageProps) {
  const t = useT()
  const [index, setIndex] = useState<DocIndex | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)

  // 加载目录索引
  useEffect(() => {
    if (!category) return
    fetch(`/docs/${category}/_index.json`)
      .then(r => r.json())
      .then(setIndex)
      .catch(console.error)
  }, [category])

  // 加载文档内容
  useEffect(() => {
    if (!category || !page) return
    setLoading(true)
    fetch(`/docs/${category}/${page}.md`)
      .then(r => r.text())
      .then(setContent)
      .catch(() => setContent('# 文档未找到'))
      .finally(() => setLoading(false))
  }, [category, page])

  return (
    <div className="flex h-full">
      {/* 侧边栏 */}
      <DocsSidebar category={category} page={page} index={index} />

      {/* 内容区 */}
      <main className="flex-1 overflow-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span>加载中...</span>
          </div>
        ) : content ? (
          <div className="max-w-3xl mx-auto docs-content">
            <MarkdownContent content={content} />
          </div>
        ) : (
          <DocsHome />
        )}
      </main>
    </div>
  )
}
```

### 任务 1.3: 创建 HelpMenuDropdown 组件

**文件**: `web/src/components/layout/HelpMenuDropdown.tsx`

```typescript
import { HelpCircle } from 'lucide-react'
import { useT } from '@/i18n'

interface HelpMenuDropdownProps {
  onOpenDocs: (category: 'user' | 'developer') => void
}

export function HelpMenuDropdown({ onOpenDocs }: HelpMenuDropdownProps) {
  const t = useT()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BrandButton iconButton>
          <HelpCircle className="h-[14px] w-[14px]" />
        </BrandButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onOpenDocs('user')}>
          用户文档
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenDocs('developer')}>
          开发者文档
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### 任务 1.4: 集成 HelpMenuDropdown 到 TopBar

**文件**: `web/src/components/layout/TopBar.tsx`

```typescript
import { HelpMenuDropdown } from './HelpMenuDropdown'

interface TopBarProps {
  // ... 现有 props
  onDocsOpen?: (category: 'user' | 'developer') => void
}

// 在右侧按钮区域添加
<ActionTooltip label={t('topbar.tooltips.help')}>
  <HelpMenuDropdown onOpenDocs={onDocsOpen ?? (() => {})} />
</ActionTooltip>
```

---

## Phase 2: 文档渲染 + 内容加载

说明：文档源目录统一维护在仓库根目录 `docs/`，`web/public/docs/` 由同步插件自动生成，不手工维护。

### 任务 2.1: 创建文档目录结构

**文件**: `docs/user/_index.json`

```json
{
  "title": "用户文档",
  "pages": [
    { "slug": "getting-started", "title": "快速入门", "file": "getting-started.md" },
    { "slug": "workspace", "title": "工作空间使用", "file": "workspace.md" },
    { "slug": "conversation", "title": "对话功能", "file": "conversation.md" },
    { "slug": "sync", "title": "同步功能", "file": "sync.md" }
  ]
}
```

**文件**: `docs/developer/_index.json`

```json
{
  "title": "开发者文档",
  "pages": [
    { "slug": "api", "title": "API 参考", "file": "api.md" },
    { "slug": "architecture", "title": "架构说明", "file": "architecture.md" },
    { "slug": "contributing", "title": "贡献指南", "file": "contributing.md" }
  ]
}
```

### 任务 2.2: 创建文档内容文件

**文件**: `docs/user/getting-started.md`

```markdown
# 快速入门

欢迎使用 CreatorWeave！

## 开始使用

1. 创建或打开项目
2. 开始对话
3. 使用 AI 能力完成工作

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Cmd+P | 快速切换 |
| Cmd+/ | 命令面板 |
```

**文件**: `docs/developer/api.md`

```markdown
# API 参考

## 对话 API

### 发送消息

```typescript
const response = await conversation.send({
  content: 'Hello!',
  mode: 'auto'
})
```

### 获取历史

```typescript
const history = await conversation.getHistory()
```
```

---

## Phase 3: 侧边栏导航

### 任务 3.1: 创建 DocsSidebar 组件

**文件**: `web/src/pages/docs/DocsSidebar.tsx`

```typescript
import { ChevronRight, FileText } from 'lucide-react'

interface DocsSidebarProps {
  category?: 'user' | 'developer'
  page?: string
  index: DocIndex | null
}

export function DocsSidebar({ category, page, index }: DocsSidebarProps) {
  const navigate = useNavigate()

  if (!category || !index) {
    return <DefaultSidebar />
  }

  return (
    <aside className="docs-sidebar">
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
        <h2 className="font-semibold">{index.title}</h2>
      </div>
      <nav className="p-2">
        {index.pages.map((p) => (
          <button
            key={p.slug}
            onClick={() => navigate(`/docs/${category}/${p.slug}`)}
            className={`docs-nav-item w-full text-left ${
              page === p.slug ? 'active' : ''
            }`}
          >
            <FileText className="h-4 w-4 mr-2 inline" />
            {p.title}
          </button>
        ))}
      </nav>
    </aside>
  )
}
```

---

## Phase 4: 完善样式 + 文档内容

### 任务 4.1: 添加文档样式

```css
/* web/src/index.css 或组件内 */
.docs-content h1 { @apply text-2xl font-bold mb-4 mt-8 first:mt-0 }
.docs-content h2 { @apply text-xl font-semibold mb-3 mt-6 }
.docs-content h3 { @apply text-lg font-medium mb-2 }
.docs-content p { @apply mb-3 text-[15px] leading-relaxed }
.docs-content ul { @apply list-disc pl-5 mb-3 }
.docs-content code { @apply bg-muted px-1.5 py-0.5 rounded text-sm font-mono }
.docs-content pre { @apply bg-neutral-900 text-white p-4 rounded-lg overflow-x-auto mb-3 }
```

### 任务 4.2: 创建剩余文档

创建以下文档文件：
- `docs/user/workspace.md`
- `docs/user/conversation.md`
- `docs/user/sync.md`
- `docs/developer/architecture.md`
- `docs/developer/contributing.md`

---

## 文件清单

### 新建文件

| 文件 | 用途 |
|------|------|
| `web/src/pages/docs/DocsPage.tsx` | 文档页面主组件 |
| `web/src/pages/docs/DocsSidebar.tsx` | 侧边栏导航 |
| `web/src/components/layout/HelpMenuDropdown.tsx` | 帮助菜单 |
| `docs/user/_index.json` | 用户文档索引 |
| `docs/user/getting-started.md` | 快速入门文档 |
| `docs/user/*.md` | 其他用户文档 |
| `docs/developer/_index.json` | 开发者文档索引 |
| `docs/developer/api.md` | API 文档 |
| `docs/developer/*.md` | 其他开发者文档 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `web/src/App.tsx` | 添加 docs 路由类型和解析 |
| `web/src/components/layout/TopBar.tsx` | 添加帮助菜单入口 |

---

## 依赖关系

```
Phase 1 ──────┬────── Phase 2
              │
              ├────── Phase 3
              │
              └────── Phase 4
```

**无阻塞依赖**: Phase 1、2、3、4 可部分并行

---

## 验证清单

- [ ] 访问 `/docs` 显示文档首页
- [ ] 点击帮助菜单「用户文档」跳转 `/docs/user`
- [ ] 点击侧边栏目录加载对应文档
- [ ] Markdown 内容正确渲染
- [ ] 代码块有语法高亮
- [ ] 暗色主题正常显示
- [ ] URL 可直接分享
