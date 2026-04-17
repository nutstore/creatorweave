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
      return { text: 'text-red-600 dark:text-red-400', label: t('conversation.usage.highRisk') }
    }
    if (usagePercent >= 85) {
      return {
        text: 'text-amber-600 dark:text-amber-400',
        label: t('conversation.usage.nearLimit'),
      }
    }
    return {
      text: 'text-emerald-600 dark:text-emerald-400',
      label: t('conversation.usage.comfortable'),
    }
  }

  const formatTokenCompact = (value: number): string => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
    return `${value}`
  }

  if (!contextWindowUsage) return null

  const usageTone = getUsageToneClass(contextWindowUsage.usagePercent)
  const percent = contextWindowUsage.usagePercent
  const isHigh = percent >= 85
  const isCritical = percent >= 95
  const effectiveBudget = contextWindowUsage.maxTokens
  const reserveTokens = contextWindowUsage.reserveTokens
  const modelMaxTokens = contextWindowUsage.modelMaxTokens ?? effectiveBudget + reserveTokens

  return (
    <div className="flex items-center gap-2.5 sm:mt-0">
      <div className="relative h-1 w-12 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isCritical ? 'bg-red-500' : isHigh ? 'bg-amber-500' : 'bg-emerald-500'
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      <span className={cn('text-xs font-semibold tabular-nums', usageTone.text)}>
        {percent.toFixed(0)}%
      </span>

      <span
        className="text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500"
        title={t('conversation.tokenBudget', { effectiveBudget, modelMaxTokens, reserveTokens })}
      >
        {formatTokenCompact(contextWindowUsage.usedTokens)}
        <span className="mx-0.5 opacity-50">/</span>
        {formatTokenCompact(effectiveBudget)}
      </span>

      {isProcessing && (
        <span className="dark:bg-primary-400 h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
      )}
    </div>
  )
}
