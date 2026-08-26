/**
 * ContextUsageBar — compact context window usage indicator.
 */

import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import type { ContextWindowUsage } from '@/agent/message-types'

interface ContextUsageBarProps {
  contextWindowUsage: ContextWindowUsage | null
  isProcessing: boolean
}

export function ContextUsageBar({
  contextWindowUsage,
  isProcessing,
}: ContextUsageBarProps) {
  const t = useT()

  const getUsageToneClass = (usagePercent: number): { text: string; label: string } => {
    if (usagePercent >= 95) {
      return { text: 'text-danger dark:text-danger', label: t('conversation.usage.highRisk') }
    }
    if (usagePercent >= 85) {
      return {
        text: 'text-warning dark:text-warning',
        label: t('conversation.usage.nearLimit'),
      }
    }
    return {
      text: 'text-neutral-600 dark:text-neutral-300',
      label: t('conversation.usage.comfortable'),
    }
  }

  const formatTokenCompact = (value: number): string => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
    return `${value}`
  }

  if (!contextWindowUsage) return null

  const reserveTokens = contextWindowUsage.reserveTokens
  const modelMaxTokens = contextWindowUsage.modelMaxTokens ?? contextWindowUsage.maxTokens + reserveTokens
  const displayPercent = Math.max(0, Math.min(100, (contextWindowUsage.usedTokens / modelMaxTokens) * 100))
  const usageTone = getUsageToneClass(displayPercent)

  return (
    <div className="flex items-center gap-2.5 sm:mt-0">
      <div className="relative h-1 w-12 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            displayPercent >= 95 ? 'bg-danger' : displayPercent >= 85 ? 'bg-warning' : 'bg-primary-500'
          )}
          style={{ width: `${Math.min(displayPercent, 100)}%` }}
        />
      </div>

      <span className={cn('text-xs font-semibold tabular-nums', usageTone.text)}>
        {displayPercent.toFixed(0)}%
      </span>

      <span
        className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400"
        title={t('conversation.tokenBudget', { effectiveBudget: contextWindowUsage.maxTokens, modelMaxTokens, reserveTokens })}
      >
        {formatTokenCompact(contextWindowUsage.usedTokens)}
        <span className="mx-0.5 opacity-50">/</span>
        {formatTokenCompact(modelMaxTokens)}
      </span>

      {isProcessing && (
        <span className="dark:bg-primary-500 h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
      )}
    </div>
  )
}
