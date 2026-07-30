/**
 * FolderTipBubble — lightweight tooltip that nudges users to open a local
 * folder after they've just connected an AI model.
 *
 * Replaces the old multi-step OnboardingTour with a single, focused hint.
 *
 * Positioning: anchored to the "open folder" button via a forwarded ref.
 * Action: invokes `onOpenFolder` callback (which calls `addRoot()` from the
 * folder access store). No DOM querySelector hacks — React composition only.
 */

import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen } from 'lucide-react'
import { useT } from '@/i18n'

interface FolderTipBubbleProps {
  /** When true, the bubble appears */
  show: boolean
  /** Called when user dismisses the tip */
  onDismiss: () => void
  /**
   * Called when user clicks "Select Folder" in the bubble.
   * Typically wires to `useFolderAccessStore().addRoot()`.
   */
  onOpenFolder: () => void | Promise<void>
  /**
   * Ref to the "open folder" button in TopBar. The bubble anchors visually
   * to this element (reads its bounding rect for positioning).
   * Optional — falls back to a corner position if missing.
   */
  anchorRef?: RefObject<HTMLElement | null>
}

export function FolderTipBubble({
  show,
  onDismiss,
  onOpenFolder,
  anchorRef,
}: FolderTipBubbleProps) {
  const t = useT()

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!show) {
      setPos(null)
      return
    }

    const bubbleWidth = 280
    const fallbackPos = {
      top: 60,
      left: Math.max(12, window.innerWidth - bubbleWidth - 12),
    }

    const compute = () => {
      const anchor = anchorRef?.current
      if (!anchor) {
        setPos(fallbackPos)
        return
      }
      const rect = anchor.getBoundingClientRect()
      setPos({
        top: rect.bottom + 8,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - bubbleWidth - 12)),
      })
    }

    // Compute on next frame so the layout is settled.
    const raf = requestAnimationFrame(compute)
    // Recompute on resize so the bubble follows the anchor.
    window.addEventListener('resize', compute)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', compute)
    }
  }, [show, anchorRef])

  if (!show || !pos) return null

  return createPortal(
    <div
      className="fixed z-[9998] w-[280px] animate-in fade-in slide-in-from-top-2 duration-300 rounded-xl border border-border bg-white p-4 shadow-lg dark:bg-neutral-900"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Arrow */}
      <div
        className="absolute -top-[6px] h-3 w-3 rotate-45 border-l border-t border-border bg-white dark:bg-neutral-900"
        style={{ left: 24 }}
      />

      <div className="mb-2 flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-primary-600" />
        <span className="text-[13px] font-medium text-foreground">
          {t('agent.folderTip.title')}
        </span>
      </div>

      <p className="mb-3 text-[13px] leading-relaxed text-secondary">
        {t('agent.folderTip.description')}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void Promise.resolve(onOpenFolder()).catch((err) => {
              // Surface the error but keep the bubble responsive.
              // eslint-disable-next-line no-console
              console.error('[FolderTipBubble] onOpenFolder failed:', err)
            })
            onDismiss()
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark"
        >
          {t('agent.folderTip.selectFolder')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-2 py-1.5 text-xs text-tertiary transition-colors hover:text-secondary"
        >
          {t('agent.folderTip.later')}
        </button>
      </div>
    </div>,
    document.body,
  )
}