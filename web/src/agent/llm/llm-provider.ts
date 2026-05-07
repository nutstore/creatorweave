/**
 * LLM Provider abstraction.
 * All providers must implement this interface.
 */

import type { ToolDefinition } from '../tools/tool-types'
import type { Message, ToolCall } from '../message-types'

/** Chat completion request */
export interface ChatCompletionRequest {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  temperature?: number
  maxTokens?: number
  stream?: boolean
  /** If true, instruct the provider to disable thinking/reasoning (saves latency and tokens) */
  disableThinking?: boolean
}

/** Message format sent to LLM API */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

/** Non-streaming response */
export interface ChatCompletionResponse {
  id: string
  choices: Array<{
    index: number
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: 'stop' | 'tool_calls' | 'length'
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** Token usage stats returned by the API */
export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

/** Streaming chunk */
export interface ChatCompletionChunk {
  id: string
  choices: Array<{
    index: number
    delta: {
      role?: 'assistant'
      content?: string | null
      /** Chain-of-thought reasoning content (GLM-4.7+ specific) */
      reasoning_content?: string | null
      /** Optional generic reasoning field for non-GLM providers */
      reasoning?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason: 'stop' | 'tool_calls' | 'length' | null
  }>
  /** Token usage - present in the final chunk when stream_options.include_usage is true */
  usage?: TokenUsage
}

/** LLM Provider interface */
export interface LLMProvider {
  readonly name: string
  readonly maxContextTokens: number

  /** Non-streaming chat completion */
  chat(request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse>

  /** Streaming chat completion */
  chatStream(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): AsyncGenerator<ChatCompletionChunk>

  /** Estimate token count for messages */
  estimateTokens(messages: ChatMessage[]): number
}

/** Convert internal Message[] to ChatMessage[] for API calls */
export function messagesToChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map((msg) => {
    const chatMsg: ChatMessage = {
      role: msg.role,
      content: msg.content,
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      chatMsg.tool_calls = msg.toolCalls.map((tc: ToolCall) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }))
    }

    if (msg.toolCallId) {
      chatMsg.tool_call_id = msg.toolCallId
    }

    if (msg.name) {
      chatMsg.name = msg.name
    }

    return chatMsg
  })
}
