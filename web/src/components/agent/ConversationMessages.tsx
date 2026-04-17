/**
 * ConversationMessages — renders the list of message turns,
 * draft assistant bubble, and workflow progress panels.
 */

import { Fragment, useMemo } from 'react'
import { MessageBubble } from './MessageBubble'
import { AssistantTurnBubble } from './AssistantTurnBubble'
import { WorkflowExecutionProgress } from './WorkflowExecutionProgress'
import { groupMessagesIntoTurns } from './group-messages'
import { useWorkflowProgressAnchor } from './useWorkflowProgressAnchor'
import type { Message, ToolCall, WorkflowExecutionState } from '@/agent/message-types'

type ConversationMessagesProps = {
  activeMessages: Message[]
  toolResults: Map<string, string>
  isProcessing: boolean
  isWaitingForModel: boolean
  streamingState: { reasoning: boolean; content: boolean } | undefined
  streamingContentMessage: { reasoning: string; content: string } | undefined
  activeDraftAssistant: {
    toolCalls: ToolCall[]
    steps: { type: string }[]
    toolResults: Record<string, string>
    reasoning: string
    content: string
  } | null
  activeStreamingState: {
    currentToolCall: ToolCall | null
    streamingToolArgs: string
    streamingToolArgsByCallId: Record<string, string>
    activeToolCalls: ToolCall[]
  } | null
  activeWorkflowExecution: WorkflowExecutionState | null
  status: string
  onDeleteAgentLoop: (messageId: string) => void
  onEditAndResend: (userMessageId: string, newContent: string) => void
  onRegenerate: ((userMessageId: string) => void) | undefined
  onCancel: () => void
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}

/** Build runtime props for an AssistantTurnBubble. Returns undefined values when not active. */
function getRuntimeProps(
  active: boolean,
  isWaiting: boolean,
  draftAssistant: ConversationMessagesProps['activeDraftAssistant'],
  streamingState: ConversationMessagesProps['activeStreamingState'],
  streamingStateDerived: ConversationMessagesProps['streamingState'],
  streamingContent: ConversationMessagesProps['streamingContentMessage'],
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

export function ConversationMessages({
  activeMessages,
  toolResults,
  isProcessing,
  isWaitingForModel,
  streamingState,
  streamingContentMessage,
  activeDraftAssistant,
  activeStreamingState,
  activeWorkflowExecution,
  status,
  onDeleteAgentLoop,
  onEditAndResend,
  onRegenerate,
  onCancel,
  messagesEndRef,
}: ConversationMessagesProps) {
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

  return (
    <div className="min-h-0 px-4 py-4">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        {turns.map((turn, idx) => {
          const isLast = isProcessing && idx === turns.length - 1
          const runtime = getRuntimeProps(
            isLast, isWaitingForModel, activeDraftAssistant, activeStreamingState,
            streamingState, streamingContentMessage, status,
          )

          return turn.type === 'user' ? (
            <MessageBubble
              key={turn.message.id}
              message={turn.message}
              onDeleteAgentLoop={onDeleteAgentLoop}
              onEditAndResend={onEditAndResend}
              onRegenerate={onRegenerate}
              onCancel={onCancel}
              disableDeleteActions={isProcessing}
              isProcessing={isProcessing}
            />
          ) : (
            <Fragment key={turn.messages[0].id}>
              <AssistantTurnBubble
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
              showAvatar={!draftHasCompressionOnly}
              isProcessing={true}
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

        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
