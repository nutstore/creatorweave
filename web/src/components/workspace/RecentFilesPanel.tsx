/**
 * Recent Files Panel - displays and manages recently accessed files.
 *
 * Features:
 * - Shows up to 10 most recent files
 * - Displays timestamps
 * - Click to open file in preview
 * - Clear history button
 * - Remove individual files
 */

import { formatDistanceToNow } from 'date-fns'
import { zhCN, enUS } from 'date-fns/locale'
import { Clock, Trash2, X } from 'lucide-react'
import { BrandButton } from '@creatorweave/ui'
import { useWorkspacePreferencesStore, type RecentFile } from '@/store/workspace-preferences.store'
import { useT } from '@/i18n'

interface RecentFilesPanelProps {
  onFileSelect?: (path: string) => void
  className?: string
}

export function RecentFilesPanel({ onFileSelect, className = '' }: RecentFilesPanelProps) {
  const t = useT()
  const { recentFiles, removeRecentFile, clearRecentFiles } = useWorkspacePreferencesStore()

  // Get locale for date formatting
  const locale = t('locale') === 'zh-CN' ? zhCN : enUS

  const handleFileClick = (file: RecentFile) => {
    onFileSelect?.(file.path)
  }

  const handleRemoveFile = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    removeRecentFile(path)
  }

  const handleClearAll = () => {
    if (
      confirm(t('recentFiles.confirmClear') || 'Are you sure you want to clear all recent files?')
    ) {
      clearRecentFiles()
    }
  }

  if (recentFiles.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
        <Clock className="mb-3 h-12 w-12 text-tertiary dark:text-secondary" />
        <p className="text-sm text-tertiary dark:text-muted">
          {t('recentFiles.empty') || 'No recent files'}
        </p>
        <p className="mt-1 text-xs text-tertiary">
          {t('recentFiles.emptyHint') || 'Files you open will appear here'}
        </p>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="border-subtle flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold text-primary dark:text-primary-foreground">
          {t('recentFiles.title') || 'Recent Files'}
        </h3>
        <BrandButton
          variant="ghost"
          onClick={handleClearAll}
          className="h-7 px-2 text-xs text-tertiary hover:text-secondary"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </BrandButton>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-subtle divide-y">
          {recentFiles.map((file) => (
            <div
              key={file.path}
              onClick={() => handleFileClick(file)}
              className="group flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-muted dark:hover:bg-muted"
            >
              {/* File info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {/* File icon */}
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-tertiary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>

                  {/* File name */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-secondary dark:text-muted">
                      {file.path.split('/').pop()}
                    </div>
                    <div className="truncate text-xs text-tertiary">{file.path}</div>
                  </div>
                </div>

                {/* Timestamp */}
                <div className="mt-1 flex items-center gap-1 text-xs text-tertiary">
                  <Clock className="h-3 w-3" />
                  <span>
                    {formatDistanceToNow(new Date(file.timestamp), {
                      addSuffix: true,
                      locale,
                    })}
                  </span>
                </div>
              </div>

              {/* Remove button */}
              <button
                onClick={(e) => handleRemoveFile(e, file.path)}
                className="flex-shrink-0 rounded p-1 text-tertiary opacity-0 transition-opacity hover:bg-muted hover:text-secondary group-hover:opacity-100 dark:hover:bg-muted dark:hover:text-tertiary"
                title={t('recentFiles.remove') || 'Remove from recent'}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-subtle border-t px-3 py-2">
        <p className="text-xs text-tertiary">
          {t('recentFiles.count', { count: recentFiles.length }) ||
            `${recentFiles.length} recent files`}
        </p>
      </div>
    </div>
  )
}
