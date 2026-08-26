/**
 * MarkdownPreview - renders a markdown file as styled HTML.
 *
 * Reuses the shared MarkdownContent component (GFM tables, math, mermaid,
 * code blocks with copy, asset image resolution, interactive-html demos).
 * Wrapped in a centered, scrollable reading column.
 */

import { useState, useEffect } from 'react'
import { useT } from '@/i18n'
import { MarkdownContent } from '@/components/agent/MarkdownContent'
import type { FormatPreviewProps } from '../../format-registry'

export function MarkdownPreview({ blob }: FormatPreviewProps) {
  const t = useT()
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!blob)

  useEffect(() => {
    if (!blob) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const text = await blob.text()
        if (!cancelled) setContent(text)
      } catch {
        if (!cancelled) setContent(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [blob])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        {t('common.loading')}
      </div>
    )
  }

  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-400">
        {t('filePreview.cannotReadFile')}
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-white px-6 py-6 dark:bg-neutral-950">
      <article className="prose mx-auto max-w-3xl text-sm leading-relaxed text-neutral-800 dark:text-neutral-100">
        <MarkdownContent content={content} allowHtml />
      </article>
    </div>
  )
}
