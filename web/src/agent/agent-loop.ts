/**
 * Agent Loop - orchestrates the LLM conversation with tool calling.
 *
 * Flow:
 * 1. User message → inject skills and MCP services into system prompt
 * 2. ContextManager trims to token window
 * 3. Call LLM (streaming) with tools
 * 4. If tool_calls → execute tools → append results → loop
 * 5. If stop → return final response
 * 6. Max 20 iterations
 */

import type { LLMProvider, TokenUsage } from './llm/llm-provider'
import { produce } from 'immer'
import { messagesToChatMessages } from './llm/llm-provider'
import type { ToolContext } from './tools/tool-types'
import type { Message, ToolCall, ToolResult, MessageUsage } from './message-types'
import { createAssistantMessage, createToolMessage } from './message-types'
import { ContextManager } from './context-manager'
import { ToolRegistry } from './tool-registry'
import { getSkillManager } from '@/skills/skill-manager'
import type { SkillMatchContext } from '@/skills/skill-types'
import { getMCPManager } from '@/mcp'

const MAX_ITERATIONS = 20
const DEFAULT_SYSTEM_PROMPT = `You are a powerful AI assistant running in the browser with full access to the user's local project files through tools.

IMPORTANT: You CAN and MUST use the provided tools to interact with the user's file system. You are NOT a regular chatbot - you have real tool-calling capabilities. Never say "I cannot access files" or "I cannot view files" - instead, USE the tools to do it.

Available built-in tools:
- file_read: Read file contents by path
- file_write: Write/create files (auto-creates directories)
- file_edit: Apply text replacements to files
- glob: Search for files by pattern (e.g. "**/*.ts")
- grep: Search file contents with regex
- list_files: List directory structure as a tree

When the user asks about files, code, or their project:
1. Use list_files or glob to discover the project structure
2. Use file_read to read relevant files
3. Use grep to search for specific patterns
4. For MCP tools that need file access (e.g., Excel analysis): the system will automatically prompt for file upload when needed
5. ALWAYS call the appropriate tool - never guess or refuse

Always read files before editing them. Be concise and helpful.`

