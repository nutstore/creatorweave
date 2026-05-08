/**
 * ImageLightbox — fullscreen overlay for viewing an image at full size.
 *
 * Click backdrop or close button to dismiss. Keyboard Escape also closes.
 * Extracted from FileDiffViewer's inline lightbox for reuse in AssetCard etc.
 */

import { useEffect, useCallback, useMemo, useState } from 'react'

interface ImageLightboxProps {
  /** Object URL or data URL of the image */
  src: string
  /** Alt text / title shown in the header bar */
  title: string
  /** Close callback */
  onClose: () => void
}

export function ImageLightbox({ src, title, onClose }: ImageLightboxProps) {
  const MIN_SCALE = 0.25
  const MAX_SCALE = 4
  const SCALE_STEP = 0.25

  const [scale, setScale] = useState(1)

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

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))
  }, [])

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))
  }, [])

  const resetZoom = useCallback(() => {
    setScale(1)
  }, [])

  const scaleLabel = useMemo(() => `${Math.round(scale * 100)}%`, [scale])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      onClick={handleBackdropClick}
      role="dialog"
      aria-label={title}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 bg-black/40 px-4 py-3 text-white">
        <div className="min-w-0 truncate pr-3 text-sm">{title}</div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
          >
            -
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
          >
            {scaleLabel}
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
          >
            +
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-6" onClick={handleContentClick}>
        <img
          src={src}
          alt={title}
          className="origin-center select-none"
          style={{ transform: `scale(${scale})` }}
        />
      </div>
    </div>
  )
}
