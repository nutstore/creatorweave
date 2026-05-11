/**
 * AssistantTurnBubble - renders a grouped agent turn (one avatar, multiple steps, summary footer).
 *
 * Streaming state is passed as props and rendered as part of the current turn,
 * not as a separate component.
 */

import { memo, useMemo, type ReactNode } from 'react'
import { Bot } from 'lucide-react'
import type { Turn } from './group-messages'
import type {
  DraftAssistantStep,
  Message,
  ToolCall,
  WorkflowRealRunPayload,
} from '@/agent/message-types'
import { ReasoningSection } from './ReasoningSection'
import { ToolCallDisplay } from './ToolCallDisplay'
import { MarkdownContent } from './MarkdownContent'
import { CopyButton } from './CopyButton'
import { AssetCompactList } from './AssetCard'
import { useT } from '@/i18n'

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
  /** Whether to render the bot avatar column for this bubble */
  showAvatar?: boolean
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
  /** Optional workflow progress block rendered at the bottom of the bubble */
  workflowProgress?: ReactNode
  /** Conversation ID — needed for ask_user_question to bridge UI answer back to executor */
  conversationId?: string | null
}

export const AssistantTurnBubble = memo(function AssistantTurnBubble({
  turn,
  toolResults,
  showAvatar = true,
  isProcessing,
  isWaiting,
  streamingState,
  streamingContent,
  currentToolCall,
  streamingToolArgs,
  streamingToolArgsByCallId,
  runtimeToolCalls,
  runtimeSteps,
  workflowProgress,
  conversationId,
}: AssistantTurnBubbleProps) {
  const t = useT()
  const isStreamingReasoning = streamingState?.reasoning ?? false
  const isStreamingContent = streamingState?.content ?? false

  // Memoize committed tool call IDs — only changes when turn.messages changes
  const committedToolCallIds = useMemo(
    () => new Set(turn.messages.flatMap((msg) => msg.toolCalls?.map((tc) => tc.id) || [])),
    [turn.messages],
  )

  // Memoize filtered runtime steps — depends on runtimeSteps reference + committed IDs
  const orderedRuntimeSteps = useMemo(
    () =>
      (runtimeSteps || []).filter((step) => {
        if (step.streaming) return true
        if (step.type === 'tool_call') {
          return !committedToolCallIds.has(step.toolCall.id)
        }
        return true
      }),
    [runtimeSteps, committedToolCallIds],
  )

  const draftToolCalls = useMemo(
    () => (runtimeToolCalls || []).filter((tc) => !committedToolCallIds.has(tc.id)),
    [runtimeToolCalls, committedToolCallIds],
  )

  const hasCurrentToolCallInDraft = !!(
    currentToolCall && draftToolCalls.some((tc) => tc.id === currentToolCall.id)
  )

  // Memoize suppress set — depends on steps + toolResults + currentToolCall
  const suppressExecutingToolCallIds = useMemo(() => {
    const set = new Set<string>()
    if (isProcessing) {
      for (const step of orderedRuntimeSteps) {
        if (step.type !== 'tool_call') continue
        const hasResult = !!(step.result ?? toolResults.get(step.toolCall.id))
        if (step.streaming && !hasResult) {
          set.add(step.toolCall.id)
        }
      }
      if (currentToolCall && !toolResults.get(currentToolCall.id)) {
        set.add(currentToolCall.id)
      }
    }
    return set
  }, [isProcessing, orderedRuntimeSteps, toolResults, currentToolCall])

  // Memoize merged timeline — the expensive sort+concat
  const mergedTimelineItems = useMemo(
    () =>
      isProcessing
        ? [
            ...turn.messages.map((message, index) => ({
              kind: 'message' as const,
              key: `msg-${message.id}`,
              order: index,
              timestamp: message.timestamp,
              message,
            })),
            ...orderedRuntimeSteps.map((step, index) => ({
              kind: 'runtime' as const,
              key: `step-${step.id}`,
              order: index,
              timestamp:
                typeof step.timestamp === 'number'
                  ? step.timestamp
                  : turn.timestamp + index + 1,
              step,
            })),
          ].sort((a, b) => {
            if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
            return a.order - b.order
          })
        : [],
    [isProcessing, turn.messages, turn.timestamp, orderedRuntimeSteps],
  )

  const hasCurrentToolCallInRuntimeSteps = !!(
    currentToolCall &&
    orderedRuntimeSteps.some(
      (step) => step.type === 'tool_call' && step.toolCall.id === currentToolCall.id,
    )
  )
  const shouldRenderMergedTimeline = isProcessing && mergedTimelineItems.length > 0

  // Find the last message with content for copy button
  const lastMessageWithContent = [...turn.messages].reverse().find((msg) => msg.content)

  return (
    <div className={showAvatar ? 'flex gap-3' : ''}>
      {showAvatar && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
          <Bot className="h-4 w-4" />
        </div>
      )}

      {/* Steps column */}
      <div className={showAvatar ? 'w-[90%] min-w-0 space-y-2' : 'w-full min-w-0 space-y-2'}>
        {shouldRenderMergedTimeline &&
          mergedTimelineItems.map((item, index) => {
            const showDivider = index > 0
            if (item.kind === 'message') {
              return (
                <div key={item.key}>
                  {showDivider && (
                    <div className="mb-2 border-t border-neutral-100 dark:border-neutral-700" />
                  )}
                  <AssistantStep
                    message={item.message}
                    toolResults={toolResults}
                    showDivider={false}
                    suppressExecutingToolCallIds={suppressExecutingToolCallIds}
                    conversationId={conversationId ?? undefined}
                  />
                </div>
              )
            }

            const step = item.step
            if (step.type === 'reasoning') {
              if (!step.content) return null
              return (
                <div key={item.key}>
                  {showDivider && (
                    <div className="mb-2 border-t border-neutral-100 dark:border-neutral-700" />
                  )}
                  <StreamingContentSection
                    reasoning={step.content}
                    isStreamingReasoning={step.streaming}
                    isStreamingContent={false}
                    lightweight={true}
                    showDivider={false}
                  />
                </div>
              )
            }
            if (step.type === 'content') {
              if (!step.content) return null
              return (
                <div key={item.key}>
                  {showDivider && (
                    <div className="mb-2 border-t border-neutral-100 dark:border-neutral-700" />
                  )}
                  <StreamingContentSection
                    content={step.content}
                    isStreamingReasoning={false}
                    isStreamingContent={step.streaming}
                    lightweight={true}
                    showDivider={false}
                  />
                </div>
              )
            }
            if (step.type === 'compression') {
              return (
                <div key={item.key}>
                  {showDivider && (
                    <div className="mb-2 border-t border-neutral-100 dark:border-neutral-700" />
                  )}
                  <CompressionStatusCard text={step.content} streaming={step.streaming} />
                </div>
              )
            }
            return (
              <div key={item.key}>
                {showDivider && (
                  <div className="mb-2 border-t border-neutral-100 dark:border-neutral-700" />
                )}
                <ToolCallDisplay
                  toolCall={step.toolCall}
                  result={step.result ?? toolResults.get(step.toolCall.id)}
                  isExecuting={
                    step.streaming && !(step.result ?? toolResults.get(step.toolCall.id))
                  }
                  streamingArgs={
                    step.streaming
                      ? step.args ||
                        streamingToolArgsByCallId?.[step.toolCall.id] ||
                        streamingToolArgs ||
                        undefined
                      : undefined
                  }
                  subagentEvents={step.subagentEvents}
                  conversationId={conversationId ?? undefined}
                />
              </div>
            )
          })}

        {/* Legacy path: non-processing render */}
        {!shouldRenderMergedTimeline &&
          turn.messages.map((msg, idx) => (
            <AssistantStep
              key={msg.id}
              message={msg}
              toolResults={toolResults}
              showDivider={idx > 0}
              suppressExecutingToolCallIds={suppressExecutingToolCallIds}
              conversationId={conversationId ?? undefined}
            />
          ))}

        {/* Legacy path: explicit runtime render when merge is disabled */}
        {!shouldRenderMergedTimeline &&
          isProcessing &&
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
                    ? step.args ||
                      streamingToolArgsByCallId?.[step.toolCall.id] ||
                      streamingToolArgs ||
                      undefined
                    : undefined
                }
                subagentEvents={step.subagentEvents}
                conversationId={conversationId ?? undefined}
              />
            )
          })}

        {/* Fallback for older runtime path without ordered steps */}
        {!shouldRenderMergedTimeline &&
          isProcessing &&
          orderedRuntimeSteps.length === 0 &&
          draftToolCalls.map((tc) => (
            <ToolCallDisplay
              key={tc.id}
              toolCall={tc}
              result={toolResults.get(tc.id)}
              isExecuting={true}
              streamingArgs={
                streamingToolArgsByCallId?.[tc.id] ||
                (currentToolCall?.id === tc.id ? streamingToolArgs || undefined : undefined)
              }
              conversationId={conversationId ?? undefined}
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
        {isProcessing &&
          currentToolCall &&
          !hasCurrentToolCallInDraft &&
          !hasCurrentToolCallInRuntimeSteps && (
            <ToolCallDisplay
              toolCall={currentToolCall}
              isExecuting={true}
              streamingArgs={
                streamingToolArgsByCallId?.[currentToolCall.id] || streamingToolArgs || undefined
              }
              conversationId={conversationId ?? undefined}
            />
          )}

        {/* Waiting indicator - three pulsing dots while waiting for next model response */}
        {isWaiting && !currentToolCall && !isStreamingReasoning && !isStreamingContent && (
          <div className="inline-block rounded-lg bg-white px-4 py-2 text-base text-neutral-800 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700">
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

        {workflowProgress}

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
                title={`${t('workflow.input')} ${turn.totalUsage.promptTokens} + ${t('workflow.output')} ${turn.totalUsage.completionTokens} = ${turn.totalUsage.totalTokens} tokens`}
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
})

/** Renders streaming content section within the turn */
const StreamingContentSection = memo(function StreamingContentSection({
  reasoning,
  content,
  isStreamingReasoning,
  isStreamingContent,
  lightweight = false,
  showDivider = true,
}: {
  reasoning?: string
  content?: string
  isStreamingReasoning: boolean
  isStreamingContent: boolean
  lightweight?: boolean
  showDivider?: boolean
}) {
  return (
    <>
      {/* Show divider if there's content above */}
      {showDivider && <div className="border-t border-neutral-100 dark:border-neutral-700" />}

      {/* Reasoning */}
      {reasoning && <ReasoningSection reasoning={reasoning} streaming={isStreamingReasoning} />}

      {/* Content */}
      {content && (
        <div className="rounded-lg bg-white px-4 py-2 text-base text-neutral-800 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700">
          {lightweight ? (
            <div className="max-w-prose whitespace-pre-wrap break-words">{content}</div>
          ) : (
            <div className="prose max-w-prose overflow-x-auto break-words">
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
})

/** Renders one assistant message step inside a turn */
const AssistantStep = memo(function AssistantStep({
  message,
  toolResults,
  showDivider,
  suppressExecutingToolCallIds,
  conversationId,
}: {
  message: Message
  toolResults: Map<string, string>
  showDivider: boolean
  suppressExecutingToolCallIds?: Set<string>
  conversationId?: string
}) {
  const t = useT()
  const hasReasoning = !!message.reasoning
  const hasContent = !!message.content
  const hasAssets = !!(message.assets && message.assets.length > 0)
  const visibleToolCalls =
    message.toolCalls?.filter((tc) => !suppressExecutingToolCallIds?.has(tc.id)) || []
  const hasToolCalls = visibleToolCalls.length > 0
  const isContextSummary = message.kind === 'context_summary'
  const isWorkflowDryRun = message.kind === 'workflow_dry_run'
  const isWorkflowRealRun = message.kind === 'workflow_real_run'

  return (
    <>
      {showDivider && <div className="border-t border-neutral-100 dark:border-neutral-700" />}

      {/* Unified container for reasoning, content, and tool calls */}
      {(hasReasoning || hasContent || hasToolCalls || hasAssets) && (
        <div className="space-y-2">
          {/* Reasoning section */}
          {hasReasoning && <ReasoningSection reasoning={message.reasoning!} />}

          {/* Content section */}
          {hasContent && (
            <div
              className={
                isContextSummary
                  ? 'rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-base text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
                  : isWorkflowDryRun
                    ? 'rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-base text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100'
                    : isWorkflowRealRun
                      ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-base text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
                      : 'rounded-lg bg-white px-4 py-2 text-base text-neutral-800 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700'
              }
            >
              {isContextSummary && (
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  {t('workflow.contextSummary')}
                </div>
              )}
              {isWorkflowDryRun && (
                <div className="mb-2 space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300">
                    {t('workflow.simulateRun')}
                  </div>
                  {message.workflowDryRun && (
                    <div className="text-xs text-sky-800/90 dark:text-sky-200/90">
                      <span className="mr-2">
                        {t('workflow.status')}: {message.workflowDryRun.status}
                      </span>
                      <span className="mr-2">
                        {t('workflow.template')}: {message.workflowDryRun.templateId}
                      </span>
                      <span>
                        {t('workflow.repairRounds')}: {message.workflowDryRun.repairRound}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {isWorkflowRealRun && <WorkflowRealRunHeader payload={message.workflowRealRun} />}
              <div className="prose max-w-prose overflow-x-auto break-words">
                <MarkdownContent content={message.content!} />
              </div>
            </div>
          )}

          {/* Tool calls section */}
          {hasToolCalls && (
            <div className="space-y-1">
              {visibleToolCalls.map((tc) => (
                <ToolCallDisplay key={tc.id} toolCall={tc} result={toolResults.get(tc.id)} conversationId={conversationId} />
              ))}
            </div>
          )}

          {/* Assets section (generated charts, images, etc.) */}
          {message.assets && message.assets.length > 0 && (
            <AssetCompactList assets={message.assets} />
          )}
        </div>
      )}
    </>
  )
})

function CompressionStatusCard({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
      <span>{text}</span>
      {streaming && (
        <span className="ml-2 inline-block h-3 w-[2px] animate-pulse bg-neutral-400 align-middle" />
      )}
    </div>
  )
}

function WorkflowRealRunHeader({ payload }: { payload?: WorkflowRealRunPayload }) {
  const t = useT()
  return (
    <div className="mb-2 space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        {t('workflow.realRun')}
      </div>
      {payload && (
        <div className="space-y-1 text-xs text-emerald-800/90 dark:text-emerald-200/90">
          <div>
            <span className="mr-2">
              {t('workflow.status')}: {payload.status}
            </span>
            <span className="mr-2">
              {t('workflow.template')}: {payload.templateId}
            </span>
            <span className="mr-2">
              {t('workflow.repairRounds')}: {payload.repairRound}
            </span>
            {payload.totalTokens != null && <span>Tokens: {payload.totalTokens}</span>}
          </div>
          {Object.keys(payload.nodeOutputs).length > 0 && (
            <div className="mt-1 space-y-0.5">
              {Object.entries(payload.nodeOutputs).map(([key, content]) => (
                <details
                  key={key}
                  className="rounded border border-emerald-200 dark:border-emerald-800"
                >
                  <summary className="cursor-pointer px-2 py-0.5 font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/30">
                    {key}
                  </summary>
                  <div className="max-h-40 overflow-auto whitespace-pre-wrap px-2 py-1 text-[11px]">
                    {content.length > 500 ? content.slice(0, 500) + '...' : content}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
