/**
 * Conversation Runtime Store
 *
 * Stores per-conversation runtime state that changes at high frequency
 * during agent execution (streaming content, tool calls, draft assistant, etc.).
 *
 * This store is intentionally separated from the main conversation store
 * so that streaming updates (~60fps during agent runs) do NOT trigger
 * re-renders in components that only need persisted data
 * (conversation list, titles, message history).
 *
 * All state is ephemeral (lost on page reload) and keyed by conversationId.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import type {
  ConversationStatus,
  ToolCall,
  DraftAssistantStep,
  ContextWindowUsage,
} from '@/agent/message-types'
import type { AssetMeta } from '@/types/asset'

// Enable Immer Map/Set support
enableMapSet()

// ─── Types ────────────────────────────────────────────────────────────────

/** Per-conversation runtime state (ephemeral, not persisted) */
export interface ConversationRuntime {
  /** Agent lifecycle status */
  status: ConversationStatus
  /** Streaming content being received */
  streamingContent: string
  /** Streaming reasoning content */
  streamingReasoning: string
  /** Whether reasoning is actively streaming */
  isReasoningStreaming: boolean
  /** Whether content is actively streaming */
  isContentStreaming: boolean
  /** Complete reasoning content */
  completedReasoning: string | null
  /** Complete content */
  completedContent: string | null
  /** Currently executing tool call */
  currentToolCall: ToolCall | null
  /** All currently executing tool calls */
  activeToolCalls: ToolCall[]
  /** Streaming tool call arguments */
  streamingToolArgs: string
  /** Streaming args keyed by tool call id */
  streamingToolArgsByCallId: Record<string, string>
  /** Error message */
  error: string | null
  /** Active run id for guarding stale callbacks */
  activeRunId: string | null
  /** Monotonic run counter for this conversation */
  runEpoch: number
  /** Streaming draft projection rendered in UI */
  draftAssistant: {
    reasoning: string
    content: string
    toolCalls: ToolCall[]
    toolResults: Record<string, string>
    toolCall: ToolCall | null
    toolArgs: string
    steps: DraftAssistantStep[]
    activeReasoningStepId?: string | null
    activeContentStepId?: string | null
    activeToolStepId?: string | null
    activeCompressionStepId?: string | null
  } | null
  /** Runtime context window usage for the active model call */
  contextWindowUsage: ContextWindowUsage | null
  /** Runtime workflow execution progress */
  workflowExecution: import('@/agent/message-types').WorkflowExecutionState | null
  /** Assets collected during current agent run */
  collectedAssets: AssetMeta[]
  /** Runtime convert call counter for context compression cadence */
  compressionConvertCallCount: number
  /** Runtime marker for last summary convert call */
  compressionLastSummaryConvertCall: number
}

/** Creates a fresh runtime state for a conversation */
export function createEmptyRuntime(): ConversationRuntime {
  return {
    status: 'idle',
    streamingContent: '',
    streamingReasoning: '',
    isReasoningStreaming: false,
    isContentStreaming: false,
    completedReasoning: null,
    completedContent: null,
    currentToolCall: null,
    activeToolCalls: [],
    streamingToolArgs: '',
    streamingToolArgsByCallId: {},
    error: null,
    activeRunId: null,
    runEpoch: 0,
    draftAssistant: null,
    contextWindowUsage: null,
    workflowExecution: null,
    collectedAssets: [],
    compressionConvertCallCount: 0,
    compressionLastSummaryConvertCall: Number.NEGATIVE_INFINITY,
  }
}

export interface ConversationRuntimeState {
  // ─── Per-conversation runtime state ───
  runtimes: Map<string, ConversationRuntime>

  // ─── AgentLoop instances (not persisted) ───
  agentLoops: Map<string, import('@/agent/agent-loop').AgentLoop>

  // ─── Streaming queues for RAF-batched updates (not persisted) ───
  streamingQueues: Map<string, {
    reasoning: import('../utils/streaming-queue').StreamingQueue
    content: import('../utils/streaming-queue').StreamingQueue
  }>

  // ─── Follow-up suggestions (not persisted) ───
  suggestedFollowUps: Map<string, string>

  // ─── Track run IDs that were cancelled by user (not persisted) ───
  cancelledRunIds: Set<string>

  // ─── Track mounted view ref counts per conversation (not persisted) ───
  mountedConversations: Map<string, number>

  // ─── Pending workflow requests (not persisted) ───
  pendingWorkflowDryRuns: Map<string, {
    templateId: string
    rubricDsl?: string
  }>
  pendingWorkflowRealRuns: Map<string, {
    templateId: string
    rubricDsl?: string
  }>
  workflowAbortControllers: Map<string, AbortController>

  // ─── Computed helpers ───
  getRuntime: (convId: string) => ConversationRuntime | undefined
  getConversationStatus: (convId: string) => ConversationStatus
  isConversationRunning: (convId: string) => boolean
  getRunningConversations: () => string[]

