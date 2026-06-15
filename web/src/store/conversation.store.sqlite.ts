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
  MessageUsage,
  ToolCall,
  ConversationStatus,
  DraftAssistantStep,
  ContextWindowUsage,
} from '@/agent/message-types'
import type { AssetMeta } from '@/types/asset'
import {
  createAssistantMessage,
  createConversation,
  createToolMessage,
  createUserMessage,
  generateId,
} from '@/agent/message-types'
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
import { deleteAgentLoop, getAgentLoop, setAgentLoop } from './agent-loop-registry'
import {
  deleteStreamingQueues,
  getStreamingQueues,
  setStreamingQueues,
} from './streaming-queue-registry'
import {
  applyDraftAssistantEvent,
  createEmptyDraftAssistant,
} from './draft-assistant'
import { useI18nStore } from '@/i18n/store'
import { getElicitationHandler } from '@/mcp/elicitation-handler.tsx'

/** Default conversation name when title is not available */
const DEFAULT_CONVERSATION_NAME = 'New Chat'

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

  // Fallback: find the last valid (non-zero) token usage from previous
  // assistant messages. When the agent is cancelled mid-stream, the API
  // never returns final usage, so the committed draft would otherwise show
  // "input 0 output 0" in the UI.  We use the last known-good usage instead.
  let fallbackUsage: MessageUsage | undefined
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i]
    if (m.role === 'assistant' && m.usage && m.usage.totalTokens > 0) {
      fallbackUsage = m.usage
      break
    }
  }

  conv.messages.push(
    createAssistantMessage(
      draft.content || null,
      completedToolCalls.length > 0 ? completedToolCalls : undefined,
      fallbackUsage,
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

// ---------------------------------------------------------------------------
// Subagent Step Notification Handler
// Routes streaming events from subagent's internal AgentLoop to a per-agentId
// DraftAssistantState in the runtime store, enabling real-time UI rendering
// of subagent's reasoning, content, and tool calls.
// ---------------------------------------------------------------------------

function handleSubagentStepNotification(
  _conversationId: string,
  event: SubagentStepNotification
): void {
  const { agentId, step } = event

  useConversationRuntimeStore.setState((state) => {
    // Get or create draft state for this subagent
    let draft = state.subagentDrafts.get(agentId)
    if (!draft) {
      draft = createEmptyDraftAssistant()
      state.subagentDrafts.set(agentId, draft)
    }

    // Apply the step event directly to the draft state.
    // Note: Unlike the main agent (which batches deltas via StreamingQueue for
    // RAF-throttled updates), subagent steps are applied directly here.
    // Subagent streaming frequency is lower and the DraftAssistantState reducer
    // is cheap enough. If profiling shows store thrashing, a StreamingQueue can
    // be added via streaming-queue-registry keyed by agentId.
    applyDraftAssistantEvent({ draftAssistant: draft }, step)
  })
}
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
import type { SubagentTaskNotification, SubagentStepNotification } from '@/agent/tools/tool-types'

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
    compressedContextSummary: conversation.compressedContextSummary || null,
    compressedContextCutoffTimestamp: conversation.compressedContextCutoffTimestamp ?? null,
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
    compressedContextSummary: meta.compressedContextSummary || null,
    compressedContextCutoffTimestamp: meta.compressedContextCutoffTimestamp ?? null,
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

/**
 * AgentLoop callbacks are expected to provide a full conversation snapshot,
 * but under rare races we may receive a partial fragment (for example, only
 * the current turn messages). Guard against destructive regressions by
 * merging fragments with the previous in-memory snapshot.
 */
function reconcileMessageSnapshot(previous: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return previous
  if (previous.length === 0) return incoming

  const previousIds = new Set(previous.map((m) => m.id))
  const overlap = incoming.reduce((count, m) => count + (previousIds.has(m.id) ? 1 : 0), 0)
  if (overlap === incoming.length && incoming.length >= previous.length) {
    return incoming
  }

  // If there is no overlap at all, we must determine whether incoming is a
  // small fragment to append (e.g. a new tool result) or a full snapshot that
  // should replace previous (e.g. re-mapped messages with regenerated IDs
  // after a cancel). Blindly appending a full snapshot would duplicate the
  // entire conversation history.
  if (overlap === 0) {
    // If incoming is large relative to previous, treat it as a replacement
    // snapshot rather than a tiny fragment to append.
    if (previous.length > 0 && incoming.length >= previous.length * 0.5) {
      return incoming
    }
    return [...previous, ...incoming]
  }

  // Partial overlap: update matching messages and append unseen ones without
  // dropping existing history.
  const merged = previous.slice()
  const indexById = new Map(merged.map((m, idx) => [m.id, idx]))
  for (const msg of incoming) {
    const idx = indexById.get(msg.id)
    if (idx === undefined) {
      merged.push(msg)
      indexById.set(msg.id, merged.length - 1)
    } else {
      merged[idx] = msg
    }
  }
  return merged
}

function deriveContextUsageFromAssistantUsage(
  messages: Message[],
  modelMaxTokens: number,
  reserveTokens: number
): ContextWindowUsage | null {
  const latestAssistantWithUsage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.usage)
  if (!latestAssistantWithUsage?.usage) return null

  const usedTokens =
    latestAssistantWithUsage.usage.promptTokens +
    latestAssistantWithUsage.usage.completionTokens +
    (latestAssistantWithUsage.usage.cacheReadTokens ?? 0)
  const maxTokens = Math.max(1, modelMaxTokens - reserveTokens)
  const usagePercent = Math.max(0, Math.min(100, (usedTokens / maxTokens) * 100))
  return {
    usedTokens,
    maxTokens,
    reserveTokens,
    usagePercent,
    modelMaxTokens,
  }
}

/**
 * Auto-heal compression baseline for conversations created before the
 * persistence fix.  When compressedContextSummary is missing but the message
 * list contains a context_summary message, restore the baseline from it.
 *
 * Note: context_summary messages store `timestamp = cutoffTimestamp - 1`,
 * so we add 1 to recover the original cutoff.
 */
function healCompressionBaseline(conv: Conversation): void {
  if (conv.compressedContextSummary) return // already has baseline
  const summaryMsg = [...conv.messages].reverse().find((m) => m.kind === 'context_summary')
  if (!summaryMsg?.content || typeof summaryMsg.timestamp !== 'number') return
  conv.compressedContextSummary = summaryMsg.content
  conv.compressedContextCutoffTimestamp = summaryMsg.timestamp + 1
  console.info('[conversation.store] Healed compression baseline from messages', {
    conversationId: conv.id,
    summaryChars: summaryMsg.content.length,
    cutoffTimestamp: conv.compressedContextCutoffTimestamp,
  })
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

  // Live AgentLoop instances live in `@/store/agent-loop-registry` rather
  // than in this state. They are service objects with private fields that
  // cannot be immer-drafted (see registry file for the full rationale).

  // Live StreamingQueue pairs live in `@/store/streaming-queue-registry` for
  // the same reason — they are RAF-batched writers, not serializable state.

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
  invalidateCompressionBaseline: (conv: Conversation, timestamp: number) => void
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

  /** Compact conversation: generate context summary and stop (no agent loop). */
  compactConversation: (conversationId: string) => Promise<void>

  /** Generate an image from a text prompt using the /image command. */
  runImageGeneration: (conversationId: string, prompt: string, options?: { aspectRatio?: string; isRegeneration?: boolean }) => Promise<void>

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

  // Branch conversation (fork)
  branchConversation: (sourceConversationId: string, upToMessageId: string) => Promise<Conversation>

  // Emergency draft persistence (beforeunload)
  commitAndPersistRunningDrafts: () => void
}

export const useConversationStoreSQLite = create<ConversationState>()(
  immer((set, get) => ({
    conversations: [],
    activeConversationId: null,
    loaded: false,
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

        // NOTE: workspace switching is handled by syncFromRoute in App.tsx.
        // loadFromDB only loads conversation data; it does NOT call refreshWorkspaces or switchWorkspace.

        // Determine the active conversation ID from workspace store's current state.
        const workspaceStore = useConversationContextStore.getState()
        const preferredWorkspaceId = workspaceStore.activeWorkspaceId
        const activeId =
          (preferredWorkspaceId && conversations.some((c) => c.id === preferredWorkspaceId))
            ? preferredWorkspaceId
            : (workspaceStore.workspaces.find((w) =>
              conversations.some((c) => c.id === w.id)
            )?.id || null)

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
                // Auto-heal: restore compression baseline from context_summary messages
                healCompressionBaseline(conv)
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

      // NOTE: workspace switching for new conversations is handled by syncFromRoute
      // in App.tsx after the URL is updated via navigateToRoute.

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
                // Auto-heal: restore compression baseline from context_summary messages
                // for conversations created before the persistence fix.
                healCompressionBaseline(c)
              }
            })
          } catch (error) {
            console.error('[conversation.store] Failed to load messages for conversation:', error)
          }
        }
        // NOTE: workspace switching is handled by syncFromRoute in App.tsx.
        // This store only manages conversation data; it does NOT call switchWorkspace.
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

    /** Invalidate compression baseline if a message at `timestamp` falls within the compressed range. */
    invalidateCompressionBaseline: (conv, timestamp) => {
      if (
        conv.compressedContextSummary &&
        conv.compressedContextCutoffTimestamp != null &&
        timestamp < conv.compressedContextCutoffTimestamp
      ) {
        conv.compressedContextSummary = null
        conv.compressedContextCutoffTimestamp = null
        conv.messages = conv.messages.filter((m) => m.kind !== 'context_summary')
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
        const msgTimestamp = conv.messages[idx].timestamp
        conv.messages.splice(idx, 1)
        // Invalidate compression summary if the deleted message was within the compressed range
        get().invalidateCompressionBaseline(conv, msgTimestamp)
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

        const loopStartTimestamp = conv.messages[startIdx].timestamp

        const idsToDelete = new Set<string>()
        idsToDelete.add(conv.messages[startIdx].id)
        for (let i = startIdx + 1; i < conv.messages.length; i++) {
          const msg = conv.messages[i]
          if (msg.role === 'user') break
          idsToDelete.add(msg.id)
        }

        conv.messages = conv.messages.filter((msg) => !idsToDelete.has(msg.id))
        // Invalidate compression summary if the deleted loop was within the compressed range
        get().invalidateCompressionBaseline(conv, loopStartTimestamp)
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

      const userMsgTimestamp = conv.messages[userMsgIndex].timestamp

      // Find and delete all subsequent messages in the same turn (until the next user message)
      const idsToDelete = new Set<string>()
      for (let i = userMsgIndex + 1; i < conv.messages.length; i++) {
        const msg = conv.messages[i]
        if (msg.role === 'user') break
        idsToDelete.add(msg.id)
      }

      const originalContent = conv.messages[userMsgIndex]?.content?.trim()

      // If the message to regenerate is a slash command, we need to dispatch the
      // correct handler instead of just running the generic agent.
      // IMPORTANT: We must do this *BEFORE* the state update, because the handlers
      // themselves will manage the placeholder/streaming state.
      if (originalContent?.startsWith('/image')) {
        // First, clean up the old messages synchronously inside a `set`
        set((draft) => {
          const conv = draft.conversations.find((c) => c.id === conversationId)
          if (!conv) return
          if (idsToDelete.size > 0) {
            conv.messages = conv.messages.filter((m) => !idsToDelete.has(m.id))
          }
          get().invalidateCompressionBaseline(conv, userMsgTimestamp)
          conv.status = 'idle'
          conv.error = null
          conv.updatedAt = Date.now()
        })
        // Persist the cleanup
        const updatedConv = get().conversations.find((c) => c.id === conversationId)
        if (updatedConv) {
          persistMessageReplace(conversationId, updatedConv.messages).catch((error) => {
            console.error('[conversation.store] Failed to persist on regenerate (pre-image):', error)
          })
        }

        // Then, run the image generation handler
        const prompt = originalContent.slice(6).trim()
        if (prompt) {
          // Pass `isRegeneration: true` to prevent creating a duplicate user message
          get().runImageGeneration(conversationId, prompt, { isRegeneration: true })
        } else {
          toast.error(i18nText('conversation.imageGen.emptyPromptRegenerate', '图片描述为空，无法重新生成'))
        }
        return
      }

      // For non-command messages, do the cleanup and run the standard agent
      set((draft) => {
        const conv = draft.conversations.find((c) => c.id === conversationId)
        if (!conv) return

        if (idsToDelete.size > 0) {
          conv.messages = conv.messages.filter((m) => !idsToDelete.has(m.id))
        }
        get().invalidateCompressionBaseline(conv, userMsgTimestamp)
        // Reset streaming state
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

      // Persist the cleanup
      const finalConv = get().conversations.find((c) => c.id === conversationId)
      if (finalConv) {
        persistMessageReplace(conversationId, finalConv.messages).catch((error) => {
          console.error('[conversation.store] Failed to persist on regenerate:', error)
        })
      }

      if (originalContent === '/compact') {
        get().compactConversation(conversationId)
        return
      }

      // Get settings and run the standard agent flow
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

      const userMsgTimestamp = conv.messages[userMsgIndex].timestamp

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

        // Invalidate compression summary if the edited message was within the compressed range
        get().invalidateCompressionBaseline(conv, userMsgTimestamp)

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

      // If the edited message is a slash command (e.g. /compact),
      // dispatch the corresponding handler instead of runAgent.
      if (newContent.trim().startsWith('/image')) {
        const prompt = newContent.trim().slice(6).trim()
        if (prompt) {
          get().runImageGeneration(conversationId, prompt)
        } else {
          toast.error(i18nText('conversation.imageGen.emptyPrompt', '请输入图片描述，例如: /image 一只橘色的猫'))
        }
        return
      }
      if (newContent.trim() === '/compact') {
        get().compactConversation(conversationId)
        return
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

    branchConversation: async (sourceConversationId, upToMessageId) => {
      const sourceConv = get().conversations.find((c) => c.id === sourceConversationId)
      if (!sourceConv) {
        throw new Error('Source conversation not found')
      }

      // Ensure source messages are loaded
      let sourceMessages = sourceConv.messages
      if (sourceMessages.length === 0) {
        const msgRepo = getMessageRepository()
        sourceMessages = await msgRepo.findByConversation(sourceConversationId)
      }

      if (sourceMessages.length === 0) {
        throw new Error('Cannot branch an empty conversation')
      }

      // Only include messages up to (and including) the branch point
      const branchIndex = sourceMessages.findIndex((msg) => msg.id === upToMessageId)
      if (branchIndex === -1) {
        throw new Error('Branch point message not found in source conversation')
      }
      const messagesToCopy = sourceMessages.slice(0, branchIndex + 1)

      // Create a new conversation (new ID)
      const branched = createConversation()
      const sourceTitle = sourceConv.title || 'Chat'
      branched.title = `分支: ${sourceTitle}`
      branched.titleMode = 'auto'

      // Deep-copy messages with new IDs (to avoid primary key conflicts)
      const branchedMessages: Message[] = messagesToCopy.map((msg) => ({
        ...msg,
        id: generateId(),
      }))

      // Set messages on the new conversation
      branched.messages = branchedMessages

      // Add to state
      set((state) => {
        state.conversations.unshift(branched)
        state.activeConversationId = branched.id
      })

      // Persist conversation metadata
      const metaPersist = persistConversationMeta(branched)
        .catch((error) => {
          console.error('[conversation.store] Failed to persist branched conversation:', error)
          toast.error('分支对话保存失败，刷新页面后可能丢失')
          throw error
        })
        .finally(() => {
          if (pendingConversationMetaPersists.get(branched.id) === metaPersist) {
            pendingConversationMetaPersists.delete(branched.id)
          }
        })
      pendingConversationMetaPersists.set(branched.id, metaPersist)

      // Persist messages to SQLite
      const msgRepo = getMessageRepository()
      await msgRepo.insertBatch(branched.id, branchedMessages)

      // NOTE: workspace switching for branched conversations is handled by syncFromRoute
      // in App.tsx after the URL is updated via navigateToRoute.

      void metaPersist.catch(() => {})

      toast.success(i18nText('conversation.toast.branchCreated', 'Branched conversation created'))

      return branched
    },

    deleteConversation: async (id) => {
      const queues = getStreamingQueues(id)
      if (queues) {
        queues.reasoning.destroy()
        queues.content.destroy()
      }

      // Stop runtime work first to avoid continued writes while deleting persisted data.
      const agentLoop = deleteAgentLoop(id)
      if (agentLoop) {
        agentLoop.cancel()
      }
      deleteStreamingQueues(id)
      set((state) => {
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

        // Also set run state on the main conversation store so that
        // commitAndPersistRunningDrafts (used by beforeunload/pagehide handlers)
        // can correctly detect running conversations and save streaming drafts.
        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            c.activeRunId = runId
            c.runEpoch = runEpoch
            c.status = 'pending'
            c.error = null
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
          }
        })

        const isCurrentRun = () => {
          const rt = useConversationRuntimeStore.getState().runtimes.get(conversationId)
          return !!rt && rt.activeRunId === runId && (rt.runEpoch || 0) === runEpoch
        }

        const isCurrentRunEpoch = () => {
          const rt = useConversationRuntimeStore.getState().runtimes.get(conversationId)
          return !!rt && (rt.runEpoch || 0) === runEpoch
        }

        const failRunEarly = (message: string) => {
          if (!isCurrentRun()) return
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c && c.activeRunId === runId) {
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
            }
          })
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

          // Persist messages on early failure so that historical messages
          // (including the user message that triggered this run) are not lost
          // if the user refreshes the page.
          const errorConv = get().conversations.find((c) => c.id === conversationId)
          if (errorConv) {
            persistMessageReplace(conversationId, errorConv.messages).catch((err) => {
              console.error('[conversation.store] Failed to persist on failRunEarly:', err)
            })
          }
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
          deleteAgentLoop(conversationId)
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
          })

          emitComplete()
          const finalConv = get().conversations.find((c) => c.id === conversationId)
          if (finalConv) {
            persistMessageReplace(conversationId, finalConv.messages).catch((err) => {
              console.error('[conversation.store] Failed to persist workflow dry-run:', err)
              toast.error('对话保存失败，部分内容可能丢失')
            })
          }
          deleteStreamingQueues(conversationId)

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
        let resolvedProjectId: string | null = null
        let activeAgentId: string | null = null
        let knownAgentIds: Set<string> | null = null

        try {
          const { getWorkspaceRepository } =
            await import('@/sqlite/repositories/workspace.repository')
          const workspace = await getWorkspaceRepository().findWorkspaceById(conversationId)
          resolvedProjectId = workspace?.projectId || null
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
                  projectId: resolvedProjectId ?? null,
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
              deleteAgentLoop(conversationId)
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
              })

              emitComplete()
              const finalConv = get().conversations.find((c) => c.id === conversationId)
              if (finalConv) {
                persistMessageReplace(conversationId, finalConv.messages).catch((err) => {
                  console.error('[conversation.store] Failed to persist workflow real-run:', err)
                  toast.error('对话保存失败，部分内容可能丢失')
                })
              }
              deleteStreamingQueues(conversationId)
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

        // Resolve OPFS workspace dir for subagent transcript storage
        let subagentGetWorkspaceDir: (() => Promise<FileSystemDirectoryHandle>) | undefined
        try {
          const { getWorkspaceManager } = await import('@/opfs')
          const wsManager = await getWorkspaceManager()
          const wsRuntime = await wsManager.getWorkspace(conversationId)
          if (wsRuntime) {
            subagentGetWorkspaceDir = async () => wsRuntime.workspaceDir
          }
        } catch {
          // Transcript storage is optional — subagent continues without it
        }

        const subagentRuntime = getOrCreateSubagentRuntime({
          workspaceId: conversationId,
          provider,
          toolRegistry,
          contextManager,
          baseToolContext: {
            directoryHandle,
            workspaceId: conversationId,
            projectId: resolvedProjectId,
            currentAgentId: activeAgentId,
            agentMode,
          },
          getWorkspaceDir: subagentGetWorkspaceDir,
          onNotification: (event: SubagentTaskNotification | SubagentStepNotification) => {
            // ── Route step_notification events to subagent draft state ──
            if (event.event_type === 'step_notification') {
              handleSubagentStepNotification(conversationId, event)
              return
            }

            // ── Handle task_notification (status updates) ──
            // Helper: find the spawn_subagent/batch_spawn step in a draftAssistant
            const findSpawnStep = (draft: { activeToolStepId?: string | null; steps: DraftAssistantStep[] } | null): Extract<DraftAssistantStep, { type: 'tool_call' }> | undefined => {
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
            projectId: resolvedProjectId,
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

        setAgentLoop(conversationId, agentLoop)

        const currentMessages = conv.messages

        const finalizeRun = async (
          status: ConversationStatus,
          finalMessages?: Message[],
          error?: string
        ) => {
          // If already committed, nothing to do
          if (committed) return
          // Unregister the live loop up front; the rest of finalize only
          // touches persisted state.
          deleteAgentLoop(conversationId)

          // Only the current run is allowed to commit message state.
          // Stale callbacks from prior runs (e.g. after project/workspace switch
          // or elicitation-triggered nested run) must never overwrite UI history.
          const current = get().conversations.find((c) => c.id === conversationId)
          const isRunCurrent =
            !!current && current.activeRunId === runId && (current.runEpoch || 0) === runEpoch
          const isSameEpoch = !!current && (current.runEpoch || 0) === runEpoch
          if (!isRunCurrent && !isSameEpoch) {
            console.info('[conversation.store] skip finalize from stale run', {
              conversationId,
              runId,
              status,
            })
            return
          }

          committed = true
          const currentSnapshot = get().conversations.find((c) => c.id === conversationId)?.messages || []
          const targetMessages = reconcileMessageSnapshot(currentSnapshot, finalMessages || latestMessages)
          const derivedUsageAtFinalize = deriveContextUsageFromAssistantUsage(
            targetMessages,
            provider.maxContextTokens,
            maxTokens
          )
          const usageAtFinalize = derivedUsageAtFinalize

          // Collect any assets accumulated during this agent run before overwriting messages
          const currentConv = get().conversations.find((c) => c.id === conversationId)
          const collectedAssets = currentConv?.collectedAssets?.length
            ? [...currentConv.collectedAssets]
            : undefined

          // targetMessages may come from an Immer-frozen source.
          // Build a fresh array/object snapshot before putting it back into state.
          const finalizedMessages =
            status === 'idle' && collectedAssets && collectedAssets.length > 0
              ? (() => {
                  const cloned = targetMessages.slice()
                  for (let i = cloned.length - 1; i >= 0; i--) {
                    if (cloned[i].role === 'assistant') {
                      cloned[i] = {
                        ...cloned[i],
                        assets: collectedAssets,
                      }
                      break
                    }
                  }
                  return cloned
                })()
              : targetMessages

          set((inner) => {
            const c = inner.conversations.find((x) => x.id === conversationId)
            if (!c) return
            if (status === 'idle') {
              c.messages = finalizedMessages
              if (usageAtFinalize) {
                c.contextWindowUsage = usageAtFinalize
                c.lastContextWindowUsage = usageAtFinalize
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
            if (status === 'idle') {
              inner.cancelledRunIds.delete(runId)
            }
          })
          deleteStreamingQueues(conversationId)

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
                if (usageAtFinalize) {
                  r.contextWindowUsage = usageAtFinalize
                }
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

            // Refresh asset inventory so the AssetsPopover badge stays up-to-date
            try {
              const { useAssetInventoryStore } = await import('@/store/asset-inventory.store')
              useAssetInventoryStore.getState().refresh().catch(() => {})
            } catch {
              // Non-critical — asset inventory refresh failure should not affect the loop
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

        setStreamingQueues(conversationId, {
          reasoning: reasoningQueue,
          content: contentQueue,
        })

        const cleanupQueues = () => {
          reasoningQueue.destroy()
          contentQueue.destroy()
          deleteStreamingQueues(conversationId)
        }

        // Clear iteration limit flag from any previous run
        useConversationRuntimeStore.setState((state) => {
          const r = state.runtimes.get(conversationId)
          if (r) {
            r.iterationLimitReached = null
          }
        })

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

            // ── Auto-refresh agents list when write/delete tools touch agents/ directory ──
            // Detects paths like vfs://agents/{id}/... and refreshes useAgentsStore so the
            // @-mention dropdown picks up newly created agents without a page reload.
            try {
              const toolName = tc.function.name
              if (toolName === 'write' || toolName === 'delete') {
                const args = JSON.parse(tc.function.arguments)
                const paths: string[] = args.path
                  ? [args.path]
                  : Array.isArray(args.files)
                    ? args.files.map((f: { path: string }) => f.path)
                    : Array.isArray(args.paths)
                      ? args.paths
                      : []
                const touchesAgents = paths.some((p: string) => {
                  const norm = p.replace(/^vfs:\/\/workspace\//, '')
                  return norm.startsWith('agents/') || p.startsWith('vfs://agents/')
                })
                if (touchesAgents) {
                  import('./agents.store').then(({ useAgentsStore }) => {
                    useAgentsStore.getState().refreshAgents()
                  })
                }
              }
            } catch {
              // Best-effort: never let agent-refresh failure break tool completion
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
              deleteAgentLoop(conversationId)
              set((state) => {
                const c = state.conversations.find((c) => c.id === conversationId)
                if (c) {
                  c.status = 'idle'
                  c.error = null
                  c.activeRunId = null
                  c.draftAssistant = null
                }
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

              deleteAgentLoop(conversationId)
              set((state) => {
                const c = state.conversations.find((c) => c.id === conversationId)
                if (c) {
                  c.status = 'error'
                  c.error = errorMsg
                }
              })
              emitError(errorMsg)
            }
          },
          onMessagesUpdated: (msgs: Message[]) => {
            if (!isCurrentRun() && !isCurrentRunEpoch()) return
            const previous = get().conversations.find((x) => x.id === conversationId)?.messages || []
            const reconciled = reconcileMessageSnapshot(previous, msgs)
            latestMessages = reconciled
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || (c.runEpoch || 0) !== runEpoch) return
              c.messages = reconciled
              c.compressedContextSummary =
                reconciled.find((msg) => msg.kind === 'context_summary')?.content || c.compressedContextSummary || null
              c.compressedContextCutoffTimestamp =
                reconciled.find((msg) => msg.kind === 'context_summary')?.timestamp ||
                c.compressedContextCutoffTimestamp ||
                null
              c.updatedAt = Date.now()
              // Evict draft entries already committed to messages.
              // This prevents commitDraftToMessages (cancel path) from duplicating them.
              if (c.draftAssistant) {
                // Clean up tool calls/results already in committed messages
                const committedToolCallIds = new Set(
                  reconciled
                    .filter((m) => m.role === 'assistant' && m.toolCalls)
                    .flatMap((m) => m.toolCalls!.map((tc) => tc.id))
                )
                if (committedToolCallIds.size > 0) {
                  c.draftAssistant.toolCalls = c.draftAssistant.toolCalls.filter(
                    (tc) => !committedToolCallIds.has(tc.id)
                  )
                  for (const id of committedToolCallIds) {
                    delete c.draftAssistant.toolResults[id]
                  }
                }
                // Clean up reasoning/content already in committed messages.
                // The last committed assistant message carries the full text and
                // reasoning from this iteration — subsequent commits must not replay them.
                const lastAssistant = [...reconciled].reverse().find((m) => m.role === 'assistant')
                if (lastAssistant) {
                  if (lastAssistant.reasoning) {
                    c.draftAssistant.reasoning = ''
                  }
                  if (lastAssistant.content) {
                    c.draftAssistant.content = ''
                  }
                }
                // Remove completed steps whose content is now in committed messages
                c.draftAssistant.steps = c.draftAssistant.steps.filter((s) => {
                  if (s.streaming) return true
                  if (s.type === 'tool_call' && committedToolCallIds.has(s.toolCall.id)) return false
                  if ((s.type === 'reasoning' || s.type === 'content') && lastAssistant) return false
                  return true
                })
              }
            })
            const latestAssistant = [...reconciled]
              .reverse()
              .find((m) => m.role === 'assistant' && m.usage)
            if (latestAssistant?.usage) {
              const modelMaxTokens = provider.maxContextTokens
              const reserveTokens = maxTokens
              const maxInputTokens = Math.max(1, modelMaxTokens - reserveTokens)
              const usedTokens =
                latestAssistant.usage.totalTokens ??
                latestAssistant.usage.promptTokens + latestAssistant.usage.completionTokens
              const usagePercent = Math.max(0, Math.min(100, (usedTokens / modelMaxTokens) * 100))
              const usage: ContextWindowUsage = {
                usedTokens,
                maxTokens: maxInputTokens,
                reserveTokens,
                usagePercent,
                modelMaxTokens,
              }
              set((state) => {
                const c = state.conversations.find((x) => x.id === conversationId)
                if (!c || (c.runEpoch || 0) !== runEpoch) return
                c.contextWindowUsage = usage
                c.lastContextWindowUsage = usage
              })
              useConversationRuntimeStore.setState((state) => {
                const r = ensureRuntime(state, conversationId)
                if ((r.runEpoch || 0) === runEpoch) {
                  r.contextWindowUsage = usage
                }
              })
            }
            // Persist immediately — this callback fires at block boundaries
            // (message_end), so it's the right time to save.
            persistAfterBlockComplete()
            // Sync draft eviction to runtime store
            const committedIds = new Set(
              reconciled
                .filter((m) => m.role === 'assistant' && m.toolCalls)
                .flatMap((m) => m.toolCalls!.map((tc) => tc.id))
            )
            const lastAssistantMsg = [...reconciled].reverse().find((m) => m.role === 'assistant')
            if (committedIds.size > 0 || lastAssistantMsg) {
              useConversationRuntimeStore.setState((state) => {
                const r = state.runtimes.get(conversationId)
                if (r?.draftAssistant && (r.runEpoch || 0) === runEpoch) {
                  if (committedIds.size > 0) {
                    r.draftAssistant.toolCalls = r.draftAssistant.toolCalls.filter(
                      (tc) => !committedIds.has(tc.id)
                    )
                    for (const id of committedIds) {
                      delete r.draftAssistant.toolResults[id]
                    }
                  }
                  if (lastAssistantMsg) {
                    if (lastAssistantMsg.reasoning) {
                      r.draftAssistant.reasoning = ''
                    }
                    if (lastAssistantMsg.content) {
                      r.draftAssistant.content = ''
                    }
                  }
                  r.draftAssistant.steps = r.draftAssistant.steps.filter((s) => {
                    if (s.streaming) return true
                    if (s.type === 'tool_call' && committedIds.has(s.toolCall.id)) return false
                    if ((s.type === 'reasoning' || s.type === 'content') && lastAssistantMsg) return false
                    return true
                  })
                }
              })
            }
          },
          onComplete: async (msgs: Message[]) => {
            if (!isCurrentRun() && !isCurrentRunEpoch()) return
            const previous = get().conversations.find((x) => x.id === conversationId)?.messages || []
            const reconciled = reconcileMessageSnapshot(previous, msgs)
            console.info('[#LoopStop] store_onComplete', {
              conversationId,
              runId,
              messagesCount: reconciled.length,
            })
            latestMessages = reconciled
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
            deleteAgentLoop(conversationId)
            deleteStreamingQueues(conversationId)
            set((inner) => {
              const c = inner.conversations.find((x) => x.id === conversationId)
              if (c && c.activeRunId === runId) {
                c.status = 'error'
                c.error = err.message
                c.activeRunId = null
                c.draftAssistant = null
              }
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
            // Persist messages on error so that historical messages are not lost
            // on page refresh. Without this, only the in-memory store retains
            // messages after an LLM error.
            const errorConv = get().conversations.find((x) => x.id === conversationId)
            if (errorConv) {
              persistMessageReplace(conversationId, errorConv.messages).catch((persistErr) => {
                console.error('[conversation.store] Failed to persist on onError:', persistErr)
              })
            }
            emitError(err.message)
          },
          onIterationLimitReached: (limit: number) => {
            if (!isCurrentRun()) return
            console.info('[#LoopStop] iteration_limit_reached', {
              conversationId,
              runId,
              limit,
            })
            useConversationRuntimeStore.setState((state) => {
              const r = state.runtimes.get(conversationId)
              if (r) {
                r.iterationLimitReached = limit
              }
            })
          },
        })
        latestMessages = resultMessages
        await finalizeRun('idle', latestMessages)
      } catch (error) {
        const queues = getStreamingQueues(conversationId)
        if (queues) {
          queues.reasoning.destroy()
          queues.content.destroy()
        }
        deleteStreamingQueues(conversationId)

        if (error instanceof Error && error.name === 'AbortError') {
          deleteAgentLoop(conversationId)
          deleteStreamingQueues(conversationId)
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c) {
              c.status = 'idle'
              c.activeRunId = null
              c.draftAssistant = null
            }
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
          // Do NOT return here — fall through to consume queued messages
          // so that messages enqueued during the cancelled run are processed.
        } else {
          deleteAgentLoop(conversationId)
          deleteStreamingQueues(conversationId)
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c) {
              c.status = 'error'
              c.error = error instanceof Error ? error.message : String(error)
              c.activeRunId = null
              c.draftAssistant = null
            }
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
          // Persist messages on generic error to prevent data loss on page refresh
          const catchConv = get().conversations.find((c) => c.id === conversationId)
          if (catchConv) {
            persistMessageReplace(conversationId, catchConv.messages).catch((persistErr) => {
              console.error('[conversation.store] Failed to persist on catch:', persistErr)
            })
          }
        } // end else (non-AbortError path — errors do NOT consume queue)
      }

      // ── Consume queued messages ──
      // After a successful (idle) run, check if messages were queued during execution.
      // If so, dequeue the next one and trigger a new agent run.
      const finalStatus = get().conversations.find((c) => c.id === conversationId)?.status
      if (finalStatus === 'idle') {
        const nextMsg = useConversationRuntimeStore.getState().dequeueMessage(conversationId)
        if (nextMsg) {
          const userMsg = createUserMessage(nextMsg.text, nextMsg.assets)
          const currentConv = get().conversations.find((c) => c.id === conversationId)
          if (currentConv) {
            get().updateMessages(conversationId, [...currentConv.messages, userMsg])
            // Schedule the next run on the next microtask to avoid re-entrancy
            const { useAgentStore } = await import('./agent.store')
            const { directoryHandle: dh } = useAgentStore.getState()
            queueMicrotask(() => {
              get().runAgent(
                conversationId,
                providerType,
                modelName,
                maxTokens,
                dh,
                nextMsg.agentOverrideId ?? null,
              )
            })
          }
        }
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

      const agentLoop = getAgentLoop(conversationId)
      if (agentLoop) {
        agentLoop.cancel()
        const queues = getStreamingQueues(conversationId)
        if (queues) {
          queues.reasoning.flushNow()
          queues.content.flushNow()
          queues.reasoning.destroy()
          queues.content.destroy()
        }
        deleteStreamingQueues(conversationId)

        // Commit draft to conversation messages BEFORE aborting the agent loop.
        // This ensures the draft is in c.messages when finalizeRun runs.
        let committedPartial = false
        deleteAgentLoop(conversationId)
        set((state) => {
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
            // Bump epoch so late callbacks from the cancelled run are ignored.
            c.runEpoch = (c.runEpoch || 0) + 1
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

      const queues = getStreamingQueues(conversationId)
      if (queues) {
        queues.reasoning.flushNow()
        queues.content.flushNow()
        queues.reasoning.destroy()
        queues.content.destroy()
      }
      deleteStreamingQueues(conversationId)

      set((state) => {
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

    // ── Compact conversation ──
    compactConversation: async (conversationId: string) => {
      const state = get()
      if (state.isConversationRunning(conversationId)) {
        toast.error(i18nText('conversation.toast.stopBeforeCompact', '请等待当前任务完成'))
        return
      }

      const conv = state.conversations.find((c) => c.id === conversationId)
      if (!conv) {
        toast.error(i18nText('conversation.toast.conversationMissing', '会话不存在'))
        return
      }

      // Nothing to compress if only user messages (or empty)
      const compressibleMessages = conv.messages.filter(
        (m) => m.kind !== 'context_summary' && m.role !== 'user',
      )
      if (compressibleMessages.length === 0) {
        toast.info(i18nText('conversation.toast.nothingToCompact', '没有可压缩的上下文'))
        return
      }

      // 1. Add "/compact" as a user message — reuse existing one if the last
      //    message is already "/compact" (e.g. regenerated via context menu).
      const { createUserMessage } = await import('@/agent/message-types')
      const lastMsg = conv.messages[conv.messages.length - 1]
      const lastIsCompact = lastMsg?.role === 'user' && lastMsg?.content?.trim() === '/compact'
      const compactUserMsg = lastIsCompact ? lastMsg : createUserMessage('/compact')
      const messagesBeforeCompact = lastIsCompact ? conv.messages : [...conv.messages, compactUserMsg]
      if (!lastIsCompact) {
        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            c.messages = messagesBeforeCompact
            c.updatedAt = Date.now()
          }
        })
        persistMessageReplace(conversationId, messagesBeforeCompact).catch((err) => {
          console.error('[conversation.store] Failed to persist /compact user message:', err)
        })
      }

      // 2. Create provider / contextManager / toolRegistry (same as runAgent)
      const settingsState = useSettingsStore.getState()
      const { hasApiKey: hasKey, providerType: pType, modelName: mName } = settingsState
      if (!hasKey) {
        toast.error(i18nText('conversation.toast.noApiKey', '未配置 API Key'))
        return
      }

      const effectiveConfig = settingsState.getEffectiveProviderConfig()

      // Resolve provider config (same logic as runAgent — handles custom providers)
      const providerConfig =
        isCustomProviderType(pType)
          ? effectiveConfig
          : {
              apiKeyProviderKey: pType,
              baseUrl: LLM_PROVIDER_CONFIGS[pType]?.baseURL,
              modelName: mName || LLM_PROVIDER_CONFIGS[pType]?.modelName,
            }

      if (!providerConfig?.baseUrl || !providerConfig.modelName) {
        toast.error(i18nText('conversation.toast.noApiKey', '未配置 API Key'))
        return
      }

      const apiKeyRepo = getApiKeyRepository()
      const apiKey = await apiKeyRepo.load(providerConfig.apiKeyProviderKey)
      if (!apiKey) {
        toast.error(i18nText('conversation.toast.noApiKey', '未配置 API Key'))
        return
      }

      const provider = createLLMProvider({
        apiKey,
        providerType: pType,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.modelName,
        apiMode: isCustomProviderType(pType)
          ? settingsState.customProviders.find((p) => p.id === pType)?.apiMode || 'chat-completions'
          : undefined,
      })

      const maxTokens = settingsState.maxTokens || 4096
      const contextManager = new ContextManager({
        maxContextTokens: provider.maxContextTokens,
        reserveTokens: maxTokens,
        enableSummarization: true,
        maxMessageGroups: provider.maxContextTokens >= 200000 ? 80 : 50,
      })

      const toolRegistry = getToolRegistry()
      const { useAgentStore } = await import('@/store/agent.store')
      const directoryHandle = useAgentStore.getState().directoryHandle || null

      const agentLoop = new AgentLoop({
        provider,
        toolRegistry,
        contextManager,
        toolContext: {
          directoryHandle,
          workspaceId: conversationId,
          projectId: undefined,
          currentAgentId: 'default',
          agentMode: 'act',
        },
        maxIterations: 1,
        initialConvertCallCount: conv.compressionConvertCallCount ?? 0,
        initialLastSummaryConvertCall: conv.compressionLastSummaryConvertCall ?? Number.NEGATIVE_INFINITY,
        initialCompressionBaseline:
          conv.compressedContextSummary && conv.compressedContextCutoffTimestamp
            ? { summary: conv.compressedContextSummary, cutoffTimestamp: conv.compressedContextCutoffTimestamp }
            : null,
        onCompressionStateUpdate: (compressionState) => {
          set((state) => {
            const c = state.conversations.find((x) => x.id === conversationId)
            if (!c) return
            c.compressionConvertCallCount = compressionState.convertCallCount
            c.compressionLastSummaryConvertCall = compressionState.lastSummaryConvertCall
          })
        },
        onLoopComplete: async () => {
          const { useConversationContextStore } = await import('@/store/conversation-context.store')
          await useConversationContextStore.getState().refreshPendingChanges()
        },
      })

      // 3. Acquire run lock (simplified version of runAgent)
      const runId = `${Date.now()}-compact-${Math.random().toString(36).slice(2, 10)}`
      let runEpoch = 0
      let committed = false

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

      // Register the agentLoop so cancelAgent can find and abort it
      setAgentLoop(conversationId, agentLoop)
      set((state) => {
        const c = state.conversations.find((c) => c.id === conversationId)
        if (c) {
          c.activeRunId = runId
          c.runEpoch = runEpoch
          c.status = 'pending'
          c.error = null
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
        }
      })

      const isCurrentRun = () => {
        const rt = useConversationRuntimeStore.getState().runtimes.get(conversationId)
        return !!rt && rt.activeRunId === runId && (rt.runEpoch || 0) === runEpoch
      }

      const emitCompactEvent = (payload: Record<string, unknown>) => {
        emitCompressionEvent(payload as any)
      }

      // 4. Run compact — generate summary and update compression baseline only.
      //    IMPORTANT: We do NOT replace c.messages with the compacted result.
      //    The UI must keep showing the full history.  The compressed summary is
      //    stored in c.compressedContextSummary / c.compressedContextCutoffTimestamp
      //    so that the next LLM call automatically uses the trimmed context via
      //    applyCompressionBaseline().
      try {
        const resultMessages = await agentLoop.runCompactOnly(messagesBeforeCompact, {
          onContextCompressionStart: (payload) => {
            if (!isCurrentRun()) return
            emitCompactEvent({ phase: 'start', ...payload })
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (c && c.activeRunId === runId) {
                applyDraftAssistantEvent(c, { type: 'compression_start' })
              }
            })
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                applyDraftAssistantEvent(r, { type: 'compression_start' })
              }
            })
          },
          onContextCompressionComplete: (payload) => {
            if (!isCurrentRun()) return
            emitCompactEvent({ phase: 'complete', ...payload })
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (c && c.activeRunId === runId) {
                applyDraftAssistantEvent(c, {
                  type: 'compression_complete',
                  mode: payload.mode === 'skip' ? 'skip' : 'compress',
                })
              }
            })
            useConversationRuntimeStore.setState((state) => {
              const r = ensureRuntime(state, conversationId)
              if (r.activeRunId === runId) {
                applyDraftAssistantEvent(r, {
                  type: 'compression_complete',
                  mode: payload.mode === 'skip' ? 'skip' : 'compress',
                })
              }
            })
          },
          onMessagesUpdated: (msgs) => {
            // Do NOT replace c.messages — only update compression baseline state.
            // The compacted message list is for the LLM, not for the UI.
            if (!isCurrentRun()) return
            // messages persisted via onMessagesUpdated callback
            set((state) => {
              const c = state.conversations.find((x) => x.id === conversationId)
              if (!c || (c.runEpoch || 0) !== runEpoch) return
              // Only update compression metadata — keep original messages intact
              const summaryMsg = msgs.find((msg) => msg.kind === 'context_summary')
              if (summaryMsg) {
                c.compressedContextSummary = summaryMsg.content || c.compressedContextSummary || null
                c.compressedContextCutoffTimestamp =
                  typeof summaryMsg.timestamp === 'number' ? summaryMsg.timestamp : c.compressedContextCutoffTimestamp || null
              }
              c.updatedAt = Date.now()
            })
          },
          onError: (error) => {
            console.error('[conversation.store] compactConversation error:', error)
            toast.error(i18nText('conversation.toast.compactFailed', '压缩失败：') + error.message)
          },
        })

        // 5. Finalize — keep original messages + append a visible summary message
        if (!committed) {
          committed = true
          // Extract the summary message from resultMessages to show in UI.
          // Keep ALL original messages intact (no history loss), just add the summary at the end.
          const summaryMsg = resultMessages.find((m) => m.kind === 'context_summary')
          const finalMessages = summaryMsg
            ? [...messagesBeforeCompact, summaryMsg]
            : messagesBeforeCompact
          deleteAgentLoop(conversationId)
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c) {
              c.messages = finalMessages
              c.status = 'idle'
              c.error = null
              c.activeRunId = null
              c.draftAssistant = null
              c.updatedAt = Date.now()
            }
          })
          useConversationRuntimeStore.setState((state) => {
            const r = ensureRuntime(state, conversationId)
            if (r.activeRunId === runId) {
              r.status = 'idle'
              r.error = null
              r.activeRunId = null
              r.draftAssistant = null
            }
          })
          persistMessageReplace(conversationId, finalMessages).catch((err) => {
            console.error('[conversation.store] Failed to persist after compact:', err)
          })
        }
      } catch (error) {
        if (!committed) {
          committed = true
          const errorMsg = error instanceof Error ? error.message : String(error)
          deleteAgentLoop(conversationId)
          set((state) => {
            const c = state.conversations.find((c) => c.id === conversationId)
            if (c) {
              c.status = 'error'
              c.error = errorMsg
              c.activeRunId = null
              c.draftAssistant = null
            }
          })
          useConversationRuntimeStore.setState((state) => {
            const r = ensureRuntime(state, conversationId)
            if (r.activeRunId === runId) {
              r.status = 'error'
              r.error = errorMsg
              r.activeRunId = null
              r.draftAssistant = null
            }
          })
        }
      }
    },

    // ── Image generation (/image command) ──
    runImageGeneration: async (conversationId: string, prompt: string, options?: { aspectRatio?: string; isRegeneration?: boolean }) => {
      const state = get()
      if (state.isConversationRunning(conversationId)) {
        toast.error(i18nText('conversation.imageGen.waitRunning', '请等待当前任务完成'))
        return
      }

      const conv = state.conversations.find((c) => c.id === conversationId)
      if (!conv) return

      // 1. Resolve provider config (reuse same logic as runAgent)
      const settingsState = useSettingsStore.getState()
      const effectiveConfig = settingsState.getEffectiveProviderConfig()
      if (!effectiveConfig) {
        toast.error(i18nText('conversation.imageGen.configureProvider', '请先配置服务商'))
        return
      }

      const apiKeyRepo = getApiKeyRepository()
      const apiKey = await apiKeyRepo.load(effectiveConfig.apiKeyProviderKey)
      if (!apiKey) {
        toast.error(i18nText('conversation.imageGen.apiKeyMissing', 'API Key 未设置，请先在设置中配置'))
        return
      }

      // 2. Create user message (if not regenerating) and placeholder assistant message
      const { createUserMessage, createAssistantMessage } = await import('@/agent/message-types')
      const { normalizeBaseUrl } = await import('@/agent/llm/pi-ai-url-utils')

      let newMessages = [...conv.messages]
      if (!options?.isRegeneration) {
        const userMsg = createUserMessage(`/image ${prompt}`)
        newMessages.push(userMsg)
      }

      const assistantMsg = createAssistantMessage(i18nText('conversation.imageGen.generating', '正在生成图片...'))
      newMessages.push(assistantMsg)

      set((state) => {
        const c = state.conversations.find((c) => c.id === conversationId)
        if (c) {
          c.messages = newMessages
          c.status = 'streaming'
          c.updatedAt = Date.now()
        }
      })

      // Persist user + placeholder messages
      persistMessageReplace(conversationId, newMessages).catch((err) => {
        console.error('[conversation.store] Failed to persist image gen messages:', err)
      })

      // 3. Set runtime streaming state
      useConversationRuntimeStore.setState((state) => {
        const r = ensureRuntime(state, conversationId)
        r.status = 'streaming'
        r.isContentStreaming = true
        r.streamingContent = i18nText('conversation.imageGen.generating', '正在生成图片...')
      })

      // 4. Call image generation
      try {
        const { generateImage } = await import('@/agent/llm/image-gen')
        const imageModelId = settingsState.imageGenModel || 'google/gemini-2.5-flash-image'
        const aspectRatio = options?.aspectRatio || settingsState.imageGenAspectRatio || '1:1'
        const result = await generateImage(prompt, {
          apiKey,
          baseUrl: normalizeBaseUrl(effectiveConfig.baseUrl),
          modelId: imageModelId,
          providerKey: effectiveConfig.apiKeyProviderKey,
          aspectRatio,
        })

        // 5. Parse result
        const textParts: string[] = []
        const images: Array<{ data: string; mimeType: string }> = []
        for (const block of result.output) {
          if (block.type === 'text') textParts.push(block.text)
          if (block.type === 'image' && block.data && block.mimeType) {
            images.push({ data: block.data, mimeType: block.mimeType })
          }
        }

        if (result.stopReason === 'error') {
          throw new Error(result.errorMessage || i18nText('conversation.imageGen.failed', '图片生成失败').replace('{error}', ''))
        }

        // 6. Update assistant message with images
        const contentText = textParts.join('') || (images.length > 0 ? i18nText('conversation.imageGen.generated', '已生成图片') : i18nText('conversation.imageGen.noResult', '图片生成完成（无结果）'))
        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            const msgIdx = c.messages.findIndex((m) => m.id === assistantMsg.id)
            if (msgIdx >= 0) {
              const newMessages = [...c.messages]
              newMessages[msgIdx] = {
                ...newMessages[msgIdx],
                content: contentText,
                images: images.length > 0 ? images : undefined,
                updatedAt: Date.now(),
              }
              c.messages = newMessages
            }
            c.status = 'idle'
            c.updatedAt = Date.now()
          }
        })

        // Persist updated messages
        const updatedConv = get().conversations.find((c) => c.id === conversationId)
        if (updatedConv) {
          persistMessageReplace(conversationId, updatedConv.messages).catch((err) => {
            console.error('[conversation.store] Failed to persist image result:', err)
          })
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : i18nText('conversation.imageGen.failed', '图片生成失败').replace('{error}', '')
        console.error('[conversation.store] Image generation error:', error)

        set((state) => {
          const c = state.conversations.find((c) => c.id === conversationId)
          if (c) {
            const msgIdx = c.messages.findIndex((m) => m.id === assistantMsg.id)
            if (msgIdx >= 0) {
              c.messages[msgIdx] = {
                ...c.messages[msgIdx],
                content: i18nText('conversation.imageGen.failed', '图片生成失败').replace('{error}', errorMsg),
              }
            }
            c.status = 'idle'
            c.error = errorMsg
            c.updatedAt = Date.now()
          }
        })

        toast.error(i18nText('conversation.imageGen.failed', '图片生成失败').replace('{error}', errorMsg))
      } finally {
        // Reset runtime state
        useConversationRuntimeStore.setState((state) => {
          const r = ensureRuntime(state, conversationId)
          r.status = 'idle'
          r.isContentStreaming = false
          r.streamingContent = ''
        })
      }
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

    /**
     * Emergency draft persistence for beforeunload.
     *
     * When the page is about to close/refresh, this commits any in-flight
     * streaming drafts into conversation messages and triggers persistence.
     * This prevents content loss if the user refreshes the page.
     *
     * Must be called synchronously from beforeunload/pagehide.
     * The async persist calls are fire-and-forget — the browser will
     * typically let in-flight IndexedDB writes complete.
     */
    commitAndPersistRunningDrafts: () => {
      const state = get()
      const runningConvs = state.conversations.filter((c) => !!c.activeRunId)
      if (runningConvs.length === 0) return

      // Collect messages to persist for each running conversation.
      // We use set() to properly mutate through immer and collect the
      // resulting messages for persistence.
      const toPersist: Array<{ convId: string; messages: Message[] }> = []

      // Phase 1: Flush streaming queues OUTSIDE of set() so that the runtime
      // store's draftAssistant is fully up-to-date before we read it.
      // flushNow() is synchronous — it cancels pending RAF and invokes callbacks
      // which call useConversationRuntimeStore.setState() synchronously.
      for (const convRef of runningConvs) {
        const queues = getStreamingQueues(convRef.id)
        if (queues) {
          queues.reasoning.flushNow()
          queues.content.flushNow()
        }
      }

      // Phase 2: Now read the (freshly flushed) runtime draft and commit.
      set((draft) => {
        for (const convRef of runningConvs) {
          const c = draft.conversations.find((x) => x.id === convRef.id)
          if (!c) continue

          // Sync runtime draft to main store (same pattern as cancelAgent)
          const rtDraft =
            useConversationRuntimeStore.getState().runtimes.get(c.id)?.draftAssistant
          if (rtDraft && !c.draftAssistant) {
            c.draftAssistant = rtDraft
          }

          // Commit draft into messages
          const committed = commitDraftToMessages(c)
          if (committed) {
            c.updatedAt = Date.now()
            // Clean up streaming/draft UI state
            c.draftAssistant = null
            c.currentToolCall = null
            c.activeToolCalls = []
            c.streamingToolArgs = ''
            c.streamingToolArgsByCallId = {}
            c.streamingContent = ''
            c.streamingReasoning = ''
            c.isContentStreaming = false
            c.isReasoningStreaming = false
            c.status = 'idle'
            c.error = null
            c.activeRunId = null

            toPersist.push({ convId: c.id, messages: [...c.messages] })
          }
        }
      })

      // Persist outside of set() — fire-and-forget async writes
      for (const { convId, messages } of toPersist) {
        persistMessageReplace(convId, messages, true).catch((err) => {
          console.error(
            '[conversation.store] Failed to persist draft on beforeunload:',
            err,
          )
        })
        console.info(
          `[conversation.store] Saved streaming draft for conversation ${convId} on page unload`,
        )
      }
    },
  }))
)
