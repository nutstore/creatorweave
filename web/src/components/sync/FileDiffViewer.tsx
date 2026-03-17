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
  isImageFile,
  fileExistsInNativeFS,
  readFileFromOPFS,
  readFileFromNativeFS,
  readBinaryFileFromOPFS,
  readBinaryFileFromNativeFS,
} from '@/opfs'
import { diffLines } from 'diff'

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
          <span className="w-8 text-right text-tertiary dark:text-muted select-none pr-3 border-r border dark:border-border">
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
  opfsImageUrl: string | null
  nativeImageUrl: string | null
  showNativePanel: boolean
  loading: boolean
  error: string | null
}

type SideBySideRow = {
  left: string
  right: string
  leftType: 'same' | 'removed' | 'empty'
  rightType: 'same' | 'added' | 'empty'
  leftLineNumber: number | null
  rightLineNumber: number | null
}

type InlineDiffRow = {
  lineNumber: number
  text: string
  type: 'same' | 'added' | 'removed'
}

function getImageMimeType(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.ico')) return 'image/x-icon'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.avif')) return 'image/avif'
  if (lower.endsWith('.heic')) return 'image/heic'
  if (lower.endsWith('.heif')) return 'image/heif'
  if (lower.endsWith('.tiff') || lower.endsWith('.tif')) return 'image/tiff'
  return 'application/octet-stream'
}

function splitDiffLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.length > 0 ? lines : ['']
}

