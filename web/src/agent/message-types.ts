/**
 * Agent message types for AI conversation system.
 * Compatible with OpenAI chat completion format.
 */

import type { AssetMeta } from '@/types/asset'
import { parseThinkTags } from './think-tags'

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

export interface ToolResult {
  toolCallId: string
  name: string
  content: string // JSON string or plain text
  isError?: boolean
}

/** Token usage stats for a message */
export interface MessageUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface WorkflowDryRunPayload {
  templateId: string
  label: string
  status: 'queued' | 'running' | 'needs_human' | 'passed' | 'failed'
  executionOrder: string[]
  executedNodeIds: string[]
  repairRound: number
  errors: string[]
}

export interface WorkflowRealRunPayload {
  templateId: string
  label: string
  status: 'queued' | 'running' | 'needs_human' | 'passed' | 'failed'
  executionOrder: string[]
  executedNodeIds: string[]
  repairRound: number
  errors: string[]
  nodeOutputs: Record<string, string>
  totalTokens?: number
}

/** Runtime state for a running workflow execution (not persisted) */
export type WorkflowNodeExecStatus = 'pending' | 'running' | 'completed' | 'failed'

/** A single streaming step within a workflow node execution */
export type WorkflowNodeStep =
  | {
      id: string
      type: 'reasoning'
      content: string
      streaming: boolean
    }
  | {
      id: string
      type: 'content'
      content: string
      streaming: boolean
    }

export interface WorkflowNodeExecState {
  id: string
  kind: string
  label: string
  status: WorkflowNodeExecStatus
  output?: string
  error?: string
  steps?: WorkflowNodeStep[]
}

export interface WorkflowExecutionState {
  templateId: string
  label: string
  nodes: WorkflowNodeExecState[]
  totalTokens: number
  startedAt: number
}

export interface Message {
  id: string
  role: MessageRole
  content: string | null
  /** UI-only classification for special assistant records */
  kind?: 'normal' | 'context_summary' | 'workflow_dry_run' | 'workflow_real_run'
  /** Structured payload for workflow dry-run assistant records */
  workflowDryRun?: WorkflowDryRunPayload
  /** Structured payload for workflow real-run assistant records */
  workflowRealRun?: WorkflowRealRunPayload
  /** Chain-of-thought reasoning content (GLM-4.7+), not sent back to API */
  reasoning?: string | null
  toolCalls?: ToolCall[]
  toolCallId?: string // For tool role messages
  name?: string // Tool name for tool role messages
  timestamp: number
  /** Token usage for this assistant message (from API response) */
  usage?: MessageUsage
  /** File assets attached to this message (user uploads or agent-generated) */
  assets?: AssetMeta[]
}

export type DraftAssistantStep =
  | {
      id: string
      timestamp?: number
      type: 'reasoning'
      content: string
      streaming: boolean
    }
  | {
      id: string
      timestamp?: number
      type: 'content'
      content: string
      streaming: boolean
    }
  | {
      id: string
      timestamp?: number
      type: 'tool_call'
      toolCall: ToolCall
      args: string
      result?: string
      streaming: boolean
      /** SubAgent progress events bridged from runtime notifications during blocking spawn */
      subagentEvents?: Array<{
        agentId: string
        status: string
        summary: string
        timestamp: number
      }>
    }
  | {
      id: string
      timestamp?: number
      type: 'compression'
      content: string
      streaming: boolean
    }

/** Runtime status for a conversation */
export type ConversationStatus = 'idle' | 'pending' | 'streaming' | 'tool_calling' | 'error'
export type ConversationTitleMode = 'auto' | 'manual'

export interface ContextWindowUsage {
  /** Actual input tokens sent to model this turn */
  usedTokens: number
  /** Effective input budget E = modelMaxTokens - reserveTokens */
  maxTokens: number
  /** Reserved tokens for model output */
  reserveTokens: number
  /** Usage percent = usedTokens / maxTokens * 100 */
  usagePercent: number
  /** Raw model context limit M (for diagnostics/UI) */
  modelMaxTokens?: number
}

