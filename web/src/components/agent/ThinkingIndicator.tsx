/**
 * ThinkingIndicator - minimal status indicator for the "thinking" state.
 * Tool calling is now rendered via ToolCallDisplay for visual consistency.
 */

import { Loader2 } from 'lucide-react'

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
      {status === 'tool_calling' && toolName && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>调用工具 {toolName}...</span>
        </>
      )}
    </div>
  )
}