export interface AgentCallbacks {
  /** Called when a new assistant message starts */
  onMessageStart?: () => void
  /** Called when reasoning stream starts (first reasoning_content delta) */
  onReasoningStart?: () => void
  /** Called with streaming reasoning/thinking deltas (GLM-4.7+) */
  onReasoningDelta?: (delta: string) => void
  /** Called when reasoning stream completes (before content/tool_call starts) */
  onReasoningComplete?: (reasoning: string) => void
  /** Called when content stream starts (first content delta) */
  onContentStart?: () => void
  /** Called with streaming content deltas */
  onContentDelta?: (delta: string) => void
  /** Called when content streaming completes (before tool_call starts) */
  onContentComplete?: (content: string) => void
  /** Called when the LLM requests a tool call */
  onToolCallStart?: (toolCall: ToolCall) => void
  /** Called with streaming tool call argument deltas (tool_stream mode) */
  onToolCallDelta?: (index: number, argsDelta: string) => void
  /** Called when a tool execution completes */
  onToolCallComplete?: (toolCall: ToolCall, result: string) => void
  /** Called when messages are updated mid-loop (e.g. after assistant msg or tool result) */
  onMessagesUpdated?: (messages: Message[]) => void
  /** Called when the entire agent loop finishes */
  onComplete?: (messages: Message[]) => void
  /** Called on error */
  onError?: (error: Error) => void
  /**
   * Called when SEP-1306 binary elicitation is detected
   * The agent loop will be paused; caller should handle file upload
   * and resume the agent with the file metadata as a tool result.
   */
  onElicitation?: (elicitation: {
    mode: 'binary'
    message: string
    toolName: string
    args: Record<string, unknown>
    serverId: string
    toolCallId: string
  }) => void
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
  private baseSystemPrompt: string
  private abortController: AbortController | null = null

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider
    this.toolRegistry = config.toolRegistry
    this.contextManager = config.contextManager
    this.toolContext = config.toolContext
    this.maxIterations = config.maxIterations || MAX_ITERATIONS
    this.baseSystemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT
    this.contextManager.setSystemPrompt(this.baseSystemPrompt)
  }

  /** Update system prompt (e.g. when skills are injected) */
  setSystemPrompt(prompt: string): void {
    this.baseSystemPrompt = prompt
    this.contextManager.setSystemPrompt(prompt)
  }

  /** Inject matching skills and MCP services into the system prompt */
  private async injectEnhancements(messages: Message[]): Promise<void> {
    // Start with base system prompt
    let enhancedPrompt = this.baseSystemPrompt

    // Inject MCP services block AND register MCP tools
    try {
      const mcpManager = getMCPManager()
      await mcpManager.initialize()

      // Register MCP tools to ToolRegistry (must happen before getToolDefinitions)
      await this.toolRegistry.registerMCPTools()

      // Use MCPManager's built-in method
      const mcpBlock = mcpManager.getAvailableMCPServicesBlock()
      if (mcpBlock) {
        enhancedPrompt += '\n\n' + mcpBlock
      }
    } catch (error) {
      console.warn('[AgentLoop] Failed to inject MCP services:', error)
    }

    // Extract user message for skill matching (use the last user message)
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUserMsg) {
      const context: SkillMatchContext = {
        userMessage: lastUserMsg.content || '',
      }

      const skillManager = getSkillManager()
      const skillsBlock = skillManager.getEnhancedSystemPrompt('', context)
      if (skillsBlock) {
        enhancedPrompt += skillsBlock
      }
    }

    this.contextManager.setSystemPrompt(enhancedPrompt)
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
    // Start with input messages (keep as immutable, use concat to add new messages)
    let allMessages = messages

    // Inject matching skills and MCP services into system prompt
    await this.injectEnhancements(messages)

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
        let reasoning = ''
        const toolCalls: ToolCall[] = []
        // Buffer for accumulating tool call deltas by index
        const toolCallBuffers = new Map<number, { id: string; name: string; arguments: string }>()

        // Phase detection for reasoning lifecycle
        let reasoningPhaseStarted = false
        let contentPhaseStarted = false
        let toolCallsPhaseStarted = false

        let finishReason: string | null = null
        let usage: TokenUsage | undefined

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

          // --- Reasoning phase (GLM-4.7+ chain-of-thought) ---
          if (choice.delta.reasoning_content) {
            // First reasoning delta → reasoning phase starts
            if (!reasoningPhaseStarted) {
              reasoningPhaseStarted = true
              callbacks?.onReasoningStart?.()
            }
            reasoning += choice.delta.reasoning_content
            callbacks?.onReasoningDelta?.(choice.delta.reasoning_content)
          }

          // --- Content phase ---
          if (choice.delta.content) {
            // First content delta → content phase starts
            if (!contentPhaseStarted) {
              contentPhaseStarted = true
              callbacks?.onContentStart?.()
              // Transition: reasoning → content
              if (reasoningPhaseStarted) {
                callbacks?.onReasoningComplete?.(reasoning)
              }
            }
            content += choice.delta.content
            callbacks?.onContentDelta?.(choice.delta.content)
          }

          // --- Tool calls phase ---
          if (choice.delta.tool_calls) {
            // First tool_call delta → tool_calls phase starts
            if (!toolCallsPhaseStarted) {
              toolCallsPhaseStarted = true
              // Transition: reasoning → tool_calls
              if (reasoningPhaseStarted) {
                callbacks?.onReasoningComplete?.(reasoning)
              }
              // Transition: content → tool_calls
              if (contentPhaseStarted) {
                callbacks?.onContentComplete?.(content)
              }
            }
            for (const tcDelta of choice.delta.tool_calls) {
              let buffer = toolCallBuffers.get(tcDelta.index)
              if (!buffer) {
                buffer = { id: '', name: '', arguments: '' }
                toolCallBuffers.set(tcDelta.index, buffer)
              }
              if (tcDelta.id) buffer.id = tcDelta.id
              if (tcDelta.function?.name) {
                const isFirstName = !buffer.name
                buffer.name = tcDelta.function.name
                // Notify UI only once when we first learn the tool name
                if (isFirstName) {
                  callbacks?.onToolCallStart?.({
                    id: buffer.id,
                    type: 'function',
                    function: { name: buffer.name, arguments: '' },
                  })
                }
              }
              if (tcDelta.function?.arguments) {
                buffer.arguments += tcDelta.function.arguments
                callbacks?.onToolCallDelta?.(tcDelta.index, tcDelta.function.arguments)
              }
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason
          }

          // Capture usage from the final chunk (when stream_options.include_usage is set)
          if (chunk.usage) {
            usage = chunk.usage
          }
        }

        // Handle edge case: reasoning completed but no content/tool_calls after it
        if (reasoningPhaseStarted && !toolCallsPhaseStarted) {
          callbacks?.onReasoningComplete?.(reasoning)
        }

        // Handle edge case: content completed but no tool_calls after it
        if (contentPhaseStarted && !toolCallsPhaseStarted) {
          callbacks?.onContentComplete?.(content)
        }

        // Build tool calls from buffers
        for (const [, buffer] of Array.from(toolCallBuffers.entries()).sort(([a], [b]) => a - b)) {
          toolCalls.push({
            id: buffer.id,
            type: 'function',
            function: { name: buffer.name, arguments: buffer.arguments },
          })
        }

        // Create assistant message with token usage
        const msgUsage: MessageUsage | undefined = usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : undefined
        const assistantMsg = createAssistantMessage(
          content || null,
          toolCalls.length > 0 ? toolCalls : undefined,
          msgUsage,
          reasoning || null
        )
        allMessages = produce(allMessages, (draft) => {
          draft.push(assistantMsg)
        })
        callbacks?.onMessagesUpdated?.(allMessages)

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

          try {
            const result = await this.toolRegistry.execute(tc.function.name, args, this.toolContext)

            // SEP-1306: Check for binary elicitation in tool result
            let elicitationData: {
              mode: 'binary'
              message: string
              toolName: string
              args: Record<string, unknown>
              serverId: string
            } | null = null
            try {
              const parsedResult = JSON.parse(result)
              if (parsedResult._elicitation && parsedResult._elicitation.mode === 'binary') {
                elicitationData = parsedResult._elicitation
              }
            } catch {
              // Not JSON, not an elicitation response
            }

            // If elicitation detected, notify callback and exit loop
            if (elicitationData && callbacks?.onElicitation) {
              // Add assistant message with tool call
              const assistantMsg = createAssistantMessage(null, [tc], undefined, null)
              allMessages = produce(allMessages, (draft) => {
                draft.push(assistantMsg)
              })
              callbacks?.onMessagesUpdated?.(allMessages)

              // Call elicitation callback - caller should handle file upload
              // and resume the agent loop with file metadata
              // Include toolCallId so the handler can create proper tool result message
              callbacks.onElicitation({
                ...elicitationData,
                toolCallId: tc.id,
              })
              callbacks?.onComplete?.(allMessages)
              return allMessages
            }

            callbacks?.onToolCallComplete?.(tc, result)

            const toolResult: ToolResult = {
              toolCallId: tc.id,
              name: tc.function.name,
              content: result,
            }
            allMessages = produce(allMessages, (draft) => {
              draft.push(createToolMessage(toolResult))
            })
            callbacks?.onMessagesUpdated?.(allMessages)
          } catch (toolError) {
            console.error(`[AgentLoop] Tool ${tc.function.name} failed:`, toolError)
            const errorMsg = toolError instanceof Error ? toolError.message : String(toolError)
            const toolResult: ToolResult = {
              toolCallId: tc.id,
              name: tc.function.name,
              content: `Error: ${errorMsg}`,
            }
            allMessages = produce(allMessages, (draft) => {
              draft.push(createToolMessage(toolResult))
            })
            callbacks?.onMessagesUpdated?.(allMessages)
          }
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
