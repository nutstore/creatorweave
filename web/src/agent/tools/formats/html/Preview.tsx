/**
 * HtmlPreview - Render HTML files in an iframe with blob URL.
 *
 * Features:
 *   - Renders HTML content in a sandboxed iframe
 *   - "Open in new tab" button uses StandalonePreview route
 *   - Refresh button to reload iframe
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useT } from '@/i18n'
import toast from 'react-hot-toast'
import type { FormatPreviewProps } from '../../format-registry'

interface HtmlPreviewProps extends FormatPreviewProps {}

export function HtmlPreview({ blob, fileName, filePath }: HtmlPreviewProps) {
  const t = useT()
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!blob)
  const [iframeKey, setIframeKey] = useState(0)

  // Read content from blob
  useEffect(() => {
    if (!blob) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const text = await blob.text()
        if (!cancelled) setContent(text)
      } catch {
        if (!cancelled) setContent(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [blob])

  // Create blob URL for iframe rendering
  const blobUrl = useMemo(() => {
    if (!content) return null
    const blobObj = new Blob([content], { type: 'text/html' })
    return URL.createObjectURL(blobObj)
  }, [content])

  // Clean up blob URL
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  // Open in new tab via StandalonePreview route
  const handleOpenInNewTab = useCallback(async () => {
    if (!content) return
    const path = filePath || fileName
    try {
      localStorage.setItem('preview-content-' + path, content)
      window.open(`#/preview?path=${encodeURIComponent(path)}`, '_blank')
    } catch (err) {
      toast.error(t('filePreview.openInNewTabFailed', { error: err instanceof Error ? err.message : String(err) }))
    }
  }, [content, filePath, fileName, t])

  // Refresh iframe
  const handleRefresh = useCallback(() => {
    setIframeKey(k => k + 1)
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        {t('common.loading')}
      </div>
    )
  }

  if (!content || !blobUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-400">
        {t('filePreview.cannotReadFile')}
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Toolbar */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={handleRefresh}
          className="rounded p-1.5 text-neutral-400 opacity-60 backdrop-blur-sm transition-all hover:bg-white/10 hover:text-neutral-200"
          title={t('standalonePreview.refresh') ?? 'Refresh'}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleOpenInNewTab}
          className="rounded p-1.5 text-neutral-400 opacity-60 backdrop-blur-sm transition-all hover:bg-white/10 hover:text-neutral-200"
          title={t('filePreview.openInNewTab') ?? 'Open in new tab'}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Iframe */}
      <iframe
        key={iframeKey}
        src={blobUrl}
        title={fileName}
        className="h-full w-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  )
}
