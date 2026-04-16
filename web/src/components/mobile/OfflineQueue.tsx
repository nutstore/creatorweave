/**
 * OfflineQueue - Mobile-optimized offline task queue component
 *
 * Features:
 * - Displays pending, syncing, and failed tasks
 * - Progress tracking for syncing tasks
 * - Retry and delete actions for failed tasks
 * - Online/offline status indicator
 * - Touch-friendly interface
 */

import React, { useEffect } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  RefreshCw,
  Trash2,
  Check,
  AlertCircle,
  Clock,
  Upload,
  Download,
  Cloud,
  CloudOff,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useOfflineQueueStore, OfflineTask, OfflineTaskType } from '@/store/offline-queue.store'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useT } from '@/i18n'

//=============================================================================
// Types
//=============================================================================

interface OfflineQueueProps {
  /** Show compact view with just counts */
  compact?: boolean
  /** Maximum items to show in compact view */
  maxItems?: number
  /** Show sync button */
  showSyncButton?: boolean
  /** Callback when task is clicked */
  onTaskClick?: (task?: OfflineTask) => void
  /** Additional CSS classes */
  className?: string
}

//=============================================================================
// Utility Functions
//=============================================================================

function getTaskTypeIcon(type: OfflineTaskType): React.ReactNode {
  switch (type) {
    case 'upload':
      return <Upload className="h-4 w-4 text-blue-500" />
    case 'download':
      return <Download className="h-4 w-4 text-green-500" />
    case 'sync':
      return <RefreshCw className="h-4 w-4 text-purple-500" />
    case 'analysis':
      return <AlertCircle className="h-4 w-4 text-amber-500" />
    default:
      return <Cloud className="h-4 w-4 text-slate-500" />
  }
}

function formatTime(timestamp: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60 * 1000) {
    return t('offlineQueue.justNow')
  }
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return t('offlineQueue.minutesAgo', { count: minutes })
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return t('offlineQueue.hoursAgo', { count: hours })
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

//=============================================================================
// Task Item Component
//=============================================================================

