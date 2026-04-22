/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Conversation Store
 *
 * Manages chat history with per-conversation AgentLoop instances.
 * Uses SQLite for persistence.
 *
 * Runtime state (status, streaming content, etc.) is stored per-conversation
 * and not persisted to SQLite.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import { toast } from 'sonner'
import type {
  Conversation,
  Message,
  ToolCall,
  ConversationStatus,
  DraftAssistantStep,
} from '@/agent/message-types'
import {
  createAssistantMessage,
  createConversation,
  createToolMessage,
} from '@/agent/message-types'
import { parseThinkTags } from '@/agent/think-tags'
import { extractFirstMentionedAgentId } from '@/agent/agent-mention'
import {
  emitThinkingStart,
  emitThinkingDelta,
  emitCompressionEvent,
  emitToolStart,
  emitComplete,
  emitError,
} from '@/streaming-bus'
import { useConversationContextStore } from './conversation-context.store'
import { getElicitationHandler } from '@/mcp/elicitation-handler.tsx'

/**
 * Commit completed draft assistant content + tool calls into conversation messages.
 * Used both when starting a new assistant message (onMessageStart) and when cancelling.
 */
function commitDraftToMessages(conv: {
  messages: Message[]
  draftAssistant?: {
    reasoning: string
    content: string
    toolCalls: ToolCall[]
    toolResults: Record<string, string>
    toolCall: ToolCall | null
    toolArgs: string
    steps: import('@/agent/message-types').DraftAssistantStep[]
    activeReasoningStepId?: string | null
    activeContentStepId?: string | null
    activeToolStepId?: string | null
    activeCompressionStepId?: string | null
  } | null
}): boolean {
  const draft = conv.draftAssistant
  if (!draft) return false

  const completedToolCalls = draft.toolCalls.filter((tc) =>
    Object.prototype.hasOwnProperty.call(draft.toolResults, tc.id)
  )
  const hasContent = draft.reasoning.trim() || draft.content.trim() || completedToolCalls.length > 0

  if (!hasContent) return false

  conv.messages.push(
    createAssistantMessage(
      draft.content || null,
      completedToolCalls.length > 0 ? completedToolCalls : undefined,
      undefined,
      draft.reasoning || null
    )
  )
  for (const tc of completedToolCalls) {
    conv.messages.push(
      createToolMessage({
        toolCallId: tc.id,
        name: tc.function.name,
        content: draft.toolResults[tc.id] || '',
      })
    )
  }
  return true
}

type DraftAssistantState = NonNullable<Conversation['draftAssistant']>

type DraftAssistantEvent =
  | { type: 'message_start' }
  | { type: 'reasoning_start' }
  | { type: 'reasoning_stream_sync'; reasoning: string }
  | { type: 'reasoning_complete'; reasoning: string }
  | { type: 'content_start' }
  | { type: 'content_stream_sync'; content: string }
  | { type: 'content_complete'; content: string }
  | { type: 'tool_start'; toolCall: ToolCall }
  | {
      type: 'tool_delta'
      argsDelta: string
      toolCallId?: string
      isCurrentToolDelta: boolean
    }
  | {
      type: 'tool_complete'
      toolCall: ToolCall
      result: string
      isCurrentTool: boolean
      nextToolCall: ToolCall | null
      streamedArgsByCallId: Record<string, string>
    }
  | { type: 'compression_start' }
  | { type: 'compression_complete'; mode: 'skip' | 'compress' }
  | {
      type: 'subagent_progress'
      agentId: string
      status: string
      summary: string
      timestamp: number
    }

