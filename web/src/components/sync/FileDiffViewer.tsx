/**
 * FileDiffViewer Component
 *
 * Displays side-by-side diff between OPFS and Native FS versions.
 * Shows content changes with syntax highlighting.
 *
 * Part of Phase 3: Sync Preview UI
 */

import React, { useState, useEffect, useMemo } from 'react'
import { type FileChange, type ChangeType } from '@/opfs/types/opfs-types'
import { getActiveWorkspace } from '@/store/workspace.store'
import {
  readFileFromOPFS,
  readFileFromNativeFS,
} from '@/opfs'
import { diffLines, type Change } from 'diff'

type ViewMode = 'sideBySide' | 'inline'

const STORAGE_KEY = 'fileDiffViewer-viewMode'

/** Get initial view mode from localStorage */
function getInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'sideBySide'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'sideBySide' || stored === 'inline') return stored
  return 'sideBySide'
}

interface FileDiffViewerProps {
  /** Selected file change to display */
  fileChange: FileChange | null
}

/**
 * Simple syntax highlighting (placeholder for real implementation)
 */
function highlightCode(code: string): React.ReactNode {
  const lines = code.split('\n')

  return (
    <div className="font-mono text-sm">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="w-8 text-right text-gray-400 dark:text-neutral-500 select-none pr-3 border-r border-gray-200 dark:border-neutral-700">
            {i + 1}
          </span>
          <span className="flex-1 pl-3 whitespace-pre-wrap break-all">
            {line || '\u00A0'}
          </span>
        </div>
      ))}
    </div>
  )
}

type FileContentState = {
  opfs: string | null
  native: string | null
  loading: boolean
  error: string | null
}

