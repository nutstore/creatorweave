/**
 * ConversationMessages — renders the list of message turns,
 * draft assistant bubble, and workflow progress panels.
 *
 * Uses @tanstack/react-virtual for virtualized rendering — only
 * turns visible in the viewport (+ overscan) are mounted in the DOM.
 *
 * Streaming data (draftAssistant, streamingState, streamingContent, toolResults)
 * is subscribed directly from the runtime store inside this component,
 * so that parent components (ConversationView) do NOT re-render on every
 * streaming token (~60fps). Only this component tree re-renders.
 */

import { memo, useCallback, useEffect, forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useConversationRuntimeStore } from '@/store/conversation-runtime.store'
import { useShallow } from 'zustand/react/shallow'
import { MessageBubble } from './MessageBubble'
import { AssistantTurnBubble } from './AssistantTurnBubble'
import { WorkflowExecutionProgress } from './WorkflowExecutionProgress'
import { groupMessagesIntoTurns } from './group-messages'
import { useWorkflowProgressAnchor } from './useWorkflowProgressAnchor'
import type { DraftAssistantStep, Message, ToolCall, WorkflowExecutionState } from '@/agent/message-types'
import type { FileMentionItem } from './FileMentionExtension'

/** Exposed handle for parent components to access navigation data */
export interface ConversationMessagesHandle {
  /** Get user message navigation items (turn index + preview text) */
  getUserNavItems: () => Array<{ turnIndex: number; preview: string; number: number }>
  /** Scroll to a specific turn by index */
  scrollToTurnIndex: (index: number, align?: 'start' | 'center' | 'end') => void
}

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
  /** No longer used for scrollIntoView — kept for API compat, virtualizer handles scrolling */
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  /** The scroll container element (overflow-y-auto div) from ConversationView */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  /** Conversation ID for bridging ask_user_question UI back to executor */
  conversationId?: string | null
  /** Agent candidates for @ mention in edit mode */
  mentionAgents: { id: string; name?: string }[]
  /** Async file search callback for # file mention in edit mode */
  onSearchFiles?: (query: string) => Promise<FileMentionItem[]>
  /**
   * Stable snapshot of low-frequency data computed by the parent.
   * These fields change only when the processing state or messages change,
   * NOT on every streaming token.
   */
  staticSnapshot: {
    activeWorkflowExecution: WorkflowExecutionState | null
  }
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
): {
  isWaiting: boolean
  streamingState: { reasoning: boolean; content: boolean } | undefined
  streamingContent: { reasoning: string; content: string } | undefined
  currentToolCall: ToolCall | null | undefined
  streamingToolArgs: string | undefined
  streamingToolArgsByCallId: Record<string, string> | undefined
  runtimeToolCalls: ToolCall[] | undefined
  runtimeSteps: DraftAssistantStep[] | undefined
} {
  // Fast path: non-active turns get all-undefined — stable references
  if (!active) {
    return EMPTY_RUNTIME_PROPS
  }
  return {
    isWaiting,
    streamingState: streamingStateDerived,
    streamingContent,
    currentToolCall: status === 'tool_calling' ? streamingState?.currentToolCall : undefined,
    streamingToolArgs: status === 'tool_calling' ? streamingState?.streamingToolArgs : undefined,
    streamingToolArgsByCallId: streamingState?.streamingToolArgsByCallId,
    runtimeToolCalls: draftAssistant?.toolCalls,
    runtimeSteps: draftAssistant?.steps,
  }
}

