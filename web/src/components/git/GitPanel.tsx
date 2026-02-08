/**
 * GitPanel component with staging area and commit functionality
 *
 * Provides git operations panel with:
 * - Commit history view with SHA copy
 * - File status with staging/unstaging
 * - Staging area management
 * - Commit message form with stage all/unstage all actions
 */

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
  Check,
  ArrowRight,
  ArrowLeft,
  Copy,
  Clock,
  Square,
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
export type GitTabType = 'log' | 'status' | 'staged'

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
  // Staging callbacks
  onTabChange?: (tab: GitTabType) => void
  onRefresh?: () => void
  onFileClick?: (file: GitFileStatus | GitDiffFile) => void
  onStageFile?: (file: GitFileStatus) => void
  onUnstageFile?: (file: GitFileStatus) => void
  onStageAll?: () => void
  onUnstageAll?: () => void
  onCommit?: (message: string) => void
  // Commit SHA copy handler
  onCopySha?: (sha: string) => void
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
 * Commit list item component with SHA copy functionality
 */
function CommitItem({
  commit,
  onCopy,
}: {
  commit: GitCommitEntry
  onCopy?: (sha: string) => void
}) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(commit.hash)
    onCopy?.(commit.hash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleCopy(e as unknown as React.MouseEvent)
        }
      }}
    >
      <div className="mt-0.5 rounded-full bg-primary/10 p-1.5">
        <GitCommit className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={cn(
              'group flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs transition-colors',
              'hover:bg-primary/10 active:scale-[0.98]',
              copied && 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
            )}
            onClick={handleCopy}
            aria-label={`Copy SHA ${commit.shortHash}`}
          >
            <span>{commit.shortHash}</span>
            <Copy
              className={cn(
                'h-3 w-3 opacity-0 transition-opacity',
                copied || 'group-hover:opacity-50'
              )}
            />
          </button>
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
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            {commit.author} • {commit.authorDate}
          </span>
        </p>
      </div>
      <ChevronRight className="mt-2 h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </div>
  )
}

/**
 * File status item component with staging controls
 */
function FileStatusItem({
  file,
  onClick,
  onStage,
  onUnstage,
  isStagingMode = false,
}: {
  file: GitFileStatus
  onClick?: () => void
  onStage?: () => void
  onUnstage?: () => void
  isStagingMode?: boolean
}) {
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
      {/* Staging checkbox */}
      {isStagingMode && (
        <button
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors',
            'touch-manipulation active:scale-95',
            file.staged
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/30 hover:border-primary'
          )}
          onClick={(e) => {
            e.stopPropagation()
            if (file.staged) {
              onUnstage?.()
            } else {
              onStage?.()
            }
          }}
          aria-label={file.staged ? `Unstage ${file.path}` : `Stage ${file.path}`}
        >
          {file.staged && <Check className="h-4 w-4" />}
        </button>
      )}

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
 * Staging panel component with staged/unstaged file sections
 */