interface TaskItemProps {
  task: OfflineTask
  onRetry?: () => void
  onDelete?: () => void
  onClick?: (task: OfflineTask) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

function TaskItem({ task, onRetry, onDelete, onClick, t }: TaskItemProps) {
  return (
    <div
      className={clsx(
        'group relative flex items-center gap-3 rounded-lg border p-3 transition-all',
        task.status === 'failed'
          ? 'border-red-200 bg-red-50'
          : task.status === 'completed'
            ? 'border-green-200 bg-green-50'
            : 'border-slate-200 bg-white'
      )}
      onClick={() => onClick?.(task)}
      role="listitem"
    >
      {/* Status Icon */}
      <div
        className={clsx(
          'flex h-10 w-10 items-center justify-center rounded-lg',
          task.status === 'syncing'
            ? 'bg-blue-100'
            : task.status === 'failed'
              ? 'bg-red-100'
              : task.status === 'completed'
                ? 'bg-green-100'
                : 'bg-slate-100'
        )}
      >
        {task.status === 'syncing' ? (
          <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
        ) : task.status === 'completed' ? (
          <Check className="h-5 w-5 text-green-600" />
        ) : task.status === 'failed' ? (
          <AlertCircle className="h-5 w-5 text-red-500" />
        ) : (
          getTaskTypeIcon(task.type)
        )}
      </div>

      {/* Task Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{task.name}</p>
        <p className="truncate text-xs text-slate-500">
          {task.description || formatTime(task.updatedAt, t)}
        </p>

        {/* Progress Bar */}
        {task.status === 'syncing' && (
          <div className="mt-2">
            <Progress value={task.progress} className="h-1.5" />
            <p className="mt-0.5 text-xs text-blue-600">{task.progress}%</p>
          </div>
        )}

        {/* Error Message */}
        {task.status === 'failed' && task.error && (
          <p className="mt-1 text-xs text-red-600">{task.error}</p>
        )}
      </div>

      {/* Actions for failed tasks */}
      {task.status === 'failed' && (
        <div className="flex items-center gap-1">
          {onRetry && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRetry()
              }}
              className="rounded-lg p-2 text-blue-500 transition-colors hover:bg-blue-100"
              title={t('offlineQueue.retry')}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-100"
              title={t('offlineQueue.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Timestamp */}
      {task.status !== 'syncing' && (
        <span className="text-xs text-slate-400">{formatTime(task.updatedAt, t)}</span>
      )}
    </div>
  )
}

//=============================================================================
// Section Header Component
//=============================================================================

interface SectionHeaderProps {
  icon: React.ReactNode
  title: string
  count: number
  onClear?: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}

function SectionHeader({ icon, title, count, onClear, t }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium text-slate-700">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {count}
        </span>
      </div>
      {onClear && count > 0 && (
        <button onClick={onClear} className="text-xs text-slate-500 hover:text-slate-700">
          {t('offlineQueue.clearCompleted')}
        </button>
      )}
    </div>
  )
}

//=============================================================================
// Compact View Component
//=============================================================================

interface CompactViewProps {
  onClick?: (task?: OfflineTask) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

function CompactView({ onClick, t }: CompactViewProps) {
  const { isOnline, getTaskCounts } = useOfflineQueueStore()
  const counts = getTaskCounts()
  const totalPending = counts.pending + counts.syncing

  return (
    <button
      onClick={() => onClick?.()}
      className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-3 transition-all hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
    >
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-full',
            isOnline ? 'bg-green-100' : 'bg-slate-100'
          )}
        >
          {isOnline ? (
            <Wifi className="h-5 w-5 text-green-600" />
          ) : (
            <WifiOff className="h-5 w-5 text-slate-500" />
          )}
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">{isOnline ? t('offlineQueue.online') : t('offlineQueue.offline')}</p>
          {totalPending > 0 && (
            <p className="text-xs text-slate-500">
              {counts.syncing > 0 && `${t('offlineQueue.syncingCount', { count: counts.syncing })}, `}
              {counts.pending > 0 && t('offlineQueue.pendingCount', { count: counts.pending })}
            </p>
          )}
        </div>
      </div>
      {totalPending > 0 && (
        <div className="flex items-center gap-2">
          {counts.failed > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
              {counts.failed} {t('offlineQueue.failedCount', { count: counts.failed })}
            </span>
          )}
          <Cloud className="h-5 w-5 text-slate-400" />
        </div>
      )}
    </button>
  )
}

//=============================================================================
// Main Component
//=============================================================================

export function OfflineQueue({
  compact = false,
  maxItems = 5,
  showSyncButton = true,
  onTaskClick,
  className,
}: OfflineQueueProps) {
  const t = useT()
  const {
    isOnline,
    isSyncing,
    tasks,
    getPendingTasks,
    getSyncingTasks,
    getFailedTasks,
    getCompletedTasks,
    getTaskCounts,
    retryTask,
    removeTask,
    clearCompleted,
    processQueue,
  } = useOfflineQueueStore()

  const syncingTasks = getSyncingTasks()
  const pendingTasks = getPendingTasks()
  const failedTasks = getFailedTasks()
  const completedTasks = getCompletedTasks()
  const counts = getTaskCounts()

  // Auto-process queue when online
  useEffect(() => {
    if (isOnline && !isSyncing) {
      processQueue()
    }
  }, [isOnline, isSyncing, processQueue])

  // Handle retry
  const handleRetry = (taskId: string) => {
    retryTask(taskId)
  }

  // Handle delete
  const handleDelete = (taskId: string) => {
    removeTask(taskId)
  }

  // Handle sync all
  const handleSyncAll = async () => {
    if (isOnline && !isSyncing) {
      await processQueue()
    }
  }

  if (compact) {
    return <CompactView onClick={onTaskClick} t={t} />
  }

  return (
    <div className={twMerge('flex flex-col gap-4', className)}>
      {/* Status Header */}
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              'flex h-12 w-12 items-center justify-center rounded-full',
              isOnline ? 'bg-green-100' : 'bg-amber-100'
            )}
          >
            {isOnline ? (
              <Cloud className="h-6 w-6 text-green-600" />
            ) : (
              <CloudOff className="h-6 w-6 text-amber-600" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">
              {isOnline ? t('offlineQueue.connectedToNetwork') : t('offlineQueue.offlineMode')}
            </p>
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              {isOnline ? t('offlineQueue.tasksWillSyncAutomatically') : t('offlineQueue.tasksWillSyncWhenReconnected')}
            </p>
          </div>
        </div>

        {/* Sync Button */}
        {showSyncButton &&
          isOnline &&
          !isSyncing &&
          tasks.some((t) => t.status !== 'completed') && (
            <Button size="sm" onClick={handleSyncAll}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('offlineQueue.syncAll')}
            </Button>
          )}

        {isSyncing && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t('offlineQueue.syncing')}
          </div>
        )}
      </div>

      {/* Task Sections */}
      {(counts.pending > 0 || counts.syncing > 0 || counts.failed > 0 || counts.completed > 0) && (
        <div className="space-y-4">
          {/* Syncing Section */}
          {syncingTasks.length > 0 && (
            <div className="space-y-2">
              <SectionHeader
                icon={<RefreshCw className="h-4 w-4 text-blue-600" />}
                title={t('offlineQueue.syncing')}
                count={syncingTasks.length}
                t={t}
              />
              <div className="space-y-2">
                {syncingTasks.slice(0, maxItems).map((task) => (
                  <TaskItem key={task.id} task={task} onClick={() => onTaskClick?.(task)} t={t} />
                ))}
              </div>
            </div>
          )}

          {/* Pending Section */}
          {pendingTasks.length > 0 && (
            <div className="space-y-2">
              <SectionHeader
                icon={<Clock className="h-4 w-4 text-slate-500" />}
                title={t('offlineQueue.pending')}
                count={pendingTasks.length}
                t={t}
              />
              <div className="space-y-2">
                {pendingTasks.slice(0, maxItems).map((task) => (
                  <TaskItem key={task.id} task={task} onClick={() => onTaskClick?.(task)} t={t} />
                ))}
              </div>
            </div>
          )}

          {/* Failed Section */}
          {failedTasks.length > 0 && (
            <div className="space-y-2">
              <SectionHeader
                icon={<AlertCircle className="h-4 w-4 text-red-500" />}
                title={t('offlineQueue.failed')}
                count={failedTasks.length}
                onClear={() => {
                  failedTasks.forEach((t) => removeTask(t.id))
                }}
                t={t}
              />
              <div className="space-y-2">
                {failedTasks.slice(0, maxItems).map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onRetry={() => handleRetry(task.id)}
                    onDelete={() => handleDelete(task.id)}
                    onClick={() => onTaskClick?.(task)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Section */}
          {completedTasks.length > 0 && counts.pending === 0 && counts.syncing === 0 && (
            <div className="space-y-2">
              <SectionHeader
                icon={<Check className="h-4 w-4 text-green-500" />}
                title={t('offlineQueue.completed')}
                count={completedTasks.length}
                onClear={clearCompleted}
                t={t}
              />
              {completedTasks.length <= 3 && (
                <div className="space-y-2">
                  {completedTasks.slice(0, 3).map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onDelete={() => handleDelete(task.id)}
                      onClick={() => onTaskClick?.(task)}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 py-8">
          <Cloud className="h-12 w-12 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">{t('offlineQueue.noOfflineTasks')}</p>
          <p className="text-xs text-slate-400">{t('offlineQueue.tasksSavedAutomatically')}</p>
        </div>
      )}
    </div>
  )
}

//=============================================================================
// Compact Badge Component
//=============================================================================

export function OfflineQueueBadge() {
  const { isOnline, getTaskCounts } = useOfflineQueueStore()
  const counts = getTaskCounts()
  const totalPending = counts.pending + counts.syncing
  const hasFailed = counts.failed > 0

  if (totalPending === 0 && !hasFailed) {
    return null
  }

  return (
    <div className="relative">
      {isOnline ? (
        <Cloud className="h-5 w-5 text-slate-500" />
      ) : (
        <CloudOff className="h-5 w-5 text-amber-500" />
      )}
      {(totalPending > 0 || hasFailed) && (
        <span
          className={clsx(
            'absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium',
            hasFailed ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
          )}
        >
          {totalPending + counts.failed}
        </span>
      )}
    </div>
  )
}

export default OfflineQueue
