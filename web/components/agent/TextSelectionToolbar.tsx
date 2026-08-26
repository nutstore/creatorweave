/**
 * TextSelectionToolbar — invisible component that auto-copies
 * selected text to clipboard when the user selects text inside
 * the markdown content area.
 *
 * Uses debounce to control copy frequency.
 */

import { memo, useCallback, useEffect, useRef } from 'react'
import { useT } from '@/i18n'
import { toast } from 'sonner'

/** Minimum selection length to trigger auto-copy */
const MIN_SELECTION_LENGTH = 2

/** Debounce delay in ms */
const DEBOUNCE_MS = 400

export const TextSelectionToolbar = memo(function TextSelectionToolbar({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>
}) {
  const t = useT()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleSelectionChange = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) return

    const text = selection.toString().trim()
    if (text.length < MIN_SELECTION_LENGTH) return

    // Check if the selection is within our container
    const container = containerRef.current
    if (!container) return
    const anchorNode = selection.anchorNode
    if (!anchorNode || !container.contains(anchorNode)) return

    // Debounced copy
    timerRef.current = setTimeout(async () => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t('common.copied'), { duration: 1500 })
      } catch {
        // Silently ignore clipboard errors (e.g. permissions)
      }
    }, DEBOUNCE_MS)
  }, [containerRef, t])

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [handleSelectionChange])

  return null
})
