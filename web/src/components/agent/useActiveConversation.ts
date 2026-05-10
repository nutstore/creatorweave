/**
 * useActiveConversation — selects the active conversation's persisted data.
 *
 * IMPORTANT: This hook does NOT subscribe to streaming/high-frequency data
 * (draftAssistant, streamingContent, etc.). That data is subscribed directly
 * inside ConversationMessages to prevent parent components from re-rendering
 * on every streaming token (~60fps).
 *
 * Only low-frequency data is exposed: messages, status, error, workflow execution.
 */

import { useConversationStore } from '@/store/conversation.store'
import { useConversationRuntimeStore } from '@/store/conversation-runtime.store'
import { useShallow } from 'zustand/react/shallow'
import type { Message, WorkflowExecutionState } from '@/agent/message-types'

const EMPTY_MESSAGES: Message[] = []

const NULL_SLICE: ActiveConversationSlice = {
  convId: null,
  messages: EMPTY_MESSAGES,
  status: 'idle' as const,
  workflowExecution: null,
  error: null,
  contextWindowUsage: null,
}

export interface ActiveConversationSlice {
  convId: string | null
  messages: Message[]
  status: 'idle' | 'pending' | 'tool_calling' | 'streaming' | 'error'
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
 * Reads persisted data (messages, lastContextWindowUsage) from the main store
 * and low-frequency runtime data (status, error, workflow, contextWindowUsage)
 * from the runtime store.
 *
 * Streaming data (draftAssistant, streamingContent, etc.) is intentionally
 * excluded — it is subscribed directly in ConversationMessages.
 */
export function useActiveConversation(): ActiveConversationSlice {
  // Persisted data from main store
  const convSlice = useConversationStore(
    useShallow((s) => {
      if (!s.activeConversationId) return null
      const conv = s.conversations.find((c) => c.id === s.activeConversationId)
      if (!conv) return null
      return {
        id: conv.id,
        messages: conv.messages || EMPTY_MESSAGES,
        lastContextWindowUsage: conv.lastContextWindowUsage || null,
      }
    }),
  )

  // Low-frequency runtime data from runtime store.
  // Only select fields that change at low rates (status transitions, error events),
  // NOT per-token streaming fields.
  const rtSlice = useConversationRuntimeStore(
    useShallow((s) => {
      if (!convSlice) return null
      const rt = s.runtimes.get(convSlice.id)
      if (!rt) return null
      return {
        status: rt.status,
        error: rt.error,
        workflowExecution: rt.workflowExecution,
        contextWindowUsage: rt.contextWindowUsage,
      }
    }),
  )

  if (!convSlice) return NULL_SLICE
  const rt = rtSlice

  return {
    convId: convSlice.id,
    messages: convSlice.messages,
    status: rt?.status || 'idle',
    workflowExecution: rt?.workflowExecution || null,
    error: rt?.status === 'error' ? rt.error?.trim() || null : null,
    contextWindowUsage: rt?.contextWindowUsage || convSlice.lastContextWindowUsage || null,
  }
}
