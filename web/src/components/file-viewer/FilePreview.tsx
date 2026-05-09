/**
 * FilePreview - read-only file content display with Monaco Editor.
 * Supports text files with syntax highlighting and images with direct display.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { X, FileText, Copy, Check, Eye, Code } from 'lucide-react'
import { Editor } from '@monaco-editor/react'
import { formatBytes } from '@/lib/utils'
import { useT } from '@/i18n'
import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'

interface FilePreviewProps {
  filePath: string | null
  fileHandle: FileSystemFileHandle | null
  onClose: () => void
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

/** Binary (non-image, non-docx) extensions */
const BINARY_EXTS = new Set([
  'wasm', 'zip', 'gz', 'tar', 'br', 'zst', 'pdf', 'doc', 'xls', 'xlsx',
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

function getFileType(path: string): 'text' | 'image' | 'binary' | 'docx' | 'html' {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (DOCX_EXTS.has(ext)) return 'docx'
  if (HTML_EXTS.has(ext)) return 'html'
  if (TEXT_EXTS.has(ext)) return 'text'
  if (BINARY_EXTS.has(ext)) return 'binary'
  // Unknown extension - try text
  return 'text'
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function FilePreview({ filePath, fileHandle, onClose }: FilePreviewProps) {
  const t = useT()
  const wordWrap = useWorkspacePreferencesStore((state) => state.display.wordWrap)
  const [content, setContent] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [diskNewer, setDiskNewer] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null)
  const docxContainerRef = useRef<HTMLDivElement>(null)
  // HTML preview: toggle between rendered preview and source code
  const [previewMode, setPreviewMode] = useState<'preview' | 'source'>('source')
  const [isDark, setIsDark] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

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

  // Load file content when filePath or fileHandle changes
  useEffect(() => {
    if (!filePath) {
      setContent(null)
      setImageUrl(null)
      setDocxBlob(null)
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
      setDiskNewer(false)

      try {
        let text: string | undefined
        let blob: Blob | undefined
        let fileSize = 0
        let opfsMtime: number | null = null
        let diskMtime: number | null = null

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
            // ArrayBuffer - for docx, keep as Blob; for text, decode it
            const buffer = result.content as ArrayBuffer
            fileSize = buffer.byteLength
            if (fileType === 'docx') {
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
              if (fileType === 'image' || fileType === 'docx') {
                blob = diskFile
              } else {
                text = await diskFile.text()
              }
              setDiskNewer(true)
            } else if (opfsMtime === null) {
              fileSize = diskFile.size
              if (fileType === 'image' || fileType === 'docx') {
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
  }, [filePath, fileHandle, fileType])

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
            options={{
              readOnly: true,
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: wordWrap ? 'on' : 'off',
              automaticLayout: true,
              fontSize: 12,
              padding: { top: 8, bottom: 8 },
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
            }}
          />
        )}
      </div>

      {/* Footer - file path */}
      <div className="border-t border-neutral-100 px-3 py-1 dark:border-neutral-800">
        <span className="text-[10px] text-neutral-400" title={filePath}>
          {filePath}
        </span>
      </div>
    </div>
  )
}
