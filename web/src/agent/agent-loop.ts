/**
 * Agent Loop - orchestrates the LLM conversation with tool calling.
 *
 * Flow:
 * 1. User message → inject skills into system prompt
 * 2. ContextManager trims to token window
 * 3. Call LLM (streaming) with tools
 * 4. If tool_calls → execute tools → append results → loop
 * 5. If stop → return final response
 * 6. Max 20 iterations
 */

import type { LLMProvider } from './llm/llm-provider'
import { messagesToChatMessages } from './llm/llm-provider'
import type { ToolContext } from './tools/tool-types'
import type { Message, ToolCall, ToolResult } from './message-types'
import { createAssistantMessage, createToolMessage } from './message-types'
import { ContextManager } from './context-manager'
import { ToolRegistry } from './tool-registry'

const MAX_ITERATIONS = 20
const DEFAULT_SYSTEM_PROMPT = `You are an AI coding assistant running in the browser. You have access to the user's local project files through the File System Access API.

Available tools:
- file_read: Read file contents
- file_write: Write/create files (auto-creates directories)
- file_edit: Apply text replacements to files
- glob: Search for files by pattern
- grep: Search file contents with regex
- list_files: List directory structure

Always read files before editing them. Use glob/grep to find relevant files. Be concise and helpful.`

export interface AgentCallbacks {
  /** Called when a new assistant message starts */
  onMessageStart?: () => void
  /** Called with streaming content deltas */
  onContentDelta?: (delta: string) => void
  /** Called when content streaming completes */
  onContentComplete?: (content: string) => void
  /** Called when the LLM requests a tool call */
  onToolCallStart?: (toolCall: ToolCall) => void
  /** Called when a tool execution completes */
  onToolCallComplete?: (toolCall: ToolCall, result: string) => void
  /** Called when the entire agent loop finishes */
  onComplete?: (messages: Message[]) => void
  /** Called on error */
  onError?: (error: Error) => void
}

export interface AgentLoopConfig {
  provider: LLMProvider
  toolRegistry: ToolRegistry
  contextManager: ContextManager
  toolContext: ToolContext
  systemPrompt?: string
  maxIterations?: number
}

export class AgentLoop {
  private provider: LLMProvider
  private toolRegistry: ToolRegistry
  private contextManager: ContextManager
  private toolContext: ToolContext
  private maxIterations: number
  private abortController: AbortController | null = null

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider
    this.toolRegistry = config.toolRegistry
    this.contextManager = config.contextManager
    this.toolContext = config.toolContext
    this.maxIterations = config.maxIterations || MAX_ITERATIONS
    this.contextManager.setSystemPrompt(config.systemPrompt || DEFAULT_SYSTEM_PROMPT)
  }

  /** Update system prompt (e.g. when skills are injected) */
  setSystemPrompt(prompt: string): void {
    this.contextManager.setSystemPrompt(prompt)
  }

  /** Cancel the current agent loop */
  cancel(): void {
    this.abortController?.abort()
  }

  /**
   * Run the agent loop with a list of messages.
   * Appends new assistant/tool messages and returns the full updated list.
   */
  async run(messages: Message[], callbacks?: AgentCallbacks): Promise<Message[]> {
    this.abortController = new AbortController()
    const signal = this.abortController.signal
    const allMessages = [...messages]

    try {
      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        if (signal.aborted) break

        // Convert to chat format and trim to context window
        const chatMessages = messagesToChatMessages(allMessages)
        const trimmedMessages = this.contextManager.trimMessages(chatMessages)

        // Stream LLM response
        const tools = this.toolRegistry.getToolDefinitions()
        callbacks?.onMessageStart?.()

        let content = ''
        const toolCalls: ToolCall[] = []
        // Buffer for accumulating tool call deltas by index
        const toolCallBuffers = new Map<number, { id: string; name: string; arguments: string }>()

        let finishReason: string | null = null

        const stream = this.provider.chatStream(
          {
            messages: trimmedMessages,
            tools: tools.length > 0 ? tools : undefined,
            toolChoice: tools.length > 0 ? 'auto' : undefined,
          },
          signal
        )

        for await (const chunk of stream) {
          if (signal.aborted) break

          const choice = chunk.choices[0]
          if (!choice) continue

          // Accumulate content
          if (choice.delta.content) {
            content += choice.delta.content
            callbacks?.onContentDelta?.(choice.delta.content)
          }

          // Accumulate tool calls
          if (choice.delta.tool_calls) {
            for (const tcDelta of choice.delta.tool_calls) {
              let buffer = toolCallBuffers.get(tcDelta.index)
              if (!buffer) {
                buffer = { id: '', name: '', arguments: '' }
                toolCallBuffers.set(tcDelta.index, buffer)
              }
              if (tcDelta.id) buffer.id = tcDelta.id
              if (tcDelta.function?.name) buffer.name += tcDelta.function.name
              if (tcDelta.function?.arguments) buffer.arguments += tcDelta.function.arguments
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason
          }
        }

        // Build tool calls from buffers
        for (const [, buffer] of Array.from(toolCallBuffers.entries()).sort(([a], [b]) => a - b)) {
          toolCalls.push({
            id: buffer.id,
            type: 'function',
            function: { name: buffer.name, arguments: buffer.arguments },
          })
        }

        if (content) {
          callbacks?.onContentComplete?.(content)
        }

        // Create assistant message
        const assistantMsg = createAssistantMessage(
          content || null,
          toolCalls.length > 0 ? toolCalls : undefined
        )
        allMessages.push(assistantMsg)

        // If no tool calls, we're done
        if (finishReason !== 'tool_calls' || toolCalls.length === 0) {
          break
        }

        // Execute tool calls
        for (const tc of toolCalls) {
          if (signal.aborted) break

          callbacks?.onToolCallStart?.(tc)

          let args: Record<string, unknown>
          try {
            args = JSON.parse(tc.function.arguments)
          } catch {
            args = {}
          }

          const result = await this.toolRegistry.execute(tc.function.name, args, this.toolContext)

          callbacks?.onToolCallComplete?.(tc, result)

          const toolResult: ToolResult = {
            toolCallId: tc.id,
            name: tc.function.name,
            content: result,
          }
          allMessages.push(createToolMessage(toolResult))
        }
      }

      callbacks?.onComplete?.(allMessages)
      return allMessages
    } catch (error) {
      if (signal.aborted) {
        // Cancelled - return what we have
        callbacks?.onComplete?.(allMessages)
        return allMessages
      }
      const err = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(err)
      throw err
    } finally {
      this.abortController = null
    }
  }
}
