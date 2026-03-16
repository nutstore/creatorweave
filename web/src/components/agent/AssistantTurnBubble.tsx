/**
 * AssistantTurnBubble - renders a grouped agent turn (one avatar, multiple steps, summary footer).
 *
 * Streaming state is passed as props and rendered as part of the current turn,
 * not as a separate component.
 */

import { Bot } from 'lucide-react'
import type { Turn } from './group-messages'
import type { DraftAssistantStep, Message, ToolCall } from '@/agent/message-types'
import { ReasoningSection } from './ReasoningSection'
import { ToolCallDisplay } from './ToolCallDisplay'
import { MarkdownContent } from './MarkdownContent'
import { CopyButton } from './CopyButton'

/** Format token count: 999 → "999", 1234 → "1.2K" */
function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  return (n / 1000).toFixed(n < 10000 ? 2 : 1) + 'K'
}

interface StreamingState {
  reasoning?: boolean
  content?: boolean
}

interface StreamingContent {
  reasoning?: string
  content?: string
}

interface AssistantTurnBubbleProps {
  turn: Extract<Turn, { type: 'assistant' }>
  toolResults: Map<string, string>
  /** Whether agent is still processing this turn */
  isProcessing?: boolean
  /** Whether agent is waiting (pending - request sent, waiting for response) */
  isWaiting?: boolean
  /** Streaming state flags (only for last turn when processing) */
  streamingState?: StreamingState
  /** Streaming content (only for last turn when processing) */
  streamingContent?: StreamingContent
  /** Current tool call being streamed (only for last turn when tool_calling) */
  currentToolCall?: ToolCall | null
  /** Streaming tool arguments (only for last turn when tool_calling) */
  streamingToolArgs?: string | null
  /** Streaming tool args keyed by tool call id */
  streamingToolArgsByCallId?: Record<string, string>
  /** Runtime tool calls captured during this run (for providers that don't emit tool_calls in assistant messages) */
  runtimeToolCalls?: ToolCall[]
  /** Runtime ordered streaming timeline (reasoning/content/tool calls) */
  runtimeSteps?: DraftAssistantStep[]
}

