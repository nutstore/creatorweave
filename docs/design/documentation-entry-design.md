# 文档入口 - 技术设计方案

**需求**: `/docs/requirements/documentation-entry-rfd.md`
**状态**: 设计完成

---

## 1. 路由设计

### 1.1 路由类型

```typescript
type AppRoute =
  | { kind: 'projectsHome' }
  | { kind: 'projectWorkspace'; projectId: string; workspaceId?: string }
  | { kind: 'legacyWorkspace' }
  | { kind: 'webcontainerPreview' }
  | { kind: 'filePreview'; path: string }
  | { kind: 'docs'; category?: 'user' | 'developer'; page?: string }  // 新增
  | { kind: 'unknown' }
```

### 1.2 URL 结构

| URL | 说明 |
|-----|------|
| `/docs` | 文档首页（展示两个分类入口） |
| `/docs/user` | 用户文档列表 |
| `/docs/user/getting-started` | 用户文档 - 快速入门 |
| `/docs/developer` | 开发者文档列表 |
| `/docs/developer/api` | 开发者文档 - API 参考 |

### 1.3 路由解析

```typescript
// resolveRoute() 新增
if (segments[0] === 'docs') {
  const category = segments[1] as 'user' | 'developer' | undefined
  const page = segments[2]
  return { kind: 'docs', category, page }
}
```

---

## 2. 页面布局

### 2.1 布局结构

```
┌─────────────────────────────────────────────────────────┐
│  TopBar                                                  │
│  [←返回] [项目名 / 工作区名]                    [帮助▼]... │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌─────────────────────────────────────┐  │
│  │ 侧边栏   │  │                                     │  │
│  │          │  │  文档内容区                          │  │
│  │ 用户文档  │  │                                     │  │
│  │  ├ 入门  │  │  # 快速入门                          │  │
│  │  ├ 工作区│  │                                     │  │
│  │  └ 同步  │  │  内容...                             │  │
│  │          │  │                                     │  │
│  │ 开发者文档│  │                                     │  │
│  │  ├ API  │  │                                     │  │
│  │  └ 架构  │  │                                     │  │
│  │          │  │                                     │  │
│  └──────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 组件结构

```
src/pages/docs/
├── DocsPage.tsx              # 主页面容器
├── DocsSidebar.tsx           # 侧边栏（目录导航）
├── DocsContent.tsx           # 内容区（Markdown 渲染）
└── DocsHome.tsx              # 文档首页（分类入口）

# 或整合为单个组件
src/pages/docs/
└── DocsPage.tsx              # 包含侧边栏 + 内容
```

---

## 3. 组件设计

### 3.1 DocsPage

```typescript
interface DocsPageProps {
  category?: 'user' | 'developer'
  page?: string  // 如 'getting-started', 'api'
}

function DocsPage({ category, page }: DocsPageProps) {
  // 1. 读取文档目录结构
  // 2. 根据 category/page 加载对应文档
  // 3. 渲染侧边栏 + 内容
}
```

### 3.2 DocsSidebar

```typescript
interface DocsSidebarProps {
  category?: 'user' | 'developer'
  currentPage: string
  onNavigate: (category: string, page: string) => void
}

function DocsSidebar({ category, currentPage, onNavigate }: DocsSidebarProps) {
  // 分类展示文档目录
  // 支持展开/折叠
  // 高亮当前页面
}
```

### 3.3 DocsContent

```typescript
interface DocsContentProps {
  content: string  // Markdown 内容
  title: string
}

function DocsContent({ content, title }: DocsContentProps) {
  // 使用 MarkdownContent 组件渲染
  // 支持代码高亮
  // 滚动到顶部（切换文档时）
}
```

---

## 4. TopBar 帮助菜单

### 4.1 TopBar 修改

```typescript
// TopBar.tsx 新增
import { HelpCircle } from 'lucide-react'

interface TopBarProps {
  // ... 现有 props
  onDocsOpen?: (category: 'user' | 'developer') => void
}

// 在右侧按钮区域添加
<ActionTooltip label={t('topbar.tooltips.help')}>
  <HelpMenuDropdown onOpenDocs={onDocsOpen} />
</ActionTooltip>
```

### 4.2 HelpMenuDropdown 组件

```typescript
// 新建: src/components/layout/HelpMenuDropdown.tsx

interface HelpMenuDropdownProps {
  onOpenDocs: (category: 'user' | 'developer') => void
}

