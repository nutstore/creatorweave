/**
 * ThinkingIndicator - minimal status indicator for thinking and tool_calling states.
 * Streaming content is now rendered as a live MessageBubble instead.
 */

import { Loader2, Wrench } from 'lucide-react'

interface ThinkingIndicatorProps {
  status: 'thinking' | 'tool_calling'
  toolName?: string
}

export function ThinkingIndicator({ status, toolName }: ThinkingIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-1 py-2 text-sm text-neutral-500">
      {status === 'thinking' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>思考中...</span>
        </>
      )}
      {status === 'tool_calling' && (
        <>
          <Wrench className="h-3.5 w-3.5 animate-pulse text-amber-500" />
          <span>
            调用工具{' '}
            <code className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
              {toolName}
            </code>
          </span>
        </>
      )}
    </div>
  )
}
