/**
 * PdfPreview - Continuous-scroll PDF viewer with virtualized rendering.
 *
 * All pages are laid out vertically. Only pages near the viewport
 * are rendered to canvas; the rest use lightweight placeholder divs.
 * Scrolling updates the current page indicator in the toolbar.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { getPdfjs } from './pdfjs'

// ── Types ──────────────────────────────────────────────────────────────────

interface PageSize {
  width: number
  height: number
}

// ── Virtualized Page Slot ──────────────────────────────────────────────────

/**
 * A single page slot: renders a canvas when visible, shows a placeholder
 * div when off-screen. Accesses the PDF document through the module-level
 * ref set by the parent PdfPreview component.
 */
function PageSlot({
  pageNum,
  scale,
  rotation,
  pageSize,
  isVisible,
}: {
  pageNum: number
  scale: number
  rotation: number
  pageSize: PageSize
  isVisible: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<any>(null)
  const lastRenderKey = useRef('')

  // Compute display dimensions from natural page size + scale + rotation
  const displaySize = useMemo(() => {
    const isRotated = rotation % 180 !== 0
    const naturalW = isRotated ? pageSize.height : pageSize.width
    const naturalH = isRotated ? pageSize.width : pageSize.height
    return {
      width: Math.floor(naturalW * scale),
      height: Math.floor(naturalH * scale),
    }
  }, [pageSize, scale, rotation])

  // Render this page when it becomes visible
  useEffect(() => {
    if (!isVisible) return

    const canvas = canvasRef.current
    const textLayerDiv = textLayerRef.current
    const doc = _sharedDocRef
    if (!canvas || !doc) return

    // Skip re-render if params haven't changed
    const renderKey = `${pageNum}:${scale}:${rotation}`
    if (lastRenderKey.current === renderKey) return

    let cancelled = false

    async function render() {
      // Cancel any in-progress render for this slot
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel() } catch { /* ignore */ }
        renderTaskRef.current = null
      }

      try {
        const page = await doc.getPage(pageNum)
        if (cancelled) return

        const viewport = page.getViewport({ scale, rotation })
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Reset transform before resizing
        ctx.setTransform(1, 0, 0, 1, 0, 0)

        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        const renderTask = page.render({ canvasContext: ctx, viewport })
        renderTaskRef.current = renderTask
        await renderTask.promise
        renderTaskRef.current = null

        if (!cancelled) {
          lastRenderKey.current = renderKey
          // Build text layer for selection/copy
          await renderTextLayer(page, viewport, textLayerDiv)
        }
      } catch (err: unknown) {
        const isCancel = err instanceof Error && 'name' in err
          && (err as any).name === 'RenderingCancelledException'
        if (!isCancel && !cancelled) {
          console.error(`PDF render error (page ${pageNum}):`, err)
        }
      }
    }

    render()

    return () => {
      cancelled = true
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel() } catch { /* ignore */ }
        renderTaskRef.current = null
      }
    }
  }, [isVisible, pageNum, scale, rotation])

  return (
    <div
      data-page={pageNum}
      className="cw-pdf-page-slot"
      style={{ height: displaySize.height }}
    >
      <div
        className="cw-pdf-page-inner"
        style={{
          width: displaySize.width,
          height: displaySize.height,
          // Hide unrendered/off-screen canvases without unmounting them.
          // This preserves the canvas bitmap so scrolling back doesn't
          // require a re-render.
          visibility: isVisible ? 'visible' : 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          className="shadow-lg"
        />
        <div
          ref={textLayerRef}
          className="cw-pdf-text-layer"
        />
      </div>
    </div>
  )
}

// ── Text Layer Rendering ──────────────────────────────────────────────────

/**
 * Render a transparent text layer on top of the canvas so users can
 * select and copy text from the PDF. Uses pdfjs TextLayer API.
 */
async function renderTextLayer(
  page: PDFPageProxy,
  viewport: ReturnType<PDFPageProxy['getViewport']>,
  container: HTMLDivElement | null,
) {
  if (!container) return

  // Clear previous text layer content
  container.innerHTML = ''

  const pdfjsLib = await getPdfjs()

  try {
    const textContent = await page.getTextContent()

    // pdfjs-dist v4+ exposes TextLayer as a class
    if ('TextLayer' in pdfjsLib) {
      const textLayer = new (pdfjsLib as any).TextLayer({
        textContentSource: textContent,
        container,
        viewport,
      })
      await textLayer.render()
    } else {
      // Fallback for older versions using renderTextLayer function
      const renderTextLayerFn = (pdfjsLib as any).renderTextLayer
      if (renderTextLayerFn) {
        await renderTextLayerFn({
          textContentSource: textContent,
          container,
          viewport,
        })
      }
    }
  } catch (err) {
    // Text layer is best-effort; don't break the viewer if it fails
    console.warn(`PDF text layer error (page ${page.pageNumber}):`, err)
  }
}

// ── Shared doc ref ─────────────────────────────────────────────────────────
// Module-level ref so PageSlot children can access the PDF document without
// prop drilling through hundreds of components. Set by the PdfPreview parent.

let _sharedDocRef: PDFDocumentProxy | null = null

// ── Main Component ─────────────────────────────────────────────────────────

export function PdfPreview({ blob, fileName, fileSize }: {
  blob: Blob
  fileName: string
  fileSize: number
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [rotation, setRotation] = useState(0)
  const [pageSizes, setPageSizes] = useState<PageSize[]>([])

  const containerRef = useRef<HTMLDivElement>(null)
  const isScrollingToPage = useRef(false)
  const visiblePagesRef = useRef<Set<number>>(new Set())
  // forceUpdate counter to trigger re-renders when visible pages change
  // (since visiblePagesRef is a ref, React won't re-render on its own)
  const [renderTick, setRenderTick] = useState(0)

  // ── Load PDF document ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function loadPdf() {
      try {
        const pdfjsLib = await getPdfjs()
        const arrayBuffer = await blob.arrayBuffer()
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

        if (cancelled) return

        _sharedDocRef = doc
        setTotalPages(doc.numPages)

        // Pre-fetch all page sizes for correct layout heights
        const sizes: PageSize[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const vp = page.getViewport({ scale: 1, rotation: 0 })
          sizes.push({ width: vp.width, height: vp.height })
        }

        if (cancelled) return
        setPageSizes(sizes)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    }

    loadPdf()

    return () => {
      cancelled = true
      if (_sharedDocRef) {
        _sharedDocRef.destroy()
        _sharedDocRef = null
      }
    }
  }, [blob])

  // ── Compute render buffer (visible pages ± 2) ─────────────────────────
  // This useMemo depends on renderTick so it re-computes when the
  // IntersectionObserver detects visibility changes.

  const renderBuffer = useMemo(() => {
    // Suppress unused-var lint — renderTick is the reactivity trigger
    void renderTick

    const visible = visiblePagesRef.current
    if (visible.size === 0) {
      // Before any intersection data, render first 3 pages as a seed
      const initial = new Set<number>()
      for (let i = 1; i <= Math.min(3, totalPages); i++) initial.add(i)
      return initial
    }

    const buffer = new Set(visible)
    for (const p of visible) {
      for (let d = 1; d <= 3; d++) {
        if (p - d >= 1) buffer.add(p - d)
        if (p + d <= totalPages) buffer.add(p + d)
      }
    }
    return buffer
  }, [renderTick, totalPages])

  // ── Intersection Observer ───────────────────────────────────────────────
  // Tracks which pages are within the extended render buffer zone.
  // Page number detection is handled separately via scroll listener
  // for robustness.

  useEffect(() => {
    const container = containerRef.current
    if (!container || loading || pageSizes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false

        for (const entry of entries) {
          const pageNum = parseInt(entry.target.getAttribute('data-page')!, 10)
          if (entry.isIntersecting) {
            if (!visiblePagesRef.current.has(pageNum)) {
              visiblePagesRef.current.add(pageNum)
              changed = true
            }
          } else {
            if (visiblePagesRef.current.has(pageNum)) {
              visiblePagesRef.current.delete(pageNum)
              changed = true
            }
          }
        }

        if (changed) {
          // Trigger re-render so renderBuffer recomputes
          setRenderTick(n => n + 1)
        }
      },
      {
        root: container,
        // Extend detection well above/below viewport so pages are
        // rendered before the user scrolls them into view.
        rootMargin: '100% 0px',
        threshold: 0,
      }
    )

    // Observe all page slot elements
    const pageElements = container.querySelectorAll('[data-page]')
    for (const el of pageElements) {
      observer.observe(el)
    }

    return () => observer.disconnect()
  }, [loading, pageSizes, scale, rotation])

  // ── Scroll-based page tracking ─────────────────────────────────────────
  // Uses a scroll listener to detect which page is at the top of the
  // viewport. This is more reliable than IntersectionObserver for
  // determining the "current page" because it doesn't depend on the
  // observer's rootMargin or callback timing.

  useEffect(() => {
    const container = containerRef.current
    if (!container || loading || pageSizes.length === 0) return

    function onScroll() {
      if (isScrollingToPage.current) return

      const containerTop = container.scrollTop
      const containerHeight = container.clientHeight

      // Find the page whose top edge is closest to (but not below)
      // the middle of the visible viewport area.
      let bestPage = 1
      let bestDist = Infinity

      const pageElements = container.querySelectorAll('[data-page]')
      for (const el of pageElements) {
        const pageNum = parseInt(el.getAttribute('data-page')!, 10)
        // Use getBoundingClientRect relative to the container
        const rect = (el as HTMLElement).getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        // Distance from page top to container top
        const dist = rect.top - containerRect.top
        // Pick the page closest to the top, preferring pages that
        // have started to enter the viewport (dist <= half height)
        if (dist <= containerHeight / 2 && dist > -rect.height) {
          const absDist = Math.abs(dist)
          if (absDist < bestDist) {
            bestDist = absDist
            bestPage = pageNum
          }
        }
      }

      setCurrentPage(bestPage)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    // Run once on mount to set initial page
    onScroll()

    return () => container.removeEventListener('scroll', onScroll)
  }, [loading, pageSizes, scale, rotation])

  // ── Auto-fit scale on first load ───────────────────────────────────────

  useEffect(() => {
    if (loading || !containerRef.current || pageSizes.length === 0) return

    const container = containerRef.current
    const padding = 48 // 24px padding each side
    const availWidth = container.clientWidth - padding

    const firstPage = pageSizes[0]
    const fitScale = Math.min(availWidth / firstPage.width, 1.5)
    if (fitScale > 0 && isFinite(fitScale)) {
      setScale(Math.round(fitScale * 100) / 100)
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setScale(s => Math.min(3, s + 0.25))
      } else if (e.key === '-') {
        e.preventDefault()
        setScale(s => Math.max(0.25, s - 0.25))
      } else if (e.key === 'r') {
        e.preventDefault()
        setRotation(r => (r + 90) % 360)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Scroll to a specific page (toolbar navigation) ─────────────────────

  const scrollToPage = useCallback((page: number) => {
    const container = containerRef.current
    if (!container) return

    isScrollingToPage.current = true
    setCurrentPage(page)

    const target = container.querySelector(`[data-page="${page}"]`)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    // Reset flag after scroll animation settles
    setTimeout(() => {
      isScrollingToPage.current = false
    }, 600)
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────

  const goToPrevPage = useCallback(() => {
    scrollToPage(Math.max(1, currentPage - 1))
  }, [currentPage, scrollToPage])

  const goToNextPage = useCallback(() => {
    scrollToPage(Math.min(totalPages, currentPage + 1))
  }, [currentPage, totalPages, scrollToPage])

  const zoomIn = useCallback(() => setScale(s => Math.min(3, s + 0.25)), [])
  const zoomOut = useCallback(() => setScale(s => Math.max(0.25, s - 0.25)), [])
  const rotate = useCallback(() => setRotation(r => (r + 90) % 360), [])

  const [pageInput, setPageInput] = useState<string | null>(null)

  const handlePageInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value)
  }, [])

  const handlePageInputCommit = useCallback(() => {
    if (pageInput === null) return
    const val = parseInt(pageInput, 10)
    setPageInput(null)
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      scrollToPage(val)
    }
  }, [pageInput, totalPages, scrollToPage])

  const handlePageInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handlePageInputCommit()
    } else if (e.key === 'Escape') {
      setPageInput(null)
    }
  }, [handlePageInputCommit])

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          <p className="text-xs text-neutral-400">Loading PDF...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
          <FileText className="h-5 w-5 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">Failed to load PDF</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-neutral-100 dark:bg-neutral-900">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-950">
        {/* File info */}
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-red-500" />
          <span className="max-w-[160px] truncate text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
            {fileName}
          </span>
          <span className="text-[10px] text-neutral-400">({formatBytes(fileSize)})</span>
        </div>

        <span className="text-[10px] text-neutral-300 dark:text-neutral-700">|</span>

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-center gap-0.5 text-[11px]">
            <input
              type="text"
              value={pageInput ?? currentPage}
              onChange={handlePageInputChange}
              onKeyDown={handlePageInputKeyDown}
              onBlur={handlePageInputCommit}
              className="w-8 rounded border border-neutral-200 bg-transparent text-center text-[11px] text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
              style={{ lineHeight: '18px' }}
            />
            <span className="text-neutral-400">/</span>
            <span className="text-neutral-500">{totalPages}</span>
          </div>

          <button
            type="button"
            onClick={goToNextPage}
            disabled={currentPage >= totalPages}
            className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

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

        {/* Rotate */}
        <button
          type="button"
          onClick={rotate}
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1" />
      </div>

      {/* PDF Pages — continuous scroll container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
      >
        <div className="flex flex-col items-center gap-4 py-4 px-6">
          {pageSizes.map((ps, i) => {
            const pageNum = i + 1
            return (
              <PageSlot
                key={pageNum}
                pageNum={pageNum}
                scale={scale}
                rotation={rotation}
                pageSize={ps}
                isVisible={renderBuffer.has(pageNum)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
