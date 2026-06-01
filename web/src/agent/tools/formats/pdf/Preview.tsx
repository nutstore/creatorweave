/**
 * PdfPreview - Render PDF pages using pdfjs-dist canvas rendering.
 *
 * Renders each page as a canvas element, with page navigation,
 * zoom controls, and keyboard shortcuts.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { PDFDocumentProxy, PDFRenderTask } from 'pdfjs-dist'
import { FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { getPdfjs } from './pdfjs'

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
  const [rendering, setRendering] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const renderTaskRef = useRef<PDFRenderTask | null>(null)

  // ── Load PDF document ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function loadPdf() {
      try {
        const pdfjsLib = await getPdfjs()
        const arrayBuffer = await blob.arrayBuffer()
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

        if (cancelled) return

        docRef.current = doc
        setTotalPages(doc.numPages)
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
      if (docRef.current) {
        docRef.current.destroy()
        docRef.current = null
      }
    }
  }, [blob])

  // ── Render current page ────────────────────────────────────────────────

  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || loading) return

    let cancelled = false

    async function render() {
      // Cancel any in-progress render
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel() } catch { /* ignore */ }
        renderTaskRef.current = null
      }

      setRendering(true)
      try {
        const page = await doc.getPage(currentPage)
        if (cancelled) return

        const viewport = page.getViewport({ scale, rotation })

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Reset transform before resizing to avoid scale accumulation
        ctx.setTransform(1, 0, 0, 1, 0, 0)

        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        // Apply DPR scale after setting dimensions
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
        })
        renderTaskRef.current = renderTask

        await renderTask.promise
        renderTaskRef.current = null
      } catch (err: unknown) {
        // Ignore cancellation errors
        const isCancel = err instanceof Error && 'name' in err
          && (err as any).name === 'RenderingCancelledException'
        if (!isCancel && !cancelled) {
          console.error('PDF render error:', err)
        }
      } finally {
        if (!cancelled) {
          setRendering(false)
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
  }, [loading, currentPage, scale, rotation])

  // ── Fit to container on first load ─────────────────────────────────────
  // NOTE: [loading] dependency means this only runs once when the PDF
  // finishes loading. It intentionally does NOT re-fit when the user
  // navigates pages — the user's zoom level is preserved.

  useEffect(() => {
    if (loading || !containerRef.current || !canvasRef.current) return

    // Auto-fit scale on first render
    const container = containerRef.current
    const padding = 32 // 16px padding on each side
    const availWidth = container.clientWidth - padding
    const availHeight = container.clientHeight - padding

    // Get natural page size
    const doc = docRef.current
    if (!doc) return

    doc.getPage(currentPage).then((page) => {
      const viewport = page.getViewport({ scale: 1, rotation: 0 })
      const fitScale = Math.min(
        availWidth / viewport.width,
        availHeight / viewport.height,
        1.5, // Don't over-zoom
      )
      if (fitScale > 0 && isFinite(fitScale)) {
        setScale(Math.round(fitScale * 100) / 100)
      }
    })
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps -- intentional: only on first load, not on page change

  // ── Keyboard navigation ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCurrentPage(p => Math.max(1, p - 1))
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setCurrentPage(p => Math.min(totalPages, p + 1))
      } else if (e.key === '+' || e.key === '=') {
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
  }, [totalPages])

  // ── Handlers ───────────────────────────────────────────────────────────

  const goToPrevPage = useCallback(() => {
    setCurrentPage(p => Math.max(1, p - 1))
  }, [])

  const goToNextPage = useCallback(() => {
    setCurrentPage(p => Math.min(totalPages, p + 1))
  }, [totalPages])

  const zoomIn = useCallback(() => {
    setScale(s => Math.min(3, s + 0.25))
  }, [])

  const zoomOut = useCallback(() => {
    setScale(s => Math.max(0.25, s - 0.25))
  }, [])

  const rotate = useCallback(() => {
    setRotation(r => (r + 90) % 360)
  }, [])

  const handlePageInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      setCurrentPage(val)
    }
  }, [totalPages])

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
              value={currentPage}
              onChange={handlePageInput}
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

        {/* Rendering indicator */}
        {rendering && (
          <Loader2 className="h-3 w-3 animate-spin text-neutral-400" />
        )}
      </div>

      {/* PDF Canvas — scrollable container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
      >
        <div className="flex justify-center p-4">
          <canvas
            ref={canvasRef}
            className="shadow-lg"
          />
        </div>
      </div>
    </div>
  )
}
