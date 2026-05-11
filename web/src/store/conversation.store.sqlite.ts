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
import { t as translateStatic } from '@creatorweave/i18n'
import type {
  Conversation,
  Message,
  ToolCall,
  ConversationStatus,
  DraftAssistantStep,
} from '@/agent/message-types'
import type { AssetMeta } from '@/types/asset'
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
import { useConversationRuntimeStore, createEmptyRuntime } from './conversation-runtime.store'
import type { ConversationRuntime } from './conversation-runtime.store'
import { useI18nStore } from '@/i18n/store'
import { getElicitationHandler } from '@/mcp/elicitation-handler.tsx'

/** Helper to get or create a runtime in the runtime store (Immer draft) */
function ensureRuntime(state: import('./conversation-runtime.store').ConversationRuntimeState, convId: string): ConversationRuntime {
  let rt = state.runtimes.get(convId)
  if (!rt) {
    rt = createEmptyRuntime()
    state.runtimes.set(convId, rt)
  }
  return rt
}

function i18nText(key: string, fallback: string): string {
  const locale = useI18nStore.getState().locale
  const translated = translateStatic(locale, key)
  return translated === key ? fallback : translated
}

/**
 * Commit completed draft assistant content + tool calls into conversation messages.
 * Used both when starting a new assistant message (onMessageStart) and when cancelling.
 */
