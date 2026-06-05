import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

import { useT } from '../../i18n'

interface ContextSummaryCardProps {
  content: string
}

export function ContextSummaryCard({ content }: ContextSummaryCardProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const preview = content.length > 180 ? `${content.slice(0, 180)}...` : content

  return (
    <motion.div
      layout
      className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-4 py-3 shadow-sm dark:border-amber-800 dark:from-amber-950/30 dark:to-neutral-900"
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 text-left outline-none active:scale-[0.99]"
        aria-expanded={expanded}
      >
        <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.12)] dark:bg-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              {t('workflow.contextSummary')}
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/60 dark:text-amber-200">
              {expanded ? t('common.expanded') : t('common.summary')}
            </span>
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.24, ease: 'easeOut' }} className="ml-auto shrink-0">
              <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            </motion.div>
          </div>

          <AnimatePresence initial={false} mode="wait">
            {!expanded ? (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="whitespace-pre-wrap break-words text-sm leading-6 text-amber-950/90 dark:text-amber-50/90"
              >
                {preview}
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="whitespace-pre-wrap break-words text-sm leading-6 text-amber-950/90 dark:text-amber-50/90"
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-2 text-xs text-amber-700/80 dark:text-amber-300/80">
            {expanded ? t('common.collapse') : t('common.expandToViewFull')}
          </div>
        </div>
      </button>
    </motion.div>
  )
}
