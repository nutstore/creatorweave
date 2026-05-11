/**
 * ToolCallDisplay - shows tool call details (name, args, result).
 * Supports streaming mode where arguments are still being received.
 * Enhanced rendering for spawn_subagent / batch_spawn with subagent progress.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2, Bot } from 'lucide-react'
import type { ToolCall } from '@/agent/message-types'
import { CopyIconButton } from './CopyIconButton'
import { MarkdownContent } from './MarkdownContent'
import { QuestionCard } from './QuestionCard'
import { getPendingQuestion, removePendingQuestion } from '@/store/pending-question.store'
import { useT } from '@/i18n'

interface SubagentEvent {
  agentId: string
  status: string
  summary: string
  timestamp: number
}

interface ToolCallDisplayProps {
  toolCall: ToolCall
  result?: string
  isExecuting?: boolean
  /** Streaming tool arguments (tool_stream mode) — overrides toolCall.function.arguments for display */
  streamingArgs?: string
  /** SubAgent progress events for spawn_subagent / batch_spawn */
  subagentEvents?: SubagentEvent[]
  /** Conversation ID — needed for ask_user_question to bridge UI answer back to executor */
  conversationId?: string
}

const SUBAGENT_TOOLS = new Set(['spawn_subagent', 'batch_spawn'])

/** Status badge color for subagent events */
function SubagentStatusBadge({ status }: { status: string }) {
  const base = 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium'
  switch (status) {
    case 'running':
      return <span className={`${base} bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300`}>running</span>
    case 'completed':
      return <span className={`${base} bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300`}>completed</span>
    case 'failed':
      return <span className={`${base} bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300`}>failed</span>
    case 'killed':
      return <span className={`${base} bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300`}>killed</span>
    default:
      return <span className={`${base} bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300`}>{status}</span>
  }
}

