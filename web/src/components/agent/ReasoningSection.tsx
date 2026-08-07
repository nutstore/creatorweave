/**
 * ReasoningSection - collapsible "thinking process" block shared by
 * MessageBubble, AssistantTurnBubble, and StreamingBubble.
 */

import { useEffect, useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { useT } from '@/i18n'
import { MarkdownContent } from './MarkdownContent'

interface ReasoningSectionProps {
  reasoning: string
  /** If true, show "Thinking..." label instead of "Thinking Process" */
  streaming?: boolean
  /** Start time for a live elapsed timer while reasoning streams. */
  startedAt?: number
  /** Final elapsed reasoning time, retained for persisted message history. */
  durationMs?: number
}

function formatElapsedTime(durationMs: number, t: ReturnType<typeof useT>): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  if (totalSeconds < 60) return `${totalSeconds}${t('common.seconds')}`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}${t('common.minutes')} ${seconds}${t('common.seconds')}`
}

export function ReasoningSection({ reasoning, streaming, startedAt, durationMs }: ReasoningSectionProps) {
  const t = useT()
  const [open, setOpen] = useState(!!streaming)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!streaming || typeof startedAt !== 'number') return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [streaming, startedAt])

  useEffect(() => {
    if (streaming) {
      setOpen(true)
    }
  }, [streaming])

  const elapsedMs =
    typeof durationMs === 'number'
      ? durationMs
      : streaming && typeof startedAt === 'number'
        ? Math.max(0, now - startedAt)
        : undefined

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-2 bg-neutral-50 px-3 py-2 text-left text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 ${
          open
            ? 'rounded-t border border-b-0 border-neutral-200 dark:border-neutral-700'
            : 'rounded border border-neutral-200 dark:border-neutral-700'
        }`}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Brain className="h-3.5 w-3.5" />
        <span>{streaming ? t('workflow.thinking') : t('workflow.thinkingProcess')}</span>
        {elapsedMs !== undefined && <span className="text-neutral-300 dark:text-neutral-600">· {formatElapsedTime(elapsedMs, t)}</span>}
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto rounded-b border border-t-0 border-neutral-200 bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
          <MarkdownContent content={reasoning} streaming={streaming} />
        </div>
      )}
    </>
  )
}
