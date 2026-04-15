import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDistanceToNow, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns'
import { zhCN, enUS, ja, ko } from 'date-fns/locale'
import type { Locale as DateFnsLocale } from 'date-fns'
import type { Project, ProjectStats } from '@/sqlite/repositories/project.repository'
import { ActivityHeatmap } from '@/components/activity/ActivityHeatmap'
import {
  BrandButton,
  BrandCheckbox,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandInput,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@creatorweave/ui'
import {
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Pencil,
  Trash2,
  Plus,
  ArrowRight,
  Clock,
  FolderOpen,
  Sparkles,
  Shield,
  RotateCcw,
  Palette,
  Sun,
  Moon,
  Globe,
  FileText,
  RefreshCw,
  Github,
} from 'lucide-react'
import { useTheme, ACCENT_COLORS, type AccentColor } from '@/store/theme.store'
import { useT, useLocale, LOCALE_LABELS, type Locale } from '@/i18n'

// Design system styles
const designStyles = `
  /* 字体 - 使用独特的字体组合 */

  :root {
    --home-serif: 'Fraunces', 'Noto Serif SC', Georgia, serif;
    --home-sans: system-ui, -apple-system, 'PingFang SC', 'Noto Sans SC', sans-serif;
  }

  /* 入场动画 */
  @keyframes revealUp {
    from {
      opacity: 0;
      transform: translateY(24px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes revealScale {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes subtleFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
    80% { transform: translateY(-1px); }
  }

  @keyframes grain {
    0%, 100% { transform: translate(0, 0); }
    10% { transform: translate(-1%, -1%); }
    20% { transform: translate(1%, 1%); }
    30% { transform: translate(-0.5%, 0.5%); }
    40% { transform: translate(0.5%, -0.5%); }
    50% { transform: translate(-1%, 0.5%); }
    60% { transform: translate(0.5%, 1%); }
    70% { transform: translate(-0.5%, -1%); }
    80% { transform: translate(1%, -0.5%); }
    90% { transform: translate(-1%, 1%); }
  }

  @keyframes pulseGlow {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
  }

  .home-reveal {
    animation: revealUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    opacity: 0;
  }

  .home-reveal-scale {
    animation: revealScale 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    opacity: 0;
  }

  .home-delay-1 { animation-delay: 0.1s; }
  .home-delay-2 { animation-delay: 0.2s; }
  .home-delay-3 { animation-delay: 0.3s; }
  .home-delay-4 { animation-delay: 0.4s; }
  .home-delay-5 { animation-delay: 0.5s; }
  .home-delay-6 { animation-delay: 0.6s; }

  /* 减少动画偏好 */
  @media (prefers-reduced-motion: reduce) {
    .home-reveal,
    .home-reveal-scale {
      animation: none;
      opacity: 1;
    }
    .home-float,
    .home-grain::before {
      animation: none;
    }
  }

  /* Hero 背景 */
  .home-hero-bg {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .home-hero-bg::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -20%;
    width: 80%;
    height: 150%;
    background: radial-gradient(
      ellipse at center,
      oklch(var(--primary) / 0.08) 0%,
      transparent 70%
    );
    animation: pulseGlow 8s ease-in-out infinite;
  }

  .home-hero-bg::after {
    content: '';
    position: absolute;
    bottom: -30%;
    left: -10%;
    width: 50%;
    height: 80%;
    background: radial-gradient(
      ellipse at center,
      oklch(220 0.15 0.5 / 0.05) 0%,
      transparent 60%
    );
  }

  /* 纹理叠加 */
  .home-grain::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    opacity: 0.02;
    pointer-events: none;
    animation: grain 20s steps(10) infinite;
  }

  /* 排版 */
  .home-title-serif {
    font-family: var(--home-serif);
    font-weight: 500;
    font-optical-sizing: auto;
    letter-spacing: -0.02em;
  }

  .home-title-sans {
    font-family: var(--home-sans);
    font-weight: 600;
    letter-spacing: -0.03em;
  }

  .home-body {
    font-family: var(--home-sans);
    letter-spacing: 0.01em;
  }

  .home-mono {
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 0.85em;
    letter-spacing: 0.02em;
  }

  /* 项目时间线 */
  .home-timeline {
    position: relative;
  }

  .home-timeline::before {
    content: '';
    position: absolute;
    left: 11px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: linear-gradient(
      to bottom,
      transparent,
      hsl(var(--border)) 10%,
      hsl(var(--border)) 90%,
      transparent
    );
  }

  .home-timeline-item {
    position: relative;
    padding-left: 36px;
    transition: transform 0.2s ease;
  }

  .home-timeline-item::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: hsl(var(--background));
    border: 2px solid hsl(var(--border));
    transition: all 0.2s ease;
  }

  .home-timeline-item:hover::before {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary-50));
  }

  .home-timeline-item.is-active::before {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary));
  }

  .home-timeline-item.is-archived {
    opacity: 0.5;
  }

  .home-timeline-item.is-archived::before {
    border-style: dashed;
  }

  /* 快捷操作卡片 */
  .home-action-card {
    position: relative;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .home-action-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      oklch(var(--primary) / 0.05) 0%,
      transparent 50%
    );
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .home-action-card:hover::before {
    opacity: 1;
  }

  .home-action-card:hover {
    transform: translateY(-2px);
    border-color: hsl(var(--primary) / 0.3);
  }

  /* 搜索框 */
  .home-search-input {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    transition: all 0.2s ease;
  }

  .home-search-input:focus {
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px oklch(var(--primary) / 0.1);
    outline: none;
  }

  /* 空状态 */
  .home-empty-state {
    position: relative;
  }

  .home-empty-state::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 50% 50%,
      oklch(var(--primary) / 0.03) 0%,
      transparent 50%
    );
    pointer-events: none;
  }
`

// Get date-fns locale
const getDateFnsLocale = (locale: string): DateFnsLocale => {
  const localeMap: Record<string, DateFnsLocale> = {
    'zh-CN': zhCN,
    'en-US': enUS,
    'ja-JP': ja,
    'ko-KR': ko,
  }
  return localeMap[locale] || zhCN
}

// Format relative time - needs to be used inside component
const formatRelativeTimeWithLocale = (date: number | Date, locale: DateFnsLocale) => {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale })
}

