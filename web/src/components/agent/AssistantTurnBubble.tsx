/**
 * AssistantTurnBubble - renders a grouped agent turn (one avatar, multiple steps, summary footer).
 *
 * Rendering model:
 * ┌─────────────────────────────────────────────┐
 * │  [avatar]  │  Step 1: reasoning (streaming)  │
 * │            │  Step 2: content (committed)     │
 * │            │  Step 3: tool_call (streaming)   │
 * │            │  Step 4: compression (committed) │
 * │            │  Step 5: content (streaming)     │
 * │            │  ─── summary footer ───          │
 * └─────────────────────────────────────────────┘
 *
 * A "step" is either:
 * - A **committed message** (persisted, immutable) from `turn.messages`
 * - A **runtime step** (streaming, mutable) from `draftAssistant.steps`
 *
 * During streaming (isProcessing=true on the last turn):
 *   Committed messages + runtime steps are merged into a single timeline
 *   sorted by timestamp. This allows context_summary, tool calls, and
 *   compression cards to appear in chronological order.
 *
 * When not processing:
 *   Only committed messages are rendered (no runtime steps).
 */

import { memo, type ReactNode, useState } from 'react'
import { Bot, Database, GitFork } from 'lucide-react'
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
import { useConversationStore } from '@/store/conversation.store'

// ─── Types ────────────────────────────────────────────────────────────

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

/** A single item in the unified timeline */
type TimelineItem =
  | { kind: 'committed'; key: string; message: Message }
  | { kind: 'runtime'; key: string; step: DraftAssistantStep }
  | { kind: 'fallback-content'; key: string; content: StreamingContent; streaming: StreamingState }
  | { kind: 'fallback-toolcall'; key: string; toolCall: ToolCall; streamingArgs?: string }

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

// ─── Timeline builder ─────────────────────────────────────────────────

/**
 * Build a unified timeline from committed messages and runtime steps.
 *
 * Strategy:
 * 1. When NOT processing: just render committed messages in array order.
 * 2. When processing:
 *    a. Collect "already committed" info for dedup.
 *    b. Filter runtime steps: hide steps that duplicate committed content.
 *    c. Merge committed + visible runtime steps, sorted by timestamp.
 *    d. If no runtime steps visible, add fallback streaming content/tool calls.
 */
function buildTimeline(
  committed: Message[],
  runtimeSteps: DraftAssistantStep[],
  runtimeToolCalls: ToolCall[],
  currentToolCall: ToolCall | null,
  streamingContent: StreamingContent | undefined,
  streamingState: StreamingState | undefined,
  isProcessing: boolean,
  turnTimestamp: number,
): TimelineItem[] {
  // ── Non-processing: just committed messages in array order ──
  if (!isProcessing) {
    return committed.map((msg) => ({
      kind: 'committed' as const,
      key: `msg-${msg.id}`,
      message: msg,
    }))
  }

  // ── Processing mode: merge committed + runtime steps ──

  // Collect committed info for dedup
  const committedToolCallIds = new Set(
    committed.flatMap((msg) => msg.toolCalls?.map((tc) => tc.id) || []),
  )
  const latestCommittedTs = committed.reduce(
    (max, msg) => Math.max(max, typeof msg.timestamp === 'number' ? msg.timestamp : 0),
    0,
  )

  // Filter runtime steps
  const visibleSteps: DraftAssistantStep[] = []
  const runtimeToolCallIds = new Set<string>()

  for (const step of runtimeSteps) {
    // Streaming steps are always visible — they represent currently active blocks
    if (step.streaming) {
      visibleSteps.push(step)
      if (step.type === 'tool_call') runtimeToolCallIds.add(step.toolCall.id)
      continue
    }

    // Completed steps: hide if their content is already represented in committed messages
    switch (step.type) {
      case 'tool_call':
        // Hide if this tool call ID already appears in a committed message
        if (!committedToolCallIds.has(step.toolCall.id)) {
          visibleSteps.push(step)
          runtimeToolCallIds.add(step.toolCall.id)
        }
        break
      case 'content':
        // Keep completed content that belongs to current in-flight iteration.
        // Older completed content has already been committed and should be hidden.
        {
          const stepTs = typeof step.timestamp === 'number' ? step.timestamp : 0
          if (stepTs >= latestCommittedTs) visibleSteps.push(step)
        }
        break
      case 'reasoning':
        // Same as content: keep only latest in-flight completed reasoning.
        {
          const stepTs = typeof step.timestamp === 'number' ? step.timestamp : 0
          if (stepTs >= latestCommittedTs) visibleSteps.push(step)
        }
        break
      case 'compression':
        // Hide if stale: completed compression from a previous iteration
        // (its timestamp is older than the latest committed message)
        {
          const stepTs = typeof step.timestamp === 'number' ? step.timestamp : 0
          if (stepTs >= latestCommittedTs) visibleSteps.push(step)
        }
        break
    }
  }

  // ── Build interleaved timeline sorted by timestamp ──
  type SortableItem = {
    timestamp: number
    subIndex: number
    source: 'committed' | 'runtime'
    sourceIndex: number
    item: TimelineItem
  }
  const sortableItems: SortableItem[] = []

  // Committed messages get even sub-indices for stable ordering at same timestamp
  committed.forEach((msg, idx) => {
    sortableItems.push({
      timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : 0,
      subIndex: idx * 2,
      source: 'committed',
      sourceIndex: idx,
      item: { kind: 'committed', key: `msg-${msg.id}`, message: msg },
    })
  })

  // Runtime steps get odd sub-indices
  visibleSteps.forEach((step, idx) => {
    const ts = typeof step.timestamp === 'number' ? step.timestamp : turnTimestamp + idx + 1
    sortableItems.push({
      timestamp: ts,
      subIndex: idx * 2 + 1,
      source: 'runtime',
      sourceIndex: idx,
      item: { kind: 'runtime', key: `step-${step.id}`, step },
    })
  })

  // Committed messages first (array order), then runtime steps (LLM emission order).
  // The visibleSteps filter already guarantees that visible runtime steps are from
  // after the last committed message, so no timestamp-based interleaving is needed.
  sortableItems.sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === 'committed' ? -1 : 1
    }
    return a.sourceIndex - b.sourceIndex
  })

  const items: TimelineItem[] = sortableItems.map((si) => si.item)

  // ── Fallbacks (only when no runtime steps are visible) ──
  const hasVisibleRuntimeSteps = visibleSteps.length > 0

  // Fallback: draft tool calls not yet in steps or committed
  if (!hasVisibleRuntimeSteps) {
    for (const tc of runtimeToolCalls) {
      if (committedToolCallIds.has(tc.id)) continue
      items.push({
        kind: 'fallback-toolcall',
        key: `draft-tc-${tc.id}`,
        toolCall: tc,
      })
    }
  }

  // Fallback: streaming content blobs
  if (
    !hasVisibleRuntimeSteps &&
    streamingContent &&
    (streamingContent.reasoning || streamingContent.content)
  ) {
    items.push({
      kind: 'fallback-content',
      key: 'fallback-streaming',
      content: streamingContent,
      streaming: streamingState ?? {},
    })
  }

  // Fallback: current tool call not yet in steps/draft
  const allToolCallIds = new Set([
    ...committedToolCallIds,
    ...runtimeToolCallIds,
    ...runtimeToolCalls.map((tc) => tc.id),
  ])
  if (currentToolCall && !allToolCallIds.has(currentToolCall.id)) {
    items.push({
      kind: 'fallback-toolcall',
      key: `current-tc-${currentToolCall.id}`,
      toolCall: currentToolCall,
    })
  }

  return items
}