export const FileDiffViewer: React.FC<FileDiffViewerProps> = ({ fileChange }) => {
  const [content, setContent] = useState<FileContentState>({
    opfs: null,
    native: null,
    opfsImageUrl: null,
    nativeImageUrl: null,
    showNativePanel: true,
    loading: false,
    error: null,
  })
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode)
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null)

  // Save preference to localStorage when view mode changes
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(STORAGE_KEY, mode)
  }

  // Load file contents when selection changes
  useEffect(() => {
    if (!fileChange) {
      setContent({
        opfs: null,
        native: null,
        opfsImageUrl: null,
        nativeImageUrl: null,
        showNativePanel: true,
        loading: false,
        error: null,
      })
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
        const isImage = isImageFile(filePath)
        let showNativePanel = fileChange.type !== 'add'
        let nativeDir: FileSystemDirectoryHandle | null = null

        if (fileChange.type !== 'add') {
          nativeDir = await workspace.getNativeDirectoryHandle()
          if (nativeDir) {
            const exists = await fileExistsInNativeFS(nativeDir, filePath)
            showNativePanel = exists
          }
        }

        if (isImage) {
          // Read image binary data and convert to data URLs for preview.
          let opfsImageUrl: string | null = null
          let nativeImageUrl: string | null = null
          const mimeType = getImageMimeType(filePath)

          try {
            if (fileChange.type !== 'delete') {
              const opfsBase64 = await readBinaryFileFromOPFS(workspaceId, filePath)
              if (opfsBase64) {
                opfsImageUrl = `data:${mimeType};base64,${opfsBase64}`
              }
            }
          } catch (err) {
            console.warn('[FileDiffViewer] Failed to read OPFS image:', err)
          }

          try {
            if (fileChange.type !== 'add' && nativeDir) {
              const nativeBase64 = await readBinaryFileFromNativeFS(nativeDir, filePath)
                if (nativeBase64) {
                  nativeImageUrl = `data:${mimeType};base64,${nativeBase64}`
                }
            }
          } catch (err) {
            console.warn('[FileDiffViewer] Failed to read native image:', err)
          }

          setContent({
            opfs: null,
            native: null,
            opfsImageUrl,
            nativeImageUrl,
            showNativePanel,
            loading: false,
            error: null,
          })
        } else {
          // Read text from OPFS (target state before sync)
          let opfsContent: string | null = null
          try {
            if (fileChange.type !== 'delete') {
              opfsContent = await readFileFromOPFS(workspaceId, filePath)
            }
          } catch (err) {
            console.warn('[FileDiffViewer] Failed to read OPFS content:', err)
            opfsContent = null
          }

          // Read text from Native FS (current on-disk state before sync)
          let nativeContent: string | null = null
          try {
            if (fileChange.type !== 'add') {
              if (nativeDir) {
                nativeContent = await readFileFromNativeFS(nativeDir, filePath)
              } else if (showNativePanel) {
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
            opfsImageUrl: null,
            nativeImageUrl: null,
            showNativePanel,
            loading: false,
            error: null,
          })
        }
      } catch (err) {
        setContent({
          opfs: null,
          native: null,
          opfsImageUrl: null,
          nativeImageUrl: null,
          showNativePanel: true,
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
    // Left column = native (current), right column = OPFS (target)
    return diffLines(content.native, content.opfs)
  }, [content.opfs, content.native])
  const sideBySideRows = useMemo<SideBySideRow[]>(() => {
    if (!content.opfs || !content.native) return []

    const rows: SideBySideRow[] = []
    let leftLine = 1
    let rightLine = 1

    for (const part of diffResult) {
      const lines = splitDiffLines(part.value)

      if (part.removed) {
        for (const line of lines) {
          rows.push({
            left: line,
            right: '',
            leftType: 'removed',
            rightType: 'empty',
            leftLineNumber: leftLine++,
            rightLineNumber: null,
          })
        }
        continue
      }

      if (part.added) {
        for (const line of lines) {
          rows.push({
            left: '',
            right: line,
            leftType: 'empty',
            rightType: 'added',
            leftLineNumber: null,
            rightLineNumber: rightLine++,
          })
        }
        continue
      }

      for (const line of lines) {
        rows.push({
          left: line,
          right: line,
          leftType: 'same',
          rightType: 'same',
          leftLineNumber: leftLine++,
          rightLineNumber: rightLine++,
        })
      }
    }

    return rows
  }, [content.opfs, content.native, diffResult])
  const inlineDiffRows = useMemo<InlineDiffRow[]>(() => {
    const rows: InlineDiffRow[] = []
    let lineNumber = 1

    for (const part of diffResult) {
      const lines = splitDiffLines(part.value)
      const type: InlineDiffRow['type'] = part.added
        ? 'added'
        : part.removed
          ? 'removed'
          : 'same'

      for (const line of lines) {
        rows.push({
          lineNumber: lineNumber++,
          text: line,
          type,
        })
      }
    }

    return rows
  }, [diffResult])
  const isImage = fileChange ? isImageFile(fileChange.path) : false

  // Close lightbox with Escape key
  useEffect(() => {
    if (!lightbox) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightbox(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightbox])

  if (!fileChange) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
        <div className="w-16 h-16 rounded-full bg-muted dark:bg-muted flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-tertiary dark:text-muted"
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
        <h3 className="text-lg font-medium text-primary dark:text-primary-foreground mb-2">选择文件查看详情</h3>
        <p className="text-sm text-tertiary dark:text-muted max-w-sm">
          从左侧列表选择一个文件，查看 OPFS 与本机文件系统的差异
        </p>
      </div>
    )
  }

  if (content.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-tertiary dark:text-muted">加载文件内容...</p>
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
          <h3 className="text-lg font-medium text-primary dark:text-primary-foreground mb-2">加载失败</h3>
          <p className="text-sm text-tertiary dark:text-muted">{content.error}</p>
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
        <div className="flex items-center justify-center h-full text-tertiary dark:text-muted text-sm">
          无法比较
        </div>
      )
    }

    return (
      <div className="font-mono text-sm">
        {inlineDiffRows.map((row) => {
          const bgColor =
            row.type === 'added' ? 'bg-success-bg' : row.type === 'removed' ? 'bg-danger-bg' : ''
          const textColor =
            row.type === 'added'
              ? 'text-green-700 dark:text-green-300'
              : row.type === 'removed'
                ? 'text-red-700 dark:text-red-300'
                : 'text-secondary dark:text-muted'
          const prefix = row.type === 'added' ? '+ ' : row.type === 'removed' ? '- ' : '  '

          return (
            <div key={`inline-${row.lineNumber}`} className={`flex ${bgColor}`}>
              <span className="w-8 text-right text-tertiary dark:text-muted select-none pr-2 border-r border dark:border-border">
                {row.lineNumber}
              </span>
              <span className={`flex-1 pl-3 whitespace-pre-wrap break-all ${textColor}`}>
                {prefix}
                {row.text || '\u00A0'}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  const renderSideBySideColumn = (side: 'left' | 'right') => {
    if (sideBySideRows.length === 0) {
      return (
        <div className="font-mono text-sm">
          {highlightCode(side === 'left' ? content.native || '' : content.opfs || '')}
        </div>
      )
    }

    return (
      <div className="font-mono text-sm">
        {sideBySideRows.map((row, index) => {
          const text = side === 'left' ? row.left : row.right
          const type = side === 'left' ? row.leftType : row.rightType
          const lineNumber = side === 'left' ? row.leftLineNumber : row.rightLineNumber

          const bgClass =
            type === 'removed'
              ? 'bg-red-50 dark:bg-red-950/40 border-l-2 border-red-400'
              : type === 'added'
                ? 'bg-green-50 dark:bg-green-950/40 border-l-2 border-green-400'
                : ''

          const textClass =
            type === 'removed'
              ? 'text-red-800 dark:text-red-200 font-medium'
              : type === 'added'
                ? 'text-green-800 dark:text-green-200 font-medium'
                : 'text-secondary dark:text-muted'

          return (
            <div key={`${side}-${index}`} className={`flex ${bgClass}`}>
              <span className="w-10 text-right text-tertiary dark:text-muted select-none pr-3 border-r border dark:border-border">
                {lineNumber ?? ''}
              </span>
              <span className={`flex-1 pl-3 whitespace-pre-wrap break-all ${textClass}`}>
                {text || '\u00A0'}
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
      <div className="px-4 py-3 border-b border dark:border-border bg-muted dark:bg-muted">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full bg-${color}-100 text-${color}-700`}
              >
                {getChangeTypeLabel(fileChange.type)}
              </span>
              <span className="text-sm font-medium text-primary dark:text-primary-foreground" title={fileChange.path}>
                {fileChange.path.length > 40
                  ? `...${fileChange.path.slice(-37)}`
                  : fileChange.path}
              </span>
            </div>
            <p className="text-xs text-tertiary dark:text-muted mt-1">
              {fileChange.size ? `${(fileChange.size / 1024).toFixed(1)} KB` : '-'}
            </p>
          </div>

          {!isImage && content.showNativePanel && (
            <div className="flex items-center gap-2 bg-card dark:bg-card rounded-lg border border dark:border-border p-1">
              <button
                onClick={() => handleViewModeChange('sideBySide')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'sideBySide'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-secondary dark:text-muted hover:bg-muted dark:hover:bg-muted'
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
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-secondary dark:text-muted hover:bg-muted dark:hover:bg-muted'
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
          )}
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 flex overflow-hidden">
        {isImage || !content.showNativePanel || viewMode === 'sideBySide' ? (
          <>
            {/* Left column: Native (when available), otherwise OPFS-only fallback */}
            <div
              className={`flex-1 flex flex-col ${
                content.showNativePanel ? 'border-r border dark:border-border' : ''
              }`}
            >
              <div className="px-4 py-2 bg-muted dark:bg-muted border-b border dark:border-border">
                <h4 className="text-sm font-medium text-secondary dark:text-muted">
                  {content.showNativePanel ? '本机文件系统（当前）' : 'OPFS 版本（待同步）'}
                  {!content.showNativePanel && fileChange.type === 'delete' && (
                    <span className="ml-2 text-xs text-red-600">(将被删除)</span>
                  )}
                </h4>
              </div>
              <div className="flex-1 overflow-auto bg-card dark:bg-card p-4">
                {isImage ? (
                  (content.showNativePanel ? content.nativeImageUrl : content.opfsImageUrl) ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          src: (content.showNativePanel ? content.nativeImageUrl : content.opfsImageUrl)!,
                          title: content.showNativePanel
                            ? `本机文件系统 - ${fileChange.path}`
                            : `OPFS 版本 - ${fileChange.path}`,
                        })
                      }
                      className="h-full w-full flex items-center justify-center"
                    >
                      <img
                        src={(content.showNativePanel ? content.nativeImageUrl : content.opfsImageUrl)!}
                        alt={content.showNativePanel ? `Native: ${fileChange.path}` : `OPFS: ${fileChange.path}`}
                        className="max-w-full max-h-full object-contain rounded border border dark:border-border"
                        loading="lazy"
                      />
                    </button>
                  ) : (
                    <div className="flex items-center justify-center h-full text-tertiary dark:text-muted text-sm">
                      {content.showNativePanel
                        ? '无法读取本机图片'
                        : fileChange.type === 'delete'
                          ? '图片将被删除（OPFS 中无内容）'
                          : '无法读取 OPFS 图片'}
                    </div>
                  )
                ) : (content.showNativePanel ? content.native : content.opfs) !== null ? (
                  content.showNativePanel ? renderSideBySideColumn('left') : highlightCode(content.opfs || '')
                ) : (
                  <div className="flex items-center justify-center h-full text-tertiary dark:text-muted text-sm">
                    {content.showNativePanel
                      ? '无法读取本机文件'
                      : fileChange.type === 'delete'
                        ? '文件已删除（OPFS 中无内容）'
                        : '无法读取 OPFS 内容'}
                  </div>
                )}
              </div>
            </div>

            {content.showNativePanel && (
              <div className="flex-1 flex flex-col">
                <div className="px-4 py-2 bg-muted dark:bg-muted border-b border dark:border-border">
                  <h4 className="text-sm font-medium text-secondary dark:text-muted">
                    OPFS 版本（待同步）
                    {fileChange.type === 'delete' && (
                      <span className="ml-2 text-xs text-red-600">(将被删除)</span>
                    )}
                  </h4>
                </div>
                <div className="flex-1 overflow-auto bg-card dark:bg-card p-4">
                  {isImage ? (
                    content.opfsImageUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setLightbox({
                            src: content.opfsImageUrl!,
                            title: `OPFS 版本 - ${fileChange.path}`,
                          })
                        }
                        className="h-full w-full flex items-center justify-center"
                      >
                        <img
                          src={content.opfsImageUrl}
                          alt={`OPFS: ${fileChange.path}`}
                          className="max-w-full max-h-full object-contain rounded border border dark:border-border"
                          loading="lazy"
                        />
                      </button>
                    ) : (
                      <div className="flex items-center justify-center h-full text-tertiary dark:text-muted text-sm">
                        {fileChange.type === 'delete' ? '图片将被删除（OPFS 中无内容）' : '无法读取 OPFS 图片'}
                      </div>
                    )
                  ) : content.opfs !== null ? (
                    renderSideBySideColumn('right')
                  ) : (
                    <div className="flex items-center justify-center h-full text-tertiary dark:text-muted text-sm">
                      {fileChange.type === 'delete' ? '文件已删除（OPFS 中无内容）' : '无法读取 OPFS 内容'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Inline Diff View */
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-2 bg-muted dark:bg-muted border-b border dark:border-border">
              <h4 className="text-sm font-medium text-secondary dark:text-muted">
                差异对比
                <span className="ml-2 text-xs text-tertiary dark:text-muted">
                  (绿色: 新增, 红色: 删除)
                </span>
              </h4>
            </div>
            <div className="flex-1 overflow-auto bg-card dark:bg-card p-4">
              {renderInlineDiff()}
            </div>
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex flex-col"
          onClick={() => setLightbox(null)}
          role="presentation"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white bg-black/40">
            <div className="text-sm truncate pr-3">{lightbox.title}</div>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-white/30 hover:bg-card/10 transition-colors"
            >
              关闭
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.title} className="max-w-full max-h-full object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