// Time grouping
type TimeGroup = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older'

const getTimeGroup = (date: number | Date): TimeGroup => {
  const d = new Date(date)
  if (isToday(d)) return 'today'
  if (isYesterday(d)) return 'thisWeek'
  if (isThisWeek(d)) return 'thisWeek'
  if (isThisMonth(d)) return 'thisMonth'
  return 'older'
}

const timeGroupOrder: TimeGroup[] = ['today', 'thisWeek', 'thisMonth', 'older']

interface ProjectHomeProps {
  projects: Project[]
  projectStats?: Record<string, ProjectStats>
  activeProjectId: string
  isLoading?: boolean
  onOpenProject: (projectId: string) => void | Promise<void>
  onCreateProject: (name: string) => void | Promise<void>
  onRenameProject: (projectId: string, name: string) => void | Promise<void>
  onArchiveProject: (projectId: string, archived: boolean) => void | Promise<void>
  onDeleteProject: (projectId: string) => void | Promise<void>
  onClearLocalData: () => void | Promise<void>
  onOpenDocs?: () => void | Promise<void>
  isClearingLocalData?: boolean
}

const SKIP_ARCHIVE_CONFIRM_KEY = 'project-home:skip-archive-confirm'

export function ProjectHome({
  projects,
  projectStats = {},
  activeProjectId,
  isLoading = false,
  onOpenProject,
  onCreateProject,
  onRenameProject,
  onArchiveProject,
  onDeleteProject,
  onClearLocalData,
  onOpenDocs,
  isClearingLocalData = false,
}: ProjectHomeProps) {
  // Theme
  const { mode: themeMode, setTheme, accentColor, setAccentColor } = useTheme()
  const currentAccentColor = accentColor || 'teal'

  // I18n
  const t = useT()
  const [locale, setLocale] = useLocale()
  const dateFnsLocale = getDateFnsLocale(locale)

  // Format relative time
  const formatRelativeTime = (date: number | Date) => {
    return formatRelativeTimeWithLocale(date, dateFnsLocale)
  }

  const getProjectActivityAt = useCallback(
    (project: Project) => {
      const workspaceActivityAt = projectStats[project.id]?.lastWorkspaceAccessAt || 0
      return Math.max(project.updatedAt, workspaceActivityAt)
    },
    [projectStats]
  )

  // Time group labels
  const getTimeGroupLabels = (): Record<TimeGroup, string> => ({
    today: t('projectHome.timeline.today'),
    yesterday: t('projectHome.timeline.yesterday'),
    thisWeek: t('projectHome.timeline.thisWeek'),
    thisMonth: t('projectHome.timeline.thisMonth'),
    older: t('projectHome.timeline.older'),
  })
  const timeGroupLabels = getTimeGroupLabels()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all')
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createDialogName, setCreateDialogName] = useState('')
  const [isComposition, setIsComposition] = useState(false)
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [archivingProject, setArchivingProject] = useState<Project | null>(null)
  const [skipArchiveConfirm, setSkipArchiveConfirm] = useState(false)
  const [archiveDontAskAgain, setArchiveDontAskAgain] = useState(false)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isActionSubmitting, setIsActionSubmitting] = useState(false)
  const [pendingProjectAction, setPendingProjectAction] = useState<{
    projectId: string
    type: 'rename' | 'archive' | 'unarchive' | 'delete'
  } | null>(null)
  const [showClearDataDialog, setShowClearDataDialog] = useState(false)
  const [clearDataConfirmText, setClearDataConfirmText] = useState('')
  const [isClearingCache, setIsClearingCache] = useState(false)

  const createInputRef = useRef<HTMLInputElement>(null)

  // Confirm text for clearing local data (needs to match translated placeholder)
  const startFreshConfirmText = t('projectHome.dialogs.startFreshConfirmPlaceholder')

  // Clear local data confirmation
  const handleClearDataConfirm = async () => {
    if (clearDataConfirmText !== startFreshConfirmText) return
    setIsActionSubmitting(true)
    try {
      await onClearLocalData()
      setShowClearDataDialog(false)
      setClearDataConfirmText('')
    } finally {
      setIsActionSubmitting(false)
    }
  }

  // Clear Service Worker cache and reload
  const handleClearCache = async () => {
    if (!navigator.serviceWorker.controller) return
    setIsClearingCache(true)
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' })
    // Wait a bit for SW to process, then reload
    await new Promise((resolve) => setTimeout(resolve, 200))
    window.location.reload()
  }

  const openCreateDialog = useCallback(() => {
    if (isLoading || isCreating) return
    setShowCreateDialog(true)
    window.setTimeout(() => createInputRef.current?.focus(), 80)
  }, [isCreating, isLoading])

  // Projects grouped by time
  const groupedProjects = useMemo(() => {
    let filtered = [...projects]

    // Apply status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter((p) => p.status !== 'archived')
    } else if (statusFilter === 'archived') {
      filtered = filtered.filter((p) => p.status === 'archived')
    }

    // Sort by project activity time
    const sorted = filtered.sort((a, b) => getProjectActivityAt(b) - getProjectActivityAt(a))

    // Apply search
    const keyword = search.trim().toLowerCase()
    const searched = keyword ? sorted.filter((p) => p.name.toLowerCase().includes(keyword)) : sorted

    // Group by time
    const groups: Record<TimeGroup, Project[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      thisMonth: [],
      older: [],
    }

    searched.forEach((project) => {
      const group = getTimeGroup(getProjectActivityAt(project))
      groups[group].push(project)
    })

    return groups
  }, [getProjectActivityAt, projects, search, statusFilter])

  // Recent project
  const recentProject = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'archived')
    return active.sort((a, b) => getProjectActivityAt(b) - getProjectActivityAt(a))[0] || null
  }, [getProjectActivityAt, projects])

  // Project stats
  const totalProjects = projects.filter((p) => p.status !== 'archived').length
  const totalWorkspaces = Object.values(projectStats).reduce(
    (sum, stats) => sum + (stats?.workspaceCount || 0),
    0
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(SKIP_ARCHIVE_CONFIRM_KEY)
    setSkipArchiveConfirm(saved === '1')
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (showCreateDialog) return

      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return
        }
      }

      event.preventDefault()
      openCreateDialog()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCreateDialog, openCreateDialog])

  // Submit from create dialog
  const handleCreateFromDialog = async () => {
    const name = createDialogName.trim()
    if (!name) return
    setIsCreating(true)
    try {
      await onCreateProject(name)
      setCreateDialogName('')
      setShowCreateDialog(false)
    } finally {
      setIsCreating(false)
    }
  }

  const handleRenameOpen = (project: Project) => {
    setRenamingProjectId(project.id)
    setRenameDraft(project.name)
  }

  const handleRenameConfirm = async () => {
    if (!renamingProjectId || !renameDraft.trim()) return
    setIsActionSubmitting(true)
    setPendingProjectAction({ projectId: renamingProjectId, type: 'rename' })
    try {
      await onRenameProject(renamingProjectId, renameDraft.trim())
      setRenamingProjectId(null)
      setRenameDraft('')
    } finally {
      setIsActionSubmitting(false)
      setPendingProjectAction(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deletingProject) return
    if (deleteConfirmText !== deletingProject.name) return
    setIsActionSubmitting(true)
    setPendingProjectAction({ projectId: deletingProject.id, type: 'delete' })
    try {
      await onDeleteProject(deletingProject.id)
      setDeletingProject(null)
      setDeleteConfirmText('')
    } finally {
      setIsActionSubmitting(false)
      setPendingProjectAction(null)
    }
  }

  const handleArchiveClick = async (project: Project, isArchived: boolean) => {
    if (isArchived) {
      setPendingProjectAction({ projectId: project.id, type: 'unarchive' })
      try {
        await onArchiveProject(project.id, false)
      } finally {
        setPendingProjectAction(null)
      }
      return
    }

    if (skipArchiveConfirm) {
      setPendingProjectAction({ projectId: project.id, type: 'archive' })
      try {
        await onArchiveProject(project.id, true)
      } finally {
        setPendingProjectAction(null)
      }
      return
    }

    setArchiveDontAskAgain(false)
    setArchivingProject(project)
  }

  const handleArchiveConfirm = async () => {
    if (!archivingProject) return
    setIsActionSubmitting(true)
    setPendingProjectAction({ projectId: archivingProject.id, type: 'archive' })
    try {
      await onArchiveProject(archivingProject.id, true)
      if (archiveDontAskAgain && typeof window !== 'undefined') {
        window.localStorage.setItem(SKIP_ARCHIVE_CONFIRM_KEY, '1')
        setSkipArchiveConfirm(true)
      }
      setArchivingProject(null)
    } finally {
      setIsActionSubmitting(false)
      setPendingProjectAction(null)
    }
  }

  // Render project timeline item
  const renderProjectItem = (project: Project, index: number) => {
    const isActive = project.id === activeProjectId
    const stats = projectStats[project.id]
    const isArchived = project.status === 'archived'
    const isProjectActionPending = pendingProjectAction?.projectId === project.id
    const activityAt = getProjectActivityAt(project)

    return (
      <div
        key={project.id}
        className={`home-timeline-item py-4 home-reveal ${isActive ? 'is-active' : ''} ${isArchived ? 'is-archived' : ''}`}
        style={{ animationDelay: `${Math.min(index * 0.05, 0.3)}s` }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="home-title-sans text-base text-primary dark:text-primary-foreground truncate">
                {project.name}
              </h3>
              {isArchived && (
                <span className="home-mono text-[10px] uppercase tracking-wider text-tertiary dark:text-muted px-1.5 py-0.5 rounded bg-muted dark:bg-muted">
                  {t('projectHome.project.archived')}
                </span>
              )}
            </div>
            <div className="home-body flex items-center gap-3 text-xs text-tertiary dark:text-muted">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(activityAt)}
              </span>
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3 h-3" />
                {t('projectHome.project.workspaceCount', { count: stats?.workspaceCount || 0 })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <BrandButton
              onClick={() => void onOpenProject(project.id)}
              variant="ghost"
              disabled={isLoading || isActionSubmitting}
              className="home-body text-xs"
            >
              {t('projectHome.project.open')}
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </BrandButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BrandButton
                  variant="ghost"
                  iconButton
                  disabled={isProjectActionPending || isActionSubmitting}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </BrandButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem
                  onSelect={() => handleRenameOpen(project)}
                  disabled={isProjectActionPending || isActionSubmitting}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {isProjectActionPending && pendingProjectAction?.type === 'rename'
                    ? t('common.processing')
                    : t('projectHome.project.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void handleArchiveClick(project, isArchived)}
                  disabled={isProjectActionPending || isActionSubmitting}
                >
                  {isArchived ? (
                    <>
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                      {t('projectHome.project.unarchive')}
                    </>
                  ) : (
                    <>
                      <Archive className="mr-2 h-4 w-4" />
                      {t('projectHome.project.archive')}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setDeletingProject(project)
                    setDeleteConfirmText('')
                  }}
                  disabled={isProjectActionPending || isActionSubmitting}
                  className="text-danger focus:text-danger"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('projectHome.project.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-background home-grain">
      <style>{designStyles}</style>

      {/* Hero 区域 */}
      <header className="relative overflow-hidden">
        <div className="home-hero-bg" />
        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-8 pb-8 sm:pt-10 sm:pb-10">
          <div className="home-reveal">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-50 border border-primary/10 dark:border-primary/20">
                <Shield className="w-3.5 h-3.5 text-primary-600 dark:text-primary-600" />
                <span className="home-body text-xs text-primary-600 dark:text-primary-600 font-medium">
                  {t('projectHome.hero.badge')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <BrandButton
                  variant="outline"
                  className="h-9 px-3 text-xs"
                  onClick={() => {
                    void onOpenDocs?.()
                  }}
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  {t('projectHome.hero.docsHub')}
                </BrandButton>
                <a
                  href="https://github.com/nutstore/creatorweave"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-xs rounded-md border border-border bg-card hover:bg-muted/50 transition-colors text-secondary dark:text-secondary-foreground"
                >
                  <Github className="w-3.5 h-3.5" />
                  GitHub
                </a>
              </div>
            </div>
          </div>

          <h1 className="home-title-serif home-reveal home-delay-1">
            <span className="block text-4xl sm:text-5xl lg:text-6xl text-primary dark:text-primary-foreground leading-tight">
              {t('projectHome.hero.title')}
            </span>
          </h1>

          <p className="home-body home-reveal home-delay-2 mt-4 text-lg sm:text-xl text-secondary dark:text-secondary-foreground max-w-xl leading-relaxed">
            {t('projectHome.hero.description')}
            <span className="text-tertiary dark:text-muted">{t('projectHome.hero.descriptionSuffix')}</span>
          </p>

          {/* 快捷统计 */}
          <div className="home-reveal home-delay-3 mt-8 flex items-center gap-6">
            <div className="home-mono text-sm">
              <span className="text-primary dark:text-primary-foreground font-medium">{totalProjects}</span>
              <span className="text-tertiary dark:text-muted ml-1">{t('projectHome.hero.projectCount', { count: '' }).trim()}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="home-mono text-sm">
              <span className="text-primary dark:text-primary-foreground font-medium">{totalWorkspaces}</span>
              <span className="text-tertiary dark:text-muted ml-1">{t('projectHome.hero.workspaceCount', { count: '' }).trim()}</span>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* 左侧：快捷操作 */}
          <aside className="lg:col-span-4 space-y-4">
            {/* 继续工作 */}
            {recentProject && (
              <div className="home-reveal home-delay-3 home-action-card rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-primary-600 dark:text-primary-600" />
                  <span className="home-mono text-xs uppercase tracking-wider text-tertiary dark:text-muted">
                    {t('projectHome.sidebar.continueWork')}
                  </span>
                </div>
                <h3 className="home-title-sans text-base text-primary dark:text-primary-foreground mb-1 truncate">
                  {recentProject.name}
                </h3>
                <p className="home-body text-xs text-tertiary dark:text-muted mb-4">
                  {formatRelativeTime(getProjectActivityAt(recentProject))}
                </p>
                <BrandButton
                  onClick={() => void onOpenProject(recentProject.id)}
                  variant="primary"
                  className="w-full"
                  disabled={isLoading}
                >
                  {t('projectHome.sidebar.continueWork')}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </BrandButton>
              </div>
            )}

            {/* 创建新项目 */}
            <div
              className="home-reveal home-delay-4 home-action-card rounded-xl border border-border bg-card p-5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              role="button"
              tabIndex={0}
              aria-label={t('projectHome.dialogs.createProject')}
              onClick={openCreateDialog}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openCreateDialog()
                }
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Plus className="w-4 h-4 text-primary-600 dark:text-primary-600" />
                <span className="home-mono text-xs uppercase tracking-wider text-tertiary dark:text-muted">
                  {t('projectHome.sidebar.createNew')}
                </span>
              </div>
              <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
                {t('projectHome.sidebar.createNewDescription')}
              </p>
              <p className="home-mono text-[11px] text-tertiary dark:text-muted mb-3">{t('projectHome.sidebar.shortcutHint')}</p>
              <BrandButton
                variant="outline"
                className="w-full"
                onClick={(event) => {
                  event.stopPropagation()
                  openCreateDialog()
                }}
                disabled={isLoading || isCreating}
              >
                {t('projectHome.sidebar.createProject')}
              </BrandButton>
            </div>

            {/* 重新开始 */}
            <div className="home-reveal home-delay-5 rounded-xl border border-border/60 bg-card/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw className="w-4 h-4 text-tertiary" />
                <span className="home-mono text-xs uppercase tracking-wider text-tertiary">
                  {t('projectHome.sidebar.startFresh')}
                </span>
              </div>
              <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
                {t('projectHome.sidebar.startFreshDescription')}
              </p>
              <BrandButton
                variant="ghost"
                className="w-full text-tertiary hover:text-danger hover:border-danger/50"
                onClick={() => setShowClearDataDialog(true)}
                disabled={isClearingLocalData || isLoading}
              >
                {isClearingLocalData ? t('projectHome.sidebar.resetting') : t('projectHome.sidebar.resetApp')}
              </BrandButton>
            </div>

            {/* 外观设置 */}
            <div className="home-reveal home-delay-6 rounded-xl border border-border/60 bg-card/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Palette className="w-4 h-4 text-tertiary" />
                <span className="home-mono text-xs uppercase tracking-wider text-tertiary">
                  {t('projectHome.sidebar.appearance')}
                </span>
              </div>

              {/* 主题模式切换 */}
              <div className="mb-4">
                <p className="home-body text-xs text-tertiary dark:text-muted mb-2">{t('projectHome.theme.modeTitle')}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all ${
                      themeMode === 'light'
                        ? 'bg-primary-50 dark:bg-primary-50 text-primary-600 dark:text-primary-600 border border-primary/20'
                        : 'bg-muted/30 dark:bg-muted/30 text-tertiary dark:text-muted hover:bg-muted/50'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>{t('projectHome.theme.light')}</span>
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all ${
                      themeMode === 'dark'
                        ? 'bg-primary-50 dark:bg-primary-50 text-primary-600 dark:text-primary-600 border border-primary/20'
                        : 'bg-muted/30 dark:bg-muted/30 text-tertiary dark:text-muted hover:bg-muted/50'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>{t('projectHome.theme.dark')}</span>
                  </button>
                </div>
              </div>

              {/* 语言选择 */}
              <div className="mb-4">
                <p className="home-body text-xs text-tertiary dark:text-muted mb-2">{t('projectHome.theme.languageTitle')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['zh-CN', 'en-US', 'ja-JP', 'ko-KR'] as Locale[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLocale(lang)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all ${
                        locale === lang
                          ? 'bg-primary-50 dark:bg-primary-50 text-primary-600 dark:text-primary-600 border border-primary/20'
                          : 'bg-muted/30 dark:bg-muted/30 text-tertiary dark:text-muted hover:bg-muted/50'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>{LOCALE_LABELS[lang]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 主题色选择 */}
              <div>
                <p className="home-body text-xs text-tertiary dark:text-muted mb-2">{t('projectHome.theme.accentColorTitle')}</p>
                <div className="grid grid-cols-6 gap-2">
                  {(Object.keys(ACCENT_COLORS) as AccentColor[]).map((color) => {
                    const config = ACCENT_COLORS[color]
                    const isSelected = currentAccentColor === color
                    const colorName = t(`projectHome.accentColors.${color}`)
                    return (
                      <button
                        key={color}
                        onClick={() => setAccentColor(color)}
                        className={`w-full aspect-square rounded-lg transition-all ${
                          isSelected
                            ? 'ring-2 ring-offset-2 ring-offset-background'
                            : 'hover:scale-110'
                        }`}
                        style={{
                          backgroundColor: `hsl(${config.hue}, ${config.saturation}%, ${config.lightness}%)`,
                          ['--tw-ring-color' as string]: `hsl(${config.hue}, ${config.saturation}%, ${config.lightness}%)`,
                        }}
                        title={colorName}
                        aria-label={colorName}
                      />
                    )
                  })}
                </div>
              </div>
</div>

            {/* 清除缓存 */}
            <div className="home-reveal home-delay-6 rounded-xl border border-border/60 bg-card/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw className="w-4 h-4 text-tertiary" />
                <span className="home-mono text-xs uppercase tracking-wider text-tertiary">
                  {t('projectHome.sidebar.cache')}
                </span>
              </div>
              <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
                {t('projectHome.sidebar.cacheDescription')}
              </p>
              <BrandButton
                variant="ghost"
                className="w-full text-tertiary hover:text-primary hover:border-primary/50"
                onClick={() => void handleClearCache()}
                disabled={isClearingCache}
              >
                {isClearingCache ? t('projectHome.sidebar.clearing') : t('projectHome.sidebar.clearCache')}
              </BrandButton>
            </div>
          </aside>

          {/* Right: Activity heatmap + Project list */}
          <section className="lg:col-span-8 space-y-6">
            {/* Activity Heatmap */}
            <ActivityHeatmap />
            {/* Search and filter */}
            <div className="home-reveal home-delay-4 flex flex-col sm:flex-row gap-3 mb-6">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('projectHome.filters.searchPlaceholder')}
                className="home-search-input home-body flex-1 h-10 px-4 rounded-lg text-sm"
              />
              <div className="flex rounded-lg border border-border p-1 bg-muted/30 dark:bg-muted/30">
                {(['all', 'active', 'archived'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`home-body px-3 py-1.5 text-xs rounded-md transition-all ${
                      statusFilter === filter
                        ? 'bg-card dark:bg-card text-primary dark:text-primary-foreground shadow-sm'
                        : 'text-tertiary dark:text-muted hover:text-secondary dark:hover:text-secondary-foreground'
                    }`}
                  >
                    {t(`projectHome.filters.${filter}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Project timeline */}
            <div className="home-timeline">
              {timeGroupOrder.map((group) => {
                const groupProjects = groupedProjects[group]
                if (groupProjects.length === 0) return null

                return (
                  <div key={group} className="mb-8 last:mb-0">
                    <h2 className="home-reveal home-delay-5 home-mono text-[11px] uppercase tracking-widest text-tertiary dark:text-muted mb-4 pl-9">
                      {timeGroupLabels[group]}
                    </h2>
                    <div className="divide-y divide-border/50">
                      {groupProjects.map((project, index) => renderProjectItem(project, index))}
                    </div>
                  </div>
                )
              })}

              {/* Empty state */}
              {timeGroupOrder.every((g) => groupedProjects[g].length === 0) && (
                <div className="home-reveal home-delay-5 home-empty-state rounded-xl border border-dashed border-border py-16 text-center">
                  <div className="relative z-10">
                    <p className="home-body text-secondary dark:text-secondary-foreground mb-4">
                      {search ? t('projectHome.empty.noResults') : t('projectHome.empty.noProjects')}
                    </p>
                    {!search && projects.length === 0 && (
                      <BrandButton
                        variant="primary"
                        onClick={openCreateDialog}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('projectHome.empty.createFirst')}
                      </BrandButton>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Dialogs */}
      <BrandDialog
        open={!!renamingProjectId}
        onOpenChange={(open) => {
          if (!open && !isActionSubmitting) {
            setRenamingProjectId(null)
          }
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('projectHome.dialogs.renameProject')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <BrandInput
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              placeholder={t('projectHome.dialogs.renamePlaceholder')}
              disabled={isActionSubmitting}
            />
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setRenamingProjectId(null)}
              disabled={isActionSubmitting}
            >
              {t('common.cancel')}
            </BrandButton>
            <BrandButton
              onClick={() => void handleRenameConfirm()}
              disabled={isActionSubmitting || !renameDraft.trim()}
            >
              {isActionSubmitting ? t('common.processing') : t('common.save')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      <BrandDialog
        open={!!archivingProject}
        onOpenChange={(open) => {
          if (!open && !isActionSubmitting) {
            setArchivingProject(null)
          }
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('projectHome.dialogs.archiveProject')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="home-body text-sm text-secondary dark:text-secondary-foreground">
              {t('projectHome.dialogs.archiveConfirm', { name: archivingProject?.name || '' })}
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-secondary dark:text-secondary-foreground">
              <BrandCheckbox
                checked={archiveDontAskAgain}
                onCheckedChange={(checked) => setArchiveDontAskAgain(Boolean(checked))}
                disabled={isActionSubmitting}
              />
              <span>{t('projectHome.dialogs.dontAskAgain')}</span>
            </label>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setArchivingProject(null)}
              disabled={isActionSubmitting}
            >
              {t('common.cancel')}
            </BrandButton>
            <BrandButton onClick={() => void handleArchiveConfirm()} disabled={isActionSubmitting}>
              {isActionSubmitting ? t('common.processing') : t('projectHome.dialogs.archiveProject')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      <BrandDialog
        modal
        open={!!deletingProject}
        onOpenChange={(open) => {
          if (!open && !isActionSubmitting) {
            setDeletingProject(null)
            setDeleteConfirmText('')
          }
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('projectHome.dialogs.deleteProject')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="home-body text-sm text-secondary dark:text-secondary-foreground">
              {t('projectHome.dialogs.deleteConfirm', { name: deletingProject?.name || '' })}
            </p>
            <p className="home-mono mt-3 text-xs text-tertiary dark:text-muted">{t('projectHome.dialogs.deleteConfirmHint')}</p>
            <BrandInput
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deletingProject?.name || ''}
              disabled={isActionSubmitting}
              className="mt-2"
            />
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setDeletingProject(null)}
              disabled={isActionSubmitting}
            >
              {t('common.cancel')}
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={() => void handleDeleteConfirm()}
              disabled={
                isActionSubmitting ||
                !deletingProject ||
                deleteConfirmText !== deletingProject.name
              }
            >
              {isActionSubmitting ? t('common.processing') : t('projectHome.dialogs.deleteProject')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Create project dialog */}
      <BrandDialog
        modal
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open && !isCreating) {
            setShowCreateDialog(false)
            setCreateDialogName('')
          }
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('projectHome.dialogs.createProject')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
              {t('projectHome.dialogs.createProjectDescription')}
            </p>
            <BrandInput
              ref={createInputRef}
              value={createDialogName}
              onChange={(e) => setCreateDialogName(e.target.value)}
              placeholder={t('projectHome.dialogs.projectNamePlaceholder')}
              onCompositionStart={() => setIsComposition(true)}
              onCompositionEnd={() => setIsComposition(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isComposition && createDialogName.trim()) {
                  void handleCreateFromDialog()
                }
              }}
              disabled={isCreating}
            />
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => {
                setShowCreateDialog(false)
                setCreateDialogName('')
              }}
              disabled={isCreating}
            >
              {t('common.cancel')}
            </BrandButton>
            <BrandButton
              onClick={() => void handleCreateFromDialog()}
              disabled={isCreating || !createDialogName.trim()}
            >
              {isCreating ? t('projectHome.dialogs.creating') : t('projectHome.dialogs.createButton')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Reset app dialog */}
      <BrandDialog
        modal
        open={showClearDataDialog}
        onOpenChange={(open) => {
          if (!open && !isClearingLocalData) {
            setShowClearDataDialog(false)
            setClearDataConfirmText('')
          }
        }}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('projectHome.dialogs.startFreshTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
              {t('projectHome.dialogs.startFreshDescription')}
            </p>
            <ul className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4 space-y-2 pl-4">
              <li>• {t('projectHome.dialogs.startFreshItems.projects')}</li>
              <li>• {t('projectHome.dialogs.startFreshItems.conversations')}</li>
              <li>• {t('projectHome.dialogs.startFreshItems.files')}</li>
            </ul>
            <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
              {t('projectHome.dialogs.startFreshNote')}
            </p>
            <p className="home-mono text-xs text-tertiary dark:text-muted mb-2">
              {t('projectHome.dialogs.startFreshConfirmHint')}
            </p>
            <BrandInput
              value={clearDataConfirmText}
              onChange={(e) => setClearDataConfirmText(e.target.value)}
              placeholder={t('projectHome.dialogs.startFreshConfirmPlaceholder')}
              disabled={isClearingLocalData}
              className="mt-1"
            />
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => {
                setShowClearDataDialog(false)
                setClearDataConfirmText('')
              }}
              disabled={isClearingLocalData}
            >
              {t('common.cancel')}
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={() => void handleClearDataConfirm()}
              disabled={isClearingLocalData || clearDataConfirmText !== t('projectHome.dialogs.startFreshConfirmPlaceholder')}
            >
              {isClearingLocalData ? t('projectHome.dialogs.resetting') : t('projectHome.dialogs.confirmReset')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>
    </div>
  )
}
