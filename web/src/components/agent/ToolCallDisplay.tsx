/**
 * ToolCallDisplay - shows tool call details (name, args, result).
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle } from 'lucide-react'
import type { ToolCall } from '@/agent/message-types'

interface ToolCallDisplayProps {
  toolCall: ToolCall
  result?: string
  isExecuting?: boolean
}

export function ToolCallDisplay({ toolCall, result, isExecuting }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false)

  let parsedArgs: Record<string, unknown> = {}
  try {
    parsedArgs = JSON.parse(toolCall.function.arguments)
  } catch {
    // Ignore
  }

  const isError = result ? result.includes('"error"') : false

  return (
    <div className="my-1 rounded border border-neutral-200 bg-neutral-50 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
        )}
        <Wrench className="h-3.5 w-3.5 text-neutral-500" />
        <code className="font-medium text-neutral-700">{toolCall.function.name}</code>
        {typeof parsedArgs.path === 'string' && (
          <span className="truncate text-neutral-400">{parsedArgs.path}</span>
        )}
        <span className="ml-auto">
          {isExecuting ? (
            <span className="text-blue-500">执行中...</span>
          ) : isError ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : result ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : null}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-neutral-200 px-3 py-2">
          <div className="mb-2">
            <div className="mb-1 text-xs font-medium text-neutral-500">参数</div>
            <pre className="max-h-40 overflow-auto rounded bg-white p-2 text-xs text-neutral-600">
              {JSON.stringify(parsedArgs, null, 2)}
            </pre>
          </div>
          {result && (
            <div>
              <div className="mb-1 text-xs font-medium text-neutral-500">结果</div>
              <pre className="max-h-60 overflow-auto rounded bg-white p-2 text-xs text-neutral-600">
                {result.length > 2000 ? result.slice(0, 2000) + '\n...(truncated)' : result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