function StagingPanel({
  stagedFiles,
  unstagedFiles,
  onStageFile,
  onUnstageFile,
  onStageAll,
  onUnstageAll,
  onFileClick,
}: {
  stagedFiles: GitFileStatus[]
  unstagedFiles: GitFileStatus[]
  onStageFile?: (file: GitFileStatus) => void
  onUnstageFile?: (file: GitFileStatus) => void
  onStageAll?: () => void
  onUnstageAll?: () => void
  onFileClick?: (file: GitFileStatus) => void
}) {
  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0

  if (!hasChanges) {
    return <EmptyState message="No changes to stage" />
  }

  return (
    <div className="space-y-4">
      {/* Staged files section */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium">Staged ({stagedFiles.length})</span>
          </div>
          {unstagedFiles.length > 0 && onUnstageAll && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={onUnstageAll}
            >
              <ArrowLeft className="mr-1 h-3 w-3" />
              Unstage All
            </Button>
          )}
        </div>
        {stagedFiles.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No staged files</p>
        ) : (
          stagedFiles.map((file, index) => (
            <FileStatusItem
              key={`${file.path}-${index}`}
              file={file}
              isStagingMode={true}
              onStage={() => onStageFile?.(file)}
              onUnstage={() => onUnstageFile?.(file)}
              onClick={() => onFileClick?.(file)}
            />
          ))
        )}
      </div>

      {/* Unstaged files section */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Square className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Unstaged ({unstagedFiles.length})</span>
          </div>
          {unstagedFiles.length > 0 && onStageAll && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={onStageAll}
            >
              <ArrowRight className="mr-1 h-3 w-3" />
              Stage All
            </Button>
          )}
        </div>
        {unstagedFiles.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No unstaged files</p>
        ) : (
          unstagedFiles.map((file, index) => (
            <FileStatusItem
              key={`${file.path}-${index}`}
              file={file}
              isStagingMode={true}
              onStage={() => onStageFile?.(file)}
              onUnstage={() => onUnstageFile?.(file)}
              onClick={() => onFileClick?.(file)}
            />
          ))
        )}
      </div>
    </div>
  )
}

/**
 * Commit form component with message input and commit button
 */
function CommitForm({
  onCommit,
  disabled,
}: {
  onCommit?: (message: string) => void
  disabled?: boolean
}) {
  const [message, setMessage] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    if (message.trim()) {
      onCommit?.(message.trim())
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t bg-muted/30 p-3">
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Commit message..."
        className={cn(
          'min-h-[60px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
        )}
        disabled={disabled}
        aria-label="Commit message"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !message.trim()}
          onClick={() => setMessage('')}
        >
          Cancel
        </Button>
        <Button size="sm" disabled={disabled || !message.trim()} onClick={handleSubmit}>
          <GitCommit className="mr-1.5 h-3.5 w-3.5" />
          Commit
        </Button>
      </div>
    </div>
  )
}

/**
 * GitPanel component - displays git operations panel with Log, Status, and Staged tabs
 */
export function GitPanel({
  repoPath,
  commits = [],
  fileStatuses = [],
  diffs: _diffs = [],
  currentTab = 'log',
  isLoading = false,
  error = null,
  onTabChange,
  onRefresh,
  onFileClick,
  onStageFile,
  onUnstageFile,
  onStageAll,
  onUnstageAll,
  onCommit,
  onCopySha,
  className,
}: GitPanelProps) {
  const tabs: { id: GitTabType; label: string; icon: React.ReactNode }[] = [
    { id: 'log', label: 'Log', icon: <GitCommit className="h-4 w-4" /> },
    { id: 'status', label: 'Status', icon: <FileText className="h-4 w-4" /> },
    { id: 'staged', label: 'Staged', icon: <Check className="h-4 w-4" /> },
  ]

  const [activeTab, setActiveTab] = React.useState<GitTabType>(currentTab)

  // Separate files into staged and unstaged for staging panel
  const stagedFiles = fileStatuses.filter((f) => f.staged)
  const unstagedFiles = fileStatuses.filter((f) => !f.staged)

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
                    commits.map((commit) => (
                      <CommitItem key={commit.hash} commit={commit} onCopy={onCopySha} />
                    ))
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

              {/* Staged tab content with staging panel */}
              {activeTab === 'staged' && (
                <StagingPanel
                  stagedFiles={stagedFiles}
                  unstagedFiles={unstagedFiles}
                  onStageFile={onStageFile}
                  onUnstageFile={onUnstageFile}
                  onStageAll={onStageAll}
                  onUnstageAll={onUnstageAll}
                  onFileClick={onFileClick}
                />
              )}
            </>
          )}
        </div>

        {/* Commit form - only visible in staged tab when commit callback is provided */}
        {activeTab === 'staged' && onCommit && (
          <CommitForm onCommit={onCommit} disabled={isLoading || stagedFiles.length === 0} />
        )}
      </CardContent>
    </Card>
  )
}

export default GitPanel