function createDraftStepId(prefix: 'reasoning' | 'content' | 'compression'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function findDraftStep(draft: DraftAssistantState, stepId: string): DraftAssistantStep | undefined {
  return draft.steps.find((s) => s.id === stepId)
}

function ensureDraftTextStep(
  draft: DraftAssistantState,
  stepType: 'reasoning' | 'content'
): string {
  const last = draft.steps[draft.steps.length - 1]
  if (last && last.type === stepType) {
    last.streaming = true
    if (!last.timestamp) {
      last.timestamp = Date.now()
    }
    return last.id
  }
  const now = Date.now()
  const stepId = createDraftStepId(stepType)
  draft.steps.push({
    id: stepId,
    timestamp: now,
    type: stepType,
    content: '',
    streaming: true,
  })
  return stepId
}

/**
 * For providers that inline reasoning in `<think>...</think>` inside content stream,
 * ensure we still have a dedicated reasoning step so streaming UI can render it.
 * The step is inserted before active content step to preserve logical order.
 */
function ensureImplicitReasoningStepForContentStream(draft: DraftAssistantState): string {
  if (draft.activeReasoningStepId) {
    const existing = findDraftStep(draft, draft.activeReasoningStepId)
    if (existing && existing.type === 'reasoning') {
      existing.streaming = true
      return existing.id
    }
  }

  const now = Date.now()
  const stepId = createDraftStepId('reasoning')
  const step: DraftAssistantStep = {
    id: stepId,
    timestamp: now,
    type: 'reasoning',
    content: '',
    streaming: true,
  }
  const activeContentIndex = draft.activeContentStepId
    ? draft.steps.findIndex((s) => s.id === draft.activeContentStepId)
    : -1
  if (activeContentIndex >= 0) {
    draft.steps.splice(activeContentIndex, 0, step)
  } else {
    draft.steps.push(step)
  }
  draft.activeReasoningStepId = stepId
  return stepId
}

function syncDraftTextStepContent(
  draft: DraftAssistantState,
  stepId: string | null | undefined,
  content: string,
  streaming: boolean
): void {
  if (!stepId) return
  const step = findDraftStep(draft, stepId)
  if (!step) return
  if (step.type !== 'reasoning' && step.type !== 'content') return
  step.content = content
  step.streaming = streaming
}

function hasExplicitReasoningStep(draft: DraftAssistantState): boolean {
  return draft.steps.some((step) => step.type === 'reasoning')
}

function ensureDraftAssistantForMessageStart(conv: Conversation): DraftAssistantState {
  const previous = conv.draftAssistant
  const next: DraftAssistantState = {
    reasoning: '',
    content: '',
    toolCalls: [],
    toolResults: {},
    toolCall: null,
    toolArgs: '',
    // Keep streaming timeline across assistant restarts in one run,
    // but discard completed text/tool steps (they have already been
    // committed to messages and would otherwise cause duplicate renders
    // when committedContentSet hasn't caught up yet).
    steps: previous?.steps.filter((s) => {
      if (s.streaming) return true
      // Completed text steps (content/reasoning) are already committed
      if (s.type === 'content' || s.type === 'reasoning') return false
      // Completed tool_call steps are also committed
      if (s.type === 'tool_call') return false
      // Keep compression steps for status continuity
      return true
    }) || [],
    activeReasoningStepId: null,
    activeContentStepId: null,
    activeToolStepId: null,
    activeCompressionStepId: previous?.activeCompressionStepId || null,
  }
  conv.draftAssistant = next
  return next
}

function applyDraftAssistantEvent(conv: Conversation, event: DraftAssistantEvent): void {
  if (event.type === 'message_start') {
    ensureDraftAssistantForMessageStart(conv)
    return
  }

  const draft = conv.draftAssistant
  if (!draft) return

  switch (event.type) {
    case 'reasoning_start': {
      draft.activeReasoningStepId = ensureDraftTextStep(draft, 'reasoning')
      return
    }
    case 'reasoning_stream_sync': {
      draft.reasoning = event.reasoning
      syncDraftTextStepContent(draft, draft.activeReasoningStepId, event.reasoning, true)
      return
    }
    case 'reasoning_complete': {
      draft.reasoning = event.reasoning
      syncDraftTextStepContent(draft, draft.activeReasoningStepId, event.reasoning, false)
      draft.activeReasoningStepId = null
      return
    }
    case 'content_start': {
      draft.activeContentStepId = ensureDraftTextStep(draft, 'content')
      return
    }
    case 'content_stream_sync': {
      const parsedThink = parseThinkTags(event.content)
      draft.content = parsedThink.hasThinkTag ? parsedThink.content : event.content
      if (
        parsedThink.reasoning &&
        (!hasExplicitReasoningStep(draft) || !!draft.activeReasoningStepId)
      ) {
        draft.reasoning = parsedThink.reasoning
        const reasoningStepId = ensureImplicitReasoningStepForContentStream(draft)
        syncDraftTextStepContent(draft, reasoningStepId, parsedThink.reasoning, true)
      }
      syncDraftTextStepContent(draft, draft.activeContentStepId, draft.content, true)
      return
    }
    case 'content_complete': {
      const parsedThink = parseThinkTags(event.content)
      draft.content = parsedThink.hasThinkTag ? parsedThink.content : event.content
      if (
        parsedThink.reasoning &&
        (!hasExplicitReasoningStep(draft) || !!draft.activeReasoningStepId)
      ) {
        draft.reasoning = parsedThink.reasoning
        const reasoningStepId = ensureImplicitReasoningStepForContentStream(draft)
        syncDraftTextStepContent(draft, reasoningStepId, parsedThink.reasoning, false)
        draft.activeReasoningStepId = null
      }
      syncDraftTextStepContent(draft, draft.activeContentStepId, draft.content, false)
      draft.activeContentStepId = null
      return
    }
    case 'tool_start': {
      const stepId = `tool-${event.toolCall.id}`
      const now = Date.now()
      draft.toolCall = event.toolCall
      if (!draft.toolCalls.some((x) => x.id === event.toolCall.id)) {
        draft.toolCalls.push(event.toolCall)
      }
      const existing = findDraftStep(draft, stepId)
      if (existing && existing.type === 'tool_call') {
        existing.streaming = true
        existing.toolCall = event.toolCall
        if (!existing.timestamp) {
          existing.timestamp = now
        }
      } else {
        draft.steps.push({
          id: stepId,
          timestamp: now,
          type: 'tool_call',
          toolCall: event.toolCall,
          args: '',
          streaming: true,
        })
      }
      draft.activeToolStepId = stepId
      return
    }
    case 'tool_delta': {
      if (event.isCurrentToolDelta) {
        draft.toolArgs += event.argsDelta
      }
      const stepId = event.toolCallId ? `tool-${event.toolCallId}` : draft.activeToolStepId
      if (!stepId) return
      const step = findDraftStep(draft, stepId)
      if (step && step.type === 'tool_call') {
        step.args += event.argsDelta
      }
      return
    }
    case 'tool_complete': {
      const completedStepId = `tool-${event.toolCall.id}`
      draft.toolResults[event.toolCall.id] = event.result || ''
      const streamedArgs = event.streamedArgsByCallId[event.toolCall.id] || ''
      if (streamedArgs && draft.toolCalls) {
        const toolCallIndex = draft.toolCalls.findIndex((t) => t.id === event.toolCall.id)
        if (toolCallIndex !== -1) {
          draft.toolCalls[toolCallIndex] = {
            ...draft.toolCalls[toolCallIndex],
            function: {
              ...draft.toolCalls[toolCallIndex].function,
              arguments: streamedArgs,
            },
          }
        }
      }
      const completedStep = findDraftStep(draft, completedStepId)
      if (completedStep && completedStep.type === 'tool_call') {
        completedStep.result = event.result || ''
        completedStep.streaming = false
      }
      if (!event.isCurrentTool) return
      draft.toolCall = null
      draft.toolArgs = ''
      if (draft.activeToolStepId === completedStepId) {
        draft.activeToolStepId = null
      }
      if (event.nextToolCall) {
        draft.toolCall = event.nextToolCall
        draft.toolArgs = event.streamedArgsByCallId[event.nextToolCall.id] || ''
        draft.activeToolStepId = `tool-${event.nextToolCall.id}`
      }
      return
    }
    case 'compression_start': {
      const now = Date.now()
      const stepId = createDraftStepId('compression')
      draft.steps.push({
        id: stepId,
        timestamp: now,
        type: 'compression',
        content: '正在压缩历史上下文...',
        streaming: true,
      })
      draft.activeCompressionStepId = stepId
      return
    }
    case 'compression_complete': {
      const stepId = draft.activeCompressionStepId
      if (stepId) {
        const step = findDraftStep(draft, stepId)
        if (step && step.type === 'compression') {
          step.content =
            event.mode === 'skip' ? '上下文压缩评估完成（跳过摘要）' : '上下文已压缩并生成摘要'
          step.streaming = false
        }
      }
      draft.activeCompressionStepId = null
      return
    }
    case 'subagent_progress': {
      // Bridge subagent notification to the active tool step
      if (!draft.activeToolStepId) return
      const step = findDraftStep(draft, draft.activeToolStepId)
      if (!step || step.type !== 'tool_call') return
      const toolName = step.toolCall.function.name
      if (toolName !== 'spawn_subagent' && toolName !== 'batch_spawn') return
      if (!step.subagentEvents) step.subagentEvents = []
      step.subagentEvents.push({
        agentId: event.agentId,
        status: event.status,
        summary: event.summary,
        timestamp: event.timestamp,
      })
      return
    }
  }
}

// Default conversation name when title is not available
const DEFAULT_CONVERSATION_NAME = '对话'
import { StreamingQueue } from '../utils/streaming-queue'

// Enable Immer Map/Set support
enableMapSet()
import { AgentLoop } from '@/agent/agent-loop'
import { createToolPolicyHooks } from '@/agent/tool-policy'
import { createLLMProvider } from '@/agent/llm/provider-factory'
import { ContextManager } from '@/agent/context-manager'
import { getToolRegistry } from '@/agent/tool-registry'
import { getOrCreateSubagentRuntime } from '@/agent/subagent/runtime'
import { getApiKeyRepository } from '@/sqlite'
import { LLM_PROVIDER_CONFIGS, type LLMProviderType } from '@/agent/providers/types'
import { generateFollowUp } from '@/agent/follow-up-generator'
import {
  WORKFLOW_DRY_RUN_MODEL_PREFIX,
  type RunWorkflowTemplateDryRunResult,
  parseWorkflowTemplateIdFromModelName,
  runWorkflowTemplateDryRun,
} from '@/agent/workflow/dry-run'
import { getWorkflowTemplateBundle, listWorkflowTemplateBundles } from '@/agent/workflow/templates'
import { getConversationRepository, initSQLiteDB } from '@/sqlite'
import { useSettingsStore } from './settings.store'
import { getCurrentWorkspaceAgentMode } from './workspace-preferences.store'
import type { SubagentTaskNotification } from '@/agent/tools/tool-types'

// Follow-up suggestions are enabled by default

//=============================================================================
// Persistence Functions (SQLite)
//=============================================================================

/** Persist a conversation to SQLite */
async function persistConversation(conversation: Conversation): Promise<void> {
  const repo = getConversationRepository()
  await repo.save({
    id: conversation.id,
    title: conversation.title,
    titleMode: conversation.titleMode || 'manual',
    messages: conversation.messages,
    lastContextWindowUsage: conversation.lastContextWindowUsage || null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  })
}

/** Load all conversations from SQLite */
async function loadConversations(): Promise<Conversation[]> {
  const repo = getConversationRepository()
  const stored = await repo.findAll()
  // Add runtime state to each stored conversation
  return stored.map((conv) => ({
    ...conv,
    titleMode: conv.titleMode || 'manual',
    messages: conv.messages as Message[],
    status: 'idle' as const,
    streamingContent: '',
    streamingReasoning: '',
    isReasoningStreaming: false,
    completedReasoning: null,
    isContentStreaming: false,
    completedContent: null,
    currentToolCall: null,
    activeToolCalls: [],
    streamingToolArgs: '',
    streamingToolArgsByCallId: {},
    error: null,
    activeRunId: null,
    runEpoch: 0,
    draftAssistant: null,
    contextWindowUsage: conv.lastContextWindowUsage || null,
    lastContextWindowUsage: conv.lastContextWindowUsage || null,
    mountRefCount: 0,
    compressionConvertCallCount: 0,
    compressionLastSummaryConvertCall: Number.NEGATIVE_INFINITY,
    // Runtime state - read from workspace-preferences (workspace-level isolation)
    agentMode: getCurrentWorkspaceAgentMode(),
  }))
}

/** Delete a conversation from SQLite */
async function deleteConversationFromDB(id: string): Promise<void> {
  const repo = getConversationRepository()
  await repo.delete(id)
}

//=============================================================================
// Title Management
//=============================================================================

const MAX_TITLE_LENGTH = 30

function truncateTitle(content: string): string {
  let trimmed = content.trim()
  trimmed = trimmed.replace(/\s+/g, ' ')
  if (trimmed.length <= MAX_TITLE_LENGTH) {
    return trimmed
  }
  return trimmed.slice(0, MAX_TITLE_LENGTH - 1) + '…'
}

function updateAutoTitleAfterMessageDelete(conv: Conversation): void {
  if (conv.titleMode === 'manual') return

  const firstUserMessage = conv.messages.find((m) => m.role === 'user' && m.content)
  if (firstUserMessage?.content) {
    conv.title = truncateTitle(firstUserMessage.content)
    return
  }
  conv.title = DEFAULT_CONVERSATION_NAME
}

interface WorkflowDryRunRequest {
  templateId: string
  rubricDsl?: string
}

interface RunWorkflowToolArgs {
  workflowId: string
  mode: 'dry_run' | 'real_run'
}

function extractRunWorkflowToolArgs(argumentsJson: string | undefined): RunWorkflowToolArgs | null {
  if (!argumentsJson) return null
  try {
    const parsed = JSON.parse(argumentsJson) as Record<string, unknown>
    const workflowId = typeof parsed.workflow_id === 'string' ? parsed.workflow_id.trim() : ''
    if (!workflowId) return null
    const mode = parsed.mode === 'real_run' ? 'real_run' : 'dry_run'
    return { workflowId, mode }
  } catch {
    return null
  }
}

function extractWorkflowDryRunRequestFromSlashCommand(
  content: string | null | undefined
): WorkflowDryRunRequest | null {
  if (!content) return null

  const trimmed = content.trim()
  if (!trimmed) return null

  const lines = trimmed.split('\n')
  const commandLine = (lines[0] || '').trim()
  const match = /^\/(?:workflow|wf)(?:\s+([a-zA-Z0-9_-]+))?\s*$/i.exec(commandLine)
  if (!match) return null

  const templateId = (match[1] || '').trim() || 'novel_daily_v1'
  const rubricSource = lines.slice(1).join('\n').trim()

  if (!rubricSource) {
    return { templateId }
  }

  const fencedRubricMatch = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(rubricSource)
  if (fencedRubricMatch && fencedRubricMatch[1]?.trim()) {
    return {
      templateId,
      rubricDsl: fencedRubricMatch[1].trim(),
    }
  }

  return {
    templateId,
    rubricDsl: rubricSource,
  }
}

type DryRunSuccess = Extract<RunWorkflowTemplateDryRunResult, { ok: true }>

function buildWorkflowDryRunPayload(result: DryRunSuccess) {
  return {
    templateId: result.templateId,
    label: result.label,
    status: result.status,
    executionOrder: result.execution.executionOrder,
    executedNodeIds: result.execution.executedNodeIds,
    repairRound: result.execution.repairRound,
    errors: result.execution.errors,
  }
}

//=============================================================================
// Store Definition
//=============================================================================

interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null
  loaded: boolean

  // AgentLoop management (not persisted)
  agentLoops: Map<string, AgentLoop>

  // Streaming queues for RAF-batched updates (not persisted)
  streamingQueues: Map<string, { reasoning: StreamingQueue; content: StreamingQueue }>

  // Follow-up suggestions (not persisted) - per conversation
  suggestedFollowUps: Map<string, string>

  // Track mounted view ref counts per conversation (not persisted)
  // Used to prevent StrictMode mount/unmount churn from cancelling active runs
  mountedConversations: Map<string, number>

  // Pending workflow dry-run payloads triggered from UI action (not persisted)
  pendingWorkflowDryRuns: Map<string, WorkflowDryRunRequest>
  // Pending workflow real-run payloads triggered from UI action (not persisted)
  pendingWorkflowRealRuns: Map<string, WorkflowDryRunRequest>
  // AbortControllers for in-flight workflow real-runs (not persisted)
  workflowAbortControllers: Map<string, AbortController>

  // Computed
  activeConversation: () => Conversation | null

  // Status helpers
  getConversationStatus: (id: string) => ConversationStatus
  isConversationRunning: (id: string) => boolean
  getRunningConversations: () => string[]

  // Actions
  loadFromDB: () => Promise<void>
  createNew: (title?: string) => Conversation
  setActive: (id: string | null) => Promise<void>
  addMessage: (conversationId: string, message: Message) => void
  updateMessages: (conversationId: string, messages: Message[]) => void
  deleteUserMessage: (conversationId: string, userMessageId: string) => boolean
  deleteAgentLoop: (conversationId: string, userMessageId: string) => boolean
  regenerateUserMessage: (conversationId: string, userMessageId: string) => void
  editAndResendUserMessage: (
    conversationId: string,
    userMessageId: string,
    newContent: string
  ) => void
  deleteConversation: (id: string) => Promise<void>
  deleteConversations: (ids: string[]) => Promise<{
    successIds: string[]
    failed: Array<{ id: string; error: string }>
  }>
  updateTitle: (id: string, title: string) => void

  // Mount tracking actions
  mountConversation: (id: string) => void
  unmountConversation: (id: string) => void
  isConversationMounted: (id: string) => boolean

  // Agent runtime actions
  runAgent: (
    conversationId: string,
    providerType: LLMProviderType,
    modelName: string,
    maxTokens: number,
    directoryHandle: FileSystemDirectoryHandle | null,
    agentOverrideId?: string | null
  ) => Promise<void>
  runWorkflowDryRun: (
    conversationId: string,
    templateId: string,
    options?: { rubricDsl?: string }
  ) => Promise<void>
  runWorkflowRealRun: (
    conversationId: string,
    templateId: string,
    options?: { rubricDsl?: string }
  ) => Promise<void>
  listWorkflowTemplates: () => Array<{ id: string; label: string; pipeline?: string[] }>
  runCustomWorkflowDryRun: (
    conversationId: string | null,
    workflow: import('@/agent/workflow/types').WorkflowTemplate
  ) => Promise<void>
  cancelAgent: (conversationId: string) => void

  // Runtime state actions
  setConversationStatus: (id: string, status: ConversationStatus) => void
  appendStreamingContent: (id: string, delta: string) => void
  resetStreamingContent: (id: string) => void
  appendStreamingReasoning: (id: string, delta: string) => void
  resetStreamingReasoning: (id: string) => void
  setReasoningStreaming: (id: string, streaming: boolean) => void
  setCompletedReasoning: (id: string, reasoning: string) => void
  setContentStreaming: (id: string, streaming: boolean) => void
  setCompletedContent: (id: string, content: string) => void
  setCurrentToolCall: (id: string, tc: ToolCall | null) => void
  appendStreamingToolArgs: (id: string, delta: string) => void
  resetStreamingToolArgs: (id: string) => void
  setConversationError: (id: string, error: string | null) => void
  resetConversationState: (id: string) => void

  // Follow-up suggestion actions
  setSuggestedFollowUp: (conversationId: string, suggestion: string) => void
  clearSuggestedFollowUp: (conversationId: string) => void
  getSuggestedFollowUp: (conversationId: string) => string
}

