/**
 * ThinkingIndicator - shows streaming text and agent status.
 */

import { Loader2 } from 'lucide-react'

interface ThinkingIndicatorProps {
  status: 'thinking' | 'streaming' | 'tool_calling'
  streamingContent?: string
  toolName?: string
}

export function ThinkingIndicator({ status, streamingContent, toolName }: ThinkingIndicatorProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3">
      <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-blue-600" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-blue-700">
          {status === 'thinking' && '思考中...'}
          {status === 'streaming' && '生成回复中...'}
          {status === 'tool_calling' && (
            <>
              正在执行工具: <code className="rounded bg-blue-100 px-1">{toolName}</code>
            </>
          )}
        </div>
        {streamingContent && (
          <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
            {streamingContent}
            <span className="inline-block h-4 w-0.5 animate-pulse bg-blue-500" />
          </div>
        )}
      </div>
    </div>
  )
}