export interface Conversation {
  id: string
  title: string
  /** Whether title is auto-generated or manually edited by user */
  titleMode?: ConversationTitleMode
  messages: Message[]
  createdAt: number
  updatedAt: number
  /** Runtime status (not persisted) */
  status: ConversationStatus
  /** Agent execution mode per-conversation: 'plan' (read-only) or 'act' (full access). Not persisted. */
  agentMode: 'plan' | 'act'
  /** Streaming content being received (not persisted) */
  streamingContent: string
  /** Streaming reasoning content (not persisted) */
  streamingReasoning: string
  /** Whether reasoning is actively streaming (not persisted) */
  isReasoningStreaming: boolean
  /** Complete reasoning content (not persisted) */
  completedReasoning: string | null
  /** Whether content is actively streaming (not persisted) */
  isContentStreaming: boolean
  /** Complete content (not persisted) */
  completedContent: string | null
  /** Currently executing tool call (not persisted) */
  currentToolCall: ToolCall | null
  /** All currently executing tool calls (not persisted) */
  activeToolCalls?: ToolCall[]
  /** Streaming tool call arguments (not persisted) */
  streamingToolArgs: string
  /** Streaming args keyed by tool call id (not persisted) */
  streamingToolArgsByCallId?: Record<string, string>
  /** Error message (not persisted) */
  error: string | null
  /** Active run id for guarding stale callbacks (not persisted) */
  activeRunId?: string | null
  /** Monotonic run counter for this conversation (not persisted) */
  runEpoch?: number
  /** Streaming draft projection rendered in UI (not persisted) */
  draftAssistant?: {
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
  /** Runtime context window usage for the active model call (not persisted) */
  contextWindowUsage?: ContextWindowUsage | null
  /** Last persisted context window usage snapshot */
  lastContextWindowUsage?: ContextWindowUsage | null
  /** Number of mounted views consuming this conversation (not persisted) */
  mountRefCount?: number
  /** Runtime workflow execution progress (not persisted) */
  workflowExecution?: WorkflowExecutionState | null
  /** Runtime convert call counter for context compression cadence (not persisted) */
  compressionConvertCallCount?: number
  /** Runtime marker for last summary convert call (not persisted) */
  compressionLastSummaryConvertCall?: number
  /** Persisted compressed context summary injected into future model inputs */
  compressedContextSummary?: string | null
  /** Persisted cutoff timestamp for rebuilding compressed context */
  compressedContextCutoffTimestamp?: number | null
  /** Assets collected during current agent run (not persisted, moved to assistant message on commit) */
  collectedAssets?: AssetMeta[]
}

/** Generate a unique message ID */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Create a user message */
export function createUserMessage(content: string, assets?: AssetMeta[]): Message {
  return {
    id: generateId(),
    role: 'user',
    content,
    timestamp: Date.now(),
    assets,
  }
}

/** Create an assistant message */
export function createAssistantMessage(
  content: string | null,
  toolCalls?: ToolCall[],
  usage?: MessageUsage,
  reasoning?: string | null,
  kind: Message['kind'] = 'normal',
  workflowDryRun?: WorkflowDryRunPayload,
  workflowRealRun?: WorkflowRealRunPayload,
  assets?: AssetMeta[]
): Message {
  const rawContent = content || ''
  const parsedThink = parseThinkTags(rawContent)
  const normalizedContent = parsedThink.hasThinkTag ? parsedThink.content : rawContent
  const normalizedReasoning =
    reasoning && reasoning.trim().length > 0
      ? reasoning
      : parsedThink.reasoning
        ? parsedThink.reasoning
        : null

  return {
    id: generateId(),
    role: 'assistant',
    content: normalizedContent || null,
    kind,
    workflowDryRun,
    workflowRealRun,
    reasoning: normalizedReasoning || null,
    toolCalls,
    usage,
    timestamp: Date.now(),
    assets,
  }
}

/** Create a tool result message */
export function createToolMessage(result: ToolResult): Message {
  return {
    id: generateId(),
    role: 'tool',
    content: result.content,
    toolCallId: result.toolCallId,
    name: result.name,
    timestamp: Date.now(),
  }
}

/** Create a new conversation */
export function createConversation(title?: string): Conversation {
  const id = generateId()
  const now = Date.now()
  return {
    id,
    title: title || `Chat ${new Date(now).toLocaleString()}`,
    titleMode: title ? 'manual' : 'auto',
    messages: [],
    createdAt: now,
    updatedAt: now,
    // Runtime state (not persisted)
    status: 'idle',
    agentMode: 'act',
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
    contextWindowUsage: null,
    lastContextWindowUsage: null,
    mountRefCount: 0,
    compressionConvertCallCount: 0,
    compressionLastSummaryConvertCall: Number.NEGATIVE_INFINITY,
    compressedContextSummary: null,
    compressedContextCutoffTimestamp: null,
    collectedAssets: [],
  }
}
