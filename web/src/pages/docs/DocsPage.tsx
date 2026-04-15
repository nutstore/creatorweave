/**
 * DocsPage - Documentation viewer page
 *
 * Redesigned with editorial/magazine aesthetic:
 * - Strong typographic hierarchy
 * - Clean content-focused layout
 * - Generous whitespace and visual rhythm
 * - Smooth transitions and interactions
 */

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Menu, X, FileText, BookOpen, Code2, Github } from 'lucide-react'
import { MarkdownContent } from '@/components/agent/MarkdownContent'
import { BrandButton } from '@creatorweave/ui'
import { cn } from '@/lib/utils'

interface DocIndex {
  title: string
  pages: Array<{
    slug: string
    title: string
    file: string
    category?: string
  }>
}

interface DocsPageProps {
  category?: 'user' | 'developer'
  page?: string
  onBack?: () => void
}

const CATEGORY_ICONS = {
  user: BookOpen,
  developer: Code2,
} as const

const CATEGORY_LABELS = {
  user: '用户文档',
  developer: '开发者文档',
} as const

export function DocsPage({ category, page, onBack }: DocsPageProps) {
  const [index, setIndex] = useState<DocIndex | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Load doc index
  useEffect(() => {
    if (!category) {
      setIndex(null)
      return
    }
    fetch(`/docs/${category}/_index.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Index not found')
        return r.json()
      })
      .then(setIndex)
      .catch(() => {
        setIndex(null)
        setError('目录加载失败')
      })
  }, [category])

  // Load doc content
  useEffect(() => {
    if (!category || !page || !index) {
      setContent('')
      return
    }
    const pageEntry = index.pages.find((p) => p.slug === page)
    if (!pageEntry) {
      setContent('')
      setError('文档未找到')
      return
    }
    setLoading(true)
    setError(null)
    fetch(`/docs/${category}/${pageEntry.file}`)
      .then((r) => {
        if (!r.ok) throw new Error('Document not found')
        return r.text()
      })
      .then(setContent)
      .catch(() => {
        setContent('')
        setError('文档加载失败')
      })
      .finally(() => setLoading(false))
  }, [category, page, index])

  // Close mobile sidebar when navigating to a page
  useEffect(() => {
    if (page) {
      setMobileSidebarOpen(false)
    }
  }, [page])

  const navigateTo = useCallback((cat: 'user' | 'developer', slug?: string) => {
    const parts = ['docs', cat, slug].filter(Boolean)
    const path = '/' + parts.join('/')
    window.history.pushState(null, '', path)
    window.dispatchEvent(new CustomEvent('routechange'))
  }, [])

  const navigateToHome = useCallback(() => {
    window.history.pushState(null, '', '/docs')
    window.dispatchEvent(new CustomEvent('routechange'))
  }, [])

  const pages = index?.pages ?? []

  // Get current page info
  const currentPage = index?.pages.find((p) => p.slug === page)
  const CategoryIcon = category ? CATEGORY_ICONS[category] : null

  // ====== HOME PAGE ======
  if (!category) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[oklch(98%_0.005_60)] p-8 dark:bg-[oklch(12%_0.01_250)]">
        <div className="w-full max-w-3xl">
          {/* Header */}
          <header className="mb-16 text-center">
            <h1 className="mb-4 text-5xl font-bold tracking-tight text-[oklch(20%_0.03_60)] dark:text-[oklch(95%_0.01_60)]">
              文档中心
            </h1>
            <p className="text-lg text-[oklch(45%_0.02_60)] dark:text-[oklch(65%_0.01_60)]">
              选择文档类别开始探索
            </p>
          </header>

          {/* Category Cards */}
          <div className="grid gap-6 sm:grid-cols-2">
            {(['user', 'developer'] as const).map((cat) => {
              const Icon = CATEGORY_ICONS[cat]
              return (
                <button
                  key={cat}
                  onClick={() => navigateTo(cat)}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl p-8 text-left transition-all',
                    'border border-[oklch(88%_0.01_60)] bg-white shadow-sm',
                    'hover:border-[oklch(75%_0.05_60)] hover:shadow-md',
                    'dark:border-[oklch(25%_0.01_60)] dark:bg-[oklch(18%_0.01_250)]',
                    'dark:hover:border-[oklch(40%_0.02_250)]'
                  )}
                >
                  {/* Decorative accent */}
                  <div className="absolute left-0 top-0 h-1 w-full bg-[oklch(60%_0.12_175)] opacity-0 transition-opacity group-hover:opacity-100" />

                  <Icon className="mb-6 h-10 w-10 text-[oklch(60%_0.12_175)]" strokeWidth={1.5} />

                  <h2 className="mb-2 text-xl font-semibold text-[oklch(25%_0.02_60)] dark:text-[oklch(95%_0.01_60)]">
                    {CATEGORY_LABELS[cat]}
                  </h2>

                  <p className="text-sm text-[oklch(50%_0.015_60)] dark:text-[oklch(60%_0.01_60)]">
                    {cat === 'user'
                      ? '产品功能使用指南，快速上手'
                      : 'API 参考和技术架构文档'}
                  </p>

                  <ChevronRight className="absolute bottom-6 right-6 h-5 w-5 text-[oklch(70%_0.02_60)] transition-transform group-hover:translate-x-1" />
                </button>
              )
            })}
          </div>

          {/* GitHub Project Link */}
          <a
            href="https://github.com/nutstore/creatorweave"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'group relative mt-6 flex items-center gap-4 overflow-hidden rounded-2xl p-6 transition-all',
              'border border-[oklch(88%_0.01_60)] bg-white shadow-sm',
              'hover:border-[oklch(75%_0.05_60)] hover:shadow-md',
              'dark:border-[oklch(25%_0.01_60)] dark:bg-[oklch(18%_0.01_250)]',
              'dark:hover:border-[oklch(40%_0.02_250)]'
            )}
          >
            <Github className="h-8 w-8 text-[oklch(50%_0.02_60)]" strokeWidth={1.5} />
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-[oklch(50%_0.02_60)] dark:text-[oklch(55%_0.01_60)]">
                开源项目
              </p>
              <p className="font-semibold text-[oklch(25%_0.02_60)] dark:text-[oklch(95%_0.01_60)]">
                GitHub 源码
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-[oklch(70%_0.02_60)] transition-transform group-hover:translate-x-1" />
          </a>
        </div>
      </div>
    )
  }

  // ====== SIDEBAR ======
  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Sidebar Header */}
      <div className="shrink-0 border-b border-[oklch(88%_0.01_60)] px-6 py-5 dark:border-[oklch(25%_0.01_60)]">
        <button
          onClick={navigateToHome}
          className="flex items-center gap-3 text-left"
        >
          {CategoryIcon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[oklch(92%_0.03_175)] text-[oklch(60%_0.12_175)] dark:bg-[oklch(25%_0.02_175)]">
              <CategoryIcon className="h-5 w-5" strokeWidth={1.5} />
            </div>
          )}
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-[oklch(50%_0.02_60)] dark:text-[oklch(55%_0.01_60)]">
              {CATEGORY_LABELS[category]}
            </div>
            <div className="font-semibold text-[oklch(25%_0.02_60)] dark:text-[oklch(95%_0.01_60)]">
              {index?.title}
            </div>
          </div>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-6">
        {pages.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-[oklch(50%_0.02_60)] dark:text-[oklch(55%_0.01_60)]">
              目录
            </h3>
            <div className="space-y-1">
              {pages.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => navigateTo(category, p.slug)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all',
                    page === p.slug
                      ? 'bg-[oklch(94%_0.04_175)] font-medium text-[oklch(40%_0.08_175)] dark:bg-[oklch(25%_0.03_175)] dark:text-[oklch(80%_0.05_175)]'
                      : 'text-[oklch(45%_0.015_60)] hover:bg-[oklch(94%_0.01_60)] hover:text-[oklch(25%_0.02_60)] dark:text-[oklch(60%_0.01_60)] dark:hover:bg-[oklch(22%_0.01_60)] dark:hover:text-[oklch(90%_0.01_60)]'
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="truncate">{p.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Back to Home */}
      <div className="shrink-0 border-t border-[oklch(88%_0.01_60)] px-4 py-4 dark:border-[oklch(25%_0.01_60)]">
        <button
          onClick={navigateToHome}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[oklch(50%_0.015_60)] transition-colors hover:bg-[oklch(94%_0.01_60)] hover:text-[oklch(40%_0.02_60)] dark:text-[oklch(55%_0.01_60)] dark:hover:bg-[oklch(22%_0.01_60)] dark:hover:text-[oklch(90%_0.01_60)]"
        >
          <ChevronLeft className="h-4 w-4" />
          回到文档首页
        </button>
      </div>
    </div>
  )

  // ====== CATEGORY INDEX PAGE ======
  if (!page && index) {
    return (
      <div className="flex h-[100dvh] overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className={cn(
          'h-full w-72 shrink-0 border-r border-[oklch(88%_0.01_60)] bg-white dark:border-[oklch(25%_0.01_60)] dark:bg-[oklch(15%_0.01_250)]',
          'hidden lg:block'
        )}>
          <SidebarContent />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-[oklch(98%_0.005_60)] p-8 dark:bg-[oklch(12%_0.01_250)]">
          <div className="mx-auto max-w-2xl">
            {/* Mobile header */}
            <div className="mb-8 flex items-center gap-4 lg:hidden">
              <BrandButton
                variant="ghost"
                iconButton
                onClick={() => setMobileSidebarOpen(true)}
                className="h-10 w-10"
              >
                <Menu className="h-5 w-5" />
              </BrandButton>
              <h1 className="text-2xl font-bold text-[oklch(25%_0.02_60)] dark:text-[oklch(95%_0.01_60)]">
                {index.title}
              </h1>
            </div>

            {/* Desktop header */}
            <header className="mb-12 hidden lg:block">
              <h1 className="mb-3 text-4xl font-bold tracking-tight text-[oklch(20%_0.03_60)] dark:text-[oklch(95%_0.01_60)]">
                {index.title}
              </h1>
              <p className="text-lg text-[oklch(45%_0.02_60)] dark:text-[oklch(65%_0.01_60)]">
                选择一个文档开始阅读
              </p>
            </header>

            {/* Page List */}
            <div className="space-y-3">
              {pages.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => navigateTo(category, p.slug)}
                  className={cn(
                    'group flex w-full items-center justify-between rounded-xl border p-5 text-left transition-all',
                    'border-[oklch(88%_0.01_60)] bg-white',
                    'hover:border-[oklch(75%_0.05_60)] hover:shadow-sm',
                    'dark:border-[oklch(25%_0.01_60)] dark:bg-[oklch(18%_0.01_250)]',
                    'dark:hover:border-[oklch(40%_0.02_250)]'
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(94%_0.03_175)] text-[oklch(50%_0.08_175)] dark:bg-[oklch(25%_0.03_175)] dark:text-[oklch(70%_0.05_175)]">
                      <FileText className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <span className="font-medium text-[oklch(25%_0.02_60)] dark:text-[oklch(95%_0.01_60)]">
                      {p.title}
                    </span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-[oklch(70%_0.02_60)] transition-transform group-hover:translate-x-1" />
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* Mobile Sidebar Overlay */}
        {mobileSidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <aside className="fixed bottom-0 left-0 top-0 z-50 w-72 bg-white shadow-xl dark:bg-[oklch(15%_0.01_250)] lg:hidden">
              <div className="flex justify-end p-4">
                <BrandButton
                  variant="ghost"
                  iconButton
                  onClick={() => setMobileSidebarOpen(false)}
                  className="h-8 w-8"
                >
                  <X className="h-5 w-5" />
                </BrandButton>
              </div>
              <SidebarContent />
            </aside>
          </>
        )}
      </div>
    )
  }

  // ====== DOCUMENT CONTENT PAGE ======
  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={cn(
        'h-full w-72 shrink-0 border-r border-[oklch(88%_0.01_60)] bg-white dark:border-[oklch(25%_0.01_60)] dark:bg-[oklch(15%_0.01_250)]',
        sidebarOpen ? 'hidden lg:block' : 'hidden'
      )}>
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-10 border-b border-[oklch(88%_0.01_60)] bg-[oklch(98%_0.005_60)]/95 px-6 py-4 backdrop-blur-sm dark:border-[oklch(25%_0.01_60)] dark:bg-[oklch(12%_0.01_250)]/95">
          <div className="flex items-center gap-4">
            {/* Mobile menu */}
            <BrandButton
              variant="ghost"
              iconButton
              onClick={() => setMobileSidebarOpen(true)}
              className="h-9 w-9 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </BrandButton>

            {/* Desktop toggle */}
            <BrandButton
              variant="ghost"
              iconButton
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden h-9 w-9 lg:flex"
            >
              {sidebarOpen ? (
                <ChevronLeft className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </BrandButton>

            {/* Back button */}
            <BrandButton
              variant="ghost"
              iconButton
              onClick={onBack}
              className="h-9 w-9"
            >
              <ChevronLeft className="h-5 w-5" />
            </BrandButton>

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[oklch(50%_0.015_60)] dark:text-[oklch(55%_0.01_60)]">
                文档
              </span>
              <ChevronRight className="h-4 w-4 text-[oklch(80%_0.01_60)]" />
              <span className="text-[oklch(50%_0.015_60)] dark:text-[oklch(55%_0.01_60)]">
                {CATEGORY_LABELS[category]}
              </span>
              {currentPage && (
                <>
                  <ChevronRight className="h-4 w-4 text-[oklch(80%_0.01_60)]" />
                  <span className="font-medium text-[oklch(25%_0.02_60)] dark:text-[oklch(95%_0.01_60)]">
                    {currentPage.title}
                  </span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="bg-[oklch(98%_0.005_60)] px-8 py-12 dark:bg-[oklch(12%_0.01_250)]">
          {loading ? (
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="h-10 w-2/3 animate-pulse rounded-lg bg-[oklch(90%_0.01_60)] dark:bg-[oklch(22%_0.01_60)]" />
              <div className="h-4 w-full animate-pulse rounded bg-[oklch(90%_0.01_60)] dark:bg-[oklch(22%_0.01_60)]" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-[oklch(90%_0.01_60)] dark:bg-[oklch(22%_0.01_60)]" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-[oklch(90%_0.01_60)] dark:bg-[oklch(22%_0.01_60)]" />
            </div>
          ) : error ? (
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-4 text-[oklch(50%_0.05_25)] dark:text-[oklch(65%_0.05_25)]">
                {error}
              </p>
              <button
                onClick={() => navigateTo(category)}
                className="text-sm font-medium text-[oklch(60%_0.12_175)] hover:underline"
              >
                返回目录
              </button>
            </div>
          ) : content ? (
            <article className="docs-content mx-auto max-w-3xl">
              <MarkdownContent content={content} />
            </article>
          ) : null}
        </div>
      </main>

      {/* Mobile Sidebar */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="fixed bottom-0 left-0 top-0 z-50 w-72 bg-white shadow-xl dark:bg-[oklch(15%_0.01_250)] lg:hidden">
            <div className="flex justify-end p-4">
              <BrandButton
                variant="ghost"
                iconButton
                onClick={() => setMobileSidebarOpen(false)}
                className="h-8 w-8"
              >
                <X className="h-5 w-5" />
              </BrandButton>
            </div>
            <SidebarContent />
          </aside>
        </>
      )}
    </div>
  )
}
