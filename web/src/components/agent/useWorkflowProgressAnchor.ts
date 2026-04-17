/**
 * useWorkflowProgressAnchor — computes which assistant turn index
 * the WorkflowExecutionProgress panel should be anchored to.
 */

import { useMemo } from 'react'
import { groupMessagesIntoTurns } from './group-messages'
import type { Message, ToolCall, WorkflowExecutionState } from '@/agent/message-types'

type Turn = ReturnType<typeof groupMessagesIntoTurns>[number]

type AssistantTurn = Extract<Turn, { type: 'assistant' }>

interface UseWorkflowProgressAnchorParams {
  activeWorkflowExecution: WorkflowExecutionState | null
  activeDraftAssistant: { toolCalls: ToolCall[] } | null
  activeStreamingState: { currentToolCall: ToolCall | null } | null
  activeMessages: Message[]
  isProcessing: boolean
  turns: Turn[]
}

export function useWorkflowProgressAnchor({
  activeWorkflowExecution,
  activeDraftAssistant,
  activeStreamingState,
  activeMessages,
  isProcessing,
  turns,
}: UseWorkflowProgressAnchorParams): number {
  return useMemo(() => {
    if (!activeWorkflowExecution) return -1

    // When not processing, keep panel near the tail
    if (!isProcessing) {
      const last = turns[turns.length - 1]
      return last?.type === 'assistant' ? turns.length - 1 : -1
    }

    // Build assistant message → turn index map
    const assistantTurnIndexByMessageId = new Map<string, number>()
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i]
      if (turn?.type !== 'assistant') continue
      for (const message of turn.messages) {
        assistantTurnIndexByMessageId.set(message.id, i)
      }
    }

    const hasRunWorkflowToolCall = (turn: AssistantTurn) =>
      turn.messages.some((message) =>
        (message.toolCalls || []).some((tc) => tc.function.name === 'run_workflow')
      )

    const runtimeHasRunWorkflow =
      (activeDraftAssistant?.toolCalls || []).some(
        (tc) => tc.function.name === 'run_workflow'
      ) || activeStreamingState?.currentToolCall?.function.name === 'run_workflow'

    // Runtime workflow detected — anchor to latest assistant turn
    if (runtimeHasRunWorkflow) {
      const last = turns[turns.length - 1]
      if (!last || last.type !== 'assistant') return -1
      return turns.length - 1
    }

    // Find last run_workflow tool result message
    const rawMessages = activeMessages
    let lastWorkflowToolMessageIndex = -1
    for (let i = rawMessages.length - 1; i >= 0; i -= 1) {
      const message = rawMessages[i]
      if (message.role === 'tool' && message.name === 'run_workflow') {
        lastWorkflowToolMessageIndex = i
        break
      }
    }

    // Try to find the assistant message associated with the tool result
    if (lastWorkflowToolMessageIndex >= 0) {
      let anchorAssistantMessageId: string | null = null

      // Prefer assistant message right after tool result
      for (let i = lastWorkflowToolMessageIndex + 1; i < rawMessages.length; i += 1) {
        const message = rawMessages[i]
        if (message.role === 'user') break
        if (message.role === 'assistant') {
          anchorAssistantMessageId = message.id
          break
        }
      }

      // Fallback to assistant message before tool result
      if (!anchorAssistantMessageId) {
        for (let i = lastWorkflowToolMessageIndex - 1; i >= 0; i -= 1) {
          const message = rawMessages[i]
          if (message.role === 'user') break
          if (message.role === 'assistant') {
            anchorAssistantMessageId = message.id
            break
          }
        }
      }

      if (anchorAssistantMessageId) {
        const anchoredTurnIndex = assistantTurnIndexByMessageId.get(anchorAssistantMessageId)
        if (typeof anchoredTurnIndex === 'number') return anchoredTurnIndex
      }
    }

    // Fallback: find last assistant turn with run_workflow tool call
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const turn = turns[i]
      if (turn?.type === 'assistant' && hasRunWorkflowToolCall(turn)) return i
    }

    // Final fallback: any assistant turn
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      if (turns[i]?.type === 'assistant') return i
    }

    return -1
  }, [activeWorkflowExecution, activeDraftAssistant, activeStreamingState, activeMessages, isProcessing, turns])
}
