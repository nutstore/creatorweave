import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

interface HTMLPreviewProps {
  filePath: string
  fileHandle: FileSystemFileHandle
  onClose: () => void
}

export function HTMLPreview({ filePath, fileHandle, onClose }: HTMLPreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 获取文件内容
  const readFileContent = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // 直接从 fileHandle 读取文件
      const file = await fileHandle.getFile()
      const text = await file.text()
      setContent(text)
    } catch (err) {
      console.error('[HTMLPreview] Failed to read file:', err)
      setError(err instanceof Error ? err.message : 'Failed to read file')
    } finally {
      setLoading(false)
    }
  }, [fileHandle])

  // 创建 Blob URL
  const blobUrl = useMemo(() => {
    if (!content) return null
    const blob = new Blob([content], { type: 'text/html' })
    return URL.createObjectURL(blob)
  }, [content])

  // 清理 Blob URL
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [blobUrl])

  // 初始加载
  useEffect(() => {
    readFileContent()
  }, [readFileContent])

  return (
    <div className="flex h-full flex-col bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200">预览</span>
          <span className="text-xs text-neutral-500">{filePath}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            加载中...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-400">
            {error}
          </div>
        ) : blobUrl ? (
          <iframe
            src={blobUrl}
            title="HTML Preview"
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : null}
      </div>
    </div>
  )
}
