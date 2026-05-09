/**
 * MarkdownLightbox — fullscreen overlay for previewing Markdown content.
 *
 * Reads the source as text, then renders it with MarkdownContent.
 * Click backdrop or close button to dismiss. Keyboard Escape also closes.
 */

import { useEffect, useCallback, useState } from 'react'
import { useT } from '@/i18n'
import { MarkdownContent } from '@/components/agent/MarkdownContent'

interface MarkdownLightboxProps {
  /** Object URL of the Markdown file */
  src: string
  /** Title shown in the header bar */
  title: string
  /** Close callback */
  onClose: () => void
}

export function MarkdownLightbox({ src, title, onClose }: MarkdownLightboxProps) {
  const t = useT()
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  // Fetch the markdown text from the blob URL
  useEffect(() => {
    let cancelled = false
    fetch(src)
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled) setContent(text)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => { cancelled = true }
  }, [src])

  // Close on Escape + lock body scroll
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const handleBackdropClick = useCallback(() => {
    onClose()
  }, [onClose])

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      onClick={handleBackdropClick}
      role="dialog"
      aria-label={title}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-black/40 px-4 py-3 text-white">
        <div className="truncate pr-3 text-sm">{title}</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
        >
          {t('htmlPreview.close')}
        </button>
      </div>

      {/* Markdown content area */}
      <div
        className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-neutral-900"
        onClick={handleContentClick}
      >
        {error ? (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            Failed to load markdown content
          </div>
        ) : content === null ? (
          <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
            Loading...
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-4 text-neutral-800 dark:text-neutral-200">
            <MarkdownContent content={content} />
          </div>
        )}
      </div>
    </div>
  )
}
