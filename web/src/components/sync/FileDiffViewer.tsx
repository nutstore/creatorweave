/**
 * FileDiffViewer Component
 *
 * Displays side-by-side diff between OPFS and Native FS versions.
 * Uses Monaco DiffEditor for text comparison.
 */

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { type ChangeType, type FileChange } from '@/opfs/types/opfs-types'
import { getActiveConversation } from '@/store/conversation-context.store'
import { BrandButton } from '@creatorweave/ui'
import { Badge } from '@/components/ui/badge'
import {
  isImageFile,
  fileExistsInNativeFS,
  readFileFromOPFS,
  readFileFromNativeFS,
  readBinaryFileFromOPFS,
  readBinaryFileFromNativeFS,
} from '@/opfs'

const MonacoDiffEditor = React.lazy(() => import('./MonacoDiffEditor'))

type CommentSide = 'original' | 'modified'

type LineComment = {
  id: string
  path: string
  side: CommentSide
  startLine: number
  endLine: number
  text: string
  createdAt: number
}

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

export const FileDiffViewer: React.FC<FileDiffViewerProps> = ({ fileChange, snapshotDiff = null }) => {
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
  const [commentsByPath, setCommentsByPath] = useState<Record<string, LineComment[]>>({})
  const [composer, setComposer] = useState<{ side: CommentSide; startLine: number; endLine: number; text: string } | null>(null)
  const activePath = fileChange?.path ?? ''
  const isSnapshotMode = Boolean(snapshotDiff)
  const hasBinarySnapshot = isSnapshotMode && (
    snapshotDiff?.beforeKind === 'binary' || snapshotDiff?.afterKind === 'binary'
  )
  const currentFileComments = activePath ? commentsByPath[activePath] ?? [] : []
  const allComments = useMemo(
    () => Object.values(commentsByPath).flat().sort((a, b) => a.createdAt - b.createdAt),
    [commentsByPath]
  )

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
          throw new Error('未激活的工作区')
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
        <h3 className="mb-2 text-lg font-medium text-primary dark:text-primary-foreground">选择文件查看详情</h3>
        <p className="max-w-sm text-sm text-tertiary dark:text-muted">从左侧列表选择一个文件，查看变更版本与当前文件的差异</p>
      </div>
    )
  }

  if (content.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          <p className="text-sm text-tertiary dark:text-muted">加载文件内容...</p>
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
          <h3 className="mb-2 text-lg font-medium text-primary dark:text-primary-foreground">加载失败</h3>
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

  const isImage = !isSnapshotMode && isImageFile(fileChange.path)
  const color = getChangeTypeColor(fileChange.type)
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
      [activePath]: (prev[activePath] ?? []).filter((item) => item.id !== id),
    }))
  }

  const copyCommentsForLLM = async () => {
    if (allComments.length === 0) return

    const payload = allComments
      .map((item) => {
        const sideLabel = item.side === 'modified'
          ? (isSnapshotMode ? '快照后' : '变更版本')
          : (isSnapshotMode ? '快照前' : '当前文件')
        const lineLabel = item.startLine === item.endLine
          ? `L${item.startLine}`
          : `L${item.startLine}-L${item.endLine}`
        return `- ${item.path} [${sideLabel} ${lineLabel}] ${item.text}`
      })
      .join('\n')

    const contentToCopy = `${payload}`

    try {
      await navigator.clipboard.writeText(contentToCopy)
    } catch {
      // fallback for limited environments
      const textArea = document.createElement('textarea')
      textArea.value = contentToCopy
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
  }

  const copySnapshotTemplateForLLM = async () => {
    if (!isSnapshotMode || !fileChange) return

    const beforeType = snapshotDiff?.beforeKind === 'binary' ? 'binary' : snapshotDiff?.beforeKind === 'text' ? 'text' : 'none'
    const afterType = snapshotDiff?.afterKind === 'binary' ? 'binary' : snapshotDiff?.afterKind === 'text' ? 'text' : 'none'

    const beforeContent = beforeType === 'text' ? (snapshotDiff?.originalText || '') : `[${beforeType}]`
    const afterContent = afterType === 'text' ? (snapshotDiff?.modifiedText || '') : `[${afterType}]`

    const template = [
      '请基于下面这个文件快照做审阅并给出修改建议：',
      `文件: ${fileChange.path}`,
      `变更类型: ${fileChange.type}`,
      `快照: ${snapshotDiff?.snapshotTitle || '-'}`,
      `记录时间: ${formatTime(snapshotDiff?.capturedAt)}`,
      `before(${beforeType}, ${formatSize(snapshotDiff?.beforeSize)}):`,
      '```',
      beforeContent,
      '```',
      `after(${afterType}, ${formatSize(snapshotDiff?.afterSize)}):`,
      '```',
      afterContent,
      '```',
      '请输出：',
      '1) 问题清单（按严重度）',
      '2) 可直接执行的修改建议',
      '3) 如需改代码，请给出最小改动补丁',
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
              <div className="border-b border-subtle bg-muted px-4 py-2 text-sm text-secondary">快照前</div>
              <div className="flex flex-1 items-center justify-center bg-card p-4">
                {snapshotImageUrls.before ? (
                  <img
                    src={snapshotImageUrls.before}
                    alt={`快照前: ${fileChange.path}`}
                    className="max-h-full max-w-full rounded border border-subtle object-contain"
                  />
                ) : (
                  <span className="text-sm text-secondary">无图片内容</span>
                )}
              </div>
            </div>
            <div className="flex flex-1 flex-col">
              <div className="border-b border-subtle bg-muted px-4 py-2 text-sm text-secondary">快照后</div>
              <div className="flex flex-1 items-center justify-center bg-card p-4">
                {snapshotImageUrls.after ? (
                  <img
                    src={snapshotImageUrls.after}
                    alt={`快照后: ${fileChange.path}`}
                    className="max-h-full max-w-full rounded border border-subtle object-contain"
                  />
                ) : (
                  <span className="text-sm text-secondary">无图片内容</span>
                )}
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="w-full max-w-2xl rounded-lg border border-subtle bg-background p-4">
            <h4 className="text-sm font-semibold text-primary mb-3">二进制快照对比</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded border border-subtle bg-elevated p-3">
                <div className="text-xs text-secondary">快照前</div>
                <div className="mt-1 text-sm text-primary">
                  类型: {snapshotDiff?.beforeKind === 'binary' ? '二进制' : snapshotDiff?.beforeKind === 'text' ? '文本' : '无'}
                </div>
                <div className="text-sm text-primary">大小: {formatSize(snapshotDiff?.beforeSize)}</div>
              </div>
              <div className="rounded border border-subtle bg-elevated p-3">
                <div className="text-xs text-secondary">快照后</div>
                <div className="mt-1 text-sm text-primary">
                  类型: {snapshotDiff?.afterKind === 'binary' ? '二进制' : snapshotDiff?.afterKind === 'text' ? '文本' : '无'}
                </div>
                <div className="text-sm text-primary">大小: {formatSize(snapshotDiff?.afterSize)}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-secondary">二进制内容不支持文本行级 diff，请下载文件或使用专用二进制比对工具。</p>
          </div>
        </div>
      )
    }

    if (!content.showNativePanel && content.opfs === null) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-tertiary dark:text-muted">
          {fileChange.type === 'delete' ? '文件已删除（变更版本中无内容）' : '无法读取变更版本内容'}
        </div>
      )
    }

    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-tertiary dark:text-muted">
            正在加载 Monaco 编辑器...
          </div>
        }
      >
        <MonacoDiffEditor
          original={originalText}
          modified={modifiedText}
          path={fileChange.path}
          comments={currentFileComments.map((item) => ({
            side: item.side,
            startLine: item.startLine,
            endLine: item.endLine,
          }))}
          onLineSelectForComment={(target) => {
            setComposer({
              side: target.side,
              startLine: target.startLine,
              endLine: target.endLine,
              text: '',
            })
          }}
        />
      </Suspense>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border bg-muted px-4 py-3 dark:border-border dark:bg-muted">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full bg-${color}-100 px-2 py-1 text-xs font-medium text-${color}-700`}>
                {getChangeTypeLabel(fileChange.type)}
              </span>
              <span className="text-sm font-medium text-primary dark:text-primary-foreground" title={fileChange.path}>
                {fileChange.path.length > 40 ? `...${fileChange.path.slice(-37)}` : fileChange.path}
              </span>
            </div>
            <p className="mt-1 text-xs text-tertiary dark:text-muted">
              {fileChange.size ? `${(fileChange.size / 1024).toFixed(1)} KB` : '-'}
            </p>
          </div>
          <div className="flex items-center gap-2">
              {isSnapshotMode && (
                <Badge variant="outline">{snapshotDiff?.snapshotTitle || '快照对比'}</Badge>
              )}
              {isSnapshotMode && (
                <Badge variant="outline">记录时间 {formatTime(snapshotDiff?.capturedAt)}</Badge>
              )}
              <Badge variant="outline">评论 {allComments.length}</Badge>
              {isSnapshotMode && (
                <BrandButton variant="outline" onClick={copySnapshotTemplateForLLM}>
                  复制快照模板
                </BrandButton>
              )}
              <BrandButton variant="outline" onClick={copyCommentsForLLM} disabled={allComments.length === 0}>
                复制评论
              </BrandButton>
          </div>
        </div>
      </div>

      {composer && (
        <div className="border-b bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-secondary mb-2">
            <Badge variant="outline">{composer.side === 'modified' ? '变更版本' : '当前文件'}</Badge>
            <span>
              {composer.startLine === composer.endLine
                ? `第 ${composer.startLine} 行`
                : `第 ${composer.startLine}-${composer.endLine} 行`}
            </span>
            <span>点击行号可单行评论，Shift+点击可选中多行</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="h-9 flex-1 rounded border border-input bg-background px-3 text-sm"
              placeholder="输入此行修改意见..."
              value={composer.text}
              onChange={(e) => setComposer((prev) => (prev ? { ...prev, text: e.target.value } : prev))}
            />
            <BrandButton variant="outline" onClick={() => setComposer(null)}>
              取消
            </BrandButton>
            <BrandButton variant="primary" onClick={addComment} disabled={!composer.text.trim()}>
              添加评论
            </BrandButton>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {isImage ? (
          <>
            <div className={`flex flex-1 flex-col ${content.showNativePanel ? 'border-r border dark:border-border' : ''}`}>
              <div className="border-b border bg-muted px-4 py-2 dark:border-border dark:bg-muted">
                <h4 className="text-sm font-medium text-secondary dark:text-muted">
                  {content.showNativePanel ? (isSnapshotMode ? '快照前' : '当前文件') : (isSnapshotMode ? '快照后' : '变更版本')}
                  {!content.showNativePanel && fileChange.type === 'delete' && (
                    <span className="ml-2 text-xs text-red-600">(将被删除)</span>
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
                          ? `${isSnapshotMode ? '快照前' : '当前文件'} - ${fileChange.path}`
                          : `${isSnapshotMode ? '快照后' : '变更版本'} - ${fileChange.path}`,
                      })
                    }
                    className="flex h-full w-full items-center justify-center"
                  >
                    <img
                      src={(content.showNativePanel ? content.nativeImageUrl : content.opfsImageUrl)!}
                      alt={content.showNativePanel
                        ? `${isSnapshotMode ? '快照前' : '当前文件'}: ${fileChange.path}`
                        : `${isSnapshotMode ? '快照后' : '变更版本'}: ${fileChange.path}`}
                      className="max-h-full max-w-full rounded border border dark:border-border object-contain"
                      loading="lazy"
                    />
                  </button>
                ) : (
                  <div className="text-sm text-tertiary dark:text-muted">
                    {content.showNativePanel
                      ? '无法读取本机图片'
                      : fileChange.type === 'delete'
                        ? '图片将被删除（变更版本中无内容）'
                        : '无法读取变更版本图片'}
                  </div>
                )}
              </div>
            </div>

            {content.showNativePanel && (
              <div className="flex flex-1 flex-col">
                <div className="border-b border bg-muted px-4 py-2 dark:border-border dark:bg-muted">
                  <h4 className="text-sm font-medium text-secondary dark:text-muted">
                    {isSnapshotMode ? '快照后' : '变更版本'}
                    {fileChange.type === 'delete' && <span className="ml-2 text-xs text-red-600">(将被删除)</span>}
                  </h4>
                </div>
                <div className="flex flex-1 items-center justify-center overflow-auto bg-card p-4 dark:bg-card">
                  {content.opfsImageUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({
                          src: content.opfsImageUrl!,
                          title: `变更版本 - ${fileChange.path}`,
                        })
                      }
                      className="flex h-full w-full items-center justify-center"
                    >
                      <img
                        src={content.opfsImageUrl}
                        alt={`变更版本: ${fileChange.path}`}
                        className="max-h-full max-w-full rounded border border dark:border-border object-contain"
                        loading="lazy"
                      />
                    </button>
                  ) : (
                    <div className="text-sm text-tertiary dark:text-muted">
                      {fileChange.type === 'delete' ? '图片将被删除（变更版本中无内容）' : '无法读取变更版本图片'}
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
          <div className="text-xs text-secondary mb-1">当前文件评论</div>
          <div className="flex flex-wrap gap-2">
            {currentFileComments.map((item) => (
              <div key={item.id} className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs">
                <span className="font-medium">
                  {item.side === 'modified' ? '变更' : '当前'}{' '}
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
              关闭
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