function commitDraftToMessages(conv: {
  messages: Message[]
  collectedAssets?: AssetMeta[]
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

  // Collect assets accumulated during this agent run
  const collectedAssets = conv.collectedAssets?.length ? conv.collectedAssets : undefined
  console.log(
    '[commitDraftToMessages] conv.collectedAssets:',
    conv.collectedAssets?.length,
    '→ passing:',
    collectedAssets?.length
  )
  // Clear the accumulator after collecting
  conv.collectedAssets = []

  conv.messages.push(
    createAssistantMessage(
      draft.content || null,
      completedToolCalls.length > 0 ? completedToolCalls : undefined,
      undefined,
      draft.reasoning || null,
      undefined,
      undefined,
      undefined,
      collectedAssets
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

function findLatestToolStepByToolCallId(
  draft: DraftAssistantState,
  toolCallId: string,
  streamingOnly = false
): Extract<DraftAssistantStep, { type: 'tool_call' }> | undefined {
  for (let i = draft.steps.length - 1; i >= 0; i--) {
    const step = draft.steps[i]
    if (step.type !== 'tool_call') continue
    if (step.toolCall.id !== toolCallId) continue
    if (streamingOnly && !step.streaming) continue
    return step
  }
  return undefined
}

function ensureDraftTextStep(
  draft: DraftAssistantState,
  stepType: 'reasoning' | 'content'
): string {
  // Only reuse the last step if it is the same type AND still streaming.
  // Completed steps must NOT be reused — a new iteration of the agent loop
  // should produce a brand-new step so the UI shows distinct content blocks
  // in chronological order rather than overwriting the previous one.
  const last = draft.steps[draft.steps.length - 1]
  if (last && last.type === stepType && last.streaming) {
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

/**
 * Minimal interface for objects that hold a draftAssistant.
 * Both Conversation and ConversationRuntime satisfy this.
 */
interface DraftAssistantHolder {
  draftAssistant: DraftAssistantState | null
}

function ensureDraftAssistantForMessageStart(conv: DraftAssistantHolder): DraftAssistantState {
  const previous = conv.draftAssistant
  const next: DraftAssistantState = {
    reasoning: '',
    content: '',
    toolCalls: previous?.toolCalls ? [...previous.toolCalls] : [],
    toolResults: previous?.toolResults ? { ...previous.toolResults } : {},
    toolCall: null,
    toolArgs: '',
    // Preserve ALL steps from previous iterations so the timeline remains
    // continuous across agent-loop iterations. Steps are only cleared when
    // the entire run finishes (draftAssistant = null).
    steps: previous?.steps ? [...previous.steps] : [],
    activeReasoningStepId: null,
    activeContentStepId: null,
    activeToolStepId: null,
    activeCompressionStepId: previous?.activeCompressionStepId || null,
  }
  conv.draftAssistant = next
  return next
}

function applyDraftAssistantEvent(conv: DraftAssistantHolder, event: DraftAssistantEvent): void {
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
      // Don't remove the completed reasoning step here — defer cleanup to
      // message_start (ensureDraftAssistantForMessageStart). Removing it now
      // causes a render gap between reasoning_complete and message_end, because
      // messages[] is only committed on message_end, not on reasoning_complete.
      // The orderedRuntimeSteps filter in AssistantTurnBubble deduplicates
      // against committedReasoningSet, so keeping the step is safe.
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
        // Don't remove the implicit reasoning step here — same rationale as
        // the reasoning_complete change: defer cleanup to message_start.
        draft.activeReasoningStepId = null
      }
      syncDraftTextStepContent(draft, draft.activeContentStepId, draft.content, false)
      // Don't remove the completed content step here — defer cleanup to
      // message_start. The orderedRuntimeSteps filter deduplicates against
      // committedContentSet, and removing now causes a render gap while tools
      // are executing between content_complete and message_end.
      draft.activeContentStepId = null
      return
    }
    case 'tool_start': {
      const stepId = `tool-${event.toolCall.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const now = Date.now()
      draft.toolCall = event.toolCall
      if (!draft.toolCalls.some((x) => x.id === event.toolCall.id)) {
        draft.toolCalls.push(event.toolCall)
      }
      const activeStep = draft.activeToolStepId ? findDraftStep(draft, draft.activeToolStepId) : undefined
      const existing =
        activeStep && activeStep.type === 'tool_call' && activeStep.toolCall.id === event.toolCall.id
          ? activeStep
          : findLatestToolStepByToolCallId(draft, event.toolCall.id, true)
      if (existing && existing.type === 'tool_call') {
        existing.streaming = true
        existing.toolCall = event.toolCall
        if (!existing.timestamp) {
          existing.timestamp = now
        }
        draft.activeToolStepId = existing.id
      } else {
        const created: DraftAssistantStep = {
          id: stepId,
          timestamp: now,
          type: 'tool_call',
          toolCall: event.toolCall,
          args: '',
          streaming: true,
        }
        draft.steps.push(created)
        draft.activeToolStepId = created.id
      }
      return
    }
    case 'tool_delta': {
      if (event.isCurrentToolDelta) {
        draft.toolArgs += event.argsDelta
      }
      const step =
        event.toolCallId
          ? findLatestToolStepByToolCallId(draft, event.toolCallId, true) ||
            findLatestToolStepByToolCallId(draft, event.toolCallId, false)
          : (draft.activeToolStepId ? findDraftStep(draft, draft.activeToolStepId) : undefined)
      if (step && step.type === 'tool_call') {
        step.args += event.argsDelta
      }
      return
    }
    case 'tool_complete': {
      const activeStep = draft.activeToolStepId ? findDraftStep(draft, draft.activeToolStepId) : undefined
      const completedStep =
        activeStep && activeStep.type === 'tool_call' && activeStep.toolCall.id === event.toolCall.id
          ? activeStep
          : findLatestToolStepByToolCallId(draft, event.toolCall.id, true) ||
            findLatestToolStepByToolCallId(draft, event.toolCall.id, false)
      const completedStepId = completedStep?.id
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
      if (completedStep && completedStep.type === 'tool_call') {
        completedStep.result = event.result || ''
        completedStep.streaming = false
      }
      if (!event.isCurrentTool) return
      draft.toolCall = null
      draft.toolArgs = ''
      if (completedStepId && draft.activeToolStepId === completedStepId) {
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
const DEFAULT_CONVERSATION_NAME = 'New Chat'
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
import { LLM_PROVIDER_CONFIGS, isCustomProviderType, type LLMProviderType } from '@/agent/providers/types'
import { generateFollowUp } from '@/agent/follow-up-generator'
import {
  WORKFLOW_DRY_RUN_MODEL_PREFIX,
  type RunWorkflowTemplateDryRunResult,
  parseWorkflowTemplateIdFromModelName,
  runWorkflowTemplateDryRun,
} from '@/agent/workflow/dry-run'
import { getWorkflowTemplateBundle, listWorkflowTemplateBundles } from '@/agent/workflow/templates'
import {
  getConversationRepository,
  getMessageRepository,
  getSQLiteDB,
  initSQLiteDB,
} from '@/sqlite'
import { useSettingsStore } from './settings.store'
import { getCurrentWorkspaceAgentMode } from './workspace-preferences.store'
import type { SubagentTaskNotification } from '@/agent/tools/tool-types'

// Follow-up suggestions are enabled by default

//=============================================================================
// Persistence Functions (SQLite)
//=============================================================================

const pendingConversationMetaPersists = new Map<string, Promise<void>>()

async function waitForConversationMetaPersist(convId: string): Promise<void> {
  const pending = pendingConversationMetaPersists.get(convId)
  if (pending) {
    await pending
  }
}

/** Append a single new message via MessageRepository */
async function persistNewMessage(convId: string, message: Message, seq: number): Promise<void> {
  await waitForConversationMetaPersist(convId)
  const msgRepo = getMessageRepository()
  const convRepo = getConversationRepository()
  await msgRepo.insert(convId, message, seq)
  await convRepo.touch(convId)
}

/**
 * Debounced persist scheduler — coalesces rapid fire-and-forget calls into
 * a single database write while guaranteeing immediate flush for final saves.
 *
 * Why: During an agent run, `persistAfterBlockComplete` and `onNotification`
 * can fire many times per second. Each triggers a full DELETE + INSERT in a
 * manual transaction. If two calls overlap, SQLite throws
 * "cannot start a transaction within a transaction".
 *
 * How: We debounce non-critical calls (300 ms window) so only the latest
 * messages snapshot is written. Critical calls (flush=true) skip the timer
 * and execute immediately, chained after any in-flight write.
 */
const persistSchedulers = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout> | null
    flushInProgress: Promise<void> | null
    // Resolve function for the currently-pending debounce Promise, so a
    // pre-empting call can settle it immediately instead of leaving it hanging.
    pendingResolve: (() => void) | null
  }
>()

const PERSIST_DEBOUNCE_MS = 300

async function doPersist(convId: string, messages: Message[]): Promise<void> {
  await waitForConversationMetaPersist(convId)
  const msgRepo = getMessageRepository()
  const convRepo = getConversationRepository()
  await msgRepo.replaceAll(convId, messages)
  await convRepo.touch(convId)
}

/**
 * Schedule (or immediately execute) a message persist for a conversation.
 *
 * @param flush  `true` = skip debounce, write immediately. Use for final
 *               saves (complete, cancel, user edits). `false` = debounce
 *               to coalesce rapid intermediate writes (block-complete,
 *               notifications).
 */
function persistMessageReplace(
  convId: string,
  messages: Message[],
  flush: boolean = true
): Promise<void> {
  let entry = persistSchedulers.get(convId)
  if (!entry) {
    entry = { timer: null, flushInProgress: null, pendingResolve: null }
    persistSchedulers.set(convId, entry)
  }

  // Cancel any pending debounced write — settle the old Promise immediately
  // so its caller (which uses .catch() / void) doesn't hang.
  if (entry.timer !== null) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
  if (entry.pendingResolve !== null) {
    entry.pendingResolve() // resolve old debounce Promise harmlessly
    entry.pendingResolve = null
  }

  // Flush: chain immediately after any in-flight write
  if (flush) {
    const prev = entry.flushInProgress?.catch(() => undefined) ?? Promise.resolve()
    const next = prev.then(() => doPersist(convId, messages))
    entry.flushInProgress = next
    void next.then(
      () => {
        if (entry!.flushInProgress === next) entry!.flushInProgress = null
      },
      () => {
        if (entry!.flushInProgress === next) entry!.flushInProgress = null
      }
    )
    return next
  }

  // Debounce: schedule a write after PERSIST_DEBOUNCE_MS.
  // The returned Promise resolves when the actual write completes (or
  // immediately with void if superseded by a later call).
  let resolveDebounce!: (value: void | PromiseLike<void>) => void
  let rejectDebounce!: (reason?: unknown) => void
  const debouncePromise = new Promise<void>((r, j) => {
    resolveDebounce = r
    rejectDebounce = j
  })

  entry.timer = setTimeout(() => {
    entry!.timer = null
    entry!.pendingResolve = null

    const prev = entry!.flushInProgress?.catch(() => undefined) ?? Promise.resolve()
    const next = prev.then(() => doPersist(convId, messages))
    entry!.flushInProgress = next

    // Settle the debounce Promise once the write settles
    void next.then(
      () => resolveDebounce(),
      (err) => rejectDebounce(err)
    )
    void next.then(
      () => {
        if (entry!.flushInProgress === next) entry!.flushInProgress = null
        if (entry!.timer === null && entry!.flushInProgress === null) {
          persistSchedulers.delete(convId)
        }
      },
      () => {
        if (entry!.flushInProgress === next) entry!.flushInProgress = null
        if (entry!.timer === null && entry!.flushInProgress === null) {
          persistSchedulers.delete(convId)
        }
      }
    )
  }, PERSIST_DEBOUNCE_MS)

  // Store resolve so a pre-empting flush or newer debounce can settle early
  entry.pendingResolve = resolveDebounce

  return debouncePromise
}

/** Persist only conversation metadata (title, contextUsage, etc.) — no messages */
async function persistConversationMeta(conversation: Conversation): Promise<void> {
  const repo = getConversationRepository()
  await repo.saveMeta({
    id: conversation.id,
    title: conversation.title,
    titleMode: conversation.titleMode || 'manual',
    contextUsage: conversation.lastContextWindowUsage || null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  })
}

/** Load all conversation metadata from SQLite (without messages) */
async function loadConversationsMeta(): Promise<Conversation[]> {
  const repo = getConversationRepository()
  const metas = await repo.findAllMeta()
  // Create Conversation objects with empty messages (loaded on demand)
  return metas.map((meta) => ({
    id: meta.id,
    title: meta.title,
    titleMode: meta.titleMode || 'manual',
    messages: [] as Message[], // Messages loaded lazily when conversation is opened
    lastContextWindowUsage: meta.lastContextWindowUsage || null,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
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
    contextWindowUsage: meta.lastContextWindowUsage || null,
    mountRefCount: 0,
    compressionConvertCallCount: 0,
    compressionLastSummaryConvertCall: Number.NEGATIVE_INFINITY,
    collectedAssets: [],
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

  // Track run IDs that were cancelled by user (not persisted)
  // Used to suppress follow-up generation for cancelled runs
  cancelledRunIds: Set<string>

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

  // Asset accumulation (not persisted — moved to assistant message on commit)
  collectAssets: (conversationId: string, assets: import('@/types/asset').AssetMeta[]) => void

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
    cancelledRunIds: new Set(),
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
        // Force one legacy message migration pass in main thread.
        // This repairs cases where worker-side migration was skipped in previous versions.
        try {
          const msgRepo = getMessageRepository()
          const migrated = await msgRepo.migrateFromJsonBlob()
          if (migrated.messages > 0) {
            console.log(
              `[conversation.store] Recovered ${migrated.messages} legacy messages across ${migrated.conversations} conversations`
            )
          }
          const db = getSQLiteDB()
          const missingConversations = await db.queryFirst<{ count: number }>(
            `SELECT COUNT(*) as count
             FROM conversations c
             WHERE NOT EXISTS (
               SELECT 1 FROM messages m WHERE m.conversation_id = c.id LIMIT 1
             )`
          )
          if ((missingConversations?.count ?? 0) > 0) {
            const recovered = await msgRepo.recoverFromAppSessions()
            if (recovered.messages > 0) {
              console.log(
                `[conversation.store] Recovered ${recovered.messages} messages from AppSessions (${recovered.conversations} conversations, ${recovered.sessions} snapshots)`
              )
            }
          }
        } catch (migrationError) {
          console.warn('[conversation.store] Legacy message migration pass failed:', migrationError)
        }

        const conversations = await loadConversationsMeta()

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
            collectedAssets: [],
          }))
          state.activeConversationId = activeId
          state.loaded = true
          state.suggestedFollowUps.clear()
          state.cancelledRunIds.clear()
        })

        // Load messages for the active conversation (it's about to be displayed)
        if (activeId) {
          try {
            const msgRepo = getMessageRepository()
            const activeMessages = await msgRepo.findByConversation(activeId)
            set((state) => {
              const conv = state.conversations.find((c) => c.id === activeId)
              if (conv) {
                conv.messages = activeMessages as Message[]
              }
            })
          } catch (error) {
            console.error(
              '[conversation.store] Failed to load messages for active conversation:',
              error
            )
          }
        }
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
      // Persist metadata (creates the conversation row) + empty messages
      const metaPersist = persistConversationMeta(conversation)
        .catch((error) => {
          console.error('[conversation.store] Failed to persist new conversation:', error)
          toast.error('对话保存失败，刷新页面后可能丢失')
          throw error
        })
        .finally(() => {
          if (pendingConversationMetaPersists.get(conversation.id) === metaPersist) {
            pendingConversationMetaPersists.delete(conversation.id)
          }
        })
      pendingConversationMetaPersists.set(conversation.id, metaPersist)
      void metaPersist.catch(() => {})

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
        // Lazy-load messages if not already loaded
        const conv = get().conversations.find((c) => c.id === id)
        if (conv && conv.messages.length === 0) {
          try {
            const msgRepo = getMessageRepository()
            const messages = await msgRepo.findByConversation(id)
            set((state) => {
              const c = state.conversations.find((c) => c.id === id)
              if (c && c.messages.length === 0) {
                c.messages = messages as Message[]
              }
            })
          } catch (error) {
            console.error('[conversation.store] Failed to load messages for conversation:', error)
          }
        }

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
      if (conv) {
        // Persist the new message
        const seq = conv.messages.indexOf(message)
        persistNewMessage(conversationId, message, seq).catch((error) => {
          console.error('[conversation.store] Failed to persist conversation on addMessage:', error)
          toast.error('消息保存失败')
        })
        // If title was auto-generated, also persist metadata
        if (conv.titleMode === 'auto' && message.role === 'user') {
          persistConversationMeta(conv).catch(() => {})
        }
      }
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
      if (conv) {
        persistMessageReplace(conversationId, conv.messages).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on updateMessages:',
            error
          )
          toast.error('消息更新保存失败')
        })
        // If title was auto-updated, persist metadata too
        if (conv.titleMode === 'auto') {
          persistConversationMeta(conv).catch(() => {})
        }
      }
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
      if (conv) {
        persistMessageReplace(conversationId, conv.messages).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on deleteUserMessage:',
            error
          )
          toast.error('删除消息失败')
        })
      }
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
      if (conv) {
        persistMessageReplace(conversationId, conv.messages).catch((error) => {
          console.error(
            '[conversation.store] Failed to persist conversation on deleteAgentLoop:',
            error
          )
          toast.error('删除对话轮次失败')
        })
      }
      return true
    },

    regenerateUserMessage: (conversationId, userMessageId) => {
      const state = get()
      if (state.isConversationRunning(conversationId)) {
        toast.error(i18nText('conversation.toast.stopBeforeRegenerate', '请先停止当前运行，再重新生成'))
        return
      }

      const conv = state.conversations.find((c) => c.id === conversationId)
      if (!conv) {
        toast.error(i18nText('conversation.toast.conversationMissingForRegenerate', '会话不存在，无法重新生成'))
        return
      }

      const userMsgIndex = conv.messages.findIndex((m) => m.id === userMessageId)
      if (userMsgIndex < 0) {
        toast.error(i18nText('conversation.toast.targetMessageMissing', '目标消息不存在，可能已被删除'))
        return
      }
      if (conv.messages[userMsgIndex].role !== 'user') {
        toast.error(i18nText('conversation.toast.onlyUserMessageRegenerate', '只能重新生成用户消息'))
        return
      }

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
        persistMessageReplace(conversationId, updatedConv.messages).catch((error) => {
          console.error('[conversation.store] Failed to persist on regenerate:', error)
        })
      }

      // 获取设置并执行
      const settingsState = useSettingsStore.getState()
      const provider = settingsState.providerType
      const effectiveConfig = settingsState.getEffectiveProviderConfig()
      const model = effectiveConfig?.modelName || settingsState.modelName

      if (provider && model) {
        get().runAgent(conversationId, provider, model, 8192, null)
      } else {
        toast.error(i18nText('conversation.toast.modelNotConfigured', '模型未配置，请先在设置中选择服务商和模型'))
      }
    },

    editAndResendUserMessage: (conversationId, userMessageId, newContent) => {
      const state = get()
      if (state.isConversationRunning(conversationId)) {
        toast.error(i18nText('conversation.toast.stopBeforeEditResend', '请先停止当前运行，再编辑发送'))
        return
      }

      const conv = state.conversations.find((c) => c.id === conversationId)
      if (!conv) {
        toast.error(i18nText('conversation.toast.conversationMissingForEditResend', '会话不存在，无法编辑重发'))
        return
      }

      const userMsgIndex = conv.messages.findIndex((m) => m.id === userMessageId)
      if (userMsgIndex < 0) {
        toast.error(i18nText('conversation.toast.targetMessageMissing', '目标消息不存在，可能已被删除'))
        return
      }
      if (conv.messages[userMsgIndex].role !== 'user') {
        toast.error(i18nText('conversation.toast.onlyUserMessageEditResend', '只能编辑并重发用户消息'))
        return
      }

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
        persistMessageReplace(conversationId, updatedConv.messages).catch((error) => {
          console.error('[conversation.store] Failed to persist on editAndResend:', error)
        })
      }

      // 获取设置并执行
      const settingsState = useSettingsStore.getState()
      const provider = settingsState.providerType
      const effectiveConfig = settingsState.getEffectiveProviderConfig()
      const model = effectiveConfig?.modelName || settingsState.modelName

      if (provider && model) {
        get().runAgent(conversationId, provider, model, 8192, null)
      } else {
        toast.error(i18nText('conversation.toast.modelNotConfigured', '模型未配置，请先在设置中选择服务商和模型'))
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
        // Clean up any cancelled run IDs for this conversation's active run
        const convToDelete = state.conversations.find((c) => c.id === id)
        if (convToDelete?.activeRunId) {
          state.cancelledRunIds.delete(convToDelete.activeRunId)
        }
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
        persistConversationMeta(conv).catch((error) => {
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
        let lastContextUsageMetaPersistAt = 0
        // Compression summaries are injected into the agent loop as
        // system-context messages and mirrored into the runtime message state.
        let committed = false

        // Acquire run lock immediately to prevent concurrent duplicate starts.
        useConversationRuntimeStore.setState((state) => {
          let rt = state.runtimes.get(conversationId)
          if (!rt) {
            rt = createEmptyRuntime()
            state.runtimes.set(conversationId, rt)
          }
          rt.runEpoch = (rt.runEpoch || 0) + 1
          runEpoch = rt.runEpoch
          rt.activeRunId = runId
          rt.status = 'pending'
          rt.error = null
          rt.currentToolCall = null
          rt.activeToolCalls = []
          rt.streamingToolArgs = ''
          rt.streamingToolArgsByCallId = {}
          rt.streamingContent = ''
          rt.streamingReasoning = ''
          rt.completedContent = null
          rt.completedReasoning = null
          rt.isContentStreaming = false
          rt.isReasoningStreaming = false
          rt.contextWindowUsage = null
          rt.workflowExecution = null
          rt.collectedAssets = []
          rt.draftAssistant = {
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
        // Mirror run-lock state to runtime store so streaming callbacks can guard on activeRunId
        useConversationRuntimeStore.setState((state) => {
          const r = ensureRuntime(state, conversationId)
          r.runEpoch = runEpoch
          r.activeRunId = runId
          r.status = 'pending'
          r.error = null
          r.currentToolCall = null
          r.activeToolCalls = []
          r.streamingToolArgs = ''
          r.streamingToolArgsByCallId = {}
          r.streamingContent = ''
          r.streamingReasoning = ''
          r.completedContent = null
          r.completedReasoning = null
          r.isContentStreaming = false
          r.isReasoningStreaming = false
          r.contextWindowUsage = null
          r.workflowExecution = null
          r.collectedAssets = []
          r.draftAssistant = {
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
          const rt = useConversationRuntimeStore.getState().runtimes.get(conversationId)
          return !!rt && rt.activeRunId === runId && (rt.runEpoch || 0) === runEpoch
        }

        const failRunEarly = (message: string) => {
          if (!isCurrentRun()) return
          useConversationRuntimeStore.setState((state) => {
            const r = ensureRuntime(state, conversationId)
            if (r.activeRunId !== runId) return
            r.status = 'error'
            r.error = message
            r.activeRunId = null
            r.draftAssistant = null
            r.currentToolCall = null
            r.activeToolCalls = []
            r.streamingToolArgs = ''
            r.streamingToolArgsByCallId = {}
            r.streamingContent = ''
            r.streamingReasoning = ''
          })
        }

        // Persist conversation to SQLite when a block completes (debounced).
        // Rapid block boundaries are coalesced; the final complete handler
        // will flush immediately, so at most one debounced write runs mid-stream.
        const persistAfterBlockComplete = () => {
          const current = get().conversations.find((c) => c.id === conversationId)
          if (!current) return
          persistMessageReplace(conversationId, current.messages, false).catch((err) => {
            console.warn('[conversation.store] Block-complete persist failed:', err)
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

          // Persisted: update messages in main store
          set((state) => {
            const c = state.conversations.find((x) => x.id === conversationId)
            if (!c) return
            c.messages = latestMessages
          })

          // Runtime: reset all runtime state
          useConversationRuntimeStore.setState((state) => {
            const r = ensureRuntime(state, conversationId)
            if (r.activeRunId !== runId) return
            r.status = 'idle'
            r.error = null
            r.currentToolCall = null
            r.activeToolCalls = []
            r.streamingToolArgs = ''
            r.streamingToolArgsByCallId = {}
            r.streamingContent = ''
            r.streamingReasoning = ''
            r.completedContent = null
            r.completedReasoning = null
            r.isContentStreaming = false
            r.isReasoningStreaming = false
            r.draftAssistant = null
            r.activeRunId = null
            state.agentLoops.delete(conversationId)
            state.streamingQueues.delete(conversationId)
          })

          emitComplete()
          const finalConv = get().conversations.find((c) => c.id === conversationId)
          if (finalConv) {
            persistMessageReplace(conversationId, finalConv.messages).catch((err) => {
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
          isCustomProviderType(providerType)
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
        const pendingRealRunRequest = useConversationRuntimeStore.getState().pendingWorkflowRealRuns.get(conversationId)
        if (pendingRealRunRequest) {
          useConversationRuntimeStore.setState((state) => {
            state.pendingWorkflowRealRuns.delete(conversationId)
          })

          try {
            // Create AbortController so cancelAgent can abort this workflow
            const abortController = new AbortController()
            useConversationRuntimeStore.setState((state) => {
              state.workflowAbortControllers.set(conversationId, abortController)
            })

            // Initialize workflow execution state for UI progress tracking
            const { getWorkflowTemplateBundle } = await import('@/agent/workflow/templates')
            const bundle = getWorkflowTemplateBundle(pendingRealRunRequest.templateId)
            if (bundle) {
              useConversationRuntimeStore.setState((state) => {
                const r = ensureRuntime(state, conversationId)
                if (r.activeRunId !== runId) return
                r.workflowExecution = {
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
                useConversationRuntimeStore.setState((state) => {
                  const r = ensureRuntime(state, conversationId)
                  if (r.activeRunId !== runId) return
                  r.status = 'streaming'
                  r.isContentStreaming = true
                  if (!r.workflowExecution) return
                  // Mark this node as running, set prior pending nodes that were skipped
                  for (const node of r.workflowExecution.nodes) {
                    if (node.id === nodeId) {
                      node.status = 'running'
                    }
                  }
                })
              },
              onNodeComplete: (nodeId, output) => {
                useConversationRuntimeStore.setState((state) => {
                  const r = ensureRuntime(state, conversationId)
                  if (r.activeRunId !== runId) return
                  if (!r.workflowExecution) return
                  for (const node of r.workflowExecution.nodes) {
                    if (node.id === nodeId) {
                      node.status = 'completed'
                      if (output) node.output = output
                    }
                  }
                })
              },
              onNodeError: (nodeId, error) => {
                useConversationRuntimeStore.setState((state) => {
                  const r = ensureRuntime(state, conversationId)
                  if (r.activeRunId !== runId) return
                  if (!r.workflowExecution) return
                  for (const node of r.workflowExecution.nodes) {
                    if (node.id === nodeId) {
                      node.status = 'failed'
                      node.error = error
                    }
                  }
                })
              },
              onNodeStepStart: (nodeId, stepId, stepType) => {
                useConversationRuntimeStore.setState((state) => {
                  const r = ensureRuntime(state, conversationId)
                  if (r.activeRunId !== runId || !r.workflowExecution) return
                  for (const node of r.workflowExecution.nodes) {
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
                // Write to runtime store only — avoids touching conversations[] at streaming rate
                useConversationRuntimeStore.setState((state) => {
                  const r = ensureRuntime(state, conversationId)
                  if (r.activeRunId !== runId || !r.workflowExecution) return
                  for (const node of r.workflowExecution.nodes) {
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
                // Write to runtime store only — avoids touching conversations[] at streaming rate
                useConversationRuntimeStore.setState((state) => {
                  const r = ensureRuntime(state, conversationId)
                  if (r.activeRunId !== runId || !r.workflowExecution) return
                  for (const node of r.workflowExecution.nodes) {
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
                useConversationRuntimeStore.setState((state) => {
                  const r = ensureRuntime(state, conversationId)
                  if (r.activeRunId !== runId || !r.workflowExecution) return
                  for (const node of r.workflowExecution.nodes) {
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

              // Persisted: update messages in main store
              set((state) => {
                const c = state.conversations.find((x) => x.id === conversationId)
                if (!c) return
                c.messages = latestMessages
              })

              // Runtime: reset all runtime state
              useConversationRuntimeStore.setState((state) => {
                const r = ensureRuntime(state, conversationId)
                if (r.activeRunId !== runId) return
                r.status = 'idle'
                r.error = null
                r.currentToolCall = null
                r.activeToolCalls = []
                r.streamingToolArgs = ''
                r.streamingToolArgsByCallId = {}
                r.streamingContent = ''
                r.streamingReasoning = ''
                r.completedContent = null
                r.completedReasoning = null
                r.isContentStreaming = false
                r.isReasoningStreaming = false
                r.draftAssistant = null
                r.activeRunId = null
                state.agentLoops.delete(conversationId)
                state.streamingQueues.delete(conversationId)
              })

              emitComplete()
              const finalConv = get().conversations.find((c) => c.id === conversationId)
              if (finalConv) {
                persistMessageReplace(conversationId, finalConv.messages).catch((err) => {
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
          apiMode: isCustomProviderType(providerType)
            ? settingsState.customProviders.find((p) => p.id === providerType)?.apiMode || 'chat-completions'
            : undefined,
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                r.workflowExecution = {
                  templateId: payload.templateId,
                  label: payload.label,
                  nodes: payload.nodes.map((node) => ({
                    id: node.id,
                    kind: node.kind,
                    label: node.label,
                    status: 'pending' as const,
                  })),
                  totalTokens: 0,
                  startedAt: Date.now(),
                }
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId && r.workflowExecution) {
                for (const node of r.workflowExecution.nodes) {
                  if (node.id === nodeId) {
                    node.status = 'running'
                  }
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId && r.workflowExecution) {
                for (const node of r.workflowExecution.nodes) {
                  if (node.id === nodeId) {
                    node.status = 'completed'
                    if (output) node.output = output
                  }
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId && r.workflowExecution) {
                for (const node of r.workflowExecution.nodes) {
                  if (node.id === nodeId) {
                    node.status = 'failed'
                    node.error = error
                  }
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId && r.workflowExecution) {
                if (typeof totalTokens === 'number') {
                  r.workflowExecution.totalTokens = totalTokens
                }
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
            // Helper: find the spawn_subagent/batch_spawn step in a draftAssistant
            const findSpawnStep = (draft: { activeToolStepId?: string | null; steps: DraftAssistantStep[] } | null): DraftAssistantStep | undefined => {
              if (!draft) return undefined
              // Primary: try activeToolStepId (fast path)
              if (draft.activeToolStepId) {
                const activeStep = draft.steps.find((s) => s.id === draft.activeToolStepId)
                if (activeStep && activeStep.type === 'tool_call') {
                  const name = activeStep.toolCall.function.name
                  if (name === 'spawn_subagent' || name === 'batch_spawn') return activeStep
                }
              }
              // Fallback: find most recent spawn step that is still streaming
              for (let i = draft.steps.length - 1; i >= 0; i--) {
                const step = draft.steps[i]
                if (
                  step.type === 'tool_call' &&
                  step.streaming &&
                  (step.toolCall.function.name === 'spawn_subagent' ||
                    step.toolCall.function.name === 'batch_spawn')
                ) return step
              }
              return undefined
            }
            const subagentEvent = {
              agentId: event.agentId,
              status: event.status,
              summary: event.summary,
              timestamp: event.timestamp,
            }
            // Update conversations store
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c) return
              const targetStep = findSpawnStep(c.draftAssistant)
              if (targetStep) {
                if (!targetStep.subagentEvents) targetStep.subagentEvents = []
                targetStep.subagentEvents.push(subagentEvent)
                c.updatedAt = Date.now()
              }
            })
            // Mirror to runtime store (UI reads draftAssistant from runtime store)
            useConversationRuntimeStore.setState((state) => {
              const r = state.runtimes.get(conversationId)
              if (!r) return
              const targetStep = findSpawnStep(r.draftAssistant)
              if (targetStep) {
                if (!targetStep.subagentEvents) targetStep.subagentEvents = []
                targetStep.subagentEvents.push(subagentEvent)
              }
            })
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
            askUserQuestion: async (params) => {
              const { setPendingQuestion, removePendingQuestion } =
                await import('@/store/pending-question.store')
              // Use the actual toolCallId from the LLM's tool_calls response.
              // This correlates the pending question with the UI's ToolCallDisplay.
              const toolCallId =
                params.toolCallId ?? `ask-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
              return new Promise<{ answer: string; confirmed: boolean; timed_out: boolean }>(
                (resolve) => {
                  setPendingQuestion({
                    conversationId,
                    toolCallId,
                    question: params.question,
                    type: params.type,
                    options: params.options,
                    defaultAnswer: params.defaultAnswer,
                    context: params.context,
                    resolve: (result) => {
                      removePendingQuestion(conversationId, toolCallId)
                      resolve(result)
                    },
                  })

                  // Listen for abort signal to unblock the promise on cancellation
                  if (params.signal) {
                    const onAbort = () => {
                      removePendingQuestion(conversationId, toolCallId)
                      resolve({
                        answer: params.defaultAnswer ?? 'cancelled',
                        confirmed: false,
                        timed_out: false,
                      })
                    }
                    if (params.signal.aborted) {
                      onAbort()
                    } else {
                      params.signal.addEventListener('abort', onAbort, { once: true })
                    }
                  }
                }
              )
            },
          },
          maxIterations,
          initialConvertCallCount: conv.compressionConvertCallCount ?? 0,
          initialLastSummaryConvertCall:
            conv.compressionLastSummaryConvertCall ?? Number.NEGATIVE_INFINITY,
          initialCompressionBaseline:
            conv.compressedContextSummary && conv.compressedContextCutoffTimestamp
              ? { summary: conv.compressedContextSummary, cutoffTimestamp: conv.compressedContextCutoffTimestamp }
              : null,
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
          const runtimeUsageAtFinalize =
            useConversationRuntimeStore.getState().runtimes.get(conversationId)?.contextWindowUsage ||
            null

          // Collect any assets accumulated during this agent run before overwriting messages
          const currentConv = get().conversations.find((c) => c.id === conversationId)
          const collectedAssets = currentConv?.collectedAssets?.length
            ? [...currentConv.collectedAssets]
            : undefined

          set((inner) => {
            const c = inner.conversations.find((x) => x.id === conversationId)
            if (!c) return
            if (status === 'idle') {
              c.messages = targetMessages
              if (runtimeUsageAtFinalize) {
                c.contextWindowUsage = runtimeUsageAtFinalize
                c.lastContextWindowUsage = runtimeUsageAtFinalize
              }
              // Attach collected assets to the last assistant message
              // NOTE: Must mutate via Immer draft (c.messages[i]) directly.
              // Using spread/reverse/find detaches the object from Immer's proxy,
              // resulting in "Cannot assign to read only property" error.
              if (collectedAssets && collectedAssets.length > 0) {
                for (let i = c.messages.length - 1; i >= 0; i--) {
                  if (c.messages[i].role === 'assistant') {
                    c.messages[i] = {
                      ...c.messages[i],
                      assets: collectedAssets,
                    }
                    break
                  }
                }
              }
              c.collectedAssets = []
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
            if (status === 'idle') {
              inner.cancelledRunIds.delete(runId)
            }
          })

          // Reset runtime store for this conversation
          useConversationRuntimeStore.setState((state) => {
            const r = state.runtimes.get(conversationId)
            if (r) {
              r.status = status
              r.error = error || null
              r.currentToolCall = null
              r.activeToolCalls = []
              r.streamingToolArgs = ''
              r.streamingToolArgsByCallId = {}
              r.streamingContent = ''
              r.streamingReasoning = ''
              r.completedContent = null
              r.completedReasoning = null
              r.isContentStreaming = false
              r.isReasoningStreaming = false
              r.draftAssistant = null
              r.activeRunId = null
              if (status === 'idle') {
                r.collectedAssets = []
                // Keep r.contextWindowUsage so the ContextUsageBar remains visible
                // after the agent loop finishes. It will be cleared when a new
                // run starts (runAgent).
                r.workflowExecution = null
              }
            }
          })

          if (status === 'idle') {
            emitComplete()
            const finalConv = get().conversations.find((c) => c.id === conversationId)
            if (finalConv)
              persistMessageReplace(conversationId, finalConv.messages).catch((err) => {
                console.error(
                  '[conversation.store] Failed to persist conversation on complete:',
                  err
                )
                toast.error('对话保存失败，部分内容可能丢失')
              })
            if (finalConv) {
              persistConversationMeta(finalConv).catch((err) => {
                console.warn(
                  '[conversation.store] Failed to persist context usage meta on complete:',
                  err
                )
              })
            }

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

            // Only generate follow-up on successful (non-cancelled, non-error) completion
            const runWasCancelled = get().cancelledRunIds.has(runId)
            if (!runWasCancelled) {
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
            // Clean up cancelled run ID tracking (moved inside set() above)
          }
        }

        // Reasoning streaming queue
        let fullReasoningAccumulator = ''
        const reasoningQueue = new StreamingQueue((_key: string, accumulated: string) => {
          fullReasoningAccumulator += accumulated
          // Write to runtime store only — avoids touching conversations[] at 60fps
          useConversationRuntimeStore.setState((state) => {
            const r = ensureRuntime(state, conversationId)
            if (r.activeRunId === runId) {
              r.streamingReasoning = fullReasoningAccumulator
              applyDraftAssistantEvent(r, {
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
          // Write to runtime store only — avoids touching conversations[] at 60fps
          useConversationRuntimeStore.setState((state) => {
            const r = ensureRuntime(state, conversationId)
            if (r.activeRunId === runId) {
              r.streamingContent = fullContentAccumulator
              applyDraftAssistantEvent(r, {
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                r.streamingContent = ''
                r.streamingReasoning = ''
                r.isReasoningStreaming = false
                r.completedReasoning = ''
                r.isContentStreaming = false
                r.completedContent = ''
                applyDraftAssistantEvent(r, { type: 'message_start' })
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                r.status = 'streaming'
                r.isReasoningStreaming = true
                applyDraftAssistantEvent(r, { type: 'reasoning_start' })
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                r.isReasoningStreaming = false
                r.completedReasoning = reasoning
                r.streamingReasoning = ''
                applyDraftAssistantEvent(r, {
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                r.status = 'streaming'
                r.isContentStreaming = true
                applyDraftAssistantEvent(r, { type: 'content_start' })
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                r.isContentStreaming = false
                r.completedContent = content
                r.streamingContent = ''
                applyDraftAssistantEvent(r, {
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                r.status = 'tool_calling'
                if (runWorkflowArgs?.mode === 'real_run' && !r.workflowExecution) {
                  const bundle = getWorkflowTemplateBundle(runWorkflowArgs.workflowId)
                  r.workflowExecution = {
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
                const isSameTool = r.currentToolCall?.id === tc.id
                r.currentToolCall = tc
                r.activeToolCalls = r.activeToolCalls || []
                if (!r.activeToolCalls.some((x) => x.id === tc.id)) {
                  r.activeToolCalls.push(tc)
                }
                r.streamingToolArgsByCallId = r.streamingToolArgsByCallId || {}
                if (!r.streamingToolArgsByCallId[tc.id]) {
                  r.streamingToolArgsByCallId[tc.id] = ''
                }
                applyDraftAssistantEvent(r, {
                  type: 'tool_start',
                  toolCall: tc,
                })
                if (!isSameTool) {
                  r.streamingToolArgs = ''
                  if (r.draftAssistant) {
                    r.draftAssistant.toolArgs = ''
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
            // Write to runtime store only — avoids touching conversations[] at 60fps
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId && r.draftAssistant) {
                const isCurrentToolDelta = !toolCallId || r.currentToolCall?.id === toolCallId
                if (isCurrentToolDelta) {
                  r.streamingToolArgs += argsDelta
                }
                if (toolCallId) {
                  r.streamingToolArgsByCallId = r.streamingToolArgsByCallId || {}
                  r.streamingToolArgsByCallId[toolCallId] =
                    (r.streamingToolArgsByCallId[toolCallId] || '') + argsDelta
                }
                applyDraftAssistantEvent(r, {
                  type: 'tool_delta',
                  argsDelta,
                  toolCallId,
                  isCurrentToolDelta: !!isCurrentToolDelta,
                })
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                const isCurrentTool = r.currentToolCall?.id === tc.id
                if (isCurrentTool) {
                  r.currentToolCall = null
                  r.streamingToolArgs = ''
                }
                r.activeToolCalls = (r.activeToolCalls || []).filter((x) => x.id !== tc.id)
                const hasMoreTools = (r.activeToolCalls || []).length > 0
                if (hasMoreTools) {
                  r.currentToolCall = r.activeToolCalls[r.activeToolCalls.length - 1]
                  r.streamingToolArgs =
                    (r.streamingToolArgsByCallId || {})[r.currentToolCall.id] || ''
                  r.status = 'tool_calling'
                } else {
                  r.status = 'pending'
                }
                r.streamingToolArgsByCallId = r.streamingToolArgsByCallId || {}
                applyDraftAssistantEvent(r, {
                  type: 'tool_complete',
                  toolCall: tc,
                  result: _result,
                  isCurrentTool,
                  nextToolCall: r.currentToolCall,
                  streamedArgsByCallId: r.streamingToolArgsByCallId,
                })
                delete r.streamingToolArgsByCallId[tc.id]
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                r.contextWindowUsage = {
                  usedTokens: payload.usedTokens,
                  maxTokens: payload.maxTokens,
                  reserveTokens: payload.reserveTokens,
                  usagePercent: payload.usagePercent,
                  modelMaxTokens: payload.modelMaxTokens ?? payload.maxTokens + payload.reserveTokens,
                }
              }
            })
            const now = Date.now()
            if (now - lastContextUsageMetaPersistAt >= 1000) {
              lastContextUsageMetaPersistAt = now
              const currentConv = get().conversations.find((x) => x.id === conversationId)
              if (currentConv) {
                persistConversationMeta(currentConv).catch((err) => {
                  console.warn(
                    '[conversation.store] Failed to persist context usage meta during run:',
                    err
                  )
                })
              }
            }
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                if (r.status !== 'streaming' && r.status !== 'tool_calling') {
                  r.status = 'pending'
                }
                applyDraftAssistantEvent(r, { type: 'compression_start' })
              }
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
            // Sync to runtime store
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                applyDraftAssistantEvent(r, {
                  type: 'compression_complete',
                  mode: payload.mode === 'skip' ? 'skip' : 'compress',
                })
              }
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
            latestMessages = msgs.filter((msg) => msg.kind !== 'context_summary')
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || c.activeRunId !== runId) return
              c.messages = msgs.filter((msg) => msg.kind !== 'context_summary')
              c.compressedContextSummary =
                msgs.find((msg) => msg.kind === 'context_summary')?.content || c.compressedContextSummary || null
              c.compressedContextCutoffTimestamp =
                msgs.find((msg) => msg.kind === 'context_summary')?.timestamp ||
                c.compressedContextCutoffTimestamp ||
                null
              c.updatedAt = Date.now()
            })
            // Persist immediately — this callback fires at block boundaries
            // (message_end), so it's the right time to save.
            persistAfterBlockComplete()
          },
          onComplete: async (msgs: Message[]) => {
            if (!isCurrentRun()) return
            console.info('[#LoopStop] store_onComplete', {
              conversationId,
              runId,
              messagesCount: msgs.length,
            })
            latestMessages = msgs.filter((msg) => msg.kind !== 'context_summary')
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
            // Reset runtime store on error
            useConversationRuntimeStore.setState((state) => {
              const r = state.runtimes.get(conversationId)
              if (r) {
                r.status = 'error'
                r.error = err.message
                r.activeRunId = null
                r.draftAssistant = null
              }
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
          // Reset runtime store
          useConversationRuntimeStore.setState((state) => {
            const r = state.runtimes.get(conversationId)
            if (r) {
              r.status = 'idle'
              r.activeRunId = null
              r.draftAssistant = null
            }
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
        // Reset runtime store on generic error
        useConversationRuntimeStore.setState((state) => {
          const r = state.runtimes.get(conversationId)
          if (r) {
            r.status = 'error'
            r.error = error instanceof Error ? error.message : String(error)
            r.activeRunId = null
            r.draftAssistant = null
          }
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
      // Track the run being cancelled to suppress follow-up generation
      const convBeingCancelled = get().conversations.find((c) => c.id === conversationId)
      const runIdBeingCancelled = convBeingCancelled?.activeRunId

      // Clear any pending ask_user_question entries to unblock executor promises
      import('@/store/pending-question.store')
        .then(({ clearPendingQuestions }) => {
          clearPendingQuestions(conversationId)
        })
        .catch(() => {})

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
            // Sync draft from runtime store to main store before committing
            // (streaming updates write draftAssistant to runtime store only)
            const rtDraft = useConversationRuntimeStore.getState().runtimes.get(conversationId)?.draftAssistant
            if (rtDraft && !c.draftAssistant) {
              c.draftAssistant = rtDraft
            }
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
            // Mark this run as cancelled so finalizeRun skips follow-up generation
            if (runIdBeingCancelled) {
              state.cancelledRunIds.add(runIdBeingCancelled)
            }
          }
        })
        // Reset runtime store for cancelled conversation
        useConversationRuntimeStore.setState((state) => {
          const r = state.runtimes.get(conversationId)
          if (r) {
            r.status = 'idle'
            r.error = null
            r.activeRunId = null
            r.draftAssistant = null
            r.currentToolCall = null
            r.activeToolCalls = []
            r.streamingToolArgs = ''
            r.streamingToolArgsByCallId = {}
            r.streamingContent = ''
            r.streamingReasoning = ''
            r.isContentStreaming = false
            r.isReasoningStreaming = false
            r.workflowExecution = null
          }
        })
        if (committedPartial) {
          const conv = get().conversations.find((c) => c.id === conversationId)
          if (conv)
            persistMessageReplace(conversationId, conv.messages).catch((error) => {
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
      // Reset runtime store for cancelled workflow
      useConversationRuntimeStore.setState((state) => {
        const r = state.runtimes.get(conversationId)
        if (r) {
          r.status = 'idle'
          r.error = null
          r.activeRunId = null
          r.draftAssistant = null
          r.currentToolCall = null
          r.activeToolCalls = []
          r.streamingToolArgs = ''
          r.streamingToolArgsByCallId = {}
          r.streamingContent = ''
          r.streamingReasoning = ''
          r.isContentStreaming = false
          r.isReasoningStreaming = false
          r.workflowExecution = null
        }
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
      // Clear any pending ask_user_question entries
      import('@/store/pending-question.store')
        .then(({ clearPendingQuestions }) => {
          clearPendingQuestions(id)
        })
        .catch(() => {})

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

      // Reset runtime store for this conversation
      useConversationRuntimeStore.setState((state) => {
        const r = state.runtimes.get(id)
        if (r) {
          r.status = 'idle'
          r.streamingContent = ''
          r.streamingReasoning = ''
          r.isReasoningStreaming = false
          r.completedReasoning = null
          r.isContentStreaming = false
          r.completedContent = null
          r.currentToolCall = null
          r.activeToolCalls = []
          r.streamingToolArgs = ''
          r.streamingToolArgsByCallId = {}
          r.error = null
          r.activeRunId = null
          r.draftAssistant = null
          r.contextWindowUsage = null
          r.workflowExecution = null
        }
      })
    },

    // Follow-up suggestion actions
    collectAssets: (conversationId: string, assets: import('@/types/asset').AssetMeta[]) => {
      set((state) => {
        const conv = state.conversations.find((c) => c.id === conversationId)
        if (conv) {
          if (!conv.collectedAssets) {
            conv.collectedAssets = []
          }
          conv.collectedAssets.push(...assets)
        }
      })
    },

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
