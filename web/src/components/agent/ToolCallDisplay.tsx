/**
 * ToolCallDisplay - shows tool call details (name, args, result).
 * Supports streaming mode where arguments are still being received.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { ToolCall } from '@/agent/message-types'
import { CopyIconButton } from './CopyIconButton'

interface ToolCallDisplayProps {
  toolCall: ToolCall
  result?: string
  isExecuting?: boolean
  /** Streaming tool arguments (tool_stream mode) — overrides toolCall.function.arguments for display */
  streamingArgs?: string
}

export function ToolCallDisplay({
  toolCall,
  result,
  isExecuting,
  streamingArgs,
}: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false)

  const rawArgs = streamingArgs ?? toolCall.function.arguments
  let parsedArgs: Record<string, unknown> = {}
  try {
    parsedArgs = JSON.parse(rawArgs)
  } catch {
    // Incomplete JSON during streaming — ignore parse error
  }

  const isError = result ? result.includes('"error"') : false
  const isStreaming = streamingArgs !== undefined && !result

  // Extract path for summary display
  const displayPath = typeof parsedArgs.path === 'string' ? parsedArgs.path : undefined

  return (
    <div className="my-1 rounded border border-neutral-200 bg-neutral-50 text-sm dark:border-neutral-700 dark:bg-neutral-800">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
        )}
        <Wrench className="h-3.5 w-3.5 text-neutral-500" />
        <code className="font-medium text-neutral-700 dark:text-neutral-200">{toolCall.function.name}</code>
        {displayPath && <span className="truncate text-neutral-400 dark:text-neutral-500">{displayPath}</span>}
        <span className="ml-auto">
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          ) : isExecuting ? (
            <span className="text-blue-500">执行中...</span>
          ) : isError ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : result ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : null}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">参数</span>
              <CopyIconButton
                content={Object.keys(parsedArgs).length > 0 ? JSON.stringify(parsedArgs, null, 2) : rawArgs}
              />
            </div>
            <pre className="max-h-40 overflow-auto rounded bg-white p-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
              {Object.keys(parsedArgs).length > 0 ? JSON.stringify(parsedArgs, null, 2) : rawArgs}
              {isStreaming && (
                <span className="inline-block h-3 w-[2px] animate-pulse bg-neutral-400 align-text-bottom" />
              )}
            </pre>
          </div>
          {result && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">结果</span>
                <CopyIconButton
                  content={result.length > 2000 ? result + '\n...(truncated)' : result}
                />
              </div>
              <pre className="max-h-60 overflow-auto rounded bg-white p-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                {result.length > 2000 ? result.slice(0, 2000) + '\n...(truncated)' : result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