/**
 * Compute tool call IDs to suppress in committed message rendering.
 * A tool call is suppressed when it's actively executing (streaming, no result)
 * and already shown as a runtime step — avoids "double card" for the same call.
 */
function buildSuppressedIds(
  runtimeSteps: DraftAssistantStep[],
  toolResults: Map<string, string>,
  currentToolCall: ToolCall | null,
): Set<string> {
  const suppressed = new Set<string>()
  for (const step of runtimeSteps) {
    if (step.type !== 'tool_call') continue
    const hasResult = !!(step.result ?? toolResults.get(step.toolCall.id))
    if (step.streaming && !hasResult) {
      suppressed.add(step.toolCall.id)
    }
  }
  if (currentToolCall && !toolResults.get(currentToolCall.id)) {
    suppressed.add(currentToolCall.id)
  }
  return suppressed
}

// ─── Main component ───────────────────────────────────────────────────

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

  // Build unified timeline
  const timeline = buildTimeline(
    turn.messages,
    runtimeSteps || [],
    runtimeToolCalls || [],
    currentToolCall ?? null,
    streamingContent,
    streamingState,
    !!isProcessing,
    turn.timestamp,
  )

  // Compute suppressed tool call IDs for committed message rendering
  const suppressedIds = isProcessing
    ? buildSuppressedIds(runtimeSteps || [], toolResults, currentToolCall ?? null)
    : new Set<string>()

  // Last message with content for copy button
  const lastMessageWithContent = [...turn.messages].reverse().find((msg) => msg.content)

  // Branch conversation state
  const [isBranching, setIsBranching] = useState(false)
  const handleBranch = async () => {
    if (!conversationId || isBranching) return
    // Use the last message in this turn as the branch point
    const branchPointMessageId = turn.messages[turn.messages.length - 1]?.id
    if (!branchPointMessageId) return
    setIsBranching(true)
    try {
      await useConversationStore.getState().branchConversation(conversationId, branchPointMessageId)
    } catch (error) {
      console.error('[AssistantTurnBubble] Failed to branch conversation:', error)
    } finally {
      setIsBranching(false)
    }
  }

  return (
    <div className={showAvatar ? 'flex gap-3' : ''}>
      {showAvatar && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
          <Bot className="h-4 w-4" />
        </div>
      )}

      {/* Steps column */}
      <div className={showAvatar ? 'w-[90%] min-w-0 space-y-2' : 'w-full min-w-0 space-y-2'}>
        {/* Timeline */}
        {timeline.map((item, index) => (
          <TimelineRow key={item.key} showDivider={index > 0}>
            {renderTimelineItem(
              item,
              toolResults,
              suppressedIds,
              streamingToolArgs ?? null,
              streamingToolArgsByCallId,
              conversationId,
            )}
          </TimelineRow>
        ))}

        {/* Waiting indicator */}
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

        {/* Summary footer (only when not processing) */}
        {!isProcessing && !isWaiting && (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span>
              {new Date(turn.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {turn.totalUsage && (
              <span className="inline-flex items-center gap-1.5">
                <span>↑{formatTokens(turn.totalUsage.promptTokens)}</span>
                <span>↓{formatTokens(turn.totalUsage.completionTokens)}</span>
                {turn.totalUsage.cacheReadTokens ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Database className="h-3 w-3 text-neutral-400" />{formatTokens(turn.totalUsage.cacheReadTokens)}
                  </span>
                ) : null}
              </span>
            )}
            {lastMessageWithContent?.content && (
              <CopyButton content={lastMessageWithContent.content} />
            )}
            <button
              type="button"
              onClick={handleBranch}
              disabled={isBranching || !conversationId}
              className={`inline-flex items-center rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-50`}
              title={t('conversation.branch') || 'Branch from here'}
              aria-label={t('conversation.branch') || 'Branch from here'}
            >
              <GitFork className={`h-3.5 w-3.5 ${isBranching ? 'animate-pulse' : ''}`} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

// ─── Timeline rendering helpers ───────────────────────────────────────

function renderTimelineItem(
  item: TimelineItem,
  toolResults: Map<string, string>,
  suppressedIds: Set<string>,
  streamingToolArgs: string | null,
  streamingToolArgsByCallId: Record<string, string> | undefined,
  conversationId: string | null | undefined,
): ReactNode {
  switch (item.kind) {
    case 'committed':
      return (
        <AssistantStep
          message={item.message}
          toolResults={toolResults}
          showDivider={false}
          suppressExecutingToolCallIds={suppressedIds}
          conversationId={conversationId ?? undefined}
        />
      )

    case 'runtime':
      return renderRuntimeStep(
        item.step,
        toolResults,
        streamingToolArgs,
        streamingToolArgsByCallId,
        conversationId,
      )

    case 'fallback-content':
      return (
        <StreamingContentSection
          reasoning={item.content.reasoning}
          content={item.content.content}
          isStreamingReasoning={item.streaming.reasoning ?? false}
          isStreamingContent={item.streaming.content ?? false}
          lightweight={false}
          showDivider={false}
        />
      )

    case 'fallback-toolcall':
      return (
        <ToolCallDisplay
          toolCall={item.toolCall}
          isExecuting={true}
          streamingArgs={
            streamingToolArgsByCallId?.[item.toolCall.id] ||
            streamingToolArgs ||
            undefined
          }
          conversationId={conversationId ?? undefined}
        />
      )
  }
}

function renderRuntimeStep(
  step: DraftAssistantStep,
  toolResults: Map<string, string>,
  streamingToolArgs: string | null,
  streamingToolArgsByCallId: Record<string, string> | undefined,
  conversationId: string | null | undefined,
): ReactNode {
  if (step.type === 'reasoning') {
    if (!step.content) return null
    return (
      <StreamingContentSection
        reasoning={step.content}
        isStreamingReasoning={step.streaming}
        isStreamingContent={false}
        lightweight={true}
        showDivider={false}
      />
    )
  }

  if (step.type === 'content') {
    if (!step.content) return null
    return (
      <StreamingContentSection
        content={step.content}
        isStreamingReasoning={false}
        isStreamingContent={step.streaming}
        lightweight={true}
        showDivider={false}
      />
    )
  }

  if (step.type === 'compression') {
    return <CompressionStatusCard text={step.content} streaming={step.streaming} />
  }

  // tool_call
  return (
    <ToolCallDisplay
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
}

/** Row wrapper that optionally renders a divider above children */
function TimelineRow({ showDivider, children }: { showDivider: boolean; children: ReactNode }) {
  return (
    <>
      {showDivider && <div className="mb-2 border-t border-neutral-100 dark:border-neutral-700" />}
      {children}
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────

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

      {(hasReasoning || hasContent || hasToolCalls || hasAssets) && (
        <div className="space-y-2">
          {hasReasoning && <ReasoningSection reasoning={message.reasoning!} />}

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

          {hasToolCalls && (
            <div className="space-y-1">
              {visibleToolCalls.map((tc) => (
                <ToolCallDisplay
                  key={tc.id}
                  toolCall={tc}
                  result={toolResults.get(tc.id)}
                  conversationId={conversationId}
                />
              ))}
            </div>
          )}

          {message.assets && message.assets.length > 0 && <AssetCompactList assets={message.assets} />}
        </div>
      )}
    </>
  )
})

/** Compression status card — shows progress of context compression */
function CompressionStatusCard({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
      <span>{text}</span>
      {streaming && (
        <span className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent align-text-bottom" />
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
