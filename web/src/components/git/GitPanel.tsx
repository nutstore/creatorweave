import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  GitCommit,
  GitMerge,
  Loader2,
  RefreshCw,
  ChevronRight,
  Plus,
  Minus,
  Edit,
  FileText,
  Folder,
} from 'lucide-react'

/**
 * Git commit entry interface
 */
export interface GitCommitEntry {
  hash: string
  shortHash: string
  subject: string
  author: string
  authorDate: string
  refs?: string[]
}

/**
 * Git file status entry interface
 */
export interface GitFileStatus {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'
  oldPath?: string
  staged: boolean
}

/**
 * Git diff hunk interface
 */
export interface GitDiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string
  lines: string[]
}

/**
 * Git diff file interface
 */
export interface GitDiffFile {
  path: string
  oldPath?: string
  hunks: GitDiffHunk[]
  additions: number
  deletions: number
  binary: boolean
}

/**
 * Tab types for GitPanel
 */
export type GitTabType = 'log' | 'status' | 'diff'

/**
 * GitPanel component props
 */
export interface GitPanelProps {
  repoPath: string
  commits?: GitCommitEntry[]
  fileStatuses?: GitFileStatus[]
  diffs?: GitDiffFile[]
  currentTab?: GitTabType
  isLoading?: boolean
  error?: string | null
  onTabChange?: (tab: GitTabType) => void
  onRefresh?: () => void
  onFileClick?: (file: GitFileStatus | GitDiffFile) => void
  className?: string
}

/**
 * Get status badge color based on file status
 */