  // ─── Runtime state mutations ───
  setConversationStatus: (convId: string, status: ConversationStatus) => void
  setConversationError: (convId: string, error: string | null) => void
  resetConversationState: (convId: string) => void
  collectAssets: (convId: string, assets: AssetMeta[]) => void

  // ─── Follow-up suggestion actions ───
  setSuggestedFollowUp: (convId: string, suggestion: string) => void
  clearSuggestedFollowUp: (convId: string) => void
  getSuggestedFollowUp: (convId: string) => string

  // ─── Mount tracking ───
  mountConversation: (convId: string) => void
  unmountConversation: (convId: string) => void
  isConversationMounted: (convId: string) => boolean
}

export const useConversationRuntimeStore = create<ConversationRuntimeState>()(
  immer((set, get) => ({
    runtimes: new Map(),
    agentLoops: new Map(),
    streamingQueues: new Map(),
    suggestedFollowUps: new Map(),
    cancelledRunIds: new Set(),
    mountedConversations: new Map(),
    pendingWorkflowDryRuns: new Map(),
    pendingWorkflowRealRuns: new Map(),
    workflowAbortControllers: new Map(),

    // ─── Computed helpers ───

    getRuntime: (convId: string) => {
      return get().runtimes.get(convId)
    },

    getConversationStatus: (convId: string) => {
      return get().runtimes.get(convId)?.status || 'idle'
    },

    isConversationRunning: (convId: string) => {
      const rt = get().runtimes.get(convId)
      if (!rt) return false
      return rt.status !== 'idle' && rt.status !== 'error'
    },

    getRunningConversations: () => {
      const { runtimes } = get()
      const result: string[] = []
      runtimes.forEach((rt, convId) => {
        if (rt.status !== 'idle' && rt.status !== 'error') {
          result.push(convId)
        }
      })
      return result
    },

    // ─── Runtime state mutations ───

    setConversationStatus: (convId: string, status: ConversationStatus) => {
      set((state) => {
        let rt = state.runtimes.get(convId)
        if (!rt) {
          rt = createEmptyRuntime()
          state.runtimes.set(convId, rt)
        }
        rt.status = status
      })
    },

    setConversationError: (convId: string, error: string | null) => {
      set((state) => {
        let rt = state.runtimes.get(convId)
        if (!rt) {
          rt = createEmptyRuntime()
          state.runtimes.set(convId, rt)
        }
        rt.error = error
        rt.status = error ? 'error' : 'idle'
      })
    },

    resetConversationState: (convId: string) => {
      // Clear any pending ask_user_question entries
      import('@/store/pending-question.store')
        .then(({ clearPendingQuestions }) => {
          clearPendingQuestions(convId)
        })
        .catch(() => {})

      set((state) => {
        const workflowAbortController = state.workflowAbortControllers.get(convId)
        if (workflowAbortController) {
          workflowAbortController.abort()
          state.workflowAbortControllers.delete(convId)
        }
        state.pendingWorkflowDryRuns.delete(convId)
        state.pendingWorkflowRealRuns.delete(convId)

        const rt = state.runtimes.get(convId)
        if (rt) {
          // Reset all runtime fields to initial state
          rt.status = 'idle'
          rt.streamingContent = ''
          rt.streamingReasoning = ''
          rt.isReasoningStreaming = false
          rt.completedReasoning = null
          rt.isContentStreaming = false
          rt.completedContent = null
          rt.currentToolCall = null
          rt.activeToolCalls = []
          rt.streamingToolArgs = ''
          rt.streamingToolArgsByCallId = {}
          rt.error = null
          rt.activeRunId = null
          rt.draftAssistant = null
          rt.contextWindowUsage = null
          rt.workflowExecution = null
        }
      })
    },

    collectAssets: (convId: string, assets: AssetMeta[]) => {
      set((state) => {
        let rt = state.runtimes.get(convId)
        if (!rt) {
          rt = createEmptyRuntime()
          state.runtimes.set(convId, rt)
        }
        rt.collectedAssets.push(...assets)
      })
    },

    // ─── Follow-up suggestion actions ───

    setSuggestedFollowUp: (convId: string, suggestion: string) => {
      set((state) => {
        state.suggestedFollowUps.set(convId, suggestion)
      })
    },

    clearSuggestedFollowUp: (convId: string) => {
      set((state) => {
        state.suggestedFollowUps.delete(convId)
      })
    },

    getSuggestedFollowUp: (convId: string) => {
      return get().suggestedFollowUps.get(convId) || ''
    },

    // ─── Mount tracking ───

    mountConversation: (convId: string) => {
      set((state) => {
        const count = state.mountedConversations.get(convId) || 0
        state.mountedConversations.set(convId, count + 1)
      })
    },

    unmountConversation: (convId: string) => {
      set((state) => {
        const count = state.mountedConversations.get(convId) || 0
        if (count <= 1) {
          state.mountedConversations.delete(convId)
        } else {
          state.mountedConversations.set(convId, count - 1)
        }
      })
    },

    isConversationMounted: (convId: string) => {
      return (get().mountedConversations.get(convId) || 0) > 0
    },
  }))
)