export function AssistantTurnBubble({
  turn,
  toolResults,
  isProcessing,
  isWaiting,
  streamingState,
  streamingContent,
  currentToolCall,
  streamingToolArgs,
  streamingToolArgsByCallId,
  runtimeToolCalls,
  runtimeSteps,
}: AssistantTurnBubbleProps) {
  const isStreamingReasoning = streamingState?.reasoning ?? false
  const isStreamingContent = streamingState?.content ?? false
  const committedToolCallIds = new Set(
    turn.messages.flatMap((msg) => msg.toolCalls?.map((tc) => tc.id) || [])
  )
  const committedReasoningSet = new Set(
    turn.messages.map((msg) => msg.reasoning || '').filter((x): x is string => !!x)
  )
  const committedContentSet = new Set(
    turn.messages.map((msg) => msg.content || '').filter((x): x is string => !!x)
  )
  const draftToolCalls = (runtimeToolCalls || []).filter((tc) => !committedToolCallIds.has(tc.id))
  const orderedRuntimeSteps = (runtimeSteps || []).filter((step) => {
    if (step.type === 'reasoning') {
      return step.streaming || !committedReasoningSet.has(step.content)
    }
    if (step.type === 'content') {
      return step.streaming || !committedContentSet.has(step.content)
    }
    if (step.type === 'tool_call') {
      return step.streaming || !committedToolCallIds.has(step.toolCall.id)
    }
    return true
  })
  const hasCurrentToolCallInDraft = !!(
    currentToolCall && draftToolCalls.some((tc) => tc.id === currentToolCall.id)
  )

  // Find the last message with content for copy button
  const lastMessageWithContent = [...turn.messages].reverse().find((msg) => msg.content)

  return (
    <div className="flex gap-3">
      {/* Single avatar for the entire turn */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
        <Bot className="h-4 w-4" />
      </div>

      {/* Steps column */}
      <div className="min-w-0 max-w-[80%] space-y-2">
        {turn.messages.map((msg, idx) => (
          <AssistantStep
            key={msg.id}
            message={msg}
            toolResults={toolResults}
            showDivider={idx > 0}
          />
        ))}

        {/* Waiting indicator - three pulsing dots */}
        {isWaiting && (
          <div className="inline-block rounded-lg bg-white px-4 py-2 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700">
            <span className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 dark:bg-neutral-500"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 dark:bg-neutral-500"
                style={{ animationDelay: '200ms' }}
              />
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 dark:bg-neutral-500"
                style={{ animationDelay: '400ms' }}
              />
            </span>
          </div>
        )}

        {/* Ordered runtime timeline: strictly follows stream event order */}
        {isProcessing &&
          orderedRuntimeSteps.length > 0 &&
          orderedRuntimeSteps.map((step) => {
            if (step.type === 'reasoning') {
              if (!step.content) return null
              return (
                <StreamingContentSection
                  key={step.id}
                  reasoning={step.content}
                  isStreamingReasoning={step.streaming}
                  isStreamingContent={false}
                  lightweight={true}
                />
              )
            }
            if (step.type === 'content') {
              if (!step.content) return null
              return (
                <StreamingContentSection
                  key={step.id}
                  content={step.content}
                  isStreamingReasoning={false}
                  isStreamingContent={step.streaming}
                  lightweight={true}
                />
              )
            }
            if (step.type === 'compression') {
              return (
                <CompressionStatusCard
                  key={step.id}
                  text={step.content}
                  streaming={step.streaming}
                />
              )
            }
            return (
              <ToolCallDisplay
                key={step.id}
                toolCall={step.toolCall}
                result={step.result ?? toolResults.get(step.toolCall.id)}
                isExecuting={step.streaming && !(step.result ?? toolResults.get(step.toolCall.id))}
                streamingArgs={
                  step.streaming
                    ? step.args || streamingToolArgsByCallId?.[step.toolCall.id] || streamingToolArgs || undefined
                    : undefined
                }
              />
            )
          })}

        {/* Fallback for older runtime path without ordered steps */}
        {isProcessing &&
          orderedRuntimeSteps.length === 0 &&
          draftToolCalls.map((tc) => (
            <ToolCallDisplay
              key={tc.id}
              toolCall={tc}
              result={toolResults.get(tc.id)}
              isExecuting={true}
              streamingArgs={streamingToolArgsByCallId?.[tc.id] || (currentToolCall?.id === tc.id ? (streamingToolArgs || undefined) : undefined)}
            />
          ))}

        {isProcessing &&
          orderedRuntimeSteps.length === 0 &&
          streamingContent &&
          (streamingContent.reasoning || streamingContent.content) && (
            <StreamingContentSection
              reasoning={streamingContent.reasoning}
              content={streamingContent.content}
              isStreamingReasoning={isStreamingReasoning}
              isStreamingContent={isStreamingContent}
            />
          )}

        {/* Active tool call streaming */}
        {isProcessing && currentToolCall && !hasCurrentToolCallInDraft && !committedToolCallIds.has(currentToolCall.id) && (
          <ToolCallDisplay
            toolCall={currentToolCall}
            isExecuting={true}
            streamingArgs={streamingToolArgsByCallId?.[currentToolCall.id] || streamingToolArgs || undefined}
          />
        )}

        {/* Summary footer: timestamp + aggregated token usage + copy button (only show when not processing) */}
        {!isProcessing && !isWaiting && (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span>
              {new Date(turn.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {turn.totalUsage && (
              <span
                title={`输入 ${turn.totalUsage.promptTokens} + 输出 ${turn.totalUsage.completionTokens} = ${turn.totalUsage.totalTokens} tokens`}
              >
                ↑{formatTokens(turn.totalUsage.promptTokens)} ↓
                {formatTokens(turn.totalUsage.completionTokens)}
              </span>
            )}
            {lastMessageWithContent?.content && (
              <CopyButton content={lastMessageWithContent.content} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Renders streaming content section within the turn */
function StreamingContentSection({
  reasoning,
  content,
  isStreamingReasoning,
  isStreamingContent,
  lightweight = false,
}: {
  reasoning?: string
  content?: string
  isStreamingReasoning: boolean
  isStreamingContent: boolean
  lightweight?: boolean
}) {
  return (
    <>
      {/* Show divider if there's content above */}
      <div className="border-t border-neutral-100 dark:border-neutral-700" />

      {/* Reasoning */}
      {reasoning && <ReasoningSection reasoning={reasoning} streaming={isStreamingReasoning} />}

      {/* Content */}
      {content && (
        <div className="rounded-lg bg-white px-4 py-2 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700">
          {lightweight ? (
            <div className="max-w-prose whitespace-pre-wrap break-words">{content}</div>
          ) : (
            <div className="prose-sm max-w-prose overflow-x-auto break-words">
              <MarkdownContent content={content} />
            </div>
          )}
          {/* Cursor when actively streaming content */}
          {isStreamingContent && (
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-neutral-400 align-text-bottom" />
          )}
        </div>
      )}
    </>
  )
}

/** Renders one assistant message step inside a turn */
function AssistantStep({
  message,
  toolResults,
  showDivider,
}: {
  message: Message
  toolResults: Map<string, string>
  showDivider: boolean
}) {
  const hasReasoning = !!message.reasoning
  const hasContent = !!message.content
  const hasToolCalls = !!(message.toolCalls && message.toolCalls.length > 0)
  const isContextSummary = message.kind === 'context_summary'

  return (
    <>
      {showDivider && <div className="border-t border-neutral-100 dark:border-neutral-700" />}

      {/* Unified container for reasoning, content, and tool calls */}
      {(hasReasoning || hasContent || hasToolCalls) && (
        <div className="space-y-2">
          {/* Reasoning section */}
          {hasReasoning && <ReasoningSection reasoning={message.reasoning!} />}

          {/* Content section */}
          {hasContent && (
            <div
              className={
                isContextSummary
                  ? 'rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
                  : 'rounded-lg bg-white px-4 py-2 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700'
              }
            >
              {isContextSummary && (
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  上下文压缩摘要
                </div>
              )}
              <div className="prose-sm max-w-prose overflow-x-auto break-words">
                <MarkdownContent content={message.content!} />
              </div>
            </div>
          )}

          {/* Tool calls section */}
          {hasToolCalls && (
            <div className="space-y-1">
              {message.toolCalls!.map((tc) => (
                <ToolCallDisplay key={tc.id} toolCall={tc} result={toolResults.get(tc.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function CompressionStatusCard({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
      <span>{text}</span>
      {streaming && (
        <span className="ml-2 inline-block h-3 w-[2px] animate-pulse bg-neutral-400 align-middle" />
      )}
    </div>
  )
}