function getStatusColor(status: GitFileStatus['status']): string {
  switch (status) {
    case 'added':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
    case 'modified':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
    case 'deleted':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
    case 'renamed':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
    case 'untracked':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

/**
 * Get status icon based on file status
 */
function getStatusIcon(status: GitFileStatus['status']): React.ReactNode {
  switch (status) {
    case 'added':
      return <Plus className="h-3.5 w-3.5" />
    case 'modified':
      return <Edit className="h-3.5 w-3.5" />
    case 'deleted':
      return <Minus className="h-3.5 w-3.5" />
    case 'renamed':
      return <FileText className="h-3.5 w-3.5" />
    default:
      return <FileText className="h-3.5 w-3.5" />
  }
}

/**
 * Commit list item component
 */
function CommitItem({ commit }: { commit: GitCommitEntry }) {
  return (
    <div className="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50">
      <div className="mt-0.5 rounded-full bg-primary/10 p-1.5">
        <GitCommit className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {commit.shortHash}
          </code>
          {commit.refs && commit.refs.length > 0 && (
            <div className="flex gap-1">
              {commit.refs.map((ref) => (
                <span
                  key={ref}
                  className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                >
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>
        <p className="mt-1 truncate text-sm font-medium">{commit.subject}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {commit.author} • {commit.authorDate}
        </p>
      </div>
      <ChevronRight className="mt-2 h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </div>
  )
}

/**
 * File status item component
 */
function FileStatusItem({ file, onClick }: { file: GitFileStatus; onClick?: () => void }) {
  return (
    <div
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors',
        'hover:bg-accent/50 active:bg-accent/70',
        file.staged && 'border-l-2 border-l-primary bg-primary/5'
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      <div
        className={cn(
          'rounded-md p-1.5',
          file.status === 'added' &&
            'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
          file.status === 'modified' &&
            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
          file.status === 'deleted' && 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
          file.status === 'renamed' &&
            'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
          file.status === 'untracked' &&
            'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
        )}
      >
        {file.status === 'untracked' ? <Folder className="h-4 w-4" /> : getStatusIcon(file.status)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{file.path}</span>
          <span
            className={cn(
              'flex-shrink-0 rounded px-1.5 py-0.5 text-xs capitalize',
              getStatusColor(file.status)
            )}
          >
            {file.status}
          </span>
          {file.staged && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">staged</span>
          )}
        </div>
        {file.oldPath && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{file.oldPath}</p>
        )}
      </div>
    </div>
  )
}

/**
 * Diff file component
 */
function DiffFileItem({ file, onClick }: { file: GitDiffFile; onClick?: () => void }) {
  return (
    <div
      className="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50 active:bg-accent/70"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      <div className="rounded-md bg-purple-100 p-1.5 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
        <GitMerge className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">
            {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs">
          {file.binary ? (
            <span className="text-muted-foreground">Binary file</span>
          ) : (
            <>
              <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
              <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
            </>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </div>
  )
}

/**
 * Loading state component
 */
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * Empty state component
 */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <FileText className="mb-3 h-12 w-12 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

/**
 * Error state component
 */
function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="mb-3 text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  )
}

/**
 * GitPanel component - displays git operations panel with Log, Status, and Diff tabs
 */
export function GitPanel({
  repoPath,
  commits = [],
  fileStatuses = [],
  diffs = [],
  currentTab = 'log',
  isLoading = false,
  error = null,
  onTabChange,
  onRefresh,
  onFileClick,
  className,
}: GitPanelProps) {
  const tabs: { id: GitTabType; label: string; icon: React.ReactNode }[] = [
    { id: 'log', label: 'Log', icon: <GitCommit className="h-4 w-4" /> },
    { id: 'status', label: 'Status', icon: <FileText className="h-4 w-4" /> },
    { id: 'diff', label: 'Diff', icon: <GitMerge className="h-4 w-4" /> },
  ]

  const [activeTab, setActiveTab] = React.useState<GitTabType>(currentTab)

  React.useEffect(() => {
    setActiveTab(currentTab)
  }, [currentTab])

  const handleTabChange = (tab: GitTabType) => {
    setActiveTab(tab)
    onTabChange?.(tab)
  }

  return (
    <Card className={cn('flex h-full flex-col', className)}>
      <CardHeader className="flex-shrink-0 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitMerge className="h-5 w-5" />
            Git
          </CardTitle>
          <div className="max-w-[120px] truncate text-xs text-muted-foreground">
            {repoPath.split('/').pop() || repoPath}
          </div>
        </div>
      </CardHeader>

      {/* Tab navigation */}
      <div className="mb-2 flex-shrink-0 px-4">
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'min-w-0 flex-1 touch-manipulation py-2.5 text-sm',
                'transition-transform active:scale-[0.98]'
              )}
              onClick={() => handleTabChange(tab.id)}
              disabled={isLoading}
            >
              <span className="xs:inline mr-1.5 hidden">{tab.icon}</span>
              <span className="truncate">{tab.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Refresh button */}
      {onRefresh && (
        <div className="flex-shrink-0 px-4 pb-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      )}

      {/* Content area */}
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden pt-0">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={onRefresh} />
          ) : (
            <>
              {/* Log tab content */}
              {activeTab === 'log' && (
                <div className="space-y-1">
                  {commits.length === 0 ? (
                    <EmptyState message="No commits found" />
                  ) : (
                    commits.map((commit) => <CommitItem key={commit.hash} commit={commit} />)
                  )}
                </div>
              )}

              {/* Status tab content */}
              {activeTab === 'status' && (
                <div className="space-y-1">
                  {fileStatuses.length === 0 ? (
                    <EmptyState message="No changes detected" />
                  ) : (
                    fileStatuses.map((file, index) => (
                      <FileStatusItem
                        key={`${file.path}-${index}`}
                        file={file}
                        onClick={() => onFileClick?.(file)}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Diff tab content */}
              {activeTab === 'diff' && (
                <div className="space-y-1">
                  {diffs.length === 0 ? (
                    <EmptyState message="No diff available" />
                  ) : (
                    diffs.map((file) => (
                      <DiffFileItem
                        key={file.path}
                        file={file}
                        onClick={() => onFileClick?.(file)}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default GitPanel
