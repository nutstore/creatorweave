/**
 * SyncProgressDialog Component
 *
 * Modal dialog showing sync progress for large files.
 * Displays per-file progress with cancellation support.
 *
 * Part of Phase 4: Native Filesystem Sync - Story 4.3
 */

import React, { useState, useEffect } from 'react'

export interface SyncFileProgress {
  /** File path */
  path: string
  /** Current progress (0-100) */
  progress: number
  /** Current file size in bytes */
  total: number
  /** Transferred bytes */
  transferred: number
  /** Sync status */
  status: 'pending' | 'syncing' | 'completed' | 'failed'
  /** Error message if failed */
  error?: string
}

export interface SyncProgressDialogProps {
  /** Current file being synced */
  currentFile: SyncFileProgress | null
  /** Overall progress (0-100) */
  overallProgress: number
  /** Completed count */
  completed: number
  /** Total count */
  total: number
  /** Overall sync status */
  status: 'syncing' | 'completed' | 'error'
  /** Callback when user cancels sync */
  onCancel?: () => void
  /** Callback when user closes dialog */
  onClose?: () => void
}

/**
 * Format bytes for display
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

/**
 * Get status icon and color
 */
function getStatusInfo(status: SyncFileProgress['status']) {
  switch (status) {
    case 'pending':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth={2} />
          </svg>
        ),
        color: 'gray',
      }
    case 'syncing':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 014.586 0m0 0A8.001 8.001 0 01-15.356-2H15.356"
            />
          </svg>
        ),
        color: 'blue',
      }
    case 'completed':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0l-7-7"
            />
          </svg>
        ),
        color: 'green',
      }
    case 'failed':
      return {
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ),
        color: 'red',
      }
  }
}

export const SyncProgressDialog: React.FC<SyncProgressDialogProps> = ({
  currentFile,
  overallProgress,
  completed,
  total,
  status,
  onCancel,
  onClose,
}) => {
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null)

  /**
   * Estimate remaining time based on progress
   */
  useEffect(() => {
    if (currentFile && currentFile.status === 'syncing' && currentFile.progress > 0) {
      // Rough estimation: if we have 50% progress and it took X seconds,
      // estimate remaining time
      // This is a simple estimation - in real implementation would track actual time
      const avgFileSize = 1024 * 100 // 100KB average
      const speed = avgFileSize // bytes per second (assumption)
      const remaining = currentFile.total - currentFile.transferred
      const seconds = remaining / speed
      setEstimatedTime(seconds > 0 ? seconds : null)
    } else {
      setEstimatedTime(null)
    }
  }, [currentFile])

  /**
   * Format estimated time
   */
  function formatTime(seconds: number): string {
    if (seconds < 60) return `${Math.ceil(seconds)}秒`
    const minutes = Math.ceil(seconds / 60)
    return `${minutes}分钟`
  }

  /**
   * Get overall status text
   */
  function getOverallStatus() {
    if (status === 'completed') {
      return '同步完成'
    }
    if (status === 'error') {
      return '同步失败'
    }
    return '正在同步...'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {status === 'syncing' ? (
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : status === 'completed' ? (
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0l-7-7"
                    />
                  </svg>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">同步文件</h2>
                <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
                  {getOverallStatus()}
                </p>
              </div>
            </div>
            {status === 'syncing' && onCancel && (
              <button
                onClick={onCancel}
                className="text-gray-400 hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Overall Progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">
                总体进度
              </span>
              <span className="text-sm text-gray-500 dark:text-neutral-400">
                {completed} / {total} 文件
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300 ease-out"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gray-500 dark:text-neutral-400">{overallProgress.toFixed(0)}%</span>
              {estimatedTime && status === 'syncing' && (
                <span className="text-xs text-gray-500 dark:text-neutral-400">
                  预计剩余: {formatTime(estimatedTime)}
                </span>
              )}
            </div>
          </div>

          {/* Current File Progress */}
          {currentFile && (
            <div className="border border-gray-200 dark:border-neutral-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-${getStatusInfo(currentFile.status).color}-100 flex items-center justify-center text-${getStatusInfo(currentFile.status).color}-600`}>
                  {getStatusInfo(currentFile.status).icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h4
                      className="text-sm font-medium text-gray-900 dark:text-neutral-100 truncate"
                      title={currentFile.path}
                    >
                      {currentFile.path.length > 50
                        ? `...${currentFile.path.slice(-47)}`
                        : currentFile.path}
                    </h4>
                    <span className="text-xs text-gray-500 dark:text-neutral-400">
                      {formatBytes(currentFile.transferred)} / {formatBytes(currentFile.total)}
                    </span>
                  </div>
                  {currentFile.status === 'syncing' && (
                    <div className="space-y-2">
                      <div className="w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-600 h-full transition-all duration-100 ease-out"
                          style={{ width: `${currentFile.progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-neutral-400">
                          {currentFile.progress.toFixed(0)}%
                        </span>
                        {estimatedTime && (
                          <span className="text-xs text-gray-500 dark:text-neutral-400">
                            剩余 {formatTime(estimatedTime)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {currentFile.status === 'failed' && currentFile.error && (
                    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded p-2">
                      <p className="text-xs text-red-700 dark:text-red-300">{currentFile.error}</p>
                    </div>
                  )}
                  {currentFile.status === 'completed' && (
                    <div className="flex items-center gap-1 text-green-700">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7m0 0l-7-7 7"
                        />
                      </svg>
                      <span className="text-xs">同步成功</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Status when no current file */}
          {!currentFile && status === 'syncing' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-neutral-400">准备同步...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {status !== 'syncing' && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
