/**
 * FilePreview - read-only file content display with syntax highlighting.
 * Uses shiki for code highlighting, with lazy loading.
 */

import { useState, useEffect, useRef } from 'react'
import { X, FileText, Copy, Check } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

interface FilePreviewProps {
  filePath: string | null
  fileHandle: FileSystemFileHandle | null
  onClose: () => void
}

/** Map file extension to shiki language ID */
function getLangFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    rs: 'rust',
    py: 'python',
    go: 'go',
    rb: 'ruby',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    xml: 'xml',
    svg: 'xml',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    mdx: 'mdx',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
    graphql: 'graphql',
    dockerfile: 'dockerfile',
    vue: 'vue',
    php: 'php',
  }
  // Also check filename-based languages
  const name = path.split('/').pop()?.toLowerCase() || ''
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  if (name.endsWith('.lock')) return 'json'

  return langMap[ext] || 'text'
}

/** Check if a file is likely binary */
function isBinaryExtension(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const binaryExts = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'ico',
    'bmp',
    'svg',
    'wasm',
    'zip',
    'gz',
    'tar',
    'br',
    'zst',
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'mp3',
    'mp4',
    'webm',
    'ogg',
    'wav',
    'avi',
    'woff',
    'woff2',
    'ttf',
    'eot',
    'otf',
    'exe',
    'dll',
    'so',
    'dylib',
  ])
  return binaryExts.has(ext)
}

/** Check if extension is likely text */
function isTextExtension(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const textExts = new Set([
    'txt',
    'md',
    'mdx',
    'json',
    'jsonc',
    'yaml',
    'yml',
    'toml',
    'ini',
    'env',
    'xml',
    'svg',
    'html',
    'htm',
    'css',
    'scss',
    'less',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'ts',
    'tsx',
    'py',
    'rs',
    'go',
    'java',
    'kt',
    'swift',
    'c',
    'cpp',
    'h',
    'hpp',
    'sh',
    'bash',
    'zsh',
    'sql',
    'graphql',
    'gql',
    'php',
    'rb',
    'vue',
    'svelte',
    'lock',
    'gitignore',
    'editorconfig',
  ])
  return textExts.has(ext)
}

function isTextFile(path: string): boolean {
  if (isBinaryExtension(path)) return false
  if (isTextExtension(path)) return true
  return false
}

const MAX_FILE_SIZE = 512 * 1024 // 512KB for syntax highlighting
const MAX_PLAIN_SIZE = 2 * 1024 * 1024 // 2MB for plain text

export function FilePreview({ filePath, fileHandle, onClose }: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Load file content when filePath or fileHandle changes
  useEffect(() => {
    if (!filePath || !fileHandle) {
      setContent(null)
      setHighlightedHtml(null)
      setError(null)
      return
    }

    let cancelled = false

    async function loadFile() {
      setLoading(true)
      setError(null)
      setContent(null)
      setHighlightedHtml(null)

      try {
        const file = await fileHandle!.getFile()
        setFileSize(file.size)

        // Extension-only file type detection
        const textFile = isTextFile(filePath!)
        if (!textFile) {
          setContent(null)
          setError(null)
          setLoading(false)
          return
        }

        // Too large
        if (file.size > MAX_PLAIN_SIZE) {
          setError(`文件过大 (${formatBytes(file.size)})，最大支持 ${formatBytes(MAX_PLAIN_SIZE)}`)
          setLoading(false)
          return
        }

        const text = await file.text()
        if (cancelled) return
        setContent(text)

        // Apply syntax highlighting for smaller files
        if (file.size <= MAX_FILE_SIZE) {
          try {
            const { codeToHtml } = await import('shiki')
            const lang = getLangFromPath(filePath!)
            const html = await codeToHtml(text, {
              lang,
              theme: 'github-light',
            })
            if (!cancelled) {
              setHighlightedHtml(html)
            }
          } catch {
            // Fallback to plain text if highlighting fails
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(`读取文件失败: ${err instanceof Error ? err.message : String(err)}`)
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
    }
  }, [filePath, fileHandle])

  const handleCopy = async () => {
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center bg-white p-4 dark:bg-neutral-950">
        <div className="text-center text-neutral-400">
          <FileText className="mx-auto mb-2 h-6 w-6" />
          <p className="text-xs">点击文件树中的文件进行预览</p>
        </div>
      </div>
    )
  }

  const fileName = filePath.split('/').pop() || filePath
  const isBinary = content === null && !loading && !error

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-700">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium text-neutral-700 dark:text-neutral-200" title={filePath}>
            {fileName}
          </span>
          <span className="shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">{formatBytes(fileSize)}</span>
        </div>
        <div className="flex items-center gap-1">
          {content && (
            <button
              type="button"
              onClick={handleCopy}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              title="复制内容"
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title="关闭"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" ref={contentRef}>
        {loading && <div className="p-4 text-center text-xs text-neutral-400">加载中...</div>}

        {error && <div className="p-4 text-center text-xs text-red-500">{error}</div>}

        {isBinary && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <FileText className="h-8 w-8 text-neutral-300" />
            <p className="text-xs text-neutral-500">二进制文件</p>
            <p className="text-[10px] text-neutral-400">
              {fileName} ({formatBytes(fileSize)})
            </p>
          </div>
        )}

        {/* Syntax highlighted content */}
        {highlightedHtml && (
          <div
            className="shiki-preview overflow-x-auto text-xs leading-5 [&_pre]:!m-0 [&_pre]:!rounded-none [&_pre]:!p-3"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        )}

        {/* Plain text fallback (no highlighting) */}
        {content && !highlightedHtml && !loading && !isBinary && (
          <div className="overflow-x-auto p-3">
            <pre className="text-xs leading-5 text-neutral-700">
              <code>{content}</code>
            </pre>
          </div>
        )}
      </div>

      {/* Footer - file path */}
      <div className="border-t border-neutral-100 px-3 py-1">
        <span className="text-[10px] text-neutral-400" title={filePath}>
          {filePath}
        </span>
      </div>
    </div>
  )
}
