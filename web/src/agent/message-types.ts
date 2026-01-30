/**
 * Agent message types for AI conversation system.
 * Compatible with OpenAI chat completion format.
 */

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

export interface Message {
  id: string
  role: MessageRole
  content: string | null
  /** Chain-of-thought reasoning content (GLM-4.7+), not sent back to API */
  reasoning?: string | null
  toolCalls?: ToolCall[]
  toolCallId?: string // For tool role messages
  name?: string // Tool name for tool role messages
  timestamp: number
  /** Token usage for this assistant message (from API response) */
  usage?: MessageUsage
}

/** Runtime status for a conversation */
export type ConversationStatus = 'idle' | 'pending' | 'streaming' | 'tool_calling' | 'error'

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  /** Runtime status (not persisted) */
  status: ConversationStatus
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
  /** Streaming tool call arguments (not persisted) */
  streamingToolArgs: string
  /** Error message (not persisted) */
  error: string | null
}

/** Generate a unique message ID */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Create a user message */
export function createUserMessage(content: string): Message {
  return {
    id: generateId(),
    role: 'user',
    content,
    timestamp: Date.now(),
  }
}

/** Create an assistant message */
export function createAssistantMessage(
  content: string | null,
  toolCalls?: ToolCall[],
  usage?: MessageUsage,
  reasoning?: string | null
): Message {
  return {
    id: generateId(),
    role: 'assistant',
    content,
    reasoning: reasoning || null,
    toolCalls,
    usage,
    timestamp: Date.now(),
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
    messages: [],
    createdAt: now,
    updatedAt: now,
    // Runtime state (not persisted)
    status: 'idle',
    streamingContent: '',
    streamingReasoning: '',
    isReasoningStreaming: false,
    completedReasoning: null,
    isContentStreaming: false,
    completedContent: null,
    currentToolCall: null,
    streamingToolArgs: '',
    error: null,
  }
}
