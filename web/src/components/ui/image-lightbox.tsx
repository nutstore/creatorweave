/**
 * ImageLightbox — fullscreen overlay for viewing an image at full size.
 *
 * Click backdrop or close button to dismiss. Keyboard Escape also closes.
 * Extracted from FileDiffViewer's inline lightbox for reuse in AssetCard etc.
 */

import { useEffect, useCallback } from 'react'

interface ImageLightboxProps {
  /** Object URL or data URL of the image */
  src: string
  /** Alt text / title shown in the header bar */
  title: string
  /** Close callback */
  onClose: () => void
}

export function ImageLightbox({ src, title, onClose }: ImageLightboxProps) {
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
          Close
        </button>
      </div>

      {/* Image area */}
      <div className="flex flex-1 items-center justify-center p-6" onClick={handleContentClick}>
        <img src={src} alt={title} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  )
}
