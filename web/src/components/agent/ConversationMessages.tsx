/**
 * ConversationMessages — renders the list of message turns,
 * draft assistant bubble, and workflow progress panels.
 *
 * Streaming data (draftAssistant, streamingState, streamingContent, toolResults)
 * is subscribed directly from the runtime store inside this component,
 * so that parent components (ConversationView) do NOT re-render on every
 * streaming token (~60fps). Only this component tree re-renders.
 */

import { Fragment, memo, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react'
import { useConversationRuntimeStore } from '@/store/conversation-runtime.store'
import { useShallow } from 'zustand/react/shallow'
import { MessageBubble } from './MessageBubble'
import { AssistantTurnBubble } from './AssistantTurnBubble'
import { ConversationUsageBar } from './ConversationUsageBar'
import { WorkflowExecutionProgress } from './WorkflowExecutionProgress'
import { groupMessagesIntoTurns } from './group-messages'
import { useWorkflowProgressAnchor } from './useWorkflowProgressAnchor'
import { Clock, X } from 'lucide-react'
import { useT } from '@/i18n'
import type { DraftAssistantStep, Message, ToolCall, WorkflowExecutionState } from '@/agent/message-types'
import type { FileMentionItem } from './FileMentionExtension'

type ConversationMessagesProps = {
  activeMessages: Message[]
  /** Tool results from committed messages only (not runtime) */
  toolResults: Map<string, string>
  isProcessing: boolean
  status: string
  onDeleteAgentLoop: (messageId: string) => void
  onEditAndResend: (userMessageId: string, newContent: string) => void
  onRegenerate: ((userMessageId: string) => void) | undefined
  onCancel: () => void
  messagesEndRef: React.RefObject<HTMLDivElement>
  /** Conversation ID for bridging ask_user_question UI back to executor */
  conversationId?: string | null
  /** Agent candidates for @ mention in edit mode */
  mentionAgents: { id: string; name?: string }[]
  /** Async file search callback for # file mention in edit mode */
  onSearchFiles?: (query: string) => Promise<FileMentionItem[]>
  /** Open the shared FilePreview drawer with a pre-loaded blob */
  onPreviewAsset?: (name: string, blob: Blob) => void
  /**
   * Stable snapshot of low-frequency data computed by the parent.
   * These fields change only when the processing state or messages change,
   * NOT on every streaming token.
   */
  staticSnapshot: {
    activeWorkflowExecution: WorkflowExecutionState | null
  }
}

export interface ConversationMessagesHandle {
  getUserNavItems: () => Array<{ turnIndex: number; preview: string; number: number }>
  scrollToTurnIndex: (index: number, align?: 'start' | 'center' | 'end') => void
}

/** Build runtime props for an AssistantTurnBubble. Returns undefined values when not active. */
function getRuntimeProps(
  active: boolean,
  isWaiting: boolean,
  draftAssistant: {
    toolCalls: ToolCall[]
    steps: DraftAssistantStep[]
    toolResults: Record<string, string>
    reasoning: string
    content: string
  } | null,
  streamingState: {
    currentToolCall: ToolCall | null
    streamingToolArgs: string
    streamingToolArgsByCallId: Record<string, string>
    activeToolCalls: ToolCall[]
  } | null,
  streamingStateDerived: { reasoning: boolean; content: boolean } | undefined,
  streamingContent: { reasoning: string; content: string } | undefined,
  status: string,
) {
  return {
    isWaiting: active ? isWaiting : false,
    streamingState: active ? streamingStateDerived : undefined,
    streamingContent: active ? streamingContent : undefined,
    currentToolCall: active && status === 'tool_calling' ? streamingState?.currentToolCall : undefined,
    streamingToolArgs: active && status === 'tool_calling' ? streamingState?.streamingToolArgs : undefined,
    streamingToolArgsByCallId: active ? streamingState?.streamingToolArgsByCallId : undefined,
    runtimeToolCalls: active ? draftAssistant?.toolCalls : undefined,
    runtimeSteps: active ? draftAssistant?.steps : undefined,
  }
}

export const ConversationMessages = memo(forwardRef(function ConversationMessages({
  activeMessages,
  toolResults: committedToolResults,
  isProcessing,
  status,
  onDeleteAgentLoop,
  onEditAndResend,
  onRegenerate,
  onCancel,
  messagesEndRef,
  conversationId,
  mentionAgents,
  onSearchFiles,
  onPreviewAsset,
  staticSnapshot,
}: ConversationMessagesProps, ref: React.Ref<ConversationMessagesHandle | null>) {
  const t = useT()
  const { activeWorkflowExecution } = staticSnapshot

  // ── Subscribe to streaming data directly from runtime store ──
  // This component is the ONLY place that reads streaming data at high frequency.
  // Parent components do NOT receive these props and will NOT re-render on tokens.
  const streamingData = useConversationRuntimeStore(
    useShallow((s) => {
      if (!conversationId) return null
      const rt = s.runtimes.get(conversationId)
      if (!rt) return null
      return {
        draftAssistant: rt.draftAssistant,
        streamingContent: rt.streamingContent,
        streamingReasoning: rt.streamingReasoning,
        isReasoningStreaming: rt.isReasoningStreaming,
        isContentStreaming: rt.isContentStreaming,
        currentToolCall: rt.currentToolCall,
        activeToolCalls: rt.activeToolCalls || [],
        streamingToolArgs: rt.streamingToolArgs,
        streamingToolArgsByCallId: rt.streamingToolArgsByCallId || {},
        iterationLimitReached: rt.iterationLimitReached ?? null,
      }
    }),
  )

  // Derive the same shapes that used to come from props
  const activeDraftAssistant = streamingData ? {
    toolCalls: streamingData.draftAssistant?.toolCalls || [],
    steps: streamingData.draftAssistant?.steps || [],
    toolResults: streamingData.draftAssistant?.toolResults || {},
    reasoning: streamingData.draftAssistant?.reasoning || '',
    content: streamingData.draftAssistant?.content || '',
  } : null

  const activeStreamingState = streamingData ? {
    currentToolCall: streamingData.currentToolCall,
    streamingToolArgs: streamingData.streamingToolArgs,
    streamingToolArgsByCallId: streamingData.streamingToolArgsByCallId,
    activeToolCalls: streamingData.activeToolCalls,
  } : null

  const isWaitingForModel =
    status === 'pending' ||
    (status === 'tool_calling' &&
      !activeStreamingState?.currentToolCall &&
      (activeStreamingState?.activeToolCalls?.length || 0) === 0)

  // ── Merge tool results: committed + runtime ──
  // This MUST be subscribed here (not in parent) because runtime toolResults
  // change at high frequency during multi-tool agent loops.
  const toolResults = useMemo(() => {
    const merged = new Map(committedToolResults)
    const runtimeResults = activeDraftAssistant?.toolResults || {}
    for (const [toolCallId, result] of Object.entries(runtimeResults)) {
      if (!merged.has(toolCallId)) merged.set(toolCallId, result)
    }
    return merged
  }, [committedToolResults, activeDraftAssistant?.toolResults])

  const streamingState = useMemo(
    () =>
      !streamingData || !isProcessing
        ? undefined
        : {
            reasoning: streamingData.isReasoningStreaming,
            content: streamingData.isContentStreaming,
          },
    [streamingData?.isReasoningStreaming, streamingData?.isContentStreaming, isProcessing],
  )

  const streamingContentMessage = useMemo(() => {
    if (!streamingData || !streamingData.draftAssistant || !isProcessing) return undefined
    const reasoning = streamingData.draftAssistant.reasoning || streamingData.streamingReasoning
    const content = streamingData.draftAssistant.content || streamingData.streamingContent
    if (!reasoning && !content) return undefined
    const lastAssistant = [...activeMessages].reverse().find((m) => m.role === 'assistant')
    if (
      lastAssistant &&
      (lastAssistant.reasoning || '') === (reasoning || '') &&
      (lastAssistant.content || '') === (content || '')
    ) return undefined
    return { reasoning, content }
  }, [
    streamingData?.streamingReasoning,
    streamingData?.streamingContent,
    streamingData?.draftAssistant?.reasoning,
    streamingData?.draftAssistant?.content,
    activeMessages,
    isProcessing,
  ])

  // ── Queued messages (visible while agent is processing) ──
  const queuedMessages = useConversationRuntimeStore(
    useShallow((s) => {
      if (!conversationId) return []
      return s.pendingMessageQueues.get(conversationId)?.map((m) => ({ text: m.text, enqueuedAt: m.enqueuedAt })) ?? []
    }),
  )

  const turns = useMemo(() => groupMessagesIntoTurns(activeMessages), [activeMessages])
  const lastTurn = turns[turns.length - 1]

  // ── Expose navigation handle to parent ──
  useImperativeHandle(ref, useCallback(() => ({
    getUserNavItems: () => {
      const items: Array<{ turnIndex: number; preview: string; number: number }> = []
      let num = 0
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i]
        if (turn.type === 'user') {
          num++
          const content = turn.message.content || ''
          items.push({
            turnIndex: i,
            preview: content.length > 36 ? content.slice(0, 36) + '…' : content,
            number: num,
          })
        }
      }
      return items
    },
    scrollToTurnIndex: (index: number, _align: 'start' | 'center' | 'end' = 'start') => {
      const el = document.querySelector(`[data-turn-index="${index}"]`)
      if (!el) return
      // Find the scroll container (nearest overflow-y-auto ancestor)
      const container = el.closest('[class*="overflow-y-auto"]') as HTMLElement | null
      if (container) {
        const targetTop = (el as HTMLElement).offsetTop
        container.scrollTo({ top: targetTop, behavior: 'smooth' })
      }
    },
  }), [turns]))

  const anchorIndex = useWorkflowProgressAnchor({
    activeWorkflowExecution,
    activeDraftAssistant,
    activeStreamingState,
    activeMessages,
    isProcessing,
    turns,
  })

  const shouldRenderDraftAssistant = isProcessing && (!lastTurn || lastTurn.type !== 'assistant')
  const shouldAttachRuntimeToDraft = shouldRenderDraftAssistant
  return (
    <div className="min-h-0 px-4 py-4">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        {/* Cumulative token usage across all turns in this conversation */}
        <ConversationUsageBar messages={activeMessages} />
        {turns.map((turn, idx) => {
          const isLast = isProcessing && idx === turns.length - 1
          const runtime = getRuntimeProps(
            isLast, isWaitingForModel, activeDraftAssistant, activeStreamingState,
            streamingState, streamingContentMessage, status,
          )

          return turn.type === 'user' ? (
            <div key={turn.message.id} data-turn-index={idx}>
              <MessageBubble
                message={turn.message}
              onDeleteAgentLoop={onDeleteAgentLoop}
              onEditAndResend={onEditAndResend}
              onRegenerate={onRegenerate}
              onCancel={onCancel}
              disableDeleteActions={isProcessing}
              isProcessing={isProcessing}
              mentionAgents={mentionAgents}
              onSearchFiles={onSearchFiles}
              onPreviewAsset={onPreviewAsset}
            />
            </div>
          ) : (
            <Fragment key={turn.messages[0].id}>
              <AssistantTurnBubble
                turn={turn}
                toolResults={toolResults}
                isProcessing={isLast}
                isWaiting={runtime.isWaiting}
                streamingState={runtime.streamingState}
                streamingContent={runtime.streamingContent}
                currentToolCall={runtime.currentToolCall}
                streamingToolArgs={runtime.streamingToolArgs}
                streamingToolArgsByCallId={runtime.streamingToolArgsByCallId}
                runtimeToolCalls={runtime.runtimeToolCalls}
                runtimeSteps={runtime.runtimeSteps}
                conversationId={conversationId}
                onPreviewAsset={onPreviewAsset}
                iterationLimitReached={idx === turns.length - 1 ? streamingData?.iterationLimitReached ?? null : null}
                workflowProgress={
                  activeWorkflowExecution && idx === anchorIndex ? (
                    <WorkflowExecutionProgress execution={activeWorkflowExecution} onStop={onCancel} />
                  ) : undefined
                }
              />
            </Fragment>
          )
        })}

        {/* Draft assistant turn */}
        {shouldRenderDraftAssistant && (
          <Fragment>
            <AssistantTurnBubble
              key="draft-assistant"
              turn={{ type: 'assistant', messages: [], timestamp: Date.now(), totalUsage: null }}
              toolResults={toolResults}
              showAvatar
              isProcessing={true}
              conversationId={conversationId}
              {...getRuntimeProps(
                shouldAttachRuntimeToDraft, isWaitingForModel, activeDraftAssistant,
                activeStreamingState, streamingState, streamingContentMessage, status,
              )}
              workflowProgress={
                activeWorkflowExecution && anchorIndex === -1 ? (
                  <WorkflowExecutionProgress execution={activeWorkflowExecution} onStop={onCancel} />
                ) : undefined
              }
            />
          </Fragment>
        )}

        {/* Fallback workflow progress */}
        {activeWorkflowExecution && anchorIndex === -1 && !shouldRenderDraftAssistant && (
          <WorkflowExecutionProgress execution={activeWorkflowExecution} onStop={onCancel} />
        )}

        {/* Queued messages — shown while agent is processing */}
        {isProcessing && queuedMessages.length > 0 && (
          <div className="space-y-3">
            {/* Queue divider */}
            <div className="flex items-center gap-2 text-xs text-blue-500 dark:text-blue-400">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{t('conversation.queue.divider', { count: queuedMessages.length })}</span>
              <div className="h-px flex-1 bg-blue-200 dark:bg-blue-800" />
            </div>
            {/* Queued message bubbles */}
            {queuedMessages.map((msg, idx) => (
              <div key={`queued-${idx}-${msg.enqueuedAt}`} className="group/queued relative">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-blue-50 px-4 py-2.5 text-sm text-neutral-800 opacity-60 dark:bg-blue-900/30 dark:text-neutral-200 dark:opacity-70">
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (conversationId) {
                      useConversationRuntimeStore.getState().removeQueuedMessage(conversationId, idx)
                    }
                  }}
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-neutral-500 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-500 group-hover/queued:flex group-hover/queued:opacity-100 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-red-900/60 dark:hover:text-red-400"
                  title={t('conversation.queue.remove')}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}))
