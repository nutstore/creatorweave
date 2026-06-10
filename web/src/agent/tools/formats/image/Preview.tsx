/**
 * ImagePreview - Enhanced image viewer with zoom, pan, and rotation.
 *
 * Features:
 *   - Auto-fit to container on load
 *   - Zoom in/out with keyboard (+/-) and buttons
 *   - Pan by dragging when zoomed in
 *   - Rotate 90° increments
 *   - Reset to fit
 *   - Image dimensions overlay
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ZoomIn, ZoomOut, RotateCw, Maximize2, Loader2, Image as ImageIcon } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────

interface ImagePreviewProps {
  blob: Blob
  fileName: string
  fileSize: number
}

// ── Component ──────────────────────────────────────────────────────────────

export function ImagePreview({ blob, fileName, fileSize }: ImagePreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Create blob URL
  useEffect(() => {
    const url = URL.createObjectURL(blob)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  // Auto-fit on load
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const w = img.naturalWidth
    const h = img.naturalHeight
    setNaturalSize({ width: w, height: h })
    setLoading(false)

    // Auto-fit to container
    if (containerRef.current) {
      const container = containerRef.current
      const padding = 32
      const availW = container.clientWidth - padding
      const availH = container.clientHeight - padding
      if (availW > 0 && availH > 0 && w > 0 && h > 0) {
        const fitScale = Math.min(availW / w, availH / h, 1)
        setScale(Math.round(fitScale * 100) / 100)
      }
    }
  }, [])

  const handleImageError = useCallback(() => {
    setLoading(false)
    setError('Failed to load image')
  }, [])

  // Zoom controls
  const zoomIn = useCallback(() => setScale(s => Math.min(10, +(s + 0.25).toFixed(2))), [])
  const zoomOut = useCallback(() => setScale(s => Math.max(0.1, +(s - 0.25).toFixed(2))), [])
  const rotate = useCallback(() => {
    setRotation(r => (r + 90) % 360)
    setOffset({ x: 0, y: 0 })
  }, [])
  const fitToView = useCallback(() => {
    setRotation(0)
    setOffset({ x: 0, y: 0 })
    if (naturalSize && containerRef.current) {
      const container = containerRef.current
      const padding = 32
      const availW = container.clientWidth - padding
      const availH = container.clientHeight - padding
      const fitScale = Math.min(availW / naturalSize.width, availH / naturalSize.height, 1)
      setScale(Math.round(fitScale * 100) / 100)
    }
  }, [naturalSize])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn() }
      else if (e.key === '-') { e.preventDefault(); zoomOut() }
      else if (e.key === 'r') { e.preventDefault(); rotate() }
      else if (e.key === '0') { e.preventDefault(); fitToView() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [zoomIn, zoomOut, rotate, fitToView])

  // Mouse wheel zoom
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        setScale(s => Math.max(0.1, Math.min(10, +(s + delta).toFixed(2))))
      }
    }
    container.addEventListener('wheel', handler, { passive: false })
    return () => container.removeEventListener('wheel', handler)
  }, [])

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }, [scale, offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy })
  }, [dragging])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
    dragStart.current = null
  }, [])

  // Compute transform
  const isRotated90 = rotation === 90 || rotation === 270
  const transform = useMemo(() => {
    const parts: string[] = []
    if (rotation) parts.push(`rotate(${rotation}deg)`)
    if (scale !== 1) parts.push(`scale(${scale})`)
    if (offset.x || offset.y) parts.push(`translate(${offset.x}px, ${offset.y}px)`)
    return parts.join(' ') || undefined
  }, [rotation, scale, offset])

  // Determine if pixelated rendering should be used (for small/icon images)
  const isPixelated = /\.(ico|bmp)$/i.test(fileName) || (naturalSize !== null && naturalSize.width <= 64 && naturalSize.height <= 64)

  return (
    <div className="flex h-full flex-col bg-neutral-100 dark:bg-neutral-900">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
          <span className="max-w-[160px] truncate text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
            {fileName}
          </span>
          <span className="text-[10px] text-neutral-400">({formatBytes(fileSize)})</span>
        </div>

        {naturalSize && (
          <>
            <span className="text-[10px] text-neutral-300 dark:text-neutral-700">|</span>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
              {naturalSize.width} × {naturalSize.height}
            </span>
          </>
        )}

        <span className="text-[10px] text-neutral-300 dark:text-neutral-700">|</span>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[3em] text-center text-[10px] tabular-nums text-neutral-500">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={rotate}
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title="Rotate (R)"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={fitToView}
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title="Fit to view (0)"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1" />
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden ${dragging ? 'cursor-grabbing' : scale > 1 ? 'cursor-grab' : 'cursor-default'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {loading && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
              <p className="text-xs text-neutral-400">Loading image...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
              <ImageIcon className="h-5 w-5 text-red-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-red-600 dark:text-red-400">Failed to load image</p>
              <p className="mt-0.5 text-[11px] text-neutral-400">{error}</p>
            </div>
          </div>
        )}

        {imageUrl && !error && (
          <div className="flex h-full items-center justify-center p-4">
            <img
              src={imageUrl}
              alt={fileName}
              onLoad={handleImageLoad}
              onError={handleImageError}
              className="max-h-full max-w-full object-contain transition-transform"
              style={{
                transform,
                transformOrigin: 'center center',
                imageRendering: isPixelated ? 'pixelated' : 'auto',
                display: loading ? 'none' : 'block',
              }}
              draggable={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}
