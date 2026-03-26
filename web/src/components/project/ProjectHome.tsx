import { useEffect, useMemo, useState, useRef } from 'react'
import { formatDistanceToNow, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Project, ProjectStats } from '@/sqlite/repositories/project.repository'
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
} from 'lucide-react'

// 设计系统样式
const designStyles = `
  /* 字体 - 使用独特的字体组合 */
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Noto+Serif+SC:wght@400;500;600&display=swap');

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

// 格式化相对时间
const formatRelativeTime = (date: number | Date) => {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: zhCN })
}

// 时间分组
type TimeGroup = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older'

const getTimeGroup = (date: number | Date): TimeGroup => {
  const d = new Date(date)
  if (isToday(d)) return 'today'
  if (isYesterday(d)) return 'thisWeek'
  if (isThisWeek(d)) return 'thisWeek'
  if (isThisMonth(d)) return 'thisMonth'
  return 'older'
}

const timeGroupLabels: Record<TimeGroup, string> = {
  today: '今天',
  yesterday: '昨天',
  thisWeek: '本周',
  thisMonth: '本月',
  older: '更早',
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
  isClearingLocalData = false,
}: ProjectHomeProps) {
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

  const createInputRef = useRef<HTMLInputElement>(null)

  // 清空本地数据确认
  const handleClearDataConfirm = async () => {
    if (clearDataConfirmText !== '重新开始') return
    setIsActionSubmitting(true)
    try {
      await onClearLocalData()
      setShowClearDataDialog(false)
      setClearDataConfirmText('')
    } finally {
      setIsActionSubmitting(false)
    }
  }

  const openCreateDialog = () => {
    if (isLoading || isCreating) return
    setShowCreateDialog(true)
    window.setTimeout(() => createInputRef.current?.focus(), 80)
  }

  // 按时间分组的项目
  const groupedProjects = useMemo(() => {
    let filtered = [...projects]

    // 应用状态过滤
    if (statusFilter === 'active') {
      filtered = filtered.filter((p) => p.status !== 'archived')
    } else if (statusFilter === 'archived') {
      filtered = filtered.filter((p) => p.status === 'archived')
    }

    // 按更新时间排序
    const sorted = filtered.sort((a, b) => b.updatedAt - a.updatedAt)

    // 应用搜索
    const keyword = search.trim().toLowerCase()
    const searched = keyword ? sorted.filter((p) => p.name.toLowerCase().includes(keyword)) : sorted

    // 分组
    const groups: Record<TimeGroup, Project[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      thisMonth: [],
      older: [],
    }

    searched.forEach((project) => {
      const group = getTimeGroup(project.updatedAt)
      groups[group].push(project)
    })

    return groups
  }, [projects, search, statusFilter])

  // 最近的项目
  const recentProject = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'archived')
    return active.sort((a, b) => b.updatedAt - a.updatedAt)[0] || null
  }, [projects])

  // 项目统计
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
  }, [showCreateDialog, isLoading, isCreating])

  // 从创建对话框提交
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

  // 渲染项目时间线项
  const renderProjectItem = (project: Project, index: number) => {
    const isActive = project.id === activeProjectId
    const stats = projectStats[project.id]
    const isArchived = project.status === 'archived'
    const isProjectActionPending = pendingProjectAction?.projectId === project.id

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
                  已归档
                </span>
              )}
            </div>
            <div className="home-body flex items-center gap-3 text-xs text-tertiary dark:text-muted">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(project.updatedAt)}
              </span>
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3 h-3" />
                {stats?.workspaceCount || 0} 工作区
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
              打开
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
                    ? '处理中...'
                    : '重命名'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void handleArchiveClick(project, isArchived)}
                  disabled={isProjectActionPending || isActionSubmitting}
                >
                  {isArchived ? (
                    <>
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                      取消归档
                    </>
                  ) : (
                    <>
                      <Archive className="mr-2 h-4 w-4" />
                      归档
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
                  删除
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
        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
          <div className="home-reveal">
            <div className="flex items-center gap-2 mb-6">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-50 border border-primary/10 dark:border-primary/20">
                <Shield className="w-3.5 h-3.5 text-primary-600 dark:text-primary-600" />
                <span className="home-body text-xs text-primary-600 dark:text-primary-600 font-medium">
                  本地优先
                </span>
              </div>
            </div>
          </div>

          <h1 className="home-title-serif home-reveal home-delay-1">
            <span className="block text-4xl sm:text-5xl lg:text-6xl text-primary dark:text-primary-foreground leading-tight">
              创作从这里开始
            </span>
          </h1>

          <p className="home-body home-reveal home-delay-2 mt-4 text-lg sm:text-xl text-secondary dark:text-secondary-foreground max-w-xl leading-relaxed">
            在本地 AI 工作空间中，用自然语言与你的文件对话。
            <span className="text-tertiary dark:text-muted">数据始终在你的设备上。</span>
          </p>

          {/* 快捷统计 */}
          <div className="home-reveal home-delay-3 mt-8 flex items-center gap-6">
            <div className="home-mono text-sm">
              <span className="text-primary dark:text-primary-foreground font-medium">{totalProjects}</span>
              <span className="text-tertiary dark:text-muted ml-1">项目</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="home-mono text-sm">
              <span className="text-primary dark:text-primary-foreground font-medium">{totalWorkspaces}</span>
              <span className="text-tertiary dark:text-muted ml-1">工作区</span>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* 左侧：快捷操作 */}
          <aside className="lg:col-span-4 space-y-4">
            {/* 继续工作 */}
            {recentProject && (
              <div className="home-reveal home-delay-3 home-action-card rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-primary-600 dark:text-primary-600" />
                  <span className="home-mono text-xs uppercase tracking-wider text-tertiary dark:text-muted">
                    继续工作
                  </span>
                </div>
                <h3 className="home-title-sans text-base text-primary dark:text-primary-foreground mb-1 truncate">
                  {recentProject.name}
                </h3>
                <p className="home-body text-xs text-tertiary dark:text-muted mb-4">
                  {formatRelativeTime(recentProject.updatedAt)} 更新
                </p>
                <BrandButton
                  onClick={() => void onOpenProject(recentProject.id)}
                  variant="primary"
                  className="w-full"
                  disabled={isLoading}
                >
                  继续编辑
                  <ArrowRight className="w-4 h-4 ml-1" />
                </BrandButton>
              </div>
            )}

            {/* 创建新项目 */}
            <div
              className="home-reveal home-delay-4 home-action-card rounded-xl border border-border bg-card p-5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              role="button"
              tabIndex={0}
              aria-label="创建新项目"
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
                  新建
                </span>
              </div>
              <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
                创建一个新项目，开始你的创作之旅。
              </p>
              <p className="home-mono text-[11px] text-tertiary dark:text-muted mb-3">快捷键: N</p>
              <BrandButton
                variant="outline"
                className="w-full"
                onClick={(event) => {
                  event.stopPropagation()
                  openCreateDialog()
                }}
                disabled={isLoading || isCreating}
              >
                创建项目
              </BrandButton>
            </div>

            {/* 重新开始 */}
            <div className="home-reveal home-delay-5 rounded-xl border border-border/60 bg-card/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw className="w-4 h-4 text-tertiary" />
                <span className="home-mono text-xs uppercase tracking-wider text-tertiary">
                  重新开始
                </span>
              </div>
              <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
                遇到问题？可以从头开始。这会删除所有项目和对话记录。
              </p>
              <BrandButton
                variant="ghost"
                className="w-full text-tertiary hover:text-danger hover:border-danger/50"
                onClick={() => setShowClearDataDialog(true)}
                disabled={isClearingLocalData || isLoading}
              >
                {isClearingLocalData ? '重置中...' : '重置应用'}
              </BrandButton>
            </div>
          </aside>

          {/* 右侧：项目列表 */}
          <section className="lg:col-span-8">
            {/* 搜索和过滤 */}
            <div className="home-reveal home-delay-4 flex flex-col sm:flex-row gap-3 mb-6">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索项目..."
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
                    {filter === 'all' ? '全部' : filter === 'active' ? '活跃' : '已归档'}
                  </button>
                ))}
              </div>
            </div>

            {/* 项目时间线 */}
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

              {/* 空状态 */}
              {timeGroupOrder.every((g) => groupedProjects[g].length === 0) && (
                <div className="home-reveal home-delay-5 home-empty-state rounded-xl border border-dashed border-border py-16 text-center">
                  <div className="relative z-10">
                    <p className="home-body text-secondary dark:text-secondary-foreground mb-4">
                      {search ? '没有找到匹配的项目' : '还没有项目'}
                    </p>
                    {!search && projects.length === 0 && (
                      <BrandButton
                        variant="primary"
                        onClick={openCreateDialog}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        创建第一个项目
                      </BrandButton>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* 对话框们 */}
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
            <BrandDialogTitle>重命名项目</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <BrandInput
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              placeholder="输入新的项目名称"
              disabled={isActionSubmitting}
            />
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setRenamingProjectId(null)}
              disabled={isActionSubmitting}
            >
              取消
            </BrandButton>
            <BrandButton
              onClick={() => void handleRenameConfirm()}
              disabled={isActionSubmitting || !renameDraft.trim()}
            >
              {isActionSubmitting ? '处理中...' : '保存'}
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
            <BrandDialogTitle>归档项目</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="home-body text-sm text-secondary dark:text-secondary-foreground">
              确认归档项目「{archivingProject?.name}」？归档后项目不会默认展示，但可随时取消归档。
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-secondary dark:text-secondary-foreground">
              <BrandCheckbox
                checked={archiveDontAskAgain}
                onCheckedChange={(checked) => setArchiveDontAskAgain(Boolean(checked))}
                disabled={isActionSubmitting}
              />
              <span>下次不再提示</span>
            </label>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setArchivingProject(null)}
              disabled={isActionSubmitting}
            >
              取消
            </BrandButton>
            <BrandButton onClick={() => void handleArchiveConfirm()} disabled={isActionSubmitting}>
              {isActionSubmitting ? '处理中...' : '确认归档'}
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
            <BrandDialogTitle>删除项目</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="home-body text-sm text-secondary dark:text-secondary-foreground">
              确认删除项目「{deletingProject?.name}」？该操作会删除项目关联的工作区记录，且不可撤销。
            </p>
            <p className="home-mono mt-3 text-xs text-tertiary dark:text-muted">请输入项目名称以确认删除：</p>
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
              取消
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
              {isActionSubmitting ? '处理中...' : '确认删除'}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* 创建项目对话框 */}
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
            <BrandDialogTitle>创建新项目</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
              为你的新项目起一个名字，用于组织和区分不同的工作区。
            </p>
            <BrandInput
              ref={createInputRef}
              value={createDialogName}
              onChange={(e) => setCreateDialogName(e.target.value)}
              placeholder="输入项目名称"
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
              取消
            </BrandButton>
            <BrandButton
              onClick={() => void handleCreateFromDialog()}
              disabled={isCreating || !createDialogName.trim()}
            >
              {isCreating ? '创建中...' : '创建项目'}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* 重新开始确认对话框 */}
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
            <BrandDialogTitle>重新开始</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
              这会删除你在这个应用中创建的所有内容：
            </p>
            <ul className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4 space-y-2 pl-4">
              <li>• 所有项目和工作区</li>
              <li>• 所有对话记录</li>
              <li>• 所有上传的文件</li>
            </ul>
            <p className="home-body text-sm text-secondary dark:text-secondary-foreground mb-4">
              就像第一次打开这个应用一样。
            </p>
            <p className="home-mono text-xs text-tertiary dark:text-muted mb-2">
              输入 <span className="font-bold">重新开始</span> 确认：
            </p>
            <BrandInput
              value={clearDataConfirmText}
              onChange={(e) => setClearDataConfirmText(e.target.value)}
              placeholder="重新开始"
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
              取消
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={() => void handleClearDataConfirm()}
              disabled={isClearingLocalData || clearDataConfirmText !== '重新开始'}
            >
              {isClearingLocalData ? '重置中...' : '确认重置'}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>
    </div>
  )
}
