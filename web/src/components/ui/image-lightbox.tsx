/**
 * ImageLightbox — fullscreen overlay for viewing an image at full size.
 *
 * Click backdrop or close button to dismiss. Keyboard Escape also closes.
 * Extracted from FileDiffViewer's inline lightbox for reuse in AssetCard etc.
 */

import { useEffect, useCallback, useMemo, useState } from 'react'
import { useT } from '@/i18n'

interface ImageLightboxProps {
  /** Object URL or data URL of the image */
  src: string
  /** Alt text / title shown in the header bar */
  title: string
  /** Close callback */
  onClose: () => void
}

export function ImageLightbox({ src, title, onClose }: ImageLightboxProps) {
  const t = useT()
  const MIN_SCALE = 0.25
  const MAX_SCALE = 4
  const SCALE_STEP = 0.25
  const PADDING = 48

  const [scale, setScale] = useState(1)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [fitScale, setFitScale] = useState(1)

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

  // Reset scale when image changes
  useEffect(() => {
    setScale(1)
    setNaturalSize(null)
    setFitScale(1)
  }, [src])

  // Compute a scale that fits the image fully within the viewport
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const width = img.naturalWidth
    const height = img.naturalHeight
    setNaturalSize({ width, height })

    const viewportW = window.innerWidth - PADDING * 2
    const viewportH = window.innerHeight - PADDING * 2 - 56
    const computedFit = Math.min(viewportW / width, viewportH / height, 1)
    setFitScale(Number.isFinite(computedFit) && computedFit > 0 ? computedFit : 1)
  }, [])

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

  const actualScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale))
  const scaleLabel = useMemo(() => `${Math.round(actualScale * 100)}%`, [actualScale])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
      onClick={handleBackdropClick}
      role="dialog"
      aria-label={title}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-4 py-3 text-white backdrop-blur-sm">
        <div className="min-w-0 truncate pr-3 text-sm">{title}</div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/15"
          >
            -
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/15"
            title={naturalSize ? `${naturalSize.width} × ${naturalSize.height}` : undefined}
          >
            {scaleLabel}
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/15"
          >
            +
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/15"
          >
            {t('common.close')}
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="flex flex-1 items-center justify-center overflow-auto p-6"
        onClick={handleContentClick}
      >
        <div className="flex min-h-0 min-w-0 items-center justify-center">
          <img
            src={src}
            alt={title}
            onLoad={handleImageLoad}
            className="origin-center select-none rounded-lg shadow-2xl"
            style={{
              transform: `scale(${actualScale})`,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  )
}
