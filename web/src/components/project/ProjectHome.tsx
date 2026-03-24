import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Project, ProjectStats } from '@/sqlite/repositories/project.repository'
import {
  BrandBadge,
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
import { MoreVertical, Archive, ArchiveRestore, Pencil, Trash2, SearchX, Plus, ShieldCheck, Brain } from 'lucide-react'

// 动画关键帧样式
const animationStyles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-4px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  .animate-fade-in-up {
    animation: fadeInUp 0.4s ease-out forwards;
    opacity: 0;
  }
  .animate-pulse-slow {
    animation: pulse 2s ease-in-out infinite;
  }
  .animate-slide-in {
    animation: slideIn 0.3s ease-out forwards;
    opacity: 0;
  }
  .ph-duration-100 { animation-duration: 100ms; }
  .ph-duration-200 { animation-duration: 200ms; }
  .ph-duration-300 { animation-duration: 300ms; }
  .ph-duration-400 { animation-duration: 400ms; }
  .ph-duration-500 { animation-duration: 500ms; }
  .ph-delay-100 { animation-delay: 100ms; }
  .ph-delay-200 { animation-delay: 200ms; }
  .ph-delay-300 { animation-delay: 300ms; }
  .ph-delay-400 { animation-delay: 400ms; }

  /* 减少动画偏好支持 */
  @media (prefers-reduced-motion: reduce) {
    .animate-fade-in-up,
    .animate-pulse-slow,
    .animate-slide-in {
      animation: none;
      opacity: 1;
    }
    .group:hover {
      transform: none;
    }
  }
`

// 格式化相对时间
const formatRelativeTime = (date: number | Date) => {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: zhCN })
}

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
}: ProjectHomeProps) {
  const [draftName, setDraftName] = useState('')
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

  const visibleProjects = useMemo(() => {
    let filtered = [...projects]

    // Apply status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter((p) => p.status !== 'archived')
    } else if (statusFilter === 'archived') {
      filtered = filtered.filter((p) => p.status === 'archived')
    }

    // Sort by update time
    const sorted = filtered.sort((a, b) => b.updatedAt - a.updatedAt)

    // Apply search filter
    const keyword = search.trim().toLowerCase()
    return keyword ? sorted.filter((project) => project.name.toLowerCase().includes(keyword)) : sorted
  }, [projects, search, statusFilter])

  const currentProject = useMemo(() => {
    return (
      visibleProjects.find((project) => project.id === activeProjectId) ||
      visibleProjects[0] ||
      null
    )
  }, [visibleProjects, activeProjectId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(SKIP_ARCHIVE_CONFIRM_KEY)
    setSkipArchiveConfirm(saved === '1')
  }, [])

  const handleCreate = async () => {
    const name = draftName.trim()
    if (!name) return
    setIsCreating(true)
    try {
      await onCreateProject(name)
      setDraftName('')
    } finally {
      setIsCreating(false)
    }
  }

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

  return (
    <div className="relative min-h-screen bg-muted dark:bg-background">
      <style>{animationStyles}</style>
      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
        <header className="mb-8 rounded-2xl border border bg-card p-8 relative overflow-hidden animate-fade-in-up dark:border-border dark:bg-card">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50/50 to-transparent dark:from-primary-900/10 pointer-events-none" />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <BrandBadge color="primary" shape="pill">
                  <ShieldCheck className="mr-1.5 h-3 w-3" />
                  数据仅本地处理
                </BrandBadge>
                <div className="text-xs uppercase tracking-[0.18em] text-tertiary dark:text-muted">
                  Local Workspace
                </div>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-5xl dark:text-primary-foreground">
                你好，让我们开始吧
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-secondary sm:text-base dark:text-secondary-foreground">
                创建或选择一个项目，开启你的本地 AI 工作空间。
              </p>
            </div>
            <div className="hidden sm:flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-50/80 border border-primary-200/50 dark:border-primary-800/50 dark:bg-primary-900/30">
              <Brain className="w-8 h-8 text-primary-600" />
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-xl border border bg-card p-4 animate-fade-in-up ph-duration-200 ph-delay-100 dark:border-border dark:bg-card">
          <div className="mb-2 text-sm font-medium text-primary dark:text-primary-foreground">创建或打开 Project</div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <BrandInput
              id="project-name-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onCompositionStart={() => setIsComposition(true)}
              onCompositionEnd={() => setIsComposition(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isComposition) {
                  void handleCreate()
                }
              }}
              placeholder="输入项目名称"
              className="flex-1 transition-shadow focus:shadow-md"
            />
            <BrandButton
              variant="primary"
              onClick={() => void handleCreate()}
              disabled={isCreating || isLoading || !draftName.trim()}
              className="transition-all duration-150 hover:opacity-90 active:opacity-80"
            >
              创建项目
            </BrandButton>
          </div>
        </section>

        <section className="mb-6">
          <div className="mb-3 text-sm font-medium text-tertiary animate-slide-in dark:text-muted">继续上次工作</div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 animate-fade-in-up ph-duration-200 ph-delay-200 dark:border-border/50 dark:bg-card/50">
            {currentProject ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-medium text-primary truncate dark:text-primary-foreground">{currentProject.name}</h2>
                    <p className="mt-0.5 text-xs text-tertiary dark:text-muted">
                      {formatRelativeTime(currentProject.updatedAt)} · {projectStats[currentProject.id]?.workspaceCount || 0} 个工作区
                    </p>
                  </div>
                  <BrandButton
                    onClick={() => void onOpenProject(currentProject.id)}
                    variant="primary"
                    className="ml-3 shrink-0"
                  >
                    继续
                  </BrandButton>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between py-1">
                <p className="text-sm text-tertiary dark:text-muted">暂无最近项目</p>
                <BrandButton
                  variant="ghost"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  创建
                </BrandButton>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-secondary animate-slide-in dark:text-secondary-foreground">最近项目</div>
              <div className="flex rounded-lg bg-muted p-0.5 relative dark:bg-muted">
                {/* 滑块背景 */}
                <div
                  className="absolute top-0.5 h-[calc(100%-4px)] rounded-md bg-card shadow-sm transition-all duration-300 ease-out dark:bg-card"
                  style={{
                    width: 'calc(33.333% - 2px)',
                    left: statusFilter === 'all' ? '2px' : statusFilter === 'active' ? 'calc(33.333% + 1px)' : 'calc(66.666% + 1px)',
                  }}
                />
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`relative z-10 rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                    statusFilter === 'all'
                      ? 'text-primary dark:text-primary-foreground'
                      : 'text-secondary hover:text-primary dark:text-muted dark:hover:text-primary-foreground'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`relative z-10 rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                    statusFilter === 'active'
                      ? 'text-primary dark:text-primary-foreground'
                      : 'text-secondary hover:text-primary dark:text-muted dark:hover:text-primary-foreground'
                  }`}
                >
                  活跃
                </button>
                <button
                  onClick={() => setStatusFilter('archived')}
                  className={`relative z-10 rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                    statusFilter === 'archived'
                      ? 'text-primary dark:text-primary-foreground'
                      : 'text-secondary hover:text-primary dark:text-muted dark:hover:text-primary-foreground'
                  }`}
                >
                  已归档
                </button>
              </div>
            </div>
            <BrandInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索项目"
              className="w-full sm:max-w-xs transition-shadow focus:shadow-md"
            />
          </div>

          {visibleProjects.length === 0 && (
            <div className="rounded-xl border border-dashed border bg-card p-10 text-center animate-fade-in-up ph-duration-300 dark:border-border dark:bg-card">
              <div className="mb-3 flex justify-center">
                <SearchX className="h-8 w-8 text-muted" />
              </div>
              <p className="text-sm text-secondary dark:text-muted">
                {search ? '没有找到匹配的项目试试其他关键词？' : '暂无项目'}
              </p>
              {!search && projects.length === 0 && (
                <BrandButton
                  variant="primary"
                  className="mt-4"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  创建第一个项目
                </BrandButton>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleProjects.map((project, index) => {
              const isActive = project.id === activeProjectId
              const stats = projectStats[project.id]
              const canDelete = true
              const isArchived = project.status === 'archived'
              const isProjectActionPending = pendingProjectAction?.projectId === project.id
              return (
                <div
                  key={project.id}
                  className="group rounded-xl border border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm animate-fade-in-up dark:border-border dark:bg-card"
                  style={{
                    animationDelay: `${(index % 4) * 100}ms`,
                    animationFillMode: 'both',
                  }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-base font-medium text-primary dark:text-primary-foreground">{project.name}</span>
                    <div className="flex items-center gap-2">
                      {isArchived && (
                        <BrandBadge variant="neutral" shape="pill">
                          已归档
                        </BrandBadge>
                      )}
                      {isActive && (
                        <BrandBadge type="tag" color="primary">
                          当前
                        </BrandBadge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-tertiary dark:text-muted">
                    {formatRelativeTime(project.updatedAt)}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-tertiary dark:text-muted">
                    <span>工作区 {stats?.workspaceCount || 0}</span>
                    <span>
                      最近活跃{' '}
                      {stats?.lastWorkspaceAccessAt
                        ? formatRelativeTime(stats.lastWorkspaceAccessAt)
                        : '暂无'}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <BrandButton
                      onClick={() => void onOpenProject(project.id)}
                      variant="primary"
                      disabled={isLoading || isActionSubmitting}
                      className="transition-all duration-150 hover:opacity-90 active:opacity-80"
                    >
                      进入项目
                    </BrandButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <BrandButton
                          variant="ghost"
                          iconButton
                          disabled={isProjectActionPending || isActionSubmitting}
                          className="transition-colors hover:bg-muted dark:hover:bg-muted"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </BrandButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
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
                              {isProjectActionPending &&
                              (pendingProjectAction?.type === 'archive' ||
                                pendingProjectAction?.type === 'unarchive')
                                ? '处理中...'
                                : '取消归档'}
                            </>
                          ) : (
                            <>
                              <Archive className="mr-2 h-4 w-4" />
                              {isProjectActionPending &&
                              (pendingProjectAction?.type === 'archive' ||
                                pendingProjectAction?.type === 'unarchive')
                                ? '处理中...'
                                : '归档'}
                            </>
                          )}
                        </DropdownMenuItem>
                        {canDelete && (
                          <>
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
                              {isProjectActionPending && pendingProjectAction?.type === 'delete'
                                ? '处理中...'
                                : '删除'}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

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
            <p className="text-sm text-secondary">
              确认归档项目「{archivingProject?.name}」？归档后项目不会默认展示，但可随时取消归档。
            </p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-secondary">
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
            <p className="text-sm text-secondary">
              确认删除项目「{deletingProject?.name}」？该操作会删除项目关联的工作区记录，且不可撤销。
            </p>
            <p className="mt-2 text-xs text-tertiary">请输入项目名称以确认删除：</p>
            <BrandInput
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deletingProject?.name || ''}
              disabled={isActionSubmitting}
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
            <p className="text-sm text-secondary mb-3">
              为你的新项目起一个名字，用于组织和区分不同的工作空间。
            </p>
            <BrandInput
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
              autoFocus
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
    </div>
  )
}
