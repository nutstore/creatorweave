/**
 * ProjectSwitcher - Dropdown in TopBar for quick project switching.
 *
 * Reads project list and stats directly from useProjectStore.
 * Supports external open/close control (for Cmd+P shortcut).
 */

import { useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN, enUS, ja, ko } from 'date-fns/locale'
import type { Locale as DateFnsLocale } from 'date-fns'
import { ChevronDown, Plus, FolderOpen, Loader2, Circle } from 'lucide-react'
import { toast } from 'sonner'
import { useProjectStore } from '@/store/project.store'
import { useLocale, useT } from '@/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@creatorweave/ui'
import { cn } from '@/lib/utils'

const DATE_FNS_LOCALES: Record<string, DateFnsLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  ja,
  ko,
}

interface ProjectSwitcherProps {
  activeProjectName: string
  onSwitchProject: (projectId: string) => Promise<void>
  onCreateProject: () => void
  onManageProjects: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ProjectSwitcher({
  activeProjectName,
  onSwitchProject,
  onCreateProject,
  onManageProjects,
  open,
  onOpenChange,
}: ProjectSwitcherProps) {
  const t = useT()
  const [locale] = useLocale()
  const projects = useProjectStore((s) => s.projects)
  const projectStats = useProjectStore((s) => s.projectStats)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const isLoading = useProjectStore((s) => s.isLoading)
  const dateFnsLocale = DATE_FNS_LOCALES[locale] ?? enUS

  const sortedProjects = useMemo(() => {
    return [...projects]
      .filter((p) => p.status === 'active')
      .sort((a, b) => {
        const aAccess = projectStats[a.id]?.lastWorkspaceAccessAt ?? a.updatedAt
        const bAccess = projectStats[b.id]?.lastWorkspaceAccessAt ?? b.updatedAt
        return bAccess - aAccess
      })
  }, [projects, projectStats])

  const handleSelect = async (projectId: string) => {
    if (projectId === activeProjectId || isLoading) return
    try {
      await onSwitchProject(projectId)
      onOpenChange?.(false)
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-secondary',
            'hover:bg-muted/80 focus:outline-none focus:ring-1 focus:ring-primary/40',
            'transition-colors',
            'dark:bg-muted dark:text-muted'
          )}
        >
          <span className="max-w-[120px] truncate">{activeProjectName}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        {sortedProjects.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t('topbar.projectSwitcher.noProjects')}
          </div>
        ) : (
          sortedProjects.map((project) => {
            const isActive = project.id === activeProjectId
            const stats = projectStats[project.id]
            const lastAccess = stats?.lastWorkspaceAccessAt ?? project.updatedAt
            const relativeTime = formatDistanceToNow(lastAccess, {
              addSuffix: true,
              locale: dateFnsLocale,
            })

            return (
              <DropdownMenuItem
                key={project.id}
                disabled={isLoading}
                onSelect={(e) => {
                  e.preventDefault()
                  void handleSelect(project.id)
                }}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5',
                  isActive && 'bg-accent/50'
                )}
              >
                <Circle
                  className={cn(
                    'h-2 w-2 shrink-0',
                    isActive ? 'fill-primary text-primary' : 'text-transparent'
                  )}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{project.name}</span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {t('topbar.projectSwitcher.workspaceCount', { count: String(stats?.workspaceCount ?? 0) })}
                  </span>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {relativeTime}
                </span>
                {isLoading && isActive && (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                )}
              </DropdownMenuItem>
            )
          })
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onCreateProject() }}>
          <Plus className="h-4 w-4" />
          <span>{t('topbar.projectSwitcher.createProject')}</span>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onManageProjects() }}>
          <FolderOpen className="h-4 w-4" />
          <span>{t('topbar.projectSwitcher.manageProjects')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