function HelpMenuDropdown({ onOpenDocs }: HelpMenuDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BrandButton iconButton>
          <HelpCircle className="h-[14px] w-[14px]" />
        </BrandButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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

---

## 5. 数据流

### 5.1 文档加载

```typescript
// 文档文件位置
docs/
├── user/
│   ├── index.json      # 目录结构定义
│   ├── getting-started.md
│   └── ...
└── developer/
    ├── index.json
    ├── api.md
    └── ...

// 目录结构 (index.json)
{
  "title": "用户文档",
  "pages": [
    { "slug": "getting-started", "title": "快速入门", "file": "getting-started.md" },
    { "slug": "workspace", "title": "工作空间使用", "file": "workspace.md" }
  ]
}
```

### 5.2 文档获取

```typescript
async function loadDoc(category: string, page: string): Promise<string | null> {
  // 方案 A: 静态导入（构建时打包）
  // import gettingStarted from '@/docs/user/getting-started.md?raw'

  // 方案 B: 动态 fetch（支持热更新）
  const base = import.meta.env.BASE_URL
  const path = `/docs/${category}/${page}.md`
  const res = await fetch(new URL(path, base))
  if (!res.ok) return null
  return res.text()
}
```

---

## 6. App.tsx 集成

### 6.1 新增路由解析

```typescript
type AppRoute =
  | { kind: 'projectsHome' }
  // ... 现有
  | { kind: 'docs'; category?: 'user' | 'developer'; page?: string }
  | { kind: 'unknown' }

function resolveRoute(pathname: string): AppRoute {
  // ... 现有逻辑

  if (segments[0] === 'docs') {
    return {
      kind: 'docs',
      category: segments[1] as 'user' | 'developer' | undefined,
      page: segments[2],
    }
  }
}
```

### 6.2 路由渲染

```typescript
// App.tsx
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

---

## 7. 文档文件放置

### 7.1 Public 目录方案（推荐）

```
web/
├── public/
│   └── docs/
│       ├── user/
│       │   ├── _index.json
│       │   ├── getting-started.md
│       │   └── workspace.md
│       └── developer/
│           ├── _index.json
│           └── api.md
└── src/
    └── pages/
        └── docs/
            └── DocsPage.tsx
```

**优点**:
- 可通过 `fetch('/docs/...')` 直接加载
- 文档更新无需重新构建
- Vite 会直接 serve 静态文件

### 7.2 替代方案：src 内联

```
src/
├── docs/
│   ├── user/
│   │   └── getting-started.md
│   └── developer/
│       └── api.md
└── pages/
    └── docs/
        └── DocsPage.tsx
```

使用 `import.meta.glob('@/docs/**/*.md', { as: 'raw' })` 导入。

**优点**: 构建时打包，一致性好
**缺点**: 更新文档需重新构建

---

## 8. 样式适配

### 8.1 文档样式

```css
/* 文档内容区样式 */
.docs-content {
  @apply prose prose-neutral dark:prose-invert max-w-none;
}

.docs-content h1 { @apply text-2xl font-bold mb-4 }
.docs-content h2 { @apply text-xl font-semibold mb-3 }
.docs-content h3 { @apply text-lg font-medium mb-2 }
.docs-content p { @apply mb-3 text-[15px] leading-relaxed }
.docs-content code { @apply bg-muted px-1.5 py-0.5 rounded text-sm }
.docs-content pre { @apply bg-neutral-900 text-white p-4 rounded-lg overflow-x-auto }
```

### 8.2 侧边栏样式

```css
/* 侧边栏 */
.docs-sidebar {
  @apply w-64 shrink-0 border-r border-neutral-200 dark:border-neutral-800 overflow-y-auto;
}

.docs-nav-item {
  @apply flex items-center px-3 py-2 text-sm rounded-md transition-colors;
  @apply hover:bg-muted text-secondary;
}

.docs-nav-item.active {
  @apply bg-primary/10 text-primary font-medium;
}
```

---

## 9. 实施计划

### Phase 1: 基础结构
- [ ] 创建 `DocsPage` 组件
- [ ] 创建 `HelpMenuDropdown` 组件
- [ ] 添加 `/docs` 路由解析
- [ ] 在 App.tsx 集成文档路由

### Phase 2: 内容渲染
- [ ] 创建 Markdown 渲染组件（可复用 MarkdownContent）
- [ ] 实现文档加载逻辑
- [ ] 添加目录索引结构

### Phase 3: 完善功能
- [ ] 侧边栏导航（目录树）
- [ ] 展开/折叠功能
- [ ] 暗色主题适配
- [ ] 键盘导航支持

### Phase 4: 内容填充
- [ ] 创建用户文档目录结构
- [ ] 编写用户文档内容
- [ ] 编写开发者文档内容

---

## 10. 文件清单

```
web/src/
├── components/
│   └── layout/
│       └── HelpMenuDropdown.tsx     # [新建]
├── pages/
│   └── docs/
│       ├── DocsPage.tsx            # [新建]
│       ├── DocsSidebar.tsx          # [新建] (可选合并)
│       └── DocsContent.tsx         # [新建] (可选合并)
├── App.tsx                         # [修改] 添加 docs 路由
├── app/
│   └── route-sync.ts               # [修改] resolveRoute

docs/                                # [新建/维护源目录]
├── user/
│   ├── _index.json
│   └── getting-started.md
└── developer/
    ├── _index.json
    └── api.md

注：`web/public/docs/` 为构建时同步产物，不作为手工维护目录。
```
