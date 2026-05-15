/**
 * FilePreview - read-only file content display with Monaco Editor.
 * Supports text files with syntax highlighting and images with direct display.
 *
 * Comment feature:
 * - Click line numbers to start a single-line comment
 * - Shift+Click line numbers for multi-line selection
 * - Send comments to AI conversation
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { X, FileText, Copy, Check, Eye, Code, MessageSquare, Send, Trash2 } from 'lucide-react'
import { Editor, type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { formatBytes } from '@/lib/utils'
import { useT } from '@/i18n'
import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'
import { useConversationStore } from '@/store/conversation.store'
import { useAgentStore } from '@/store/agent.store'
import { useSettingsStore } from '@/store/settings.store'
import { createUserMessage } from '@/agent/message-types'
import { toast } from 'sonner'
import { OfficePreview, OFFICE_EXTS } from './OfficePreview'

// ── Comment Types ──────────────────────────────────────────────────────────

interface LineComment {
  id: string
  path: string
  startLine: number
  endLine: number
  text: string
  createdAt: number
}

// ── FilePreview Props ──────────────────────────────────────────────────────

interface FilePreviewProps {
  filePath: string | null
  fileHandle: FileSystemFileHandle | null
  onClose: () => void
  /** Pre-loaded Blob to display (e.g. from OPFS assets/). When provided, skips OPFS/disk read. */
  blob?: Blob | null
}

/** Get Monaco language ID from file path */
function getMonacoLanguage(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.ts')) return 'typescript'
  if (lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js')) return 'javascript'
  if (lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.html')) return 'html'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.scss')) return 'scss'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.java')) return 'java'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml'
  if (lower.endsWith('.xml')) return 'xml'
  if (lower.endsWith('.sql')) return 'sql'
  if (lower.endsWith('.sh')) return 'shell'
  if (lower.endsWith('.bash')) return 'shell'
  if (lower.endsWith('.zsh')) return 'shell'
  if (lower.endsWith('.dockerfile')) return 'dockerfile'
  if (lower.endsWith('.vue')) return 'html'
  if (lower.endsWith('.php')) return 'php'
  if (lower.endsWith('.rb')) return 'ruby'
  if (lower.endsWith('.swift')) return 'swift'
  if (lower.endsWith('.kt')) return 'kotlin'
  if (lower.endsWith('.c')) return 'c'
  if (lower.endsWith('.cpp') || lower.endsWith('.hpp')) return 'cpp'
  if (lower.endsWith('.h')) return 'c'
  return 'plaintext'
}

/** Image extensions for direct display */
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg'])

/** DOCX extensions for docx-preview rendering */
const DOCX_EXTS = new Set(['docx'])

/** Office file extensions (previewed via eo2suite) */
// (imported from OfficePreview: OFFICE_EXTS = xlsx, xls, pptx, ppt, doc)

/** Binary (non-image, non-docx, non-office) extensions */
const BINARY_EXTS = new Set([
  'wasm', 'zip', 'gz', 'tar', 'br', 'zst', 'pdf',
  'mp3', 'mp4', 'webm', 'ogg', 'wav', 'avi', 'woff', 'woff2', 'ttf', 'eot', 'otf',
  'exe', 'dll', 'so', 'dylib',
])

/** Text extensions */
const TEXT_EXTS = new Set([
  'txt', 'md', 'mdx', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'env',
  'xml', 'svg', 'html', 'htm', 'css', 'scss', 'less',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx',
  'py', 'rs', 'go', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'zsh', 'sql', 'graphql', 'gql', 'php', 'rb', 'vue', 'svelte',
  'lock', 'gitignore', 'editorconfig', 'dockerfile', 'makefile',
])

/** HTML extensions for rendered preview */
const HTML_EXTS = new Set(['html', 'htm'])

