/**
 * ThinkingIndicator - minimal status indicator for the "thinking" state.
 * Tool calling is now rendered via ToolCallDisplay for visual consistency.
 */

import { Loader2 } from 'lucide-react'
import { useT } from '@/i18n'

interface ThinkingIndicatorProps {
  status: 'thinking' | 'tool_calling'
  toolName?: string
}

export function ThinkingIndicator({ status, toolName }: ThinkingIndicatorProps) {
  const t = useT()
  return (
    <div className="flex items-center gap-2 px-1 py-2 text-sm text-neutral-500">
      {status === 'thinking' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{t('agent.thinking')}</span>
        </>
      )}
      {status === 'tool_calling' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{toolName ? t('agent.callingToolWithName', { name: toolName }) : t('agent.callingTool')}</span>
        </>
      )}
    </div>
  )
}
