/**
 * ConflictResolutionDialog Component
 *
 * Modal dialog for resolving file conflicts during sync.
 * Users can choose which version to keep or manually merge.
 *
 * Part of Phase 4: Native Filesystem Sync - Story 4.2
 */

import React, { useState, useCallback } from 'react'
import { type ConflictDetail } from '@/opfs/types/opfs-types'

export interface ConflictResolutionDialogProps {
  /** Conflict to resolve */
  conflict: ConflictDetail
  /** Callback when resolution is chosen */
  onResolve: (resolution: 'opfs' | 'native' | 'skip') => void
  /** Callback when dialog is cancelled */
  onCancel: () => void
}

/**
 * Resolution option with description
 */
interface ResolutionOption {
  value: 'opfs' | 'native' | 'skip'
  label: string
  description: string
  icon: React.ReactNode
  color: string
}

/**
 * Get resolution options based on conflict state
 */
function getResolutionOptions(conflict: ConflictDetail): ResolutionOption[] {
  const options: ResolutionOption[] = []

  // OPFS version (our changes)
  options.push({
    value: 'opfs',
    label: '保留 OPFS 版本',
    description: conflict.nativeVersion.exists
      ? '使用 Python 执行后修改的版本'
      : '保留新创建的文件',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 8h14M5 8a2 2 0 01-2-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
        />
      </svg>
    ),
    color: 'blue',
  })

  // Native version (current filesystem)
  if (conflict.nativeVersion.exists) {
    options.push({
      value: 'native',
      label: '保留本机版本',
      description: '保留当前文件系统中的原始版本，放弃 OPFS 中的修改',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      ),
      color: 'green',
    })
  }

  // Skip this file
  options.push({
    value: 'skip',
    label: '跳过此文件',
    description: '不同步此文件，保持现状',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 5l7 7-7 7M5 5l14 14"
        />
      </svg>
    ),
    color: 'gray',
  })

  return options
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = ({
  conflict,
  onResolve,
  onCancel,
}) => {
  const [selectedOption, setSelectedOption] = useState<'opfs' | 'native' | 'skip' | null>(null)
  const [previewContent, setPreviewContent] = useState<{
    opfs: string | null
    native: string | null
  }>({ opfs: null, native: null })
  const [loading, setLoading] = useState(false)

  const options = getResolutionOptions(conflict)

  /**
   * Load file previews when dialog opens
   */
  const loadPreviews = useCallback(async () => {
    setLoading(true)
    try {
      // TODO: Load actual file content from workspace
      // For now, show placeholder messages
      setPreviewContent({
        opfs: '[OPFS 版本内容 - 需要实现实际读取]',
        native: conflict.nativeVersion.exists
          ? '[本机版本内容 - 需要实现实际读取]'
          : null,
      })
    } catch (err) {
      console.error('Failed to load previews:', err)
    } finally {
      setLoading(false)
    }
  }, [conflict])

  // Load previews on mount
  React.useEffect(() => {
    loadPreviews()
  }, [loadPreviews])

  /**
   * Handle resolution selection
   */
  const handleResolve = useCallback(() => {
    if (selectedOption) {
      onResolve(selectedOption)
    }
  }, [selectedOption, onResolve])

  /**
   * Handle skip all
   */
  const handleSkipAll = useCallback(() => {
    onResolve('skip')
  }, [onResolve])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-amber-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 3h.01M12 9a3 3 0 01-3 3v5a3 3 0 013 3 3 3 0 013-3v-5m3 6h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">文件冲突</h2>
                <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
                  {conflict.path} 在同步时发生冲突
                </p>
              </div>
            </div>
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
          </div>

          {/* Conflict metadata */}
          <div className="mt-4 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-neutral-400">OPFS 版本时间:</span>
              <span className="font-medium text-gray-900 dark:text-neutral-100">
                {formatTimestamp(conflict.opfsVersion.mtime)}
              </span>
            </div>
            {conflict.nativeVersion.mtime && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500 dark:text-neutral-400">本机版本时间:</span>
                <span className="font-medium text-gray-900 dark:text-neutral-100">
                  {formatTimestamp(conflict.nativeVersion.mtime)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Resolution Options */}
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-neutral-300 mb-3">选择解决方案</h3>
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedOption(option.value)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedOption === option.value
                      ? `border-${option.color}-500 bg-${option.color}-50`
                      : 'border-gray-200 hover:border-gray-300 dark:border-neutral-700 dark:hover:border-neutral-600 bg-white dark:bg-neutral-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-lg bg-${option.color}-100 flex items-center justify-center text-${option.color}-600`}
                    >
                      {option.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-sm font-medium ${
                          selectedOption === option.value
                            ? `text-${option.color}-900`
                            : 'text-gray-900 dark:text-neutral-100'
                        }`}
                      >
                        {option.label}
                      </h4>
                      <p
                        className={`text-xs mt-1 ${
                          selectedOption === option.value
                            ? `text-${option.color}-700`
                            : 'text-gray-500 dark:text-neutral-400'
                        }`}
                      >
                        {option.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Preview Panels */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* OPFS Version Preview */}
              <div className="flex flex-col bg-gray-50 dark:bg-neutral-800 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-neutral-700 bg-blue-50 dark:bg-blue-950/30">
                  <h4 className="text-sm font-medium text-blue-900">
                    OPFS 版本
                  </h4>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-white dark:bg-neutral-900">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : previewContent.opfs ? (
                    <pre className="text-xs text-gray-700 dark:text-neutral-300 whitespace-pre-wrap break-all font-mono">
                      {previewContent.opfs}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 dark:text-neutral-500 text-sm">
                      无内容
                    </div>
                  )}
                </div>
              </div>

              {/* Native Version Preview */}
              <div className="flex flex-col bg-gray-50 dark:bg-neutral-800 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-neutral-700 bg-green-50 dark:bg-green-950/30">
                  <h4 className="text-sm font-medium text-green-900">
                    本机版本
                  </h4>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-white dark:bg-neutral-900">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : previewContent.native ? (
                    <pre className="text-xs text-gray-700 dark:text-neutral-300 whitespace-pre-wrap break-all font-mono">
                      {previewContent.native}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 dark:text-neutral-500 text-sm">
                      {conflict.nativeVersion.exists ? '无内容' : '文件不存在'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Conflict explanation */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-amber-900 dark:text-amber-200 mb-1">
                  为什么会发生冲突？
                </h4>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  OPFS 中的文件在本机文件系统中也被修改了。系统检测到两个版本的修改时间不同，
                  需要您决定保留哪个版本。
                  {conflict.nativeVersion.exists
                    ? '选择"保留本机版本"将放弃 OPFS 中的修改。'
                    : '本机文件不存在，如果选择"保留本机版本"将删除此文件。'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkipAll}
              className="text-sm text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
            >
              跳过此冲突
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 rounded-lg hover:bg-gray-50 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleResolve}
                disabled={!selectedOption}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7m0 0l-7-7 7"
                  />
                </svg>
                应用选择
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