function getFileType(path: string): 'text' | 'image' | 'binary' | 'docx' | 'html' | 'office' {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (DOCX_EXTS.has(ext)) return 'docx'
  if (HTML_EXTS.has(ext)) return 'html'
  if (OFFICE_EXTS.has(ext)) return 'office'
  if (TEXT_EXTS.has(ext)) return 'text'
  if (BINARY_EXTS.has(ext)) return 'binary'
  // Unknown extension - try text
  return 'text'
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function FilePreview({ filePath, fileHandle, onClose, blob: externalBlob }: FilePreviewProps) {
  const t = useT()
  const display = useWorkspacePreferencesStore((s) => s.display)
  const [content, setContent] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [diskNewer, setDiskNewer] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null)
  const [officeBlob, setOfficeBlob] = useState<Blob | null>(null)
  const docxContainerRef = useRef<HTMLDivElement>(null)
  // HTML preview: toggle between rendered preview and source code
  const [previewMode, setPreviewMode] = useState<'preview' | 'source'>('source')
  const [isDark, setIsDark] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  // ── Comment State ──────────────────────────────────────────────────────
  const [comments, setComments] = useState<LineComment[]>([])
  const [composer, setComposer] = useState<{
    startLine: number
    endLine: number
    text: string
  } | null>(null)
  // Multi-line selection: track anchor line (like LazyDiffViewer's Shift+Click)
  const anchorLineRef = useRef<number | null>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  // Monaco decorations for comment highlights
  const decorationsRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)

  const fileType = useMemo(() => (filePath ? getFileType(filePath) : 'text'), [filePath])

  // Create blob URL for HTML preview
  const htmlBlobUrl = useMemo(() => {
    if (fileType !== 'html' || !content) return null
    const blob = new Blob([content], { type: 'text/html' })
    return URL.createObjectURL(blob)
  }, [fileType, content])

  // Clean up HTML blob URL
  useEffect(() => {
    return () => {
      if (htmlBlobUrl) {
        URL.revokeObjectURL(htmlBlobUrl)
      }
    }
  }, [htmlBlobUrl])

  // Reset preview mode when file changes
  useEffect(() => {
    setPreviewMode('preview')
  }, [filePath])

  // Reset comments when file changes
  useEffect(() => {
    setComments([])
    setComposer(null)
    anchorLineRef.current = null
  }, [filePath])

  // Track dark mode changes
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const updateTheme = () => setIsDark(root.classList.contains('dark'))

    updateTheme()

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          updateTheme()
          break
        }
      }
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  // ── Update Monaco decorations for comments & selection ─────────────────
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const newDecorations: MonacoEditor.IModelDeltaDecoration[] = []

    // Highlight commented lines
    for (const comment of comments) {
      for (let line = comment.startLine; line <= comment.endLine; line++) {
        newDecorations.push({
          range: {
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: 'fp-commented-line',
            glyphMarginClassName: 'fp-commented-glyph',
            glyphMarginHoverMessage: { value: comment.text },
          },
        })
      }
    }

    // Highlight selected composer range
    if (composer) {
      for (let line = composer.startLine; line <= composer.endLine; line++) {
        newDecorations.push({
          range: {
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: 'fp-selected-line',
            glyphMarginClassName: 'fp-selected-glyph',
          },
        })
      }
    }

    if (decorationsRef.current) {
      decorationsRef.current.clear()
    }
    decorationsRef.current = editor.createDecorationsCollection(newDecorations)
  }, [comments, composer])

  // ── Monaco Editor Mount Handler ────────────────────────────────────────
  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor

    // Enable glyph margin for comment indicators
    editor.updateOptions({ glyphMargin: true })

    // Click on line numbers or glyph margin to select lines for commenting
    editor.onMouseDown((e) => {
      // Only handle clicks on line numbers or glyph margin
      const target = e.target
      if (
        target.type !== 2 && // GUTTER_GLYPH_MARGIN
        target.type !== 3 && // GUTTER_LINE_NUMBERS
        target.type !== 4    // GUTTER_LINE_DECORATIONS
      ) {
        return
      }

      const lineNumber = target.position?.lineNumber
      if (!lineNumber) return

      const isShift = e.event.shiftKey

      if (isShift && anchorLineRef.current !== null) {
        // Shift+Click: extend selection from anchor
        const anchorLine = anchorLineRef.current
        const startLine = Math.min(anchorLine, lineNumber)
        const endLine = Math.max(anchorLine, lineNumber)
        setComposer((prev) => ({
          startLine,
          endLine,
          text: prev?.text ?? '',
        }))
      } else {
        // Normal click: single line selection
        anchorLineRef.current = lineNumber
        setComposer((prev) => ({
          startLine: lineNumber,
          endLine: lineNumber,
          text: prev?.text ?? '',
        }))
      }
    })
  }, [])

  // ── Comment Actions ────────────────────────────────────────────────────

  const addComment = useCallback(() => {
    if (!composer || !filePath) return
    const text = composer.text.trim()
    if (!text) return

    const comment: LineComment = {
      id: `${filePath}:${composer.startLine}-${composer.endLine}:${Date.now()}`,
      path: filePath,
      startLine: composer.startLine,
      endLine: composer.endLine,
      text,
      createdAt: Date.now(),
    }

    setComments((prev) => [...prev, comment])
    setComposer(null)
    anchorLineRef.current = null
  }, [composer, filePath])

  const removeComment = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const clearAllComments = useCallback(() => {
    setComments([])
    setComposer(null)
    anchorLineRef.current = null
  }, [])

  /** Send comments to AI conversation */
  const sendCommentsToAI = useCallback(async () => {
    if (comments.length === 0 || !filePath) return

    const payload = comments
      .map((item) => {
        const lineLabel = item.startLine === item.endLine
          ? `L${item.startLine}`
          : `L${item.startLine}-L${item.endLine}`
        return `- ${item.path} [${lineLabel}] ${item.text}`
      })
      .join('\n')

    const prompt = `Please review the following inline comments I left on the file:\n\n${payload}`

    const settings = useSettingsStore.getState()
    if (!settings.hasApiKey) {
      toast.error(t('conversation.toast.noApiKey'))
      return
    }

    // Close preview drawer first
    onClose()

    // Ensure conversation exists
    const conversationStore = useConversationStore.getState()
    const { directoryHandle } = useAgentStore.getState()
    let targetConvId = conversationStore.activeConversationId
    if (!targetConvId) {
      const conv = conversationStore.createNew('File Comments Review')
      targetConvId = conv.id
      await conversationStore.setActive(targetConvId)
    }

    if (conversationStore.isConversationRunning(targetConvId)) {
      toast.error(t('conversation.toast.stopBeforeSend'))
      return
    }

    const userMessage = createUserMessage(prompt)
    const currentConv = conversationStore.conversations.find((c) => c.id === targetConvId)
    const currentMessages = currentConv ? [...currentConv.messages, userMessage] : [userMessage]
    conversationStore.updateMessages(targetConvId, currentMessages)

    // Clear comments after sending
    setComments([])
    setComposer(null)
    anchorLineRef.current = null

    await conversationStore.runAgent(
      targetConvId,
      settings.providerType,
      settings.modelName,
      settings.maxTokens,
      directoryHandle
    )
  }, [comments, filePath, t, onClose])

  // Load file content when filePath or fileHandle changes
  useEffect(() => {
    if (!filePath) {
      setContent(null)
      setImageUrl(null)
      setDocxBlob(null)
      setOfficeBlob(null)
      setError(null)
      setDiskNewer(false)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    async function loadFile() {
      setLoading(true)
      setError(null)
      setContent(null)
      setImageUrl(null)
      setDocxBlob(null)
      setOfficeBlob(null)
      setDiskNewer(false)

      try {
        let text: string | undefined
        let blob: Blob | undefined
        let fileSize = 0
        let opfsMtime: number | null = null
        let diskMtime: number | null = null

        // Fast path: external blob provided (e.g. from OPFS assets/)
        if (externalBlob) {
          fileSize = externalBlob.size
          if (fileType === 'image' || fileType === 'docx' || fileType === 'office') {
            blob = externalBlob
          } else {
            text = await externalBlob.text()
          }
        } else {
          try {
            const opfs = (await import('@/store/opfs.store')).useOPFSStore.getState()
            const result = await opfs.readFile(filePath!)

            if (result.content instanceof Blob) {
              blob = result.content
              fileSize = result.content.size
            } else if (typeof result.content === 'string') {
              text = result.content
              fileSize = new Blob([result.content]).size
            } else {
              // ArrayBuffer - for docx/office, keep as Blob; for text, decode it
              const buffer = result.content as ArrayBuffer
              fileSize = buffer.byteLength
              if (fileType === 'docx' || fileType === 'office') {
                blob = new Blob([buffer])
              } else {
                const decoder = new TextDecoder()
                text = decoder.decode(buffer)
              }
            }
            opfsMtime = result.metadata.mtime || null
          } catch {
            // OPFS read failed, will try disk
          }

          if (fileHandle) {
            try {
              const diskFile = await fileHandle.getFile()
              diskMtime = diskFile.lastModified

              if (opfsMtime !== null && diskMtime > opfsMtime) {
                fileSize = diskFile.size
                if (fileType === 'image' || fileType === 'docx' || fileType === 'office') {
                  blob = diskFile
                } else {
                  text = await diskFile.text()
                }
                setDiskNewer(true)
              } else if (opfsMtime === null) {
                fileSize = diskFile.size
                if (fileType === 'image' || fileType === 'docx' || fileType === 'office') {
                  blob = diskFile
                } else {
                  text = await diskFile.text()
                }
              }
            } catch {
              // Disk read failed, rely on OPFS if available
            }
          } else if (!text && !blob) {
            setError(t('filePreview.cannotReadFile'))
            setLoading(false)
            return
          }
        } // end else (no externalBlob)

        if (!text && !blob) {
          setError(t('filePreview.cannotReadFile'))
          setLoading(false)
          return
        }

        if (cancelled) return

        if (fileSize > MAX_FILE_SIZE) {
          setError(t('filePreview.fileTooLarge', { size: formatBytes(fileSize), maxSize: formatBytes(MAX_FILE_SIZE) }))
          setLoading(false)
          return
        }

        setFileSize(fileSize)

        if (fileType === 'image' && blob) {
          objectUrl = URL.createObjectURL(blob)
          setImageUrl(objectUrl)
        } else if (fileType === 'docx' && blob) {
          setDocxBlob(blob)
        } else if (fileType === 'office' && blob) {
          setOfficeBlob(blob)
        } else if (text !== undefined) {
          setContent(text)
        }
      } catch (err) {
        if (!cancelled) {
          setError(t('filePreview.readFileFailed', { error: err instanceof Error ? err.message : String(err) }))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadFile()

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [filePath, fileHandle, fileType, externalBlob])

  // Render docx into container
  useEffect(() => {
    if (fileType !== 'docx' || !docxBlob || !docxContainerRef.current) return

    let cancelled = false
    const container = docxContainerRef.current

    import('docx-preview').then(({ renderAsync }) => {
      if (cancelled) return
      renderAsync(docxBlob, container, undefined, {
        className: 'docx-preview',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
      }).catch((err: unknown) => {
        if (!cancelled) {
          setError(t('filePreview.readFileFailed', { error: err instanceof Error ? err.message : String(err) }))
        }
      })
    })

    return () => {
      cancelled = true
      container.innerHTML = ''
    }
  }, [fileType, docxBlob, t])

  const handleCopy = useCallback(async () => {
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-neutral-950">
        <div className="text-center text-neutral-400">
          <FileText className="mx-auto mb-2 h-6 w-6" />
          <p className="text-xs">{t('filePreview.clickFileTreeToPreview')}</p>
        </div>
      </div>
    )
  }

  const fileName = filePath.split('/').pop() || filePath
  const language = getMonacoLanguage(filePath)

  // Check if current file is commentable (text source view)
  const isCommentable = content && !loading && !error && (
    fileType === 'text' || (fileType === 'html' && previewMode === 'source')
  )

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-white dark:bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-700">
        <div className="flex min-w-0 items-center gap-2">
          {diskNewer && (
            <span
              className="shrink-0 rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning"
              title={t('filePreview.diskFileNewer')}
            >
              {t('filePreview.conflict')}
            </span>
          )}
          <span className="truncate text-xs font-medium text-neutral-700 dark:text-neutral-200" title={filePath}>
            {fileName}
          </span>
          <span className="shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">{formatBytes(fileSize)}</span>
          {/* Comment count badge */}
          {comments.length > 0 && (
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              <MessageSquare className="h-2.5 w-2.5" />
              {comments.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* HTML preview/source toggle */}
          {fileType === 'html' && content && !loading && !error && (
            <div className="flex items-center rounded border border-neutral-200 dark:border-neutral-600">
              <button
                type="button"
                onClick={() => setPreviewMode('preview')}
                className={`rounded-l px-1.5 py-0.5 text-[10px] ${
                  previewMode === 'preview'
                    ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-800'
                    : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
                title={t('filePreview.preview')}
              >
                <Eye className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('source')}
                className={`rounded-r px-1.5 py-0.5 text-[10px] ${
                  previewMode === 'source'
                    ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-800'
                    : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
                title={t('filePreview.source')}
              >
                <Code className="h-3 w-3" />
              </button>
            </div>
          )}
          {/* Comment hint for text files */}
          {isCommentable && !composer && (
            <span className="hidden shrink-0 text-[10px] text-neutral-300 dark:text-neutral-600 sm:inline">
              {t('filePreview.clickLineToComment')}
            </span>
          )}
          {content && (
            <button
              type="button"
              onClick={handleCopy}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              title={t('filePreview.copyContent')}
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title={t('filePreview.close')}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="p-4 text-center text-xs text-neutral-400">Loading...</div>}

        {error && <div className="p-4 text-center text-xs text-red-500">{error}</div>}

        {/* Image preview */}
        {fileType === 'image' && imageUrl && !loading && (
          <div className="flex h-full items-center justify-center p-4">
            <img
              src={imageUrl}
              alt={fileName}
              className="max-h-full max-w-full object-contain"
              style={{ imageRendering: fileName.endsWith('.ico') ? 'pixelated' : 'auto' }}
            />
          </div>
        )}

        {/* DOCX preview */}
        {fileType === 'docx' && docxBlob && !loading && !error && (
          <div ref={docxContainerRef} className="docx-preview-container h-full" />
        )}

        {/* Office file preview (xlsx, xls, pptx, ppt, doc) via eo2suite */}
        {fileType === 'office' && officeBlob && !loading && !error && (
          <OfficePreview blob={officeBlob} fileName={fileName} fileSize={fileSize} />
        )}

        {/* Binary (non-image) file */}
        {fileType === 'binary' && !loading && !error && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <FileText className="h-8 w-8 text-neutral-300" />
            <p className="text-xs text-neutral-500">{t('filePreview.binaryFile')}</p>
            <p className="text-[10px] text-neutral-400">
              {fileName} ({formatBytes(fileSize)})
            </p>
          </div>
        )}

        {/* HTML rendered preview */}
        {fileType === 'html' && previewMode === 'preview' && htmlBlobUrl && !loading && !error && (
          <iframe
            src={htmlBlobUrl}
            title="HTML Preview"
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
        )}

        {/* Monaco Editor for text files and HTML source view */}
        {content && ((fileType === 'text') || (fileType === 'html' && previewMode === 'source')) && !loading && !error && (
          <Editor
            height="100%"
            language={language}
            value={content}
            theme={isDark ? 'vs-dark' : 'vs'}
            onMount={handleEditorMount}
            options={{
              readOnly: true,
              minimap: { enabled: display.showMiniMap },
              lineNumbers: display.showLineNumbers ? 'on' : 'off',
              scrollBeyondLastLine: false,
              wordWrap: display.wordWrap ? 'on' : 'off',
              automaticLayout: true,
              fontSize: display.fontSize === 'small' ? 11 : display.fontSize === 'large' ? 14 : 12,
              padding: { top: 8, bottom: 8 },
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
              glyphMargin: true,
            }}
          />
        )}
      </div>

      {/* ── Comment Composer ─────────────────────────────────────────────── */}
      {composer && (
        <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-850">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="shrink-0 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
              {composer.startLine === composer.endLine
                ? `L${composer.startLine}`
                : `L${composer.startLine}-L${composer.endLine}`}
            </span>
            <div className="flex-1" />
            <kbd className="shrink-0 rounded border border-neutral-200 px-1 text-[10px] text-neutral-400 dark:border-neutral-600 dark:text-neutral-500">⌘↵</kbd>
            <button
              type="button"
              onClick={() => {
                setComposer(null)
                anchorLineRef.current = null
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-start gap-2 px-3 pb-2.5">
            <textarea
              className="min-h-[48px] flex-1 resize-none rounded border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] leading-snug text-neutral-800 outline-none focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-neutral-500"
              placeholder={t('filePreview.addComment')}
              autoFocus
              rows={2}
              value={composer.text}
              onChange={(e) => setComposer((prev) => (prev ? { ...prev, text: e.target.value } : prev))}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setComposer(null)
                  anchorLineRef.current = null
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
              {t('filePreview.send')}
            </button>
          </div>
        </div>
      )}

      {/* ── Comments Summary Bar ─────────────────────────────────────────── */}
      {comments.length > 0 && !composer && (
        <div className="shrink-0 border-t border-neutral-200 bg-amber-50/80 px-3 py-1.5 dark:border-neutral-700 dark:bg-amber-950/20">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-[11px] text-amber-700 dark:text-amber-300">
              {t('filePreview.commentsCount', { count: comments.length })}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={clearAllComments}
              className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-amber-600 transition-colors hover:bg-amber-100/80 dark:text-amber-400 dark:hover:bg-amber-900/30"
              title={t('filePreview.clearComments')}
            >
              <Trash2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={sendCommentsToAI}
              className="inline-flex h-6 items-center gap-1 rounded bg-amber-600 px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              <Send className="h-3 w-3" />
              {t('filePreview.sendToAI')}
            </button>
          </div>
          {/* Individual comment chips */}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {comments.map((item) => (
              <div
                key={item.id}
                className="inline-flex max-w-full items-center gap-1 rounded border border-amber-200 bg-white px-2 py-1 text-xs dark:border-amber-800 dark:bg-amber-950/40"
              >
                <span className="shrink-0 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                  {item.startLine === item.endLine ? `L${item.startLine}` : `L${item.startLine}-L${item.endLine}`}
                </span>
                <span className="max-w-[240px] truncate text-neutral-700 dark:text-neutral-300" title={item.text}>
                  {item.text}
                </span>
                <button
                  className="shrink-0 text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
                  onClick={() => removeComment(item.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer - file path */}
      <div className="border-t border-neutral-100 px-3 py-1 dark:border-neutral-800">
        <span className="text-[10px] text-neutral-400" title={filePath}>
          {filePath}
        </span>
      </div>

      {/* ── CSS for Monaco comment decorations ───────────────────────────── */}
      <style>{`
        .fp-commented-line {
          background-color: rgba(245, 158, 11, 0.08) !important;
        }
        .fp-commented-glyph {
          background-color: rgba(245, 158, 11, 0.5);
          border-radius: 50%;
          margin-left: 4px;
          width: 6px !important;
          height: 6px !important;
          margin-top: 7px;
        }
        .fp-selected-line {
          background-color: rgba(59, 130, 246, 0.1) !important;
        }
        .fp-selected-glyph {
          background-color: rgba(59, 130, 246, 0.6);
          border-radius: 50%;
          margin-left: 4px;
          width: 6px !important;
          height: 6px !important;
          margin-top: 7px;
        }
      `}</style>
    </div>
  )
}