export const FileDiffViewer: React.FC<FileDiffViewerProps> = ({ fileChange }) => {
  const [content, setContent] = useState<FileContentState>({
    opfs: null,
    native: null,
    loading: false,
    error: null,
  })
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode)

  // Save preference to localStorage when view mode changes
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(STORAGE_KEY, mode)
  }

  // Load file contents when selection changes
  useEffect(() => {
    if (!fileChange) {
      setContent({ opfs: null, native: null, loading: false, error: null })
      return
    }

    const loadContents = async () => {
      setContent((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
          throw new Error('未激活的工作区')
        }

        const { workspace, workspaceId } = activeWorkspace
        const filePath = fileChange.path

        // Read from OPFS (target state before sync)
        let opfsContent: string | null = null
        try {
          // For add/modify, OPFS should contain the new content.
          // For delete, OPFS content is expected to be absent.
          if (fileChange.type !== 'delete') {
            opfsContent = await readFileFromOPFS(workspaceId, filePath)
          }
        } catch (err) {
          console.warn('[FileDiffViewer] Failed to read OPFS content:', err)
          opfsContent = null
        }

        // Read from Native FS (current on-disk state before sync)
        let nativeContent: string | null = null
        try {
          // For modify/delete, native should contain old content.
          // For add, native content is expected to be absent.
          if (fileChange.type !== 'add') {
            const nativeDir = await workspace.getNativeDirectoryHandle()
            if (nativeDir) {
              nativeContent = await readFileFromNativeFS(nativeDir, filePath)
            } else {
              // No directory handle - user needs to grant permission
              nativeContent = '[需要选择项目目录以查看本机文件内容]'
            }
          }
        } catch (err) {
          console.warn('[FileDiffViewer] Failed to read native content:', err)
          nativeContent = '[读取本机文件失败]'
        }

        setContent({
          opfs: opfsContent,
          native: nativeContent,
          loading: false,
          error: null,
        })
      } catch (err) {
        setContent({
          opfs: null,
          native: null,
          loading: false,
          error: err instanceof Error ? err.message : '加载文件失败',
        })
      }
    }

    loadContents()
  }, [fileChange])

  // Compute diff for inline view
  const diffResult = useMemo(() => {
    if (!content.opfs || !content.native) return []
    return diffLines(content.opfs, content.native)
  }, [content.opfs, content.native])

  if (!fileChange) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
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
        <h3 className="text-lg font-medium text-gray-900 dark:text-neutral-100 mb-2">选择文件查看详情</h3>
        <p className="text-sm text-gray-500 dark:text-neutral-400 max-w-sm">
          从左侧列表选择一个文件，查看 OPFS 与本机文件系统的差异
        </p>
      </div>
    )
  }

  if (content.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-neutral-400">加载文件内容...</p>
        </div>
      </div>
    )
  }

  if (content.error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-neutral-100 mb-2">加载失败</h3>
          <p className="text-sm text-gray-500 dark:text-neutral-400">{content.error}</p>
        </div>
      </div>
    )
  }

  const getChangeTypeLabel = (type: ChangeType) => {
    switch (type) {
      case 'add':
        return '新增文件'
      case 'modify':
        return '修改文件'
      case 'delete':
        return '删除文件'
    }
  }

  const getChangeTypeColor = (type: ChangeType) => {
    switch (type) {
      case 'add':
        return 'green'
      case 'modify':
        return 'blue'
      case 'delete':
        return 'red'
    }
  }

  const color = getChangeTypeColor(fileChange.type)

  /** Render inline diff view */
  const renderInlineDiff = () => {
    if (!content.opfs && !content.native) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400 dark:text-neutral-500 text-sm">
          无法比较
        </div>
      )
    }

    return (
      <div className="font-mono text-sm">
        {diffResult.map((part: Change, index: number) => {
          const bgColor = part.added ? 'bg-green-50' : part.removed ? 'bg-red-50' : ''
          const textColor = part.added
            ? 'text-green-700 dark:text-green-300'
            : part.removed
              ? 'text-red-700 dark:text-red-300'
              : 'text-gray-700 dark:text-neutral-300'
          const prefix = part.added ? '+ ' : part.removed ? '- ' : '  '
          
          return (
            <div key={index} className={`flex ${bgColor}`}>
              <span className="w-8 text-right text-gray-400 dark:text-neutral-500 select-none pr-2 border-r border-gray-200 dark:border-neutral-700">
                {index + 1}
              </span>
              <span className={`flex-1 pl-3 whitespace-pre-wrap break-all ${textColor}`}>
                {part.value.split('\n').map((line, lineIdx) => (
                  <React.Fragment key={lineIdx}>
                    {lineIdx > 0 && '\n'}
                    {prefix}{line}
                  </React.Fragment>
                ))}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full bg-${color}-100 text-${color}-700`}
              >
                {getChangeTypeLabel(fileChange.type)}
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-neutral-100" title={fileChange.path}>
                {fileChange.path.length > 40
                  ? `...${fileChange.path.slice(-37)}`
                  : fileChange.path}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1">
              {fileChange.size ? `${(fileChange.size / 1024).toFixed(1)} KB` : '-'}
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 p-1">
            <button
              onClick={() => handleViewModeChange('sideBySide')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'sideBySide'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800'
              }`}
              title="左右对比"
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                左右
              </span>
            </button>
            <button
              onClick={() => handleViewModeChange('inline')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'inline'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800'
              }`}
              title="行内对比"
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                行内
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 flex overflow-hidden">
        {viewMode === 'sideBySide' ? (
          <>
            {/* OPFS Version */}
            <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-neutral-700">
              <div className="px-4 py-2 bg-gray-100 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
                <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                  OPFS 版本
                  {fileChange.type === 'delete' && (
                    <span className="ml-2 text-xs text-red-600">(将被删除)</span>
                  )}
                </h4>
              </div>
              <div className="flex-1 overflow-auto bg-white dark:bg-neutral-900 p-4">
                {content.opfs !== null ? (
                  highlightCode(content.opfs)
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 dark:text-neutral-500 text-sm">
                    {fileChange.type === 'delete' ? '文件已删除（OPFS 中无内容）' : '无法读取 OPFS 内容'}
                  </div>
                )}
              </div>
            </div>

            {/* Native FS Version */}
            <div className="flex-1 flex flex-col">
              <div className="px-4 py-2 bg-gray-100 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
                <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                  本机文件系统
                  {fileChange.type === 'add' && (
                    <span className="ml-2 text-xs text-green-600">(将创建)</span>
                  )}
                </h4>
              </div>
              <div className="flex-1 overflow-auto bg-white dark:bg-neutral-900 p-4">
                {content.native !== null ? (
                  highlightCode(content.native)
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 dark:text-neutral-500 text-sm">
                    {fileChange.type === 'add' ? '文件不存在（将创建）' : '无法读取本机文件'}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Inline Diff View */
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-2 bg-gray-100 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
              <h4 className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                差异对比
                <span className="ml-2 text-xs text-gray-500 dark:text-neutral-400">
                  (绿色: 新增, 红色: 删除)
                </span>
              </h4>
            </div>
            <div className="flex-1 overflow-auto bg-white dark:bg-neutral-900 p-4">
              {renderInlineDiff()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