/** Stable object returned for all non-active turns — avoids new object per render */
const EMPTY_RUNTIME_PROPS = {
  isWaiting: false,
  streamingState: undefined,
  streamingContent: undefined,
  currentToolCall: undefined,
  streamingToolArgs: undefined,
  streamingToolArgsByCallId: undefined,
  runtimeToolCalls: undefined,
  runtimeSteps: undefined,
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
  scrollContainerRef,
  conversationId,
  mentionAgents,
  onSearchFiles,
  staticSnapshot,
}: ConversationMessagesProps, ref: React.Ref<ConversationMessagesHandle | null>) {
  const { activeWorkflowExecution } = staticSnapshot

  // ── Subscribe to streaming data directly from runtime store ──
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
      }
    }),
  )

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

  const turns = useMemo(() => groupMessagesIntoTurns(activeMessages), [activeMessages])
  const lastTurn = turns[turns.length - 1]

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
  const draftSteps = shouldAttachRuntimeToDraft ? activeDraftAssistant?.steps || [] : []
  const draftHasCompressionOnly =
    draftSteps.length > 0 &&
    draftSteps.every((step) => step.type === 'compression') &&
    !activeStreamingState?.currentToolCall &&
    !streamingContentMessage?.reasoning &&
    !streamingContentMessage?.content

  // ── Virtual list setup ──
  const itemCount = turns.length + (shouldRenderDraftAssistant ? 1 : 0)

  const getScrollElement = useCallback(
    () => scrollContainerRef.current,
    [scrollContainerRef],
  )

  // Gap between turns (matches Tailwind's space-y-4 = 1rem = 16px)
  const TURN_GAP = 16

  // Keep a map of measured heights so estimateSize can return accurate values
  // when count changes (prevents overlap from stale estimates)
  const measuredHeightsRef = useRef<Map<number, number>>(new Map())

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement,
    estimateSize: (index: number) => {
      // Return last known measured height if available
      const cached = measuredHeightsRef.current.get(index)
      if (cached) return cached
      // Draft assistant item
      if (index === turns.length && shouldRenderDraftAssistant) {
        return 200 + TURN_GAP
      }
      const turn = turns[index]
      if (!turn) return 100 + TURN_GAP
      if (turn.type === 'user') return 100 + TURN_GAP
      // Assistant turn — estimate based on number of messages
      return 150 + turn.messages.length * 100 + TURN_GAP
    },
    overscan: 5,
    measureElement: (el) => {
      const height = el?.getBoundingClientRect().height ?? 0
      // Cache the measured height for this item
      const index = el ? Number(el.getAttribute('data-index')) : -1
      if (index >= 0 && height > 0) {
        measuredHeightsRef.current.set(index, height)
      }
      return height
    },
  })

  // ── Expose navigation handle to parent ──
  useImperativeHandle(ref, () => ({
    getUserNavItems: () => {
      const items: Array<{ turnIndex: number; preview: string; number: number }> = []
      let num = 0
      for (let i = 0; i < turns.length; i++) {
        if (turns[i].type === 'user') {
          num++
          const content = turns[i].message.content || ''
          items.push({
            turnIndex: i,
            preview: content.length > 36 ? content.slice(0, 36) + '…' : content,
            number: num,
          })
        }
      }
      return items
    },
    scrollToTurnIndex: (index: number, align: 'start' | 'center' | 'end' = 'start') => {
      virtualizer.scrollToIndex(index, { align, behavior: 'smooth' })
    },
  }), [turns, virtualizer])

  // ── Re-measure on streaming content changes ──
  const lastStreamingKeyRef = useRef('')
  useEffect(() => {
    const key = `${streamingContentMessage?.reasoning || ''}:${streamingContentMessage?.content || ''}:${activeDraftAssistant?.steps?.length || 0}:${activeDraftAssistant?.toolCalls?.length || 0}`
    if (key !== lastStreamingKeyRef.current) {
      lastStreamingKeyRef.current = key
      virtualizer.measure()
    }
  }, [virtualizer, streamingContentMessage, activeDraftAssistant?.steps, activeDraftAssistant?.toolCalls])

  // ── Force full re-measure when itemCount changes (new message sent/received) ──
  const prevItemCountRef = useRef(itemCount)
  useEffect(() => {
    if (itemCount !== prevItemCountRef.current) {
      prevItemCountRef.current = itemCount
      // Clear stale measurements — item indices may have shifted
      measuredHeightsRef.current.clear()
      virtualizer.measure()
    }
  }, [itemCount, virtualizer])

  // ── Auto-scroll to bottom during streaming ──
  const isStreamingActive = isProcessing && (
    streamingState?.reasoning || streamingState?.content ||
    activeDraftAssistant?.steps?.length || activeDraftAssistant?.toolCalls?.length
  )

  useEffect(() => {
    if (!isStreamingActive) return
    // Only auto-scroll if user hasn't scrolled up
    const scrollEl = scrollContainerRef.current
    if (!scrollEl) return
    const threshold = 120
    const atBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < threshold
    if (atBottom && itemCount > 0) {
      virtualizer.scrollToIndex(itemCount - 1, { align: 'end' })
    }
  }, [isStreamingActive, virtualizer, itemCount, scrollContainerRef])

  // ── Render a single turn at the given virtual index ──
  const renderItem = (index: number) => {
    // Draft assistant item
    if (index === turns.length && shouldRenderDraftAssistant) {
      return (
        <AssistantTurnBubble
          key="draft-assistant"
          turn={{ type: 'assistant', messages: [], timestamp: Date.now(), totalUsage: null }}
          toolResults={toolResults}
          showAvatar={!draftHasCompressionOnly}
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
      )
    }

    const turn = turns[index]
    if (!turn) return null
    const isLast = isProcessing && index === turns.length - 1
    const runtime = getRuntimeProps(
      isLast, isWaitingForModel, activeDraftAssistant, activeStreamingState,
      streamingState, streamingContentMessage, status,
    )

    if (turn.type === 'user') {
      return (
        <MessageBubble
          key={turn.message.id}
          message={turn.message}
          onDeleteAgentLoop={onDeleteAgentLoop}
          onEditAndResend={onEditAndResend}
          onRegenerate={onRegenerate}
          onCancel={onCancel}
          disableDeleteActions={isProcessing}
          isProcessing={isProcessing}
          mentionAgents={mentionAgents}
          onSearchFiles={onSearchFiles}
        />
      )
    }

    return (
      <AssistantTurnBubble
        key={turn.messages[0].id}
        turn={turn}
        toolResults={toolResults}
        isProcessing={isProcessing}
        isWaiting={runtime.isWaiting}
        streamingState={runtime.streamingState}
        streamingContent={runtime.streamingContent}
        currentToolCall={runtime.currentToolCall}
        streamingToolArgs={runtime.streamingToolArgs}
        streamingToolArgsByCallId={runtime.streamingToolArgsByCallId}
        runtimeToolCalls={runtime.runtimeToolCalls}
        runtimeSteps={runtime.runtimeSteps}
        conversationId={conversationId}
        workflowProgress={
          activeWorkflowExecution && index === anchorIndex ? (
            <WorkflowExecutionProgress execution={activeWorkflowExecution} onStop={onCancel} />
          ) : undefined
        }
      />
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div className="min-h-0 px-4 py-4">
      <div
        className="mx-auto w-full max-w-3xl relative"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: virtualItem.start,
              left: 0,
              width: '100%',
              paddingBottom: TURN_GAP,
            }}
          >
            {renderItem(virtualItem.index)}
          </div>
        ))}
      </div>

      {/* Fallback workflow progress when no draft assistant */}
      {activeWorkflowExecution && anchorIndex === -1 && !shouldRenderDraftAssistant && (
        <div className="mx-auto w-full max-w-3xl">
          <WorkflowExecutionProgress execution={activeWorkflowExecution} onStop={onCancel} />
        </div>
      )}

      {/* Sentinel for scroll-to-bottom — placed outside virtualizer so it's always in DOM */}
      <div ref={messagesEndRef} />
    </div>
  )
}))
