/**
 * useActiveConversation — selects the active conversation from store
 * with a single find, then derives all per-conversation fields.
 */

import { useConversationStore } from '@/store/conversation.store'
import type { Message, ToolCall, WorkflowExecutionState } from '@/agent/message-types'

const EMPTY_MESSAGES: Message[] = []

export interface ActiveConversationSlice {
  convId: string | null
  messages: Message[]
  status: 'idle' | 'pending' | 'tool_calling' | 'streaming' | 'error'
  draftAssistant: {
    reasoning: string
    content: string
    toolCalls: ToolCall[]
    toolResults: Record<string, string>
    toolCall: ToolCall | null
    toolArgs: string
    steps: { type: string }[]
    activeReasoningStepId?: string | null
    activeContentStepId?: string | null
    activeToolStepId?: string | null
    activeCompressionStepId?: string | null
  } | null
  streamingState: {
    streamingContent: string
    streamingReasoning: string
    isReasoningStreaming: boolean
    isContentStreaming: boolean
    currentToolCall: ToolCall | null
    activeToolCalls: ToolCall[]
    streamingToolArgs: string
    streamingToolArgsByCallId: Record<string, string>
  } | null
  workflowExecution: WorkflowExecutionState | null
  error: string | null
  contextWindowUsage: {
    usagePercent: number
    usedTokens: number
    maxTokens: number
    reserveTokens: number
    modelMaxTokens?: number
  } | null
}

/**
 * Single selector that reads the active conversation once per render,
 * then returns all derived fields. Consumers use finer-grained
 * sub-selectors if they want to avoid re-renders on unrelated changes.
 */
export function useActiveConversation(): ActiveConversationSlice {
  return useConversationStore((s) => {
    if (!s.activeConversationId) {
      return {
        convId: null,
        messages: EMPTY_MESSAGES,
        status: 'idle' as const,
        draftAssistant: null,
        streamingState: null,
        workflowExecution: null,
        error: null,
        contextWindowUsage: null,
      }
    }

    const conv = s.conversations.find((c) => c.id === s.activeConversationId)
    if (!conv) {
      return {
        convId: null,
        messages: EMPTY_MESSAGES,
        status: 'idle' as const,
        draftAssistant: null,
        streamingState: null,
        workflowExecution: null,
        error: null,
        contextWindowUsage: null,
      }
    }

    return {
      convId: conv.id,
      messages: conv.messages || EMPTY_MESSAGES,
      status: conv.status,
      draftAssistant: conv.draftAssistant || null,
      streamingState: {
        streamingContent: conv.streamingContent,
        streamingReasoning: conv.streamingReasoning,
        isReasoningStreaming: conv.isReasoningStreaming,
        isContentStreaming: conv.isContentStreaming,
        currentToolCall: conv.currentToolCall,
        activeToolCalls: conv.activeToolCalls || [],
        streamingToolArgs: conv.streamingToolArgs,
        streamingToolArgsByCallId: conv.streamingToolArgsByCallId || {},
      },
      workflowExecution: conv.workflowExecution || null,
      error: conv.status === 'error' ? conv.error?.trim() || null : null,
      contextWindowUsage: conv.contextWindowUsage || conv.lastContextWindowUsage || null,
    }
  })
}
