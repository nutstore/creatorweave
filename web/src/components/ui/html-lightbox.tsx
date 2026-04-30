/**
 * HTMLLightbox — fullscreen overlay for previewing HTML content in a sandboxed iframe.
 *
 * Click backdrop or close button to dismiss. Keyboard Escape also closes.
 */

import { useEffect, useCallback } from 'react'
import { useT } from '@/i18n'

interface HTMLLightboxProps {
  /** Object URL of the HTML content */
  src: string
  /** Title shown in the header bar */
  title: string
  /** Close callback */
  onClose: () => void
}

export function HTMLLightbox({ src, title, onClose }: HTMLLightboxProps) {
  const t = useT()
  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    // Prevent body scroll while lightbox is open
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

      {/* HTML iframe area */}
      <div className="flex flex-1 min-h-0" onClick={handleContentClick}>
        <iframe
          src={src}
          title={title}
          className="h-full w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  )
}
