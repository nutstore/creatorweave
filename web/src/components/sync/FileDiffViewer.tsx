/**
 * FileDiffViewer Component
 *
 * Displays side-by-side diff between OPFS and Native FS versions.
 * Uses Monaco DiffEditor for text comparison.
 * For HTML files, provides "Inspect Element" to preview in a new tab with element inspector.
 */

import React, { Suspense, useCallback, useEffect, useState } from 'react'
import { type FileChange } from '@/opfs/types/opfs-types'
import { getActiveConversation } from '@/store/conversation-context.store'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@creatorweave/ui'
import { useT } from '@/i18n'
import {
  isImageFile,
  fileExistsInNativeFS,
  readFileFromOPFS,
  readFileFromNativeFS,
  readBinaryFileFromOPFS,
  readBinaryFileFromNativeFS,
} from '@/opfs'
import { Columns2, UnfoldVertical, Copy, X, MousePointer2, FileText } from 'lucide-react'

const MonacoDiffEditor = React.lazy(() => import('./MonacoDiffEditor'))
const LazyDiffViewer = React.lazy(() => import('./LazyDiffViewer'))

import { type CommentSide, type LineComment } from './comment-types'

interface FileDiffViewerProps {
  fileChange: FileChange | null
  snapshotDiff?: {
    originalText: string
    modifiedText: string
    snapshotTitle?: string
    beforeKind?: 'text' | 'binary' | 'none'
    afterKind?: 'text' | 'binary' | 'none'
    beforeSize?: number
    afterSize?: number
    capturedAt?: number
    beforeBinary?: Uint8Array | null
    afterBinary?: Uint8Array | null
  } | null
  /** External comment state (managed by parent). Falls back to internal state if not provided. */
  commentsByPath?: Record<string, LineComment[]>
  /** Callback to update comment state in parent */
  onCommentsChange?: React.Dispatch<React.SetStateAction<Record<string, LineComment[]>>>
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

/** Check if a file path points to an HTML file */
function isHtmlFile(path: string): boolean {
  return path.toLowerCase().endsWith('.html') || path.toLowerCase().endsWith('.htm')
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

function formatSize(size?: number): string {
  const bytes = size || 0
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${bytes}B`
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '-'
  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(timestamp)
  }
}

export const FileDiffViewer: React.FC<FileDiffViewerProps> = ({ fileChange, snapshotDiff = null, commentsByPath: externalCommentsByPath, onCommentsChange }) => {
  const t = useT()
  const [isSplitView, setIsSplitView] = useState(false)
  const [useFullEditor, setUseFullEditor] = useState(false)
  const [content, setContent] = useState<FileContentState>({
    opfs: null,
    native: null,
    opfsImageUrl: null,
    nativeImageUrl: null,
    showNativePanel: true,
    loading: false,
    error: null,
  })
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null)
  const [snapshotImageUrls, setSnapshotImageUrls] = useState<{ before: string | null; after: string | null }>({
    before: null,
    after: null,
  })
  const [internalCommentsByPath, setInternalCommentsByPath] = useState<Record<string, LineComment[]>>({})
  // Use external state if provided (from SyncPreviewPanel), otherwise use internal state
  const commentsByPath = externalCommentsByPath ?? internalCommentsByPath
  const setCommentsByPath: React.Dispatch<React.SetStateAction<Record<string, LineComment[]>>> =
    onCommentsChange ?? setInternalCommentsByPath
  const [composer, setComposer] = useState<{
    side: CommentSide
    startLine: number
    endLine: number
    text: string
  } | null>(null)
  const activePath = fileChange?.path ?? ''
  const isSnapshotMode = Boolean(snapshotDiff)
  const hasBinarySnapshot = isSnapshotMode && (
    snapshotDiff?.beforeKind === 'binary' || snapshotDiff?.afterKind === 'binary'
  )
  const currentFileComments = activePath ? commentsByPath[activePath] ?? [] : []


  /**
   * Open HTML file in a new tab with element inspector.
   * Uses the OPFS (modified) version of the file content.
   * Follows the same pattern as handleElementInspect in WorkspaceLayout.
   */
  const handleInspectElement = useCallback(async () => {
    if (!fileChange || fileChange.type === 'delete') return

    try {
      // Use the OPFS (modified) version which is the pending change
      const htmlContent = content.opfs
      if (htmlContent === null) return

      // Save to localStorage so the StandalonePreview page can read it
      localStorage.setItem('preview-content-' + fileChange.path, htmlContent)
      // Open in new tab with inspector enabled
      window.open(`/preview?path=${encodeURIComponent(fileChange.path)}`, '_blank')
    } catch (err) {
      console.error('[FileDiffViewer] Failed to open inspector:', err)
    }
  }, [fileChange, content.opfs])

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

    if (snapshotDiff) {
      setContent({
        opfs: snapshotDiff.modifiedText,
        native: snapshotDiff.originalText,
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
        const activeConversation = await getActiveConversation()
        if (!activeConversation) {
          throw new Error(t('sidebar.fileDiffViewer.noWorkspace'))
        }

        const { conversation, conversationId } = activeConversation
        const filePath = fileChange.path
        const isImage = isImageFile(filePath)
        let showNativePanel = fileChange.type !== 'add'
        let nativeDir: FileSystemDirectoryHandle | null = null

        if (fileChange.type !== 'add') {
          nativeDir = await conversation.getNativeDirectoryHandle()
          if (nativeDir) {
            const exists = await fileExistsInNativeFS(nativeDir, filePath)
            showNativePanel = exists
          }
        }

        if (isImage) {
          let opfsImageUrl: string | null = null
          let nativeImageUrl: string | null = null
          const mimeType = getImageMimeType(filePath)

          try {
            if (fileChange.type !== 'delete') {
              const opfsBase64 = await readBinaryFileFromOPFS(conversationId, filePath)
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
          let opfsContent: string | null = null
          try {
            if (fileChange.type !== 'delete') {
              opfsContent = await readFileFromOPFS(conversationId, filePath)
            }
          } catch (err) {
            console.warn('[FileDiffViewer] Failed to read OPFS content:', err)
            opfsContent = null
          }

          let nativeContent: string | null = null
          try {
            if (fileChange.type !== 'add') {
              if (nativeDir) {
                nativeContent = await readFileFromNativeFS(nativeDir, filePath)
              } else if (showNativePanel) {
                nativeContent = t('sidebar.fileDiffViewer.cannotReadNativeContent')
              }
            }
          } catch (err) {
            console.warn('[FileDiffViewer] Failed to read native content:', err)
            nativeContent = t('sidebar.fileDiffViewer.readNativeFileFailed')
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
          error: err instanceof Error ? err.message : t('sidebar.fileDiffViewer.loadFailedError'),
        })
      }
    }

    loadContents()
  }, [fileChange, snapshotDiff])

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

  useEffect(() => {
    if (!isSnapshotMode || !fileChange || !isImageFile(fileChange.path)) {
      setSnapshotImageUrls({ before: null, after: null })
      return
    }

    const beforeBlob = snapshotDiff?.beforeBinary
      ? new Blob([snapshotDiff.beforeBinary], { type: getImageMimeType(fileChange.path) })
      : null
    const afterBlob = snapshotDiff?.afterBinary
      ? new Blob([snapshotDiff.afterBinary], { type: getImageMimeType(fileChange.path) })
      : null
    const beforeUrl = beforeBlob ? URL.createObjectURL(beforeBlob) : null
    const afterUrl = afterBlob ? URL.createObjectURL(afterBlob) : null
    setSnapshotImageUrls({ before: beforeUrl, after: afterUrl })

    return () => {
      if (beforeUrl) URL.revokeObjectURL(beforeUrl)
      if (afterUrl) URL.revokeObjectURL(afterUrl)
    }
  }, [isSnapshotMode, snapshotDiff, fileChange])


  if (!fileChange) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted dark:bg-muted">
          <svg className="h-8 w-8 text-tertiary dark:text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h2l3 3H7a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-medium text-primary dark:text-primary-foreground">{t('sidebar.fileDiffViewer.selectFile')}</h3>
        <p className="max-w-sm text-sm text-tertiary dark:text-muted">{t('sidebar.fileDiffViewer.selectFileHint')}</p>
      </div>
    )
  }

  if (content.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          <p className="text-sm text-tertiary dark:text-muted">{t('sidebar.fileDiffViewer.loadingFile')}</p>
        </div>
      </div>
    )
  }

  if (content.error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30">
            <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-medium text-primary dark:text-primary-foreground">{t('sidebar.fileDiffViewer.loadFailed')}</h3>
          <p className="text-sm text-tertiary dark:text-muted">{content.error}</p>
        </div>
      </div>
    )
  }

  const isImage = !isSnapshotMode && isImageFile(fileChange.path)
  const isHtml = !isSnapshotMode && isHtmlFile(fileChange.path) && fileChange.type !== 'delete'
  const originalText = content.showNativePanel ? (content.native ?? '') : ''
  const modifiedText = content.opfs ?? ''

  const addComment = () => {
    if (!composer || !fileChange) return
    const text = composer.text.trim()
    if (!text) return

    const comment: LineComment = {
      id: `${fileChange.path}:${composer.side}:${composer.startLine}-${composer.endLine}:${Date.now()}`,
      path: fileChange.path,
      side: composer.side,
      startLine: composer.startLine,
      endLine: composer.endLine,
      text,
      createdAt: Date.now(),
    }

    setCommentsByPath((prev) => ({
      ...prev,
      [activePath]: [...(prev[activePath] ?? []), comment],
    }))
    setComposer(null)
  }

  const removeComment = (id: string) => {
    if (!activePath) return
    setCommentsByPath((prev) => ({
      ...prev,
      [activePath]: (prev[activePath] ?? []).filter((item: LineComment) => item.id !== id),
    }))
  }

  const copySnapshotTemplateForLLM = async () => {
    if (!isSnapshotMode || !fileChange) return

    const beforeType = snapshotDiff?.beforeKind === 'binary' ? 'binary' : snapshotDiff?.beforeKind === 'text' ? 'text' : 'none'
    const afterType = snapshotDiff?.afterKind === 'binary' ? 'binary' : snapshotDiff?.afterKind === 'text' ? 'text' : 'none'

    const beforeContent = beforeType === 'text' ? (snapshotDiff?.originalText || '') : `[${beforeType}]`
    const afterContent = afterType === 'text' ? (snapshotDiff?.modifiedText || '') : `[${afterType}]`

    const template = [
      t('sidebar.fileDiffViewer.reviewPromptIntro'),
      `${t('sidebar.fileDiffViewer.file')}: ${fileChange.path}`,
      `${t('sidebar.fileDiffViewer.changeType')}: ${fileChange.type}`,
      `${t('sidebar.fileDiffViewer.snapshot')}: ${snapshotDiff?.snapshotTitle || '-'}`,
      `${t('sidebar.fileDiffViewer.recordedAt')}: ${formatTime(snapshotDiff?.capturedAt)}`,
      `before(${beforeType}, ${formatSize(snapshotDiff?.beforeSize)}):`,
      '```',
      beforeContent,
      '```',
      `after(${afterType}, ${formatSize(snapshotDiff?.afterSize)}):`,
      '```',
      afterContent,
      '```',
      t('sidebar.fileDiffViewer.reviewOutput'),
      `1) ${t('sidebar.fileDiffViewer.issueList')}`,
      `2) ${t('sidebar.fileDiffViewer.actionableSuggestions')}`,
      `3) ${t('sidebar.fileDiffViewer.codePatch')}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(template)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = template
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
  }

  const renderTextDiff = () => {
    if (hasBinarySnapshot) {
      if (isImageFile(fileChange.path) && (snapshotImageUrls.before || snapshotImageUrls.after)) {
        return (
          <div className="flex h-full">
            <div className="flex flex-1 flex-col border-r border-subtle">
              <div className="border-b border-subtle bg-muted px-4 py-2 text-sm text-secondary">{t('sidebar.fileDiffViewer.beforeSnapshotLabel')}</div>
              <div className="flex flex-1 items-center justify-center bg-card p-4">
                {snapshotImageUrls.before ? (
                  <img
                    src={snapshotImageUrls.before}
                    alt={`${t('sidebar.fileDiffViewer.beforeSnapshotLabel')}: ${fileChange.path}`}
                    className="max-h-full max-w-full rounded border border-subtle object-contain"
                  />
                ) : (
                  <span className="text-sm text-secondary">{t('sidebar.fileDiffViewer.noImageContent')}</span>
                )}
              </div>
            </div>
            <div className="flex flex-1 flex-col">
              <div className="border-b border-subtle bg-muted px-4 py-2 text-sm text-secondary">{t('sidebar.fileDiffViewer.afterSnapshotLabel')}</div>
              <div className="flex flex-1 items-center justify-center bg-card p-4">
                {snapshotImageUrls.after ? (
                  <img
                    src={snapshotImageUrls.after}
                    alt={`${t('sidebar.fileDiffViewer.afterSnapshotLabel')}: ${fileChange.path}`}
                    className="max-h-full max-w-full rounded border border-subtle object-contain"
                  />
                ) : (
                  <span className="text-sm text-secondary">{t('sidebar.fileDiffViewer.noImageContent')}</span>
                )}
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="w-full max-w-2xl rounded-lg border border-subtle bg-background p-4">
            <h4 className="text-sm font-semibold text-primary mb-3">{t('sidebar.fileDiffViewer.binarySnapshot')}</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded border border-subtle bg-elevated p-3">
                <div className="text-xs text-secondary">{t('sidebar.fileDiffViewer.beforeSnapshotLabel')}</div>
                <div className="mt-1 text-sm text-primary">
                  {t('sidebar.fileDiffViewer.binary')}: {snapshotDiff?.beforeKind === 'binary' ? t('sidebar.fileDiffViewer.binary') : snapshotDiff?.beforeKind === 'text' ? t('sidebar.fileDiffViewer.text') : t('sidebar.fileDiffViewer.none')}
                </div>
                <div className="text-sm text-primary">{t('sidebar.fileDiffViewer.size')}: {formatSize(snapshotDiff?.beforeSize)}</div>
              </div>
              <div className="rounded border border-subtle bg-elevated p-3">
                <div className="text-xs text-secondary">{t('sidebar.fileDiffViewer.afterSnapshotLabel')}</div>
                <div className="mt-1 text-sm text-primary">
                  {t('sidebar.fileDiffViewer.binary')}: {snapshotDiff?.afterKind === 'binary' ? t('sidebar.fileDiffViewer.binary') : snapshotDiff?.afterKind === 'text' ? t('sidebar.fileDiffViewer.text') : t('sidebar.fileDiffViewer.none')}
                </div>
                <div className="text-sm text-primary">{t('sidebar.fileDiffViewer.size')}: {formatSize(snapshotDiff?.afterSize)}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-secondary">{t('sidebar.fileDiffViewer.binaryContent')}</p>
          </div>
        </div>
      )
    }

    if (!content.showNativePanel && content.opfs === null) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-tertiary dark:text-muted">
          {fileChange.type === 'delete' ? t('sidebar.fileDiffViewer.fileDeleted') : t('sidebar.fileDiffViewer.cannotReadChangedVersion')}
        </div>
      )
    }

    // Default: use LazyDiffViewer (only shows changed hunks)
    // Switch to Monaco full editor when user clicks the button
    if (!useFullEditor) {
      return (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-tertiary dark:text-muted">
                  {t('sidebar.fileDiffViewer.loadingFile')}
                </div>
              }
            >
              <LazyDiffViewer
                original={originalText}
                modified={modifiedText}
                path={fileChange.path}
                isSplitView={isSplitView}
                onToggleSplitView={() => setIsSplitView((v) => !v)}
                onSwitchToMonaco={() => setUseFullEditor(true)}
                comments={currentFileComments.map((item) => ({
                  side: item.side,
                  startLine: item.startLine,
                  endLine: item.endLine,
                }))}
                selectedTarget={composer ? {
                  side: composer.side,
                  startLine: composer.startLine,
                  endLine: composer.endLine,
                } : null}
                onLineSelectForComment={(target) => {
                  setComposer((prev) => ({
                    side: target.side,
                    startLine: target.startLine,
                    endLine: target.endLine,
                    text: prev && prev.side === target.side ? prev.text : '',
                  }))
                }}
              />
            </Suspense>
          </div>

          {composer && (
            <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-850">
              <div className="flex items-center gap-2 px-3 py-1.5">
                <span className="shrink-0 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                  {composer.side === 'modified' ? t('sidebar.fileDiffViewer.modified') : t('sidebar.fileDiffViewer.current')}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-neutral-300 dark:text-neutral-600">
                  L{composer.startLine}{composer.startLine !== composer.endLine && `-${composer.endLine}`}
                </span>
                <div className="flex-1" />
                <kbd className="shrink-0 rounded border border-neutral-200 px-1 text-[10px] text-neutral-400 dark:border-neutral-600 dark:text-neutral-500">⌘↵</kbd>
                <button
                  type="button"
                  onClick={() => setComposer(null)}
                  className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-start gap-2 px-3 pb-2.5">
                <textarea
                  className="min-h-[48px] flex-1 resize-none rounded border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] leading-snug text-neutral-800 outline-none focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-neutral-500"
                  placeholder={t('sidebar.fileDiffViewer.addComment')}
                  autoFocus
                  rows={2}
                  value={composer.text}
                  onChange={(e) => setComposer((prev) => (prev ? { ...prev, text: e.target.value } : prev))}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setComposer(null)
                    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      addComment()
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addComment}
                  disabled={!composer.text.trim()}
                  className="mt-0.5 flex h-8 items-center rounded-md bg-neutral-900 px-3 text-[12px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-30 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  {t('sidebar.fileDiffViewer.send')}
                </button>
              </div>
            </div>
          )}
        </div>
      )
    }

    // Full Monaco editor
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-tertiary dark:text-muted">
                {t('sidebar.fileDiffViewer.loadingMonaco')}
              </div>
            }
          >
            <MonacoDiffEditor
              original={originalText}
              modified={modifiedText}
              path={fileChange.path}
              renderSideBySide={isSplitView}
              comments={currentFileComments.map((item) => ({
                side: item.side,
                startLine: item.startLine,
                endLine: item.endLine,
              }))}
              selectedTarget={composer ? {
                side: composer.side,
                startLine: composer.startLine,
                endLine: composer.endLine,
              } : null}
              onLineSelectForComment={(target) => {
                setComposer((prev) => ({
                  side: target.side,
                  startLine: target.startLine,
                  endLine: target.endLine,
                  text: prev && prev.side === target.side ? prev.text : '',
                }))
              }}
            />
          </Suspense>
        </div>

        {composer && (
          <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-850">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="shrink-0 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                {composer.side === 'modified' ? t('sidebar.fileDiffViewer.modified') : t('sidebar.fileDiffViewer.current')}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-neutral-300 dark:text-neutral-600">
                L{composer.startLine}{composer.startLine !== composer.endLine && `-${composer.endLine}`}
              </span>
              <div className="flex-1" />
              <kbd className="shrink-0 rounded border border-neutral-200 px-1 text-[10px] text-neutral-400 dark:border-neutral-600 dark:text-neutral-500">⌘↵</kbd>
              <button
                type="button"
                onClick={() => setComposer(null)}
                className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-start gap-2 px-3 pb-2.5">
              <textarea
                className="min-h-[48px] flex-1 resize-none rounded border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] leading-snug text-neutral-800 outline-none focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-neutral-500"
                placeholder={t('sidebar.fileDiffViewer.addComment')}
                autoFocus
                rows={2}
                value={composer.text}
                onChange={(e) => setComposer((prev) => (prev ? { ...prev, text: e.target.value } : prev))}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setComposer(null)
                  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    addComment()
                  }
                }}
              />
              <button
                type="button"
                onClick={addComment}
                disabled={!composer.text.trim()}
                className="mt-0.5 flex h-8 items-center rounded-md bg-neutral-900 px-3 text-[12px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-30 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {t('sidebar.fileDiffViewer.send')}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Compact header bar */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-3 dark:border-neutral-800 dark:bg-neutral-900/80">
        {/* Left: change indicator + file path */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`shrink-0 rounded-sm px-1.5 py-px text-[11px] font-semibold uppercase tracking-wider ${
            fileChange.type === 'add' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
            : fileChange.type === 'delete' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
          }`}>
            {fileChange.type === 'add' ? 'A' : fileChange.type === 'delete' ? 'D' : 'M'}
          </span>
          <span className="min-w-0 truncate font-mono text-[13px] text-neutral-700 dark:text-neutral-300" title={fileChange.path}>
            {fileChange.path}
          </span>
          {fileChange.size ? (
            <span className="shrink-0 text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
              {(fileChange.size / 1024).toFixed(1)}k
            </span>
          ) : null}
          {currentFileComments.length > 0 && (
            <span className="shrink-0 text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
              {t('sidebar.fileDiffViewer.commentsCount', { count: currentFileComments.length })}
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-1">
          {isSnapshotMode && (
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
              {snapshotDiff?.snapshotTitle || t('sidebar.fileDiffViewer.binarySnapshot')} · {formatTime(snapshotDiff?.capturedAt)}
            </span>
          )}
          {/* Inspect Element button for HTML files */}
          {isHtml && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleInspectElement}
                    className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-emerald-600 transition-colors hover:bg-emerald-100/60 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300"
                  >
                    <MousePointer2 className="h-3 w-3" />
                    {t('sidebar.fileDiffViewer.reviewElements')}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('sidebar.fileDiffViewer.previewHTMLNewTab')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {!isImage && (
            <>
              {/* Switch between Lazy and Full editor */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setUseFullEditor((v) => !v)}
                      className={`inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] transition-colors ${
                        useFullEditor
                          ? 'text-blue-600 hover:bg-blue-100/60 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30 dark:hover:text-blue-300'
                          : 'text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-300'
                      }`}
                    >
                      <FileText className="h-3 w-3" />
                      {useFullEditor ? t('sidebar.fileDiffViewer.changesOnly') : t('sidebar.fileDiffViewer.fullEditor')}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {useFullEditor ? t('sidebar.fileDiffViewer.switchToChangesOnly') : t('sidebar.fileDiffViewer.switchToFullEditor')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Split/Merge view toggle */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setIsSplitView((v) => !v)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-300"
                    >
                      {isSplitView ? <UnfoldVertical className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{isSplitView ? t('sidebar.fileDiffViewer.mergeView') : t('sidebar.fileDiffViewer.splitView')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          {isSnapshotMode && (
            <button
              type="button"
              onClick={copySnapshotTemplateForLLM}
              className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-300"
            >
              <Copy className="h-3 w-3" />
              {t('sidebar.fileDiffViewer.template')}
            </button>
          )}

        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {isImage ? (
          <>
            <div className={`flex flex-1 flex-col ${content.showNativePanel ? 'border-r border dark:border-border' : ''}`}>
              <div className="border-b border bg-muted px-4 py-2 dark:border-border dark:bg-muted">
                <h4 className="text-sm font-medium text-secondary dark:text-muted">
                  {content.showNativePanel ? (isSnapshotMode ? t('sidebar.fileDiffViewer.beforeSnapshotLabel') : t('sidebar.fileDiffViewer.currentFile')) : (isSnapshotMode ? t('sidebar.fileDiffViewer.afterSnapshotLabel') : t('sidebar.fileDiffViewer.changedVersion'))}
                  {!content.showNativePanel && fileChange.type === 'delete' && (
                    <span className="ml-2 text-xs text-red-600">{t('sidebar.fileDiffViewer.deleteWarning')}</span>
                  )}
                </h4>
              </div>
              <div className="flex flex-1 items-center justify-center overflow-auto bg-card p-4 dark:bg-card">
                {(content.showNativePanel ? content.nativeImageUrl : content.opfsImageUrl) ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox({
                        src: (content.showNativePanel ? content.nativeImageUrl : content.opfsImageUrl)!,
                        title: content.showNativePanel
                          ? `${isSnapshotMode ? t('sidebar.fileDiffViewer.beforeSnapshotLabel') : t('sidebar.fileDiffViewer.currentFile')} - ${fileChange.path}`
                          : `${isSnapshotMode ? t('sidebar.fileDiffViewer.afterSnapshotLabel') : t('sidebar.fileDiffViewer.changedVersion')} - ${fileChange.path}`,
                      })
                    }
                    className="flex h-full w-full items-center justify-center"
                  >
                    <img
                      src={(content.showNativePanel ? content.nativeImageUrl : content.opfsImageUrl)!}
                      alt={content.showNativePanel
                        ? `${isSnapshotMode ? t('sidebar.fileDiffViewer.beforeSnapshotLabel') : t('sidebar.fileDiffViewer.currentFile')}: ${fileChange.path}`
                        : `${isSnapshotMode ? t('sidebar.fileDiffViewer.afterSnapshotLabel') : t('sidebar.fileDiffViewer.changedVersion')}: ${fileChange.path}`}
                      className="max-h-full max-w-full rounded border border dark:border-border object-contain"
                      loading="lazy"
                    />
                  </button>
                ) : (
                  <div className="text-sm text-tertiary dark:text-muted">
                    {content.showNativePanel
                      ? t('sidebar.fileDiffViewer.cannotReadNativeImage')
                      : fileChange.type === 'delete'
                        ? t('sidebar.fileDiffViewer.imageWillBeDeleted')
                        : t('sidebar.fileDiffViewer.cannotReadChangedImage')}
                  </div>
                )}
              </div>
            </div>

            {content.showNativePanel && (
              <div className="flex flex-1 flex-col">
                <div className="border-b border bg-muted px-4 py-2 dark:border-border dark:bg-muted">
                  <h4 className="text-sm font-medium text-secondary dark:text-muted">
                    {isSnapshotMode ? t('sidebar.fileDiffViewer.afterSnapshotLabel') : t('sidebar.fileDiffViewer.changedVersion')}
                    {fileChange.type === 'delete' && <span className="ml-2 text-xs text-red-600">{t('sidebar.fileDiffViewer.deleteWarning')}</span>}
                  </h4>
                </div>
                <div className="flex flex-1 items-center justify-center overflow-auto bg-card p-4 dark:bg-card">
                  {content.opfsImageUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          src: content.opfsImageUrl!,
                          title: `${t('sidebar.fileDiffViewer.changedVersion')} - ${fileChange.path}`,
                        })
                      }
                      className="flex h-full w-full items-center justify-center"
                    >
                      <img
                        src={content.opfsImageUrl}
                        alt={`${t('sidebar.fileDiffViewer.changedVersion')}: ${fileChange.path}`}
                        className="max-h-full max-w-full rounded border border dark:border-border object-contain"
                        loading="lazy"
                      />
                    </button>
                  ) : (
                    <div className="text-sm text-tertiary dark:text-muted">
                      {fileChange.type === 'delete' ? t('sidebar.fileDiffViewer.imageWillBeDeleted') : t('sidebar.fileDiffViewer.cannotReadChangedImage')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 overflow-hidden bg-card dark:bg-card">{renderTextDiff()}</div>
        )}
      </div>

      {currentFileComments.length > 0 && (
        <div className="border-t bg-elevated px-4 py-2">
          <div className="text-xs text-secondary mb-1">{t('sidebar.fileDiffViewer.currentFileComments')}</div>
          <div className="flex flex-wrap gap-2">
            {currentFileComments.map((item) => (
              <div key={item.id} className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs">
                <span className="font-medium">
                  {item.side === 'modified' ? t('sidebar.fileDiffViewer.modified') : t('sidebar.fileDiffViewer.current')}{' '}
                  {item.startLine === item.endLine ? `L${item.startLine}` : `L${item.startLine}-L${item.endLine}`}
                </span>
                <span className="max-w-[360px] truncate" title={item.text}>{item.text}</span>
                <button className="text-tertiary hover:text-destructive" onClick={() => removeComment(item.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80" onClick={() => setLightbox(null)} role="presentation">
          <div className="flex items-center justify-between bg-black/40 px-4 py-3 text-white">
            <div className="truncate pr-3 text-sm">{lightbox.title}</div>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-card/10"
            >
              {t('sidebar.fileDiffViewer.close')}
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.title} className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