function SubagentProgressSection({ events }: { events: SubagentEvent[] }) {
  if (events.length === 0) return null

  // Show last event per agentId (dedup)
  const latestByAgent = new Map<string, SubagentEvent>()
  for (const ev of events) {
    latestByAgent.set(ev.agentId, ev)
  }
  const uniqueEvents = Array.from(latestByAgent.values())

  return (
    <div className="mb-2 rounded border border-neutral-200 bg-white p-2 dark:border-neutral-600 dark:bg-neutral-850">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
        <Bot className="h-3 w-3" />
        <span>SubAgent</span>
      </div>
      <div className="space-y-1">
        {uniqueEvents.map((ev) => (
          <div key={ev.agentId} className="flex items-center gap-2 text-xs">
            <SubagentStatusBadge status={ev.status} />
            {ev.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
            <span className="truncate text-neutral-600 dark:text-neutral-300">{ev.summary}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Extract a clean description from spawn args */
function extractSubagentDescription(parsedArgs: Record<string, unknown>): string | undefined {
  return typeof parsedArgs.description === 'string' ? parsedArgs.description : undefined
}

/** Parse spawn result JSON and extract content */
function parseSpawnResult(result: string | undefined): { content?: string; agentId?: string; usage?: { total_tokens?: number; duration_ms?: number } } | null {
  if (!result) return null
  try {
    const parsed = JSON.parse(result) as Record<string, unknown>
    const data = (parsed.data ?? parsed) as Record<string, unknown>
    return {
      content: typeof data.content === 'string' ? data.content : undefined,
      agentId: typeof data.agentId === 'string' ? data.agentId : undefined,
      usage: data.usage as { total_tokens?: number; duration_ms?: number } | undefined,
    }
  } catch {
    return null
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function ToolCallDisplay({
  toolCall,
  result,
  isExecuting,
  streamingArgs,
  subagentEvents,
  conversationId,
}: ToolCallDisplayProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  const isSubagentTool = SUBAGENT_TOOLS.has(toolCall.function.name)
  const rawArgs = streamingArgs ?? toolCall.function.arguments
  let parsedArgs: Record<string, unknown> = {}
  try {
    parsedArgs = JSON.parse(rawArgs)
  } catch {
    // Incomplete JSON during streaming — ignore parse error
  }

  let parsedResult: Record<string, unknown> | null = null
  if (result) {
    try {
      parsedResult = JSON.parse(result) as Record<string, unknown>
    } catch {
      parsedResult = null
    }
  }

  const hasToolError =
    parsedResult && Object.prototype.hasOwnProperty.call(parsedResult, 'error')
      ? true
      : result
        ? result.includes('"error"')
        : false
  const hasExplicitFailure = parsedResult?.success === false
  const isError = hasToolError || hasExplicitFailure
  const isStreaming = streamingArgs !== undefined && !result

  // Extract path for summary display (non-subagent tools)
  const displayPath = !isSubagentTool && typeof parsedArgs.path === 'string' ? parsedArgs.path : undefined

  // Subagent-specific display
  const subagentDesc = isSubagentTool ? extractSubagentDescription(parsedArgs) : undefined
  const spawnResult = isSubagentTool ? parseSpawnResult(result) : null

  // ask_user_question: render as interactive QuestionCard
  const isAskQuestion = toolCall.function.name === 'ask_user_question'
  if (isAskQuestion) {
    // Extract the answer from result for the "answered" state
    let resultAnswer: string | undefined
    if (result) {
      try {
        const parsed = JSON.parse(result) as Record<string, unknown>
        const data = parsed.data as Record<string, unknown> | undefined
        if (data && typeof data.answer === 'string') {
          resultAnswer = data.answer
        }
      } catch {
        // ignore
      }
    }

    // Bridge: find the pending question resolver so the UI can answer it
    const toolCallId = toolCall.id
    const handleAnswer = conversationId
      ? (answer: string) => {
          const q = getPendingQuestion(conversationId, toolCallId)
          if (q) {
            q.resolve({ answer, confirmed: true, timed_out: false })
            removePendingQuestion(conversationId, toolCallId)
          }
        }
      : undefined

    return (
      <QuestionCard
        question={typeof parsedArgs.question === 'string' ? parsedArgs.question : ''}
        type={(parsedArgs.type as 'yes_no' | 'single_choice' | 'multi_choice' | 'free_text') ?? 'yes_no'}
        options={Array.isArray(parsedArgs.options) ? parsedArgs.options as string[] : undefined}
        defaultAnswer={typeof parsedArgs.default_answer === 'string' ? parsedArgs.default_answer : undefined}
        context={parsedArgs.context as { affected_files?: string[]; preview?: string } | undefined}
        answered={!!result}
        resultAnswer={resultAnswer}
        onAnswer={handleAnswer}
      />
    )
  }

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
        {isSubagentTool ? (
          <Bot className="h-3.5 w-3.5 text-violet-500" />
        ) : (
          <Wrench className="h-3.5 w-3.5 text-neutral-500" />
        )}
        <code className="font-medium text-neutral-700 dark:text-neutral-200">{toolCall.function.name}</code>
        {subagentDesc && (
          <span className="truncate text-neutral-400 dark:text-neutral-500">&quot;{subagentDesc}&quot;</span>
        )}
        {displayPath && <span className="truncate text-neutral-400 dark:text-neutral-500">{displayPath}</span>}
        <span className="ml-auto">
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          ) : isExecuting ? (
            <span className="text-blue-500">{t('toolCallDisplay.executing')}</span>
          ) : isError ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : result ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : null}
        </span>
      </button>

      {/* SubAgent progress section — visible when expanded */}
      {expanded && isSubagentTool && subagentEvents && subagentEvents.length > 0 && (
        <div className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <SubagentProgressSection events={subagentEvents} />
        </div>
      )}

      {/* SubAgent result summary — visible when expanded */}
      {expanded && isSubagentTool && spawnResult?.content && !isExecuting && (
        <div className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <div className="rounded bg-white p-2 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            <div className="prose-sm max-w-none break-words">
              <MarkdownContent content={spawnResult.content} />
            </div>
          </div>
          {spawnResult.usage && (
            <div className="mt-1 flex gap-3 text-[10px] text-neutral-400">
              {spawnResult.usage.total_tokens != null && (
                <span>{spawnResult.usage.total_tokens} tokens</span>
              )}
              {spawnResult.usage.duration_ms != null && (
                <span>{formatDuration(spawnResult.usage.duration_ms)}</span>
              )}
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t('toolCallDisplay.arguments')}</span>
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
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t('toolCallDisplay.result')}</span>
                <CopyIconButton content={result} />
              </div>
              <pre className="max-h-60 overflow-auto rounded bg-white p-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
