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
} from '@browser-fs-analyzer/ui'
import { MoreVertical, Archive, ArchiveRestore, Pencil, Trash2, FolderPlus, SearchX, Plus, ShieldCheck, Brain } from 'lucide-react'

// 动画关键帧样式
const animationStyles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.05);
    }
  }
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-8px);
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
    <div className="relative min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <style>{animationStyles}</style>
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-90"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(60rem 32rem at 12% -8%, rgba(59,130,246,0.16), transparent 60%), radial-gradient(52rem 30rem at 90% 2%, rgba(16,185,129,0.14), transparent 62%), linear-gradient(160deg, #f8fafc 0%, #f1f5f9 45%, #eef2ff 100%)',
        }}
      />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
        <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 p-6 shadow-sm backdrop-blur relative overflow-hidden animate-fade-in-up dark:border-neutral-700 dark:bg-neutral-900/80">
          {/* 装饰性渐变光晕 */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br from-blue-400/10 to-purple-500/10 rounded-full blur-2xl" />

          <div className="relative flex items-start justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <BrandBadge color="purple" shape="pill">
                  <ShieldCheck className="mr-1.5 h-3 w-3" />
                  数据仅本地处理
                </BrandBadge>
                <div className="text-xs uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                  Local Workspace
                </div>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl dark:text-neutral-100">
                开始今天的工作
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-neutral-600 sm:text-base dark:text-neutral-300">
                先决定下一步，再进入项目细节。支持创作、整理、开发与研究等多种工作流。
              </p>
            </div>
            <div className="hidden sm:flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-100 dark:border-neutral-700 dark:from-neutral-800 dark:to-neutral-700">
              <Brain className="w-7 h-7 text-purple-500" />
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm animate-fade-in-up ph-duration-200 ph-delay-100 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">创建或打开 Project</div>
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
              className="transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              创建项目
            </BrandButton>
          </div>
        </section>

        <section className="mb-6">
          <div className="mb-3 text-sm font-medium text-neutral-700 animate-slide-in dark:text-neutral-300">继续上次工作</div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md animate-fade-in-up ph-duration-200 ph-delay-200 dark:border-neutral-700 dark:bg-neutral-900">
            {currentProject ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <BrandBadge type="tag" color="purple">
                    {currentProject.id === activeProjectId ? '当前项目' : '最近更新'}
                  </BrandBadge>
                  {currentProject.status === 'archived' && (
                    <BrandBadge variant="neutral" shape="pill">
                      已归档
                    </BrandBadge>
                  )}
                </div>
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{currentProject.name}</h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {formatRelativeTime(currentProject.updatedAt)} · 工作区{' '}
                  {projectStats[currentProject.id]?.workspaceCount || 0}
                </p>
                <div className="mt-4">
                  <BrandButton
                    onClick={() => void onOpenProject(currentProject.id)}
                    variant="primary"
                    className="transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    继续处理
                  </BrandButton>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 animate-pulse-slow dark:bg-neutral-800">
                    <FolderPlus className="h-6 w-6 text-neutral-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">还没有项目</h2>
                  <p className="mt-1 text-sm text-neutral-600 text-center dark:text-neutral-400">
                    先创建一个 Project，后续就可以从这里一键继续。
                  </p>
                  <BrandButton
                    variant="primary"
                    className="mt-4 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                    onClick={() => setShowCreateDialog(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    创建第一个项目
                  </BrandButton>
                </div>
              </>
            )}
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-neutral-700 animate-slide-in dark:text-neutral-300">最近项目</div>
              <div className="flex rounded-lg bg-neutral-100 p-0.5 relative dark:bg-neutral-800">
                {/* 滑块背景 */}
                <div
                  className="absolute top-0.5 h-[calc(100%-4px)] rounded-md bg-white shadow-sm transition-all duration-300 ease-out dark:bg-neutral-700"
                  style={{
                    width: 'calc(33.333% - 2px)',
                    left: statusFilter === 'all' ? '2px' : statusFilter === 'active' ? 'calc(33.333% + 1px)' : 'calc(66.666% + 1px)',
                  }}
                />
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`relative z-10 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === 'all'
                      ? 'text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`relative z-10 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === 'active'
                      ? 'text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                  }`}
                >
                  活跃
                </button>
                <button
                  onClick={() => setStatusFilter('archived')}
                  className={`relative z-10 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === 'archived'
                      ? 'text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
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
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center animate-fade-in-up ph-duration-300 dark:border-neutral-700 dark:bg-neutral-900">
              <div className="mb-3 flex justify-center">
                <SearchX className="h-10 w-10 text-neutral-300 animate-pulse-slow" />
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {search ? '没有匹配的项目，试试其他关键词。' : '暂无项目'}
              </p>
              {!search && projects.length === 0 && (
                <BrandButton
                  variant="primary"
                  className="mt-4 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
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
                  className="group rounded-xl border border-neutral-200 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg animate-fade-in-up dark:border-neutral-700 dark:bg-neutral-900"
                  style={{
                    animationDelay: `${(index % 4) * 100}ms`,
                    animationFillMode: 'both',
                  }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-base font-medium text-neutral-900 dark:text-neutral-100">{project.name}</span>
                    <div className="flex items-center gap-2">
                      {isArchived && (
                        <BrandBadge variant="neutral" shape="pill">
                          已归档
                        </BrandBadge>
                      )}
                      {isActive && (
                        <BrandBadge type="tag" color="purple">
                          当前
                        </BrandBadge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {formatRelativeTime(project.updatedAt)}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
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
                      className="transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      进入项目
                    </BrandButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <BrandButton
                          variant="ghost"
                          iconButton
                          disabled={isProjectActionPending || isActionSubmitting}
                          className="transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
                              className="text-red-600 focus:text-red-600"
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
            <p className="text-sm text-neutral-700">
              确认归档项目「{archivingProject?.name}」？归档后项目不会默认展示，但可随时取消归档。
            </p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
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
            <p className="text-sm text-neutral-700">
              确认删除项目「{deletingProject?.name}」？该操作会删除项目关联的工作区记录，且不可撤销。
            </p>
            <p className="mt-2 text-xs text-neutral-500">请输入项目名称以确认删除：</p>
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
            <p className="text-sm text-neutral-700 mb-3">
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
