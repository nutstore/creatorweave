/**
 * DocxPreview - Render .docx files using docx-preview library.
 *
 * Wraps the `docx-preview` library's renderAsync into a React component,
 * matching the format-registry pattern used by PDF and NOL previews.
 */

import { useState, useEffect, useRef } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

export function DocxPreview({ blob, fileName, fileSize }: {
  blob: Blob
  fileName: string
  fileSize: number
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
      if (!cancelled) setLoading(false)
    }).catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
      container.innerHTML = ''
    }
  }, [blob])

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
          <FileText className="h-5 w-5 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">Failed to load document</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-950">
        <FileText className="h-3.5 w-3.5 text-blue-500" />
        <span className="max-w-[200px] truncate text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
          {fileName}
        </span>
        <span className="text-[10px] text-neutral-400">({formatBytes(fileSize)})</span>
        <div className="flex-1" />
        {loading && <Loader2 className="h-3 w-3 animate-spin text-neutral-400" />}
      </div>

      {/* Document content */}
      <div ref={containerRef} className="docx-preview-container flex-1" />
    </div>
  )
}
