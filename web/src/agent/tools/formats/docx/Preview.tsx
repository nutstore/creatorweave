/**
 * DocxPreview - Render .docx files using docx-preview library.
 *
 * Follows the same pattern as XlsxPreview:
 *   - No built-in header (FilePreview provides the shell)
 *   - Overlay states for loading/error
 *   - Full-height content area
 */

import { useState, useEffect, useRef } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────

type PreviewState =
  | { status: 'rendering' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

// ── Component ─────────────────────────────────────────────────────────────

export function DocxPreview({ blob }: {
  blob: Blob
  fileName: string
  fileSize: number
}) {
  const [state, setState] = useState<PreviewState>({ status: 'rendering' })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false
    const container = containerRef.current

    import('docx-preview').then(({ renderAsync }) => {
      if (cancelled) return
      return renderAsync(blob, container, undefined, {
        className: 'docx-preview',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
      })
    }).then(() => {
      if (!cancelled) setState({ status: 'ready' })
    }).catch((err: unknown) => {
      if (!cancelled) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })

    return () => {
      cancelled = true
      container.innerHTML = ''
    }
  }, [blob])

  return (
    <div className="relative h-full w-full">
      {/* Document container */}
      <div ref={containerRef} className="docx-preview-container h-full w-full" />

      {/* Loading overlay */}
      {state.status === 'rendering' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-neutral-950/80">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            <p className="text-xs text-neutral-400">Loading document...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {state.status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white p-4 dark:bg-neutral-950">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
            <AlertCircle className="h-5 w-5 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">Failed to load document</p>
            <p className="mt-0.5 text-[11px] text-neutral-400">{state.message}</p>
          </div>
        </div>
      )}
    </div>
  )
}
