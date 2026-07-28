/**
 * ShareButton - exports the message as Markdown (.md) or PNG image.
 *
 * Clicking opens a small menu with two options:
 *  - Markdown: Blob download of the raw markdown content.
 *  - Image:    captures the rendered message DOM via html-to-image (lazy-loaded).
 *
 * Mirrors the CopyButton visual weight. The image target is the DOM element
 * carrying `data-message-id` matching the `messageId` prop.
 */

import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Image as ImageIcon, Check } from 'lucide-react'
import { useT } from '@/i18n'
import { useConversationStore } from '@/store/conversation.store'
import { saveAs } from 'file-saver'

interface ShareButtonProps {
  /** Markdown content to export (used for .md export) */
  content: string
  /** Message id; the element carrying `data-message-id` is captured for image export */
  messageId?: string
  /** Conversation title used to build the filename. Falls back to date. */
  conversationTitle?: string
  /** Optional CSS class name */
  className?: string
}

/** Build a filename base: "{conversationTitle}-{YYYY-MM-DD-HHmm}". */
function buildFileName(title?: string): string {
  // Timestamp component: 2026-07-28-1530
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`

  if (!title) return ts

  // Sanitize the conversation title: strip filesystem-unsafe chars, collapse whitespace.
  const safe = title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
    .replace(/-+$/g, '')
  return safe ? `${safe}-${ts}` : ts
}

export function ShareButton({ content, messageId, conversationTitle, className }: ShareButtonProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close the menu on outside click.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Prefer the conversation title passed as a prop; fall back to the active
  // conversation title from the store.
  const activeTitle = useConversationStore((s) => s.activeConversation()?.title)
  const base = buildFileName(conversationTitle ?? activeTitle)

  const triggerDone = () => {
    setDone(true)
    setOpen(false)
    setTimeout(() => setDone(false), 2000)
  }

  const handleMarkdown = () => {
    try {
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
      saveAs(blob, `${base}.md`)
      triggerDone()
    } catch (error) {
      console.error('Failed to export markdown:', error)
    }
  }

  const handleImage = async () => {
    const el = messageId
      ? (document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null)
      : null
    if (!el) {
      console.warn('ShareButton: target element not found for image export')
      setOpen(false)
      return
    }
    setBusy(true)
    setOpen(false)
    try {
      const { toBlob } = await import('html-to-image')
      const blob = await toBlob(el, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(el).backgroundColor || '#ffffff',
        cacheBust: true,
      })
      if (blob) {
        saveAs(blob, `${base}.png`)
        triggerDone()
      }
    } catch (error) {
      console.error('Failed to export image:', error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={wrapperRef} className={`relative inline-flex ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
        title={done ? t('conversation.exported') : t('conversation.share')}
        aria-label={done ? t('conversation.exported') : t('conversation.share')}
        disabled={busy}
      >
        {done ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : busy ? (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-500" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 w-36 overflow-hidden rounded-md border border-neutral-200 bg-white py-1 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleMarkdown}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <FileText className="h-3.5 w-3.5" />
            {t('conversation.shareAsMarkdown')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleImage}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {t('conversation.shareAsImage')}
          </button>
        </div>
      )}
    </div>
  )
}
