/**
 * FileChangeList Component
 *
 * Displays list of file changes detected after Python execution.
 * Shows add/modify/delete operations with file metadata.
 *
 * Part of Phase 3: Sync Preview UI
 */

import React from 'react'
import { type ChangeDetectionResult, type FileChange, type ChangeType } from '@/opfs/types/opfs-types'

interface FileChangeListProps {
  /** Change detection result from workspace store */
  changes: ChangeDetectionResult | null
  /** Callback when user selects a file */
  onSelectFile?: (file: FileChange) => void
  /** Currently selected file path */
  selectedPath?: string
}

/**
 * Get icon and color for change type
 */
function getChangeTypeStyle(type: ChangeType): { icon: string; color: string; label: string } {
  switch (type) {
    case 'add':
      return { icon: '+', color: 'text-green-600', label: '新增' }
    case 'modify':
      return { icon: '~', color: 'text-blue-600', label: '修改' }
    case 'delete':
      return { icon: '×', color: 'text-red-600', label: '删除' }
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes?: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp?: number): string {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const FileChangeList: React.FC<FileChangeListProps> = ({
  changes,
  onSelectFile,
  selectedPath,
}) => {
  if (!changes || changes.changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-gray-400 dark:text-neutral-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h2l3 3H7a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-neutral-100 mb-2">无文件变更</h3>
        <p className="text-sm text-gray-500 dark:text-neutral-400 max-w-sm">
          Python 执行后没有检测到文件系统变更
        </p>
      </div>
    )
  }

  const totalChanges = changes.changes.length
  const summaryText =
    changes.added > 0 || changes.modified > 0 || changes.deleted > 0
      ? `${changes.added} 新增, ${changes.modified} 修改, ${changes.deleted} 删除`
      : `${totalChanges} 个文件变更`

  return (
    <div className="flex flex-col h-full">
      {/* Summary Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-neutral-100">文件变更列表</h3>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1">{summaryText}</p>
          </div>
          <div className="text-xs text-gray-500 dark:text-neutral-400">
            总计: {totalChanges}
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-gray-100 dark:divide-neutral-800">
          {changes.changes.map((change, index) => {
            const style = getChangeTypeStyle(change.type)
            const isSelected = change.path === selectedPath

            return (
              <button
                key={`${change.path}-${index}`}
                onClick={() => onSelectFile?.(change)}
                className={`w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500' : ''
                }`}
                aria-label={`查看 ${change.path} 的变更`}
              >
                {/* Type Icon */}
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${style.color} bg-opacity-10`}
                  style={{ backgroundColor: `${style.color}15` }}
                >
                  {style.icon}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-sm font-medium ${style.color}`}
                    >
                      {style.label}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-neutral-500">•</span>
                    <span className="text-xs text-gray-500 dark:text-neutral-400" title={change.path}>
                      {change.path.length > 50
                        ? `...${change.path.slice(-47)}`
                        : change.path}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-neutral-400">
                    <span>大小: {formatFileSize(change.size)}</span>
                    {change.mtime && (
                      <>
                        <span>•</span>
                        <span>时间: {formatTime(change.mtime)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Selection Indicator */}
                {isSelected && (
                  <div className="flex-shrink-0">
                    <svg
                      className="w-5 h-5 text-blue-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-8-8 0 8 8 8 0 00016 0 8-8a8 8 0 000-8 8zm3.707-9.293a1 1 0 00-1.414 1.414L9 10.586 7 7H4a1 1 0 000-2 0v4a1 1 0 002 2h5l7.293 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