export const useConversationStoreSQLite = create<ConversationState>()(
  immer((set, get) => ({
    conversations: [],
    activeConversationId: null,
    loaded: false,
    agentLoops: new Map(),
    streamingQueues: new Map(),
    suggestedFollowUps: new Map(),
    mountedConversations: new Map(),
    pendingWorkflowDryRuns: new Map(),
    pendingWorkflowRealRuns: new Map(),
    workflowAbortControllers: new Map(),

    activeConversation: () => {
      const { conversations, activeConversationId } = get()
      if (!activeConversationId) return null
      return conversations.find((c) => c.id === activeConversationId) || null
    },

    getConversationStatus: (id: string) => {
      const { conversations } = get()
      const conv = conversations.find((c) => c.id === id)
      return conv?.status || 'idle'
    },

    isConversationRunning: (id: string) => {
      const status = get().getConversationStatus(id)
      return status !== 'idle' && status !== 'error'
    },

    getRunningConversations: () => {
      const { conversations } = get()
      return conversations
        .filter((c) => c.status !== 'idle' && c.status !== 'error')
        .map((c) => c.id)
    },

    // Mount tracking actions
    mountConversation: (id: string) => {
      set((state) => {
        const next = (state.mountedConversations.get(id) || 0) + 1
        state.mountedConversations.set(id, next)
        const conv = state.conversations.find((c) => c.id === id)
        if (conv) {
          conv.mountRefCount = next
        }
      })
    },

    unmountConversation: (id: string) => {
      set((state) => {
        const current = state.mountedConversations.get(id) || 0
        const next = Math.max(0, current - 1)
        if (next === 0) {
          state.mountedConversations.delete(id)
        } else {
          state.mountedConversations.set(id, next)
        }
        const conv = state.conversations.find((c) => c.id === id)
        if (conv) {
          conv.mountRefCount = next
        }
      })
    },

    isConversationMounted: (id: string) => {
      return (get().mountedConversations.get(id) || 0) > 0
    },

    loadFromDB: async () => {
      try {
        // Initialize SQLite first
        await initSQLiteDB()

        const conversations = await loadConversations()

        // Ensure OPFS conversations exist for all loaded conversations
        const { getWorkspaceManager } = await import('@/opfs')
        const manager = await getWorkspaceManager()

        const failedWorkspaces: Array<{ id: string; title: string; error: string }> = []

        for (const conv of conversations) {
          const rootDir = `workspaces/${conv.id}`
          try {
            // Create conversation if it doesn't exist (idempotent)
            await manager.createWorkspace(rootDir, conv.id, conv.title || DEFAULT_CONVERSATION_NAME)
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e)
            console.error(`[conversation.store] Failed to ensure conversation for ${conv.id}:`, e)
            failedWorkspaces.push({
              id: conv.id,
              title: conv.title || DEFAULT_CONVERSATION_NAME,
              error: errorMsg,
            })
          }
        }

        if (failedWorkspaces.length > 0) {
          console.warn(
            `[conversation.store] Failed to create/update  workspace(s):`,
            failedWorkspaces.map((f) => `"${f.title}" (${f.id}): ${f.error}`).join('; ')
          )
        }

        // Refresh the workspace store for active project scope
        const workspaceStore = useConversationContextStore.getState()
        await workspaceStore.refreshWorkspaces()

        const workspaceIds = new Set(workspaceStore.workspaces.map((w) => w.id))
        const activeId = conversations.find((conv) => workspaceIds.has(conv.id))?.id || null

        // Switch to active workspace if exists
        if (activeId) {
          await workspaceStore.switchWorkspace(activeId).catch((e) => {
            console.error('[conversation.store] Failed to switch to active workspace:', e)
          })
        }

        set((state) => {
          state.conversations = conversations.map((conv) => ({
            ...conv,
            status: 'idle',
            streamingContent: '',
            streamingReasoning: '',
            isReasoningStreaming: false,
            completedReasoning: null,
            isContentStreaming: false,
            completedContent: null,
            currentToolCall: null,
            activeToolCalls: [],
            streamingToolArgs: '',
            streamingToolArgsByCallId: {},
            error: null,
            activeRunId: null,
            runEpoch: 0,
            draftAssistant: null,
            contextWindowUsage: conv.lastContextWindowUsage || null,
            lastContextWindowUsage: conv.lastContextWindowUsage || null,
            mountRefCount: 0,
            compressionConvertCallCount: conv.compressionConvertCallCount ?? 0,
            compressionLastSummaryConvertCall:
              conv.compressionLastSummaryConvertCall ?? Number.NEGATIVE_INFINITY,
          }))
          state.activeConversationId = activeId
          state.loaded = true
          state.suggestedFollowUps.clear()
        })
      } catch (error) {
        console.error('[conversation.store] Failed to load conversations:', error)
        set((state) => {
          state.loaded = true
        })
      }
    },

    createNew: (title?: string) => {
      const conversation = createConversation(title)
      set((state) => {
        state.conversations.unshift(conversation)
        state.activeConversationId = conversation.id
      })
      persistConversation(conversation).catch((error) => {
        console.error('[conversation.store] Failed to persist new conversation:', error)
        toast.error('对话保存失败，刷新页面后可能丢失')
      })

      useConversationContextStore
        .getState()
        .switchWorkspace(conversation.id)
        .catch((e) => {
          console.error('[conversation.store] Failed to switch workspace for new conversation:', e)
        })

      return conversation
    },

    setActive: async (id) => {
      set((state) => {
        state.activeConversationId = id
      })

      if (id) {
        const workspaceStore = useConversationContextStore.getState()
        if (workspaceStore.activeWorkspaceId !== id) {
          workspaceStore.switchWorkspace(id).catch((e) => {
            console.error('[conversation.store] Failed to switch active workspace:', e)
          })
        }
      }
    },

    addMessage: (conversationId, message) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === conversationId)
        if (conv) {
          conv.messages.push(message)
          conv.updatedAt = Date.now()

          if (message.role === 'user' && conv.titleMode !== 'manual' && message.content) {
            const userMessages = conv.messages.filter((m) => m.role === 'user')
            if (userMessages.length === 1) {
              const newTitle = truncateTitle(message.content)
              conv.title = newTitle
              conv.titleMode = 'auto'
            }
          }
        }
      })
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv)
        persistConversation(conv).catch((error) => {
          console.error('[conversation.store] Failed to persist conversation on addMessage:', error)
          toast.error('消息保存失败')
        })
    },

    updateMessages: (conversationId, messages) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === conversationId)
        if (conv) {
          const prevUserMessageCount = conv.messages.filter((m) => m.role === 'user').length

          conv.messages = messages
          conv.updatedAt = Date.now()

          const currentUserMessageCount = messages.filter((m) => m.role === 'user').length
          if (
            currentUserMessageCount === 1 &&
            prevUserMessageCount === 0 &&
            conv.titleMode !== 'manual'
          ) {
            const firstUserMessage = messages.find((m) => m.role === 'user')
            if (firstUserMessage?.content) {
              const newTitle = truncateTitle(firstUserMessage.content)
              conv.title = newTitle
              conv.titleMode = 'auto'
            }
          }
        }
      })
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv)
        persistConversation(conv).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on updateMessages:',
            error
          )
          toast.error('消息更新保存失败')
        })
    },

    deleteUserMessage: (conversationId, userMessageId) => {
      const state = get()
      if (state.isConversationRunning(conversationId)) {
        toast.error('请先停止当前运行，再删除消息')
        return false
      }

      let deleted = false
      set((draft) => {
        const conv = draft.conversations.find((c) => c.id === conversationId)
        if (!conv) return
        const idx = conv.messages.findIndex((m) => m.id === userMessageId)
        if (idx < 0 || conv.messages[idx].role !== 'user') return
        conv.messages.splice(idx, 1)
        conv.updatedAt = Date.now()
        updateAutoTitleAfterMessageDelete(conv)
        deleted = true
      })

      if (!deleted) return false
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv)
        persistConversation(conv).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on deleteUserMessage:',
            error
          )
          toast.error('删除消息失败')
        })
      return true
    },

    deleteAgentLoop: (conversationId, userMessageId) => {
      const state = get()
      if (state.isConversationRunning(conversationId)) {
        toast.error('请先停止当前运行，再删除对话轮次')
        return false
      }

      let deleted = false
      set((draft) => {
        const conv = draft.conversations.find((c) => c.id === conversationId)
        if (!conv) return
        const startIdx = conv.messages.findIndex((m) => m.id === userMessageId)
        if (startIdx < 0 || conv.messages[startIdx].role !== 'user') return

        const idsToDelete = new Set<string>()
        idsToDelete.add(conv.messages[startIdx].id)
        for (let i = startIdx + 1; i < conv.messages.length; i++) {
          const msg = conv.messages[i]
          if (msg.role === 'user') break
          idsToDelete.add(msg.id)
        }

        conv.messages = conv.messages.filter((msg) => !idsToDelete.has(msg.id))
        conv.updatedAt = Date.now()
        updateAutoTitleAfterMessageDelete(conv)
        deleted = true
      })

      if (!deleted) return false
      const conv = get().conversations.find((c) => c.id === conversationId)
      if (conv)
        persistConversation(conv).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on deleteAgentLoop:',
            error
          )
          toast.error('删除对话轮次失败')
        })
      return true
    },

    regenerateUserMessage: (conversationId, userMessageId) => {
      const state = get()
      if (state.isConversationRunning(conversationId)) {
        toast.error('请先停止当前运行，再重新生成')
        return
      }

      const conv = state.conversations.find((c) => c.id === conversationId)
      if (!conv) return

      const userMsgIndex = conv.messages.findIndex((m) => m.id === userMessageId)
      if (userMsgIndex < 0 || conv.messages[userMsgIndex].role !== 'user') return

      // 找到该用户消息所属轮次中，需要清理的所有后续消息（直到下一个 user）
      const idsToDelete = new Set<string>()
      for (let i = userMsgIndex + 1; i < conv.messages.length; i++) {
        const msg = conv.messages[i]
        if (msg.role === 'user') break
        idsToDelete.add(msg.id)
      }

      set((draft) => {
        const conv = draft.conversations.find((c) => c.id === conversationId)
        if (!conv) return

        // 删除该 user 消息后、下一个 user 之前的所有非 user 消息
        if (idsToDelete.size > 0) {
          conv.messages = conv.messages.filter((m) => !idsToDelete.has(m.id))
        }
        // 重置流式状态
        conv.status = 'idle'
        conv.streamingContent = ''
        conv.streamingReasoning = ''
        conv.completedContent = null
        conv.completedReasoning = null
        conv.currentToolCall = null
        conv.activeToolCalls = []
        conv.error = null
        conv.updatedAt = Date.now()
      })

      // 持久化
      const updatedConv = get().conversations.find((c) => c.id === conversationId)
      if (updatedConv) {
        persistConversation(updatedConv).catch((error) => {
          console.error('[conversation.store] Failed to persist on regenerate:', error)
        })
      }

      // 获取设置并执行
      const settingsState = useSettingsStore.getState()
      const provider = settingsState.providerType
      const model = settingsState.modelName

      if (provider && model) {
        get().runAgent(conversationId, provider, model, 8192, null)
      }
    },

    editAndResendUserMessage: (conversationId, userMessageId, newContent) => {
      const state = get()
      if (state.isConversationRunning(conversationId)) {
        toast.error('请先停止当前运行，再编辑发送')
        return
      }

      const conv = state.conversations.find((c) => c.id === conversationId)
      if (!conv) return

      const userMsgIndex = conv.messages.findIndex((m) => m.id === userMessageId)
      if (userMsgIndex < 0 || conv.messages[userMsgIndex].role !== 'user') return

      // 找到该用户消息所属轮次中，需要清理的所有后续消息（直到下一个 user）
      const idsToDelete = new Set<string>()
      for (let i = userMsgIndex + 1; i < conv.messages.length; i++) {
        const msg = conv.messages[i]
        if (msg.role === 'user') break
        idsToDelete.add(msg.id)
      }

      set((draft) => {
        const conv = draft.conversations.find((c) => c.id === conversationId)
        if (!conv) return

        // 更新用户消息内容
        conv.messages[userMsgIndex] = {
          ...conv.messages[userMsgIndex],
          content: newContent,
          timestamp: Date.now(),
        }

        // 删除该 user 消息后、下一个 user 之前的所有非 user 消息
        if (idsToDelete.size > 0) {
          conv.messages = conv.messages.filter((m) => !idsToDelete.has(m.id))
        }

        // 重置流式状态
        conv.status = 'idle'
        conv.streamingContent = ''
        conv.streamingReasoning = ''
        conv.completedContent = null
        conv.completedReasoning = null
        conv.currentToolCall = null
        conv.activeToolCalls = []
        conv.error = null
        conv.updatedAt = Date.now()
      })

      // 持久化
      const updatedConv = get().conversations.find((c) => c.id === conversationId)
      if (updatedConv) {
        persistConversation(updatedConv).catch((error) => {
          console.error('[conversation.store] Failed to persist on editAndResend:', error)
        })
      }

      // 获取设置并执行
      const settingsState = useSettingsStore.getState()
      const provider = settingsState.providerType
      const model = settingsState.modelName

      if (provider && model) {
        get().runAgent(conversationId, provider, model, 8192, null)
      }
    },

    deleteConversation: async (id) => {
      const queues = get().streamingQueues.get(id)
      if (queues) {
        queues.reasoning.destroy()
        queues.content.destroy()
      }

      // Stop runtime work first to avoid continued writes while deleting persisted data.
      set((state) => {
        const agentLoop = state.agentLoops.get(id)
        if (agentLoop) {
          agentLoop.cancel()
          state.agentLoops.delete(id)
        }
        const workflowAbortController = state.workflowAbortControllers.get(id)
        if (workflowAbortController) {
          workflowAbortController.abort()
          state.workflowAbortControllers.delete(id)
        }
        state.suggestedFollowUps.delete(id)
        state.streamingQueues.delete(id)
        state.mountedConversations.delete(id)
        state.pendingWorkflowDryRuns.delete(id)
        state.pendingWorkflowRealRuns.delete(id)
      })

      const [convDeleteResult, workspaceDeleteResult] = await Promise.allSettled([
        deleteConversationFromDB(id),
        useConversationContextStore.getState().deleteWorkspace(id),
      ])
      const errors: string[] = []
      if (convDeleteResult.status === 'rejected') {
        console.error(
          '[conversation.store] Failed to delete conversation from DB:',
          convDeleteResult.reason
        )
        errors.push(
          convDeleteResult.reason instanceof Error
            ? convDeleteResult.reason.message
            : String(convDeleteResult.reason)
        )
      }
      if (workspaceDeleteResult.status === 'rejected') {
        console.error(
          '[conversation.store] Failed to delete workspace:',
          workspaceDeleteResult.reason
        )
        errors.push(
          workspaceDeleteResult.reason instanceof Error
            ? workspaceDeleteResult.reason.message
            : String(workspaceDeleteResult.reason)
        )
      }
      if (errors.length > 0) {
        throw new Error(`delete conversation failed: ${errors.join('; ')}`)
      }

      // Only remove in-memory conversation after persisted deletion succeeds.
      set((state) => {
        state.conversations = state.conversations.filter((c) => c.id !== id)
        if (state.activeConversationId === id) {
          state.activeConversationId = null
        }
      })
    },

    deleteConversations: async (ids) => {
      const uniqueIds = Array.from(new Set(ids.filter((id): id is string => !!id)))
      const successIds: string[] = []
      const failed: Array<{ id: string; error: string }> = []
      for (const id of uniqueIds) {
        try {
          await get().deleteConversation(id)
          successIds.push(id)
        } catch (error) {
          failed.push({
            id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return { successIds, failed }
    },

    updateTitle: (id, title) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === id)
        if (conv) {
          conv.title = title
          conv.titleMode = 'manual'
          conv.updatedAt = Date.now()
        }
      })
      const conv = get().conversations.find((c) => c.id === id)
      if (conv)
        persistConversation(conv).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on updateTitle:',
            error
          )
          toast.error('标题修改保存失败')
        })
    },

    // Agent runtime actions
    runAgent: async (
      conversationId: string,
      providerType: LLMProviderType,
      modelName: string,
      maxTokens: number,
      directoryHandle: FileSystemDirectoryHandle | null,
      agentOverrideId?: string | null
    ) => {
      const state = get()
      const conv = state.conversations.find((c) => c.id === conversationId)
      if (!conv) return

      if (state.isConversationRunning(conversationId)) {
        console.warn('[conversation.store] Conversation is already running:', conversationId)
        return
      }

      try {
        // Ensure workspace exists and is active before the agent starts.
        // This avoids write/edit/delete tools failing with "No active workspace"
        // on first-turn chats where workspace creation/switch is still in-flight.
        const workspaceStore = useConversationContextStore.getState()
        if (workspaceStore.activeWorkspaceId !== conversationId) {
          await workspaceStore.switchWorkspace(conversationId)
        }

        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        let runEpoch = 0
        let latestMessages: Message[] = conv.messages
        // Compression summary messages are now injected into the agent
        // loop's allMessages directly via onMessagesUpdated, so they appear
        // at the correct chronological position — no longer appended here.
        let committed = false

        // Acquire run lock immediately to prevent concurrent duplicate starts.
        set((state) => {
          const c = state.conversations.find((x) => x.id === conversationId)
          if (!c) return
          c.runEpoch = (c.runEpoch || 0) + 1
          runEpoch = c.runEpoch
          c.activeRunId = runId
          c.status = 'pending'
          c.error = null
          c.currentToolCall = null
          c.activeToolCalls = []
          c.streamingToolArgs = ''
          c.streamingToolArgsByCallId = {}
          c.streamingContent = ''
          c.streamingReasoning = ''
          c.completedContent = null
          c.completedReasoning = null
          c.isContentStreaming = false
          c.isReasoningStreaming = false
          c.contextWindowUsage = null
          c.workflowExecution = null
          c.draftAssistant = {
            reasoning: '',
            content: '',
            toolCalls: [],
            toolResults: {},
            toolCall: null,
            toolArgs: '',
            steps: [],
            activeReasoningStepId: null,
            activeContentStepId: null,
            activeToolStepId: null,
            activeCompressionStepId: null,
          }
        })

        const isCurrentRun = () => {
          const current = get().conversations.find((c) => c.id === conversationId)
          return !!current && current.activeRunId === runId && (current.runEpoch || 0) === runEpoch
        }

        const failRunEarly = (message: string) => {
          if (!isCurrentRun()) return
          set((state) => {
            const c = state.conversations.find((x) => x.id === conversationId)
            if (!c || c.activeRunId !== runId) return
            c.status = 'error'
            c.error = message
            c.activeRunId = null
            c.draftAssistant = null
            c.currentToolCall = null
            c.activeToolCalls = []
            c.streamingToolArgs = ''
            c.streamingToolArgsByCallId = {}
            c.streamingContent = ''
            c.streamingReasoning = ''
          })
        }

        const pendingWorkflowRequest = get().pendingWorkflowDryRuns.get(conversationId)
        if (pendingWorkflowRequest) {
          set((state) => {
            state.pendingWorkflowDryRuns.delete(conversationId)
          })
        }

        const lastUserMessage = [...conv.messages].reverse().find((m) => m.role === 'user')
        const pendingTemplateId = pendingWorkflowRequest?.templateId?.trim() || null
        const workflowTemplateIdFromModel = parseWorkflowTemplateIdFromModelName(modelName)
        const workflowSlashRequest = extractWorkflowDryRunRequestFromSlashCommand(
          lastUserMessage?.content
        )
        const workflowTemplateId =
          pendingTemplateId ||
          workflowTemplateIdFromModel ||
          workflowSlashRequest?.templateId ||
          null

        if (workflowTemplateId) {
          const dryRunResult = await runWorkflowTemplateDryRun({
            templateId: workflowTemplateId,
            rubricDsl:
              pendingWorkflowRequest?.rubricDsl ||
              (workflowTemplateIdFromModel ? undefined : workflowSlashRequest?.rubricDsl),
          })

          if (!isCurrentRun()) return

          if (!dryRunResult.ok) {
            failRunEarly(dryRunResult.errors.join('; '))
            emitError(dryRunResult.errors.join('; '))
            return
          }

          const dryRunAssistant = createAssistantMessage(
            dryRunResult.summary,
            undefined,
            undefined,
            null,
            'workflow_dry_run',
            buildWorkflowDryRunPayload(dryRunResult)
          )
          latestMessages = [...conv.messages, dryRunAssistant]

          set((state) => {
            const c = state.conversations.find((x) => x.id === conversationId)
            if (!c || c.activeRunId !== runId) return
            c.messages = latestMessages
            c.status = 'idle'
            c.error = null
            c.currentToolCall = null
            c.activeToolCalls = []
            c.streamingToolArgs = ''
            c.streamingToolArgsByCallId = {}
            c.streamingContent = ''
            c.streamingReasoning = ''
            c.completedContent = null
            c.completedReasoning = null
            c.isContentStreaming = false
            c.isReasoningStreaming = false
            c.draftAssistant = null
            c.activeRunId = null
            state.agentLoops.delete(conversationId)
            state.streamingQueues.delete(conversationId)
          })

          emitComplete()
          const finalConv = get().conversations.find((c) => c.id === conversationId)
          if (finalConv) {
            persistConversation(finalConv).catch((err) => {
              console.error('[conversation.store] Failed to persist workflow dry-run:', err)
              toast.error('对话保存失败，部分内容可能丢失')
            })
          }

          return
        }

        const apiKeyRepo = getApiKeyRepository()
        const settingsState = useSettingsStore.getState()
        const effectiveConfig = settingsState.getEffectiveProviderConfig()
        const providerConfig =
          providerType === 'custom'
            ? effectiveConfig
            : {
                apiKeyProviderKey: providerType,
                baseUrl: LLM_PROVIDER_CONFIGS[providerType].baseURL,
                modelName: modelName || LLM_PROVIDER_CONFIGS[providerType].modelName,
              }

        if (!providerConfig?.baseUrl || !providerConfig.modelName) {
          failRunEarly('请先配置自定义服务商和模型')
          return
        }

        const apiKey = await apiKeyRepo.load(providerConfig.apiKeyProviderKey)
        if (!apiKey) {
          failRunEarly('API Key 未设置，请先在设置中配置')
          return
        }

        // Resolve runtime routing context from the current conversation/workspace.
        // Do not depend on global active-project pointer for agent prompt injection.
        let activeProjectId: string | null = null
        let activeAgentId: string | null = null
        let knownAgentIds: Set<string> | null = null

        try {
          const { getWorkspaceRepository } =
            await import('@/sqlite/repositories/workspace.repository')
          const workspace = await getWorkspaceRepository().findWorkspaceById(conversationId)
          activeProjectId = workspace?.projectId || null
        } catch {
          // Ignore workspace lookup failures; agent prompt injection will be skipped without projectId.
        }

        try {
          const { useAgentsStore } = await import('./agents.store')
          const agentsState = useAgentsStore.getState()
          activeAgentId = agentsState.activeAgentId || null
          knownAgentIds = new Set(agentsState.agents.map((agent) => agent.id.toLowerCase()))
        } catch {
          // Ignore agents-store read failures and fallback to default.
        }

        // ---- Workflow Real-Run interception ----
        // Detect pending real-run request (triggered by runWorkflowRealRun action).
        // Uses the same provider/model as normal chat — no special model name.
        const pendingRealRunRequest = get().pendingWorkflowRealRuns.get(conversationId)
        if (pendingRealRunRequest) {
          set((state) => {
            state.pendingWorkflowRealRuns.delete(conversationId)
          })

          try {
            // Create AbortController so cancelAgent can abort this workflow
            const abortController = new AbortController()
            set((state) => {
              state.workflowAbortControllers.set(conversationId, abortController)
            })

            // Initialize workflow execution state for UI progress tracking
            const { getWorkflowTemplateBundle } = await import('@/agent/workflow/templates')
            const bundle = getWorkflowTemplateBundle(pendingRealRunRequest.templateId)
            if (bundle) {
              set((state) => {
                const c = state.conversations.find((x) => x.id === conversationId)
                if (!c || c.activeRunId !== runId) return
                c.workflowExecution = {
                  templateId: bundle.id,
                  label: bundle.label,
                  nodes: bundle.workflow.nodes.map((n) => ({
                    id: n.id,
                    kind: n.kind,
                    label: n.kind,
                    status: 'pending' as const,
                  })),
                  totalTokens: 0,
                  startedAt: Date.now(),
                }
              })
            }

            const { runRealWorkflow } = await import('@/agent/workflow/real-run')
            const { buildEnhancedWorkflowNodePrompt } =
              await import('@/agent/workflow/node-enhancements')
            const result = await runRealWorkflow({
              templateId: pendingRealRunRequest.templateId,
              rubricDsl: pendingRealRunRequest.rubricDsl,
              apiKey,
              providerType,
              baseUrl: providerConfig.baseUrl,
              model: providerConfig.modelName,
              abortSignal: abortController.signal,
              enhanceSystemPrompt: (basePrompt, userMessage) =>
                buildEnhancedWorkflowNodePrompt(basePrompt, userMessage, {
                  projectId: activeProjectId ?? null,
                  directoryHandle: directoryHandle ?? null,
                  currentAgentId: activeAgentId ?? null,
                }),
              onNodeStart: (nodeId, _kind) => {
                set((state) => {
                  const c = state.conversations.find((x) => x.id === conversationId)
                  if (!c || c.activeRunId !== runId) return
                  c.status = 'streaming'
                  c.isContentStreaming = true
                  if (!c.workflowExecution) return
                  // Mark this node as running, set prior pending nodes that were skipped
                  for (const node of c.workflowExecution.nodes) {
                    if (node.id === nodeId) {
                      node.status = 'running'
                    }
                  }
                })
              },
              onNodeComplete: (nodeId, output) => {
                set((state) => {
                  const c = state.conversations.find((x) => x.id === conversationId)
                  if (!c || c.activeRunId !== runId) return
                  if (!c.workflowExecution) return
                  for (const node of c.workflowExecution.nodes) {
                    if (node.id === nodeId) {
                      node.status = 'completed'
                      if (output) node.output = output
                    }
                  }
                })
              },
              onNodeError: (nodeId, error) => {
                set((state) => {
                  const c = state.conversations.find((x) => x.id === conversationId)
                  if (!c || c.activeRunId !== runId) return
                  if (!c.workflowExecution) return
                  for (const node of c.workflowExecution.nodes) {
                    if (node.id === nodeId) {
                      node.status = 'failed'
                      node.error = error
                    }
                  }
                })
              },
              onNodeStepStart: (nodeId, stepId, stepType) => {
                set((state) => {
                  const c = state.conversations.find((x) => x.id === conversationId)
                  if (!c || c.activeRunId !== runId || !c.workflowExecution) return
                  for (const node of c.workflowExecution.nodes) {
                    if (node.id === nodeId) {
                      if (!node.steps) node.steps = []
                      node.steps.push({
                        id: stepId,
                        type: stepType,
                        content: '',
                        streaming: true,
                      })
                    }
                  }
                })
              },
              onNodeReasoningDelta: (nodeId, delta) => {
                set((state) => {
                  const c = state.conversations.find((x) => x.id === conversationId)
                  if (!c || c.activeRunId !== runId || !c.workflowExecution) return
                  for (const node of c.workflowExecution.nodes) {
                    if (node.id === nodeId && node.steps) {
                      const lastStep = node.steps[node.steps.length - 1]
                      if (lastStep && lastStep.type === 'reasoning' && lastStep.streaming) {
                        lastStep.content += delta
                      }
                    }
                  }
                })
              },
              onNodeContentDelta: (nodeId, delta) => {
                set((state) => {
                  const c = state.conversations.find((x) => x.id === conversationId)
                  if (!c || c.activeRunId !== runId || !c.workflowExecution) return
                  for (const node of c.workflowExecution.nodes) {
                    if (node.id === nodeId && node.steps) {
                      const lastStep = node.steps[node.steps.length - 1]
                      if (lastStep && lastStep.type === 'content' && lastStep.streaming) {
                        lastStep.content += delta
                      }
                    }
                  }
                })
              },
              onNodeStepEnd: (nodeId, stepId) => {
                set((state) => {
                  const c = state.conversations.find((x) => x.id === conversationId)
                  if (!c || c.activeRunId !== runId || !c.workflowExecution) return
                  for (const node of c.workflowExecution.nodes) {
                    if (node.id === nodeId && node.steps) {
                      for (const step of node.steps) {
                        if (step.id === stepId) {
                          step.streaming = false
                        }
                      }
                    }
                  }
                })
              },
            })

            if (!isCurrentRun()) return

            if (result.ok) {
              const payload: import('@/agent/message-types').WorkflowRealRunPayload = {
                templateId: result.templateId,
                label: result.label,
                status: result.status,
                executionOrder: result.execution.executionOrder,
                executedNodeIds: result.execution.executedNodeIds,
                repairRound: result.execution.repairRound,
                errors: result.execution.errors,
                nodeOutputs: result.nodeOutputs,
                totalTokens: result.totalTokens,
              }
              const realRunAssistant = createAssistantMessage(
                result.summary,
                undefined,
                undefined,
                null,
                'workflow_real_run',
                undefined,
                payload
              )
              latestMessages = [...conv.messages, realRunAssistant]

              set((state) => {
                const c = state.conversations.find((x) => x.id === conversationId)
                if (!c || c.activeRunId !== runId) return
                c.messages = latestMessages
                c.status = 'idle'
                c.error = null
                c.currentToolCall = null
                c.activeToolCalls = []
                c.streamingToolArgs = ''
                c.streamingToolArgsByCallId = {}
                c.streamingContent = ''
                c.streamingReasoning = ''
                c.completedContent = null
                c.completedReasoning = null
                c.isContentStreaming = false
                c.isReasoningStreaming = false
                c.draftAssistant = null
                c.activeRunId = null
                state.agentLoops.delete(conversationId)
                state.streamingQueues.delete(conversationId)
              })

              emitComplete()
              const finalConv = get().conversations.find((c) => c.id === conversationId)
              if (finalConv) {
                persistConversation(finalConv).catch((err) => {
                  console.error('[conversation.store] Failed to persist workflow real-run:', err)
                  toast.error('对话保存失败，部分内容可能丢失')
                })
              }
            } else {
              failRunEarly(result.errors.join('; '))
              emitError(result.errors.join('; '))
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              return
            }
            const msg = error instanceof Error ? error.message : String(error)
            failRunEarly(msg)
            emitError(msg)
          } finally {
            set((state) => {
              state.workflowAbortControllers.delete(conversationId)
            })
          }

          return
        }

        const provider = createLLMProvider({
          apiKey,
          providerType,
          baseUrl: providerConfig.baseUrl,
          model: providerConfig.modelName,
        })

        const contextManager = new ContextManager({
          maxContextTokens: provider.maxContextTokens,
          reserveTokens: maxTokens,
          enableSummarization: true,
          maxMessageGroups: provider.maxContextTokens >= 200000 ? 80 : 50,
        })

        const toolRegistry = getToolRegistry()
        const toolPolicyHooks = createToolPolicyHooks()

        const normalizedOverride = agentOverrideId?.trim() || null
        const overrideFromLatestMessage = extractFirstMentionedAgentId(lastUserMessage?.content)
        const resolvedOverride = normalizedOverride || overrideFromLatestMessage

        if (resolvedOverride) {
          const normalizedResolvedOverride = resolvedOverride.toLowerCase()
          if (!knownAgentIds || knownAgentIds.has(normalizedResolvedOverride)) {
            activeAgentId = resolvedOverride
          } else {
            console.warn(
              '[conversation.store] Ignoring unknown @agent override from latest message:',
              resolvedOverride
            )
          }
        }
        if (!activeAgentId) {
          activeAgentId = 'default'
        }

        const workflowProgressHooks: import('@/agent/tools/tool-types').WorkflowProgressHooks = {
          onStart: (payload) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId) return
              c.workflowExecution = {
                templateId: payload.templateId,
                label: payload.label,
                nodes: payload.nodes.map((node) => ({
                  id: node.id,
                  kind: node.kind,
                  label: node.label,
                  status: 'pending',
                })),
                totalTokens: 0,
                startedAt: Date.now(),
              }
            })
          },
          onNodeStart: ({ nodeId }) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId || !c.workflowExecution) return
              for (const node of c.workflowExecution.nodes) {
                if (node.id === nodeId) {
                  node.status = 'running'
                }
              }
            })
          },
          onNodeComplete: ({ nodeId, output }) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId || !c.workflowExecution) return
              for (const node of c.workflowExecution.nodes) {
                if (node.id === nodeId) {
                  node.status = 'completed'
                  if (output) node.output = output
                }
              }
            })
          },
          onNodeError: ({ nodeId, error }) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId || !c.workflowExecution) return
              for (const node of c.workflowExecution.nodes) {
                if (node.id === nodeId) {
                  node.status = 'failed'
                  node.error = error
                }
              }
            })
          },
          onFinish: ({ totalTokens }) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId || !c.workflowExecution) return
              if (typeof totalTokens === 'number') {
                c.workflowExecution.totalTokens = totalTokens
              }
            })
          },
        }
        const configuredMaxIterations = useSettingsStore.getState().maxIterations
        const maxIterations =
          configuredMaxIterations === 0
            ? 0
            : Number.isFinite(configuredMaxIterations)
              ? Math.max(1, Math.min(100, Math.floor(configuredMaxIterations)))
              : 20

        const agentMode = getCurrentWorkspaceAgentMode()
        const subagentRuntime = getOrCreateSubagentRuntime({
          workspaceId: conversationId,
          provider,
          toolRegistry,
          contextManager,
          baseToolContext: {
            directoryHandle,
            workspaceId: conversationId,
            projectId: activeProjectId,
            currentAgentId: activeAgentId,
            agentMode,
          },
          onNotification: (event: SubagentTaskNotification) => {
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c) return
              // Bridge to active tool step if spawn_subagent/batch_spawn is executing
              if (c.draftAssistant?.activeToolStepId) {
                const step = c.draftAssistant.steps.find((s) => s.id === c.draftAssistant!.activeToolStepId)
                if (step && step.type === 'tool_call') {
                  const name = step.toolCall.function.name
                  if (name === 'spawn_subagent' || name === 'batch_spawn') {
                    applyDraftAssistantEvent(c, {
                      type: 'subagent_progress',
                      agentId: event.agentId,
                      status: event.status,
                      summary: event.summary,
                      timestamp: event.timestamp,
                    })
                    c.updatedAt = Date.now()
                    return
                  }
                }
              }
              // Fallback: plain text message for non-spawn notifications
              const line = `[task_notification] ${event.status} ${event.agentId} - ${event.summary}`
              c.messages.push(createAssistantMessage(line))
              c.updatedAt = Date.now()
            })
            const snapshot = get().conversations.find((c) => c.id === conversationId)
            if (snapshot) {
              void persistConversation(snapshot)
            }
          },
        })

        const agentLoop = new AgentLoop({
          provider,
          toolRegistry,
          contextManager,
          mode: agentMode,
          toolContext: {
            directoryHandle,
            workspaceId: conversationId,
            projectId: activeProjectId,
            currentAgentId: activeAgentId,
            agentMode,
            subagentRuntime,
            workflowProgress: workflowProgressHooks,
          },
          maxIterations,
          initialConvertCallCount: conv.compressionConvertCallCount ?? 0,
          initialLastSummaryConvertCall:
            conv.compressionLastSummaryConvertCall ?? Number.NEGATIVE_INFINITY,
          onCompressionStateUpdate: (compressionState) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId) return
              c.compressionConvertCallCount = compressionState.convertCallCount
              c.compressionLastSummaryConvertCall = compressionState.lastSummaryConvertCall
            })
          },
          beforeToolCall: toolPolicyHooks.beforeToolCall,
          afterToolCall: async (context) => {
            if (context.isError) return undefined
            const changeTools = new Set(['write', 'edit', 'delete'])
            if (!changeTools.has(context.toolName)) return undefined
            const { useConversationContextStore } =
              await import('@/store/conversation-context.store')
            await useConversationContextStore.getState().refreshPendingChanges(true)
            return undefined
          },
          onLoopComplete: async () => {
            // Refresh pending changes after each agent loop completes
            const { useConversationContextStore } =
              await import('@/store/conversation-context.store')
            await useConversationContextStore.getState().refreshPendingChanges()
          },
        })

        set((state) => {
          state.agentLoops.set(conversationId, agentLoop)
        })

        const currentMessages = conv.messages

        const finalizeRun = async (
          status: ConversationStatus,
          finalMessages?: Message[],
          error?: string
        ) => {
          // If already committed, nothing to do
          if (committed) return

          // Check if this is the current run OR if we have messages to save (cancel race condition)
          // When cancelAgent aborts the loop, onComplete is called but may arrive after
          // cancelAgent's set() has cleared activeRunId. In that case, we still need to save
          // the messages we have.
          const current = get().conversations.find((c) => c.id === conversationId)
          const isRunCurrent =
            !!current && current.activeRunId === runId && (current.runEpoch || 0) === runEpoch
          if (!isRunCurrent && !finalMessages) return

          committed = true
          const targetMessages = finalMessages || latestMessages

          set((inner) => {
            const c = inner.conversations.find((x) => x.id === conversationId)
            if (!c) return
            if (status === 'idle') {
              c.messages = targetMessages
            }
            c.status = status
            c.error = error || null
            c.currentToolCall = null
            c.activeToolCalls = []
            c.streamingToolArgs = ''
            c.streamingToolArgsByCallId = {}
            c.streamingContent = ''
            c.streamingReasoning = ''
            c.completedContent = null
            c.completedReasoning = null
            c.isContentStreaming = false
            c.isReasoningStreaming = false
            c.draftAssistant = null
            c.activeRunId = null
            inner.agentLoops.delete(conversationId)
            inner.streamingQueues.delete(conversationId)
          })

          if (status === 'idle') {
            emitComplete()
            const finalConv = get().conversations.find((c) => c.id === conversationId)
            if (finalConv)
              persistConversation(finalConv).catch((err) => {
                console.error(
                  '[conversation.store] Failed to persist conversation on complete:',
                  err
                )
                toast.error('对话保存失败，部分内容可能丢失')
              })

            try {
              const { useConversationContextStore } =
                await import('@/store/conversation-context.store')
              await useConversationContextStore.getState().refreshPendingChanges(true)
            } catch (err) {
              console.warn(
                '[conversation.store] Failed to refresh pending changes on complete:',
                err
              )
            }

            try {
              const apiKey = await apiKeyRepo.load(providerConfig.apiKeyProviderKey)
              if (apiKey) {
                const suggestion = await generateFollowUp(targetMessages, providerType, apiKey)
                if (suggestion) {
                  get().setSuggestedFollowUp(conversationId, suggestion)
                }
              }
            } catch (err) {
              console.error('[conversation.store] Failed to generate follow-up:', err)
            }
          }
        }

        // Reasoning streaming queue
        let fullReasoningAccumulator = ''
        const reasoningQueue = new StreamingQueue((_key: string, accumulated: string) => {
          fullReasoningAccumulator += accumulated
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c && c.activeRunId === runId) {
              c.streamingReasoning = fullReasoningAccumulator
              applyDraftAssistantEvent(c, {
                type: 'reasoning_stream_sync',
                reasoning: fullReasoningAccumulator,
              })
            }
          })
        })

        // Content streaming queue
        // Note: The accumulated value from queue is per-frame, but we maintain
        // the full accumulated content in store.state.streamingContent separately
        let fullContentAccumulator = ''
        const contentQueue = new StreamingQueue((_key: string, accumulated: string) => {
          fullContentAccumulator += accumulated
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c && c.activeRunId === runId) {
              c.streamingContent = fullContentAccumulator
              applyDraftAssistantEvent(c, {
                type: 'content_stream_sync',
                content: fullContentAccumulator,
              })
            }
          })
        })

        set((state) => {
          state.streamingQueues.set(conversationId, {
            reasoning: reasoningQueue,
            content: contentQueue,
          })
        })

        const cleanupQueues = () => {
          reasoningQueue.destroy()
          contentQueue.destroy()
          set((state) => {
            state.streamingQueues.delete(conversationId)
          })
        }

        const resultMessages = await agentLoop.run(currentMessages, {
          onMessageStart: () => {
            if (!isCurrentRun()) return
            // Reset accumulators for new message
            fullContentAccumulator = ''
            fullReasoningAccumulator = ''
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.streamingContent = ''
                c.streamingReasoning = ''
                c.isReasoningStreaming = false
                c.completedReasoning = ''
                c.isContentStreaming = false
                c.completedContent = ''
                applyDraftAssistantEvent(c, { type: 'message_start' })
              }
            })
          },
          onReasoningStart: () => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.status = 'streaming'
                c.isReasoningStreaming = true
                applyDraftAssistantEvent(c, { type: 'reasoning_start' })
              }
            })
            emitThinkingStart()
          },
          onReasoningDelta: (delta: string) => {
            if (!isCurrentRun()) return
            reasoningQueue.add('reasoning', delta)
            emitThinkingDelta(delta)
          },
          onReasoningComplete: (reasoning: string) => {
            if (!isCurrentRun()) return
            reasoningQueue.flushNow()
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.isReasoningStreaming = false
                c.completedReasoning = reasoning
                c.streamingReasoning = ''
                applyDraftAssistantEvent(c, {
                  type: 'reasoning_complete',
                  reasoning,
                })
              }
            })
          },
          onContentStart: () => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.status = 'streaming'
                c.isContentStreaming = true
                applyDraftAssistantEvent(c, { type: 'content_start' })
              }
            })
          },
          onContentDelta: (delta: string) => {
            if (!isCurrentRun()) return
            contentQueue.add('content', delta)
          },
          onContentComplete: (content: string) => {
            if (!isCurrentRun()) return
            contentQueue.flushNow()
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.isContentStreaming = false
                c.completedContent = content
                c.streamingContent = ''
                applyDraftAssistantEvent(c, {
                  type: 'content_complete',
                  content,
                })
              }
            })
          },
          onToolCallStart: (tc: ToolCall) => {
            if (!isCurrentRun()) return
            const existingConversation = get().conversations.find((c) => c.id === conversationId)
            const shouldEmitToolStart =
              existingConversation?.activeRunId === runId
                ? existingConversation.currentToolCall?.id !== tc.id
                : true
            const runWorkflowArgs =
              tc.function.name === 'run_workflow'
                ? extractRunWorkflowToolArgs(tc.function.arguments)
                : null
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.status = 'tool_calling'
                if (runWorkflowArgs?.mode === 'real_run' && !c.workflowExecution) {
                  const bundle = getWorkflowTemplateBundle(runWorkflowArgs.workflowId)
                  c.workflowExecution = {
                    templateId: bundle?.id || runWorkflowArgs.workflowId,
                    label: bundle?.label || runWorkflowArgs.workflowId,
                    nodes:
                      bundle?.workflow.nodes.map((node) => ({
                        id: node.id,
                        kind: node.kind,
                        label: node.kind,
                        status: 'pending' as const,
                      })) || [],
                    totalTokens: 0,
                    startedAt: Date.now(),
                  }
                }
                const isSameTool = c.currentToolCall?.id === tc.id
                c.currentToolCall = tc
                c.activeToolCalls = c.activeToolCalls || []
                if (!c.activeToolCalls.some((x) => x.id === tc.id)) {
                  c.activeToolCalls.push(tc)
                }
                c.streamingToolArgsByCallId = c.streamingToolArgsByCallId || {}
                if (!c.streamingToolArgsByCallId[tc.id]) {
                  c.streamingToolArgsByCallId[tc.id] = ''
                }
                applyDraftAssistantEvent(c, {
                  type: 'tool_start',
                  toolCall: tc,
                })
                // Keep already streamed args when the same tool transitions
                // from "stream preview" to actual execution.
                if (!isSameTool) {
                  c.streamingToolArgs = ''
                  if (c.draftAssistant) {
                    c.draftAssistant.toolArgs = ''
                  }
                }
              }
            })
            if (shouldEmitToolStart) {
              emitToolStart({
                name: tc.function.name,
                args: tc.function.arguments,
                id: tc.id,
              })
            }
          },
          onToolCallDelta: (_index: number, argsDelta: string, toolCallId?: string) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                if (c.draftAssistant) {
                  const isCurrentToolDelta = !toolCallId || c.currentToolCall?.id === toolCallId
                  if (isCurrentToolDelta) {
                    c.streamingToolArgs += argsDelta
                  }
                  if (toolCallId) {
                    c.streamingToolArgsByCallId = c.streamingToolArgsByCallId || {}
                    c.streamingToolArgsByCallId[toolCallId] =
                      (c.streamingToolArgsByCallId[toolCallId] || '') + argsDelta
                  }
                  applyDraftAssistantEvent(c, {
                    type: 'tool_delta',
                    argsDelta,
                    toolCallId,
                    isCurrentToolDelta: !!isCurrentToolDelta,
                  })
                }
              }
            })
          },
          onToolCallComplete: (tc: ToolCall, _result: string) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((c) => c.id === conversationId)
              if (c && c.activeRunId === runId) {
                const isCurrentTool = c.currentToolCall?.id === tc.id

                if (isCurrentTool) {
                  c.currentToolCall = null
                  c.streamingToolArgs = ''
                }
                c.activeToolCalls = (c.activeToolCalls || []).filter((x) => x.id !== tc.id)

                // Check if there are more tools to execute
                const hasMoreTools = (c.activeToolCalls || []).length > 0
                if (hasMoreTools) {
                  // Continue with next tool
                  c.currentToolCall = c.activeToolCalls[c.activeToolCalls.length - 1]
                  c.streamingToolArgs =
                    (c.streamingToolArgsByCallId || {})[c.currentToolCall.id] || ''
                  // Keep status as 'tool_calling' since we're still executing tools
                  c.status = 'tool_calling'
                } else {
                  // All tools completed, waiting for next model response
                  // Set status to 'pending' to show loading effect
                  c.status = 'pending'
                }

                c.streamingToolArgsByCallId = c.streamingToolArgsByCallId || {}

                applyDraftAssistantEvent(c, {
                  type: 'tool_complete',
                  toolCall: tc,
                  result: _result,
                  isCurrentTool,
                  nextToolCall: c.currentToolCall,
                  streamedArgsByCallId: c.streamingToolArgsByCallId,
                })

                delete c.streamingToolArgsByCallId[tc.id]
              }
            })
          },
          onContextUsageUpdate: (payload) => {
            if (!isCurrentRun()) return
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId) return
              c.contextWindowUsage = {
                usedTokens: payload.usedTokens,
                maxTokens: payload.maxTokens,
                reserveTokens: payload.reserveTokens,
                usagePercent: payload.usagePercent,
                modelMaxTokens: payload.modelMaxTokens ?? payload.maxTokens + payload.reserveTokens,
              }
              c.lastContextWindowUsage = c.contextWindowUsage
            })
          },
          onContextCompressionStart: (payload) => {
            if (!isCurrentRun()) return
            emitCompressionEvent({
              phase: 'start',
              droppedGroups: payload.droppedGroups,
              droppedContentChars: payload.droppedContentChars,
            })
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId) return
              if (c.status !== 'streaming' && c.status !== 'tool_calling') {
                c.status = 'pending'
              }
              applyDraftAssistantEvent(c, { type: 'compression_start' })
            })
          },
          onContextCompressionComplete: (payload) => {
            if (!isCurrentRun()) return
            emitCompressionEvent({
              phase: 'complete',
              mode: payload.mode,
              droppedGroups: payload.droppedGroups,
              droppedContentChars: payload.droppedContentChars,
              summaryChars: payload.summaryChars,
              latencyMs: payload.latencyMs,
            })
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId) return
              applyDraftAssistantEvent(c, {
                type: 'compression_complete',
                mode: payload.mode === 'skip' ? 'skip' : 'compress',
              })
            })
            // Summary message is now injected by AgentLoop directly into
            // allMessages via onMessagesUpdated, so no need to collect it here.
          },
          // SEP-1306: Handle binary elicitation for file uploads
          onElicitation: async (elicitation: any) => {
            if (!isCurrentRun()) return
            console.log('[conversation.store] SEP-1306 elicitation:', elicitation)

            try {
              // Get the server config for auth token
              const mcpManager = (await import('@/mcp/mcp-manager')).getMCPManager()
              await mcpManager.initialize()
              const server = mcpManager.getServer(elicitation.serverId)

              if (!server) {
                throw new Error(`MCP server not found: ${elicitation.serverId}`)
              }

              const authToken = server?.token

              // Show file picker and upload via ElicitationHandler
              // The elicitation object contains full BinaryElicitation data from the server
              const handler = getElicitationHandler()
              const metadata = await handler.handleBinaryElicitation(
                {
                  mode: elicitation.mode,
                  message: elicitation.message,
                  requestedSchema: elicitation.requestedSchema || {
                    type: 'object',
                    properties: {},
                  },
                  uploadEndpoints: elicitation.uploadEndpoints || {},
                },
                {
                  // Pass tool args for OPFS file lookup (priority)
                  toolArgs: elicitation.args,
                  // Pass directory handle for OPFS access
                  directoryHandle,
                },
                authToken
              )

              // Add tool result message with the file metadata
              // This completes the pending tool call with the upload result
              // IMPORTANT: Tell the LLM to retry with the new download_url using natural language
              const { createToolMessage } = await import('@/agent/message-types')

              // Get the file field name from uploadEndpoints (dynamic, not hardcoded)
              const uploadEndpoints = elicitation.uploadEndpoints || {}
              const fileFieldName = Object.keys(uploadEndpoints)[0] || 'file'

              // Extract original args excluding the file field (we'll replace it)
              const originalArgs = { ...(elicitation.args || {}) }
              delete originalArgs[fileFieldName]

              // Build natural language instruction for LLM to retry
              let retryInstruction = `文件已上传成功。请重新调用 ${elicitation.toolName} 工具，使用以下参数：\n\n`
              retryInstruction += `{\n`
              retryInstruction += `  "${fileFieldName}": {\n`
              retryInstruction += `    "download_url": "${metadata.download_url}",\n`
              retryInstruction += `    "file_id": "${metadata.file_id}"\n`
              retryInstruction += `  }`

              // Add other original args (like question)
              for (const [key, value] of Object.entries(originalArgs)) {
                retryInstruction += `,\n  "${key}": ${JSON.stringify(value)}`
              }
              retryInstruction += `\n}`

              const toolResultMsg = createToolMessage({
                toolCallId: elicitation.toolCallId || 'unknown',
                name: elicitation.toolName,
                content: retryInstruction,
              })

              get().addMessage(conversationId, toolResultMsg)

              // Resume agent loop with the tool result
              // First, manually clean up the previous agentLoop state
              set((state) => {
                const c = state.conversations.find((c) => c.id === conversationId)
                if (c) {
                  c.status = 'idle'
                  c.error = null
                  c.activeRunId = null
                  c.draftAssistant = null
                }
                state.agentLoops.delete(conversationId)
              })

              // Now start a new agent loop with the updated messages
              await get().runAgent(
                conversationId,
                providerType,
                modelName,
                maxTokens,
                directoryHandle,
                activeAgentId
              )
            } catch (error) {
              console.error('[conversation.store] Elicitation failed:', error)
              const errorMsg = error instanceof Error ? error.message : String(error)

              // Add tool result with error
              const { createToolMessage } = await import('@/agent/message-types')
              const errorResultMsg = createToolMessage({
                toolCallId: elicitation.toolCallId || 'unknown',
                name: elicitation.toolName,
                content: JSON.stringify({
                  error: `文件上传失败: ${errorMsg}`,
                }),
              })
              get().addMessage(conversationId, errorResultMsg)

              set((state) => {
                const c = state.conversations.find((c) => c.id === conversationId)
                if (c) {
                  c.status = 'error'
                  c.error = errorMsg
                }
                state.agentLoops.delete(conversationId)
              })
              emitError(errorMsg)
            }
          },
          onMessagesUpdated: (msgs: Message[]) => {
            if (!isCurrentRun()) return
            latestMessages = msgs
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId) return
              c.messages = msgs
              c.updatedAt = Date.now()
            })
          },
          onComplete: async (msgs: Message[]) => {
            if (!isCurrentRun()) return
            console.info('[#LoopStop] store_onComplete', {
              conversationId,
              runId,
              messagesCount: msgs.length,
            })
            latestMessages = msgs
            reasoningQueue.flushNow()
            contentQueue.flushNow()
            cleanupQueues()
            await finalizeRun('idle', latestMessages)
          },
          onError: (err: Error) => {
            if (!isCurrentRun()) return
            console.error('[#LoopStop] store_onError', {
              conversationId,
              runId,
              error: err.message,
            })
            reasoningQueue.flushNow()
            contentQueue.flushNow()
            cleanupQueues()
            set((inner) => {
              const c = inner.conversations.find((x) => x.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.status = 'error'
                c.error = err.message
                c.activeRunId = null
                c.draftAssistant = null
              }
              inner.agentLoops.delete(conversationId)
              inner.streamingQueues.delete(conversationId)
            })
            emitError(err.message)
          },
        })
        latestMessages = resultMessages
        await finalizeRun('idle', latestMessages)
      } catch (error) {
        const queues = get().streamingQueues.get(conversationId)
        if (queues) {
          queues.reasoning.destroy()
          queues.content.destroy()
          set((state) => {
            state.streamingQueues.delete(conversationId)
          })
        }

        if (error instanceof Error && error.name === 'AbortError') {
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c) {
              c.status = 'idle'
              c.activeRunId = null
              c.draftAssistant = null
            }
            state.agentLoops.delete(conversationId)
            state.streamingQueues.delete(conversationId)
          })
          return
        }
        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            c.status = 'error'
            c.error = error instanceof Error ? error.message : String(error)
            c.activeRunId = null
            c.draftAssistant = null
          }
          state.agentLoops.delete(conversationId)
          state.streamingQueues.delete(conversationId)
        })
      }
    },

    runWorkflowDryRun: async (
      conversationId: string,
      templateId: string,
      options?: { rubricDsl?: string }
    ) => {
      const normalizedTemplateId = templateId.trim()
      if (!normalizedTemplateId) {
        return
      }

      if (get().isConversationRunning(conversationId)) {
        return
      }

      const normalizedRubricDsl = options?.rubricDsl?.trim()
      set((state) => {
        state.pendingWorkflowDryRuns.set(conversationId, {
          templateId: normalizedTemplateId,
          rubricDsl: normalizedRubricDsl || undefined,
        })
      })

      await get().runAgent(
        conversationId,
        'openai',
        `${WORKFLOW_DRY_RUN_MODEL_PREFIX}${normalizedTemplateId}`,
        1024,
        null
      )
    },

    listWorkflowTemplates: () =>
      listWorkflowTemplateBundles().map((bundle) => ({
        id: bundle.id,
        label: bundle.label,
        pipeline: bundle.workflow.nodes.map((n) => n.kind),
      })),

    runCustomWorkflowDryRun: async (
      conversationId: string | null,
      workflow: import('@/agent/workflow/types').WorkflowTemplate
    ) => {
      if (!conversationId) return
      if (get().isConversationRunning(conversationId)) return

      const { runCustomWorkflowDryRun: dryRun } = await import('@/agent/workflow/dry-run')
      const result = await dryRun(workflow)

      if (result.ok) {
        const msg = createAssistantMessage(
          result.summary,
          undefined,
          undefined,
          null,
          'workflow_dry_run',
          buildWorkflowDryRunPayload(result)
        )
        const conv = get().conversations.find((c) => c.id === conversationId)
        if (conv) {
          get().updateMessages(conversationId, [...conv.messages, msg])
        }
      } else {
        toast.error(`工作流验证失败: ${result.errors.join(', ')}`)
      }
    },

    runWorkflowRealRun: async (
      conversationId: string,
      templateId: string,
      options?: { rubricDsl?: string }
    ) => {
      const normalizedTemplateId = templateId.trim()
      if (!normalizedTemplateId) return

      if (get().isConversationRunning(conversationId)) return

      const normalizedRubricDsl = options?.rubricDsl?.trim()
      set((state) => {
        state.pendingWorkflowRealRuns.set(conversationId, {
          templateId: normalizedTemplateId,
          rubricDsl: normalizedRubricDsl || undefined,
        })
      })

      // Use normal runAgent — real-run will be intercepted inside runAgent
      // by detecting pendingWorkflowRealRuns, using the same model/provider as normal chat
      const settingsState = useSettingsStore.getState()
      const effectiveConfig = settingsState.getEffectiveProviderConfig()
      const providerType = settingsState.providerType
      const modelName = effectiveConfig?.modelName || settingsState.modelName

      await get().runAgent(conversationId, providerType, modelName, 4096, null)
    },

    cancelAgent: (conversationId: string) => {
      const workflowAbortController = get().workflowAbortControllers.get(conversationId)
      if (workflowAbortController) {
        workflowAbortController.abort()
      }

      const agentLoop = get().agentLoops.get(conversationId)
      if (agentLoop) {
        agentLoop.cancel()
        const queues = get().streamingQueues.get(conversationId)
        if (queues) {
          queues.reasoning.flushNow()
          queues.content.flushNow()
          queues.reasoning.destroy()
          queues.content.destroy()
        }

        // Commit draft to conversation messages BEFORE aborting the agent loop.
        // This ensures the draft is in c.messages when finalizeRun runs.
        let committedPartial = false
        set((state) => {
          state.agentLoops.delete(conversationId)
          state.streamingQueues.delete(conversationId)
          state.workflowAbortControllers.delete(conversationId)
          state.pendingWorkflowRealRuns.delete(conversationId)
          state.pendingWorkflowDryRuns.delete(conversationId)
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            committedPartial = commitDraftToMessages(c)
            if (committedPartial) {
              c.updatedAt = Date.now()
            }
            // Clean up streaming/draft UI state but let finalizeRun handle run lifecycle
            c.draftAssistant = null
            c.currentToolCall = null
            c.activeToolCalls = []
            c.streamingToolArgs = ''
            c.streamingToolArgsByCallId = {}
            c.streamingContent = ''
            c.streamingReasoning = ''
            c.isContentStreaming = false
            c.isReasoningStreaming = false
            c.workflowExecution = null
            // Mark run canceled immediately so UI exits running state
            // even if AgentLoop abort callbacks are delayed or suppressed.
            c.status = 'idle'
            c.error = null
            c.activeRunId = null
          }
        })
        if (committedPartial) {
          const conv = get().conversations.find((c) => c.id === conversationId)
          if (conv)
            persistConversation(conv).catch((error) => {
              console.error(
                '[conversation.store] Failed to persist conversation on cancelAgent partial commit:',
                error
              )
              toast.error('停止后保存草稿失败，部分内容可能丢失')
            })
        }
        return
      }

      const isWorkflowRunActive =
        !!workflowAbortController ||
        get().pendingWorkflowRealRuns.has(conversationId) ||
        !!get().conversations.find((c) => c.id === conversationId)?.workflowExecution

      if (!isWorkflowRunActive) return

      const queues = get().streamingQueues.get(conversationId)
      if (queues) {
        queues.reasoning.flushNow()
        queues.content.flushNow()
        queues.reasoning.destroy()
        queues.content.destroy()
      }

      set((state) => {
        state.streamingQueues.delete(conversationId)
        state.workflowAbortControllers.delete(conversationId)
        state.pendingWorkflowRealRuns.delete(conversationId)
        state.pendingWorkflowDryRuns.delete(conversationId)
        const c = state.conversations.find((x) => x.id === conversationId)
        if (!c) return
        c.status = 'idle'
        c.error = null
        c.activeRunId = null
        c.draftAssistant = null
        c.currentToolCall = null
        c.activeToolCalls = []
        c.streamingToolArgs = ''
        c.streamingToolArgsByCallId = {}
        c.streamingContent = ''
        c.streamingReasoning = ''
        c.isContentStreaming = false
        c.isReasoningStreaming = false
        c.workflowExecution = null
      })
    },

    // Runtime state actions
    setConversationStatus: (id: string, status: ConversationStatus) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.status = status
      })
    },

    appendStreamingContent: (id: string, delta: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.streamingContent += delta
      })
    },

    resetStreamingContent: (id: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.streamingContent = ''
      })
    },

    appendStreamingReasoning: (id: string, delta: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.streamingReasoning += delta
      })
    },

    resetStreamingReasoning: (id: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.streamingReasoning = ''
      })
    },

    setReasoningStreaming: (id: string, streaming: boolean) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.isReasoningStreaming = streaming
      })
    },

    setCompletedReasoning: (id: string, reasoning: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.completedReasoning = reasoning
      })
    },

    setContentStreaming: (id: string, streaming: boolean) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.isContentStreaming = streaming
      })
    },

    setCompletedContent: (id: string, content: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.completedContent = content
      })
    },

    setCurrentToolCall: (id: string, tc: ToolCall | null) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) {
          c.currentToolCall = tc
          c.activeToolCalls = c.activeToolCalls || []
          if (tc && !c.activeToolCalls.some((x) => x.id === tc.id)) {
            c.activeToolCalls.push(tc)
          }
        }
      })
    },

    appendStreamingToolArgs: (id: string, delta: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) c.streamingToolArgs += delta
      })
    },

    resetStreamingToolArgs: (id: string) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) {
          c.streamingToolArgs = ''
          c.streamingToolArgsByCallId = {}
        }
      })
    },

    setConversationError: (id: string, error: string | null) => {
      set((state) => {
        const c = state.conversations.find((c) => c.id === id)
        if (c) {
          c.error = error
          c.status = error ? 'error' : 'idle'
        }
      })
    },

    resetConversationState: (id: string) => {
      set((state) => {
        const workflowAbortController = state.workflowAbortControllers.get(id)
        if (workflowAbortController) {
          workflowAbortController.abort()
          state.workflowAbortControllers.delete(id)
        }
        state.pendingWorkflowDryRuns.delete(id)
        state.pendingWorkflowRealRuns.delete(id)
        const c = state.conversations.find((c) => c.id === id)
        if (c) {
          c.status = 'idle'
          c.streamingContent = ''
          c.streamingReasoning = ''
          c.isReasoningStreaming = false
          c.completedReasoning = null
          c.isContentStreaming = false
          c.completedContent = null
          c.currentToolCall = null
          c.activeToolCalls = []
          c.streamingToolArgs = ''
          c.streamingToolArgsByCallId = {}
          c.error = null
          c.activeRunId = null
          c.draftAssistant = null
          c.contextWindowUsage = null
          c.workflowExecution = null
        }
      })
    },

    // Follow-up suggestion actions
    setSuggestedFollowUp: (conversationId: string, suggestion: string) => {
      set((state) => ({
        suggestedFollowUps: new Map(state.suggestedFollowUps).set(conversationId, suggestion),
      }))
    },

    clearSuggestedFollowUp: (conversationId: string) => {
      set((state) => {
        const newMap = new Map(state.suggestedFollowUps)
        newMap.delete(conversationId)
        return { suggestedFollowUps: newMap }
      })
    },

    getSuggestedFollowUp: (conversationId: string) => {
      return get().suggestedFollowUps.get(conversationId) || ''
    },
  }))
)
