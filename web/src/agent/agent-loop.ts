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

import { produce } from 'immer'
import { messagesToChatMessages, type ChatMessage } from './llm/llm-provider'
import type { ToolContext } from './tools/tool-types'
import type { Message, ToolCall } from './message-types'
import { createAssistantMessage, createToolMessage } from './message-types'
import { ContextManager } from './context-manager'
import { ToolRegistry } from './tool-registry'
import { getSkillManager } from '@/skills/skill-manager'
import type { SkillMatchContext } from '@/skills/skill-types'
import { getMCPManager } from '@/mcp'
import {
  UNIVERSAL_SYSTEM_PROMPT,
  buildEnhancedSystemPrompt,
  shouldShowToolDiscovery,
  getToolDiscoveryMessage,
} from './prompts/universal-system-prompt'
// Phase 2: Intelligence enhancements
import { getIntelligenceCoordinator } from './intelligence-coordinator'
// Phase 2 P1: Predictive file loading
import { triggerPrefetch } from './prefetch'
import { agentLoopContinue, type AgentTool } from '@mariozechner/pi-agent-core'
import type {
  AgentEvent as PiAgentEvent,
  AgentMessage as PiAgentMessage,
} from '@mariozechner/pi-agent-core'
import type {
  AssistantMessageEvent as PiAssistantMessageEvent,
  Message as PiMessage,
  ToolResultMessage as PiToolResultMessage,
} from '@mariozechner/pi-ai'
import { PiAIProvider } from './llm/pi-ai-provider'

const MAX_ITERATIONS = 20
const DEFAULT_SYSTEM_PROMPT = UNIVERSAL_SYSTEM_PROMPT
const DEFAULT_TOOL_TIMEOUT = 30000
const SUMMARY_MIN_DROPPED_GROUPS = 2
const SUMMARY_MIN_DROPPED_CONTENT_CHARS = 800
const SUMMARY_MIN_INTERVAL_CONVERT_CALLS = 3
const CONTEXT_SUMMARY_SYSTEM_PROMPT =
  'You are compressing earlier conversation context for another model call. Keep only durable facts, decisions, constraints, file paths, tool findings, and unresolved tasks. Output plain text only.'
const COMPRESSED_MEMORY_PREFIX = 'Compressed memory of earlier conversation:'

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
  onToolCallDelta?: (index: number, argsDelta: string, toolCallId?: string) => void
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
  /** Called when a tool execution times out */
  onToolTimeout?: (toolCall: ToolCall) => void
  /** Called when agent stops due to maxIterations limit */
  onIterationLimitReached?: (limit: number) => void
  /** Called when context compression starts */
  onContextCompressionStart?: () => void
  /** Called when context compression completes (summary text may be null on fallback) */
  onContextCompressionComplete?: (summary: string | null) => void
}

export interface AgentLoopConfig {
  provider: PiAIProvider
  toolRegistry: ToolRegistry
  contextManager: ContextManager
  toolContext: ToolContext
  systemPrompt?: string
  maxIterations?: number
  /** Optional session ID for memory tracking */
  sessionId?: string
  /** Callback when loop completes (before onComplete) - for side effects like refresh */
  onLoopComplete?: () => Promise<void>
  /** Tool execution timeout in milliseconds (default: 30000ms) */
  toolExecutionTimeout?: number
}

export class AgentLoop {
  private provider: PiAIProvider
  private toolRegistry: ToolRegistry
  private contextManager: ContextManager
  private toolContext: ToolContext
  private maxIterations: number
  private baseSystemPrompt: string
  private abortController: AbortController | null = null
  private sessionId?: string
  private onLoopComplete?: () => Promise<void>
  private toolExecutionTimeout: number
  private convertCallCount = 0
  private lastSummaryConvertCall = Number.NEGATIVE_INFINITY

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider
    this.toolRegistry = config.toolRegistry
    this.contextManager = config.contextManager
    this.toolContext = config.toolContext
    this.maxIterations = config.maxIterations || MAX_ITERATIONS
    this.baseSystemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT
    this.sessionId = config.sessionId
    this.onLoopComplete = config.onLoopComplete
    this.toolExecutionTimeout = config.toolExecutionTimeout || DEFAULT_TOOL_TIMEOUT
    this.contextManager.setSystemPrompt(this.baseSystemPrompt)
  }

  /** Update system prompt (e.g. when skills are injected) */
  setSystemPrompt(prompt: string): void {
    this.baseSystemPrompt = prompt
    this.contextManager.setSystemPrompt(prompt)
  }

  /** Inject matching skills and MCP services into the system prompt */
  private async injectEnhancements(messages: Message[]): Promise<void> {
    // Extract user message for scenario detection (use the last user message)
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    const userMessage = lastUserMsg?.content || ''

    // Start with base system prompt, enhanced with scenario detection
    let enhancedPrompt = buildEnhancedSystemPrompt(this.baseSystemPrompt, userMessage)

    // Phase 2: Inject intelligent enhancements (tool recs, project fingerprint, memory)
    try {
      const coordinator = getIntelligenceCoordinator()
      const intelligenceResult = await coordinator.enhanceSystemPrompt(enhancedPrompt, {
        directoryHandle: this.toolContext.directoryHandle || undefined,
        userMessage,
        sessionId: this.sessionId,
      })

      enhancedPrompt = intelligenceResult.systemPrompt
    } catch (error) {
      console.warn('[AgentLoop] Failed to inject intelligence enhancements:', error)
      // Continue without intelligence enhancements
    }

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

    // Extract user message for skill matching
    if (lastUserMsg) {
      const context: SkillMatchContext = {
        userMessage: userMessage,
      }

      const skillManager = getSkillManager()
      const skillsBlock = skillManager.getEnhancedSystemPrompt('', context)
      if (skillsBlock) {
        enhancedPrompt += skillsBlock
      }
    }

    // Tool discovery: if user asks about capabilities, inject discovery message
    if (shouldShowToolDiscovery(userMessage)) {
      const discoveryMsg = getToolDiscoveryMessage(userMessage)
      if (discoveryMsg) {
        enhancedPrompt += '\n\n' + discoveryMsg
      }
    }

    this.contextManager.setSystemPrompt(enhancedPrompt)
  }

  /** Cancel the current agent loop */
  cancel(): void {
    this.abortController?.abort()
  }

  //=============================================================================
  // Phase 2 P1: Predictive File Loading
  //=============================================================================

  /**
   * Trigger prefetch if new user message is detected
   * This runs in background to load files before the agent needs them
   */
  private async triggerPrefetchIfNeeded(messages: Message[]): Promise<void> {
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUserMsg) return

    // Extract user message content for potential future use in prefetch prediction
    // Currently using recentMessages pattern, but individual message may be used for more targeted prediction
    // Void to avoid unused variable warning
    void (lastUserMsg.content || '')

    // Extract recent messages for context
    const recentMessages: string[] = []
    const recentFiles: string[] = []

    for (const msg of messages.slice(-10)) {
      if (msg.role === 'user') {
        recentMessages.push(msg.content || '')
      }
      // Extract file paths from tool calls
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.function.name === 'file_read') {
            try {
              const args = JSON.parse(tc.function.arguments)
              if (args.path) {
                recentFiles.push(args.path as string)
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    }

    // Get project type from intelligence coordinator
    let projectType = 'typescript'
    try {
      const coordinator = getIntelligenceCoordinator()
      if (this.toolContext.directoryHandle) {
        const detected = await coordinator.quickDetectProjectType(this.toolContext.directoryHandle)
        if (detected) {
          projectType = detected.type
        }
      }
    } catch {
      // Use default type
    }

    // Trigger prefetch in background (don't await)
    triggerPrefetch({
      directoryHandle: this.toolContext.directoryHandle,
      recentMessages,
      recentFiles,
      projectType,
      activeFile: recentFiles[recentFiles.length - 1],
      sessionId: this.sessionId,
    }).catch((error) => {
      console.warn('[AgentLoop] Prefetch failed:', error)
    })
  }

  private async generateContextSummaryWithLLM(
    droppedContent: string,
    maxSummaryTokens: number
  ): Promise<string | null> {
    try {
      const response = await this.provider.chat({
        messages: [
          { role: 'system', content: CONTEXT_SUMMARY_SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              'Summarize the following dropped conversation context. Keep it concise and actionable.\n\n' +
              droppedContent,
          },
        ],
        maxTokens: maxSummaryTokens,
        temperature: 0.1,
      })

      const summary = response.choices[0]?.message?.content?.trim()
      return summary || null
    } catch (error) {
      console.warn('[AgentLoop] LLM context summary failed, falling back to heuristic summary:', error)
      return this.createHeuristicSummary(droppedContent, maxSummaryTokens)
    }
  }

  private createHeuristicSummary(droppedContent: string, maxSummaryTokens: number): string {
    const lines = droppedContent
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const userHighlights: string[] = []
    const assistantHighlights: string[] = []
    const toolHighlights: string[] = []

    for (const line of lines) {
      if (line.startsWith('User:') && userHighlights.length < 6) {
        userHighlights.push(line.slice(5).trim())
        continue
      }
      if (line.startsWith('Assistant:') && assistantHighlights.length < 6) {
        assistantHighlights.push(line.slice(10).trim())
        continue
      }
      if (line.startsWith('Tool result:') && toolHighlights.length < 4) {
        toolHighlights.push(line.slice(12).trim())
      }
    }

    const parts: string[] = [COMPRESSED_MEMORY_PREFIX]
    if (userHighlights.length > 0) {
      parts.push('User intents:')
      parts.push(...userHighlights.map((item) => `- ${item}`))
    }
    if (assistantHighlights.length > 0) {
      parts.push('Assistant outputs:')
      parts.push(...assistantHighlights.map((item) => `- ${item}`))
    }
    if (toolHighlights.length > 0) {
      parts.push('Key tool findings:')
      parts.push(...toolHighlights.map((item) => `- ${item}`))
    }

    const roughMaxChars = Math.max(120, maxSummaryTokens * 3)
    const combined = parts.join('\n')
    if (combined.length <= roughMaxChars) return combined
    return combined.slice(0, roughMaxChars) + '\n...[truncated]'
  }

  private injectSummaryMessage(messages: ChatMessage[], summary: string): ChatMessage[] {
    const summaryMessage: ChatMessage = {
      role: 'assistant',
      content: `${COMPRESSED_MEMORY_PREFIX}\n${summary}`,
    }

    if (messages[0]?.role === 'system' && messages[1]) {
      return [messages[0], summaryMessage, ...messages.slice(1)]
    }
    return [summaryMessage, ...messages]
  }

  private shouldCallLLMSummary(droppedGroups: number, droppedContent: string): boolean {
    if (droppedGroups < SUMMARY_MIN_DROPPED_GROUPS) return false
    if (droppedContent.trim().length < SUMMARY_MIN_DROPPED_CONTENT_CHARS) return false
    if (this.convertCallCount - this.lastSummaryConvertCall < SUMMARY_MIN_INTERVAL_CONVERT_CALLS) {
      return false
    }
    return true
  }

  /** Execute tool with timeout protection to prevent hanging loops */
  private async executeToolWithTimeout(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number
  ): Promise<string> {
    const timeoutController = new AbortController()
    const runAbortSignal = this.abortController?.signal
    const externalAbortSignal = this.toolContext.abortSignal
    const cleanupListeners: Array<() => void> = []

    const attachAbort = (signal: AbortSignal | undefined) => {
      if (!signal) return
      const onAbort = () => timeoutController.abort()
      signal.addEventListener('abort', onAbort)
      cleanupListeners.push(() => signal.removeEventListener('abort', onAbort))
      if (signal.aborted) timeoutController.abort()
    }

    attachAbort(runAbortSignal)
    attachAbort(externalAbortSignal)

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let didTimeout = false
    const timeoutPromise = new Promise<string>((_, reject) => {
      timeoutId = setTimeout(() => {
        didTimeout = true
        reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`))
        timeoutController.abort()
      }, timeoutMs)
    })

    const abortPromise = new Promise<string>((_, reject) => {
      if (timeoutController.signal.aborted) {
        reject(
          new Error(
            didTimeout ? `Tool "${toolName}" timed out after ${timeoutMs}ms` : `Tool "${toolName}" was aborted`
          )
        )
        return
      }
      const onAbort = () =>
        reject(
          new Error(
            didTimeout ? `Tool "${toolName}" timed out after ${timeoutMs}ms` : `Tool "${toolName}" was aborted`
          )
        )
      timeoutController.signal.addEventListener('abort', onAbort, { once: true })
      cleanupListeners.push(() => timeoutController.signal.removeEventListener('abort', onAbort))
    })

    try {
      return await Promise.race([
        this.toolRegistry.execute(toolName, args, {
          ...this.toolContext,
          abortSignal: timeoutController.signal,
        }),
        timeoutPromise,
        abortPromise,
      ])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      for (const cleanup of cleanupListeners) cleanup()
    }
  }

  private parseToolArgs(args: string): Record<string, unknown> {
    try {
      return JSON.parse(args)
    } catch {
      return {}
    }
  }

  private extractTextContent(content: unknown): string | null {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return null

    const text = content
      .filter((item): item is { type: string; text?: string; thinking?: string } => !!item)
      .map((item) => {
        if (item.type === 'text') return item.text || ''
        if (item.type === 'thinking') return item.thinking || ''
        return ''
      })
      .join('')
    return text || null
  }

  private internalToPiMessages(messages: Message[]): PiMessage[] {
    const model = this.provider.getModel()
    return messages.flatMap((msg): PiMessage[] => {
      if (msg.kind === 'context_summary') {
        return []
      }
      if (msg.role === 'user') {
        return [
          {
            role: 'user',
            content: msg.content || '',
            timestamp: msg.timestamp || Date.now(),
          },
        ]
      }

      if (msg.role === 'assistant') {
        const content: Array<
          | { type: 'text'; text: string }
          | { type: 'thinking'; thinking: string }
          | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
        > = []

        if (msg.content) {
          content.push({ type: 'text', text: msg.content })
        }
        if (msg.reasoning) {
          content.push({ type: 'thinking', thinking: msg.reasoning })
        }
        for (const toolCall of msg.toolCalls || []) {
          content.push({
            type: 'toolCall',
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: this.parseToolArgs(toolCall.function.arguments),
          })
        }

        return [
          {
            role: 'assistant',
            content,
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
              input: msg.usage?.promptTokens ?? 0,
              output: msg.usage?.completionTokens ?? 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: msg.usage?.totalTokens ?? 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: msg.timestamp || Date.now(),
          },
        ]
      }

      if (msg.role === 'tool') {
        return [
          {
            role: 'toolResult',
            toolCallId: msg.toolCallId || '',
            toolName: msg.name || 'tool',
            content: [{ type: 'text', text: msg.content || '' }],
            isError: msg.content?.startsWith('Error:') ?? false,
            timestamp: msg.timestamp || Date.now(),
          },
        ]
      }

      return []
    })
  }

  private piToInternalMessage(message: PiAgentMessage): Message | null {
    const now = Date.now()
    if (typeof message !== 'object' || !message || !('role' in message)) return null

    if (message.role === 'user') {
      return {
        id: `${now}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'user',
        content: this.extractTextContent(message.content),
        timestamp: message.timestamp || now,
      }
    }

    if (message.role === 'assistant') {
      const text = message.content
        .filter((item) => !!item)
        .filter((item) => item.type === 'text')
        .map((item) => ('text' in item ? item.text || '' : ''))
        .join('')
      const reasoning = message.content
        .filter((item) => !!item)
        .filter((item) => item.type === 'thinking')
        .map((item) => ('thinking' in item ? item.thinking || '' : ''))
        .join('')
      const toolCalls: ToolCall[] = message.content
        .filter(
          (item): item is { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> } =>
            item.type === 'toolCall'
        )
        .map((item) => ({
          id: item.id,
          type: 'function',
          function: {
            name: item.name,
            arguments: JSON.stringify(item.arguments || {}),
          },
        }))

      return createAssistantMessage(
        text || null,
        toolCalls.length > 0 ? toolCalls : undefined,
        {
          promptTokens: message.usage?.input || 0,
          completionTokens: message.usage?.output || 0,
          totalTokens: message.usage?.totalTokens || 0,
        },
        reasoning || null
      )
    }

    if (message.role === 'toolResult') {
      const text = this.extractTextContent(message.content) || ''
      return createToolMessage({
        toolCallId: message.toolCallId,
        name: message.toolName,
        content: text,
      })
    }

    return null
  }

  private applyPiAssistantUpdate(
    event: PiAssistantMessageEvent,
    callbacks?: AgentCallbacks,
    onToolCallStart?: (toolCall: ToolCall) => void,
    toolCallIdByIndex?: Map<number, string>
  ): void {
    if (event.type === 'thinking_start') callbacks?.onReasoningStart?.()
    if (event.type === 'thinking_delta') callbacks?.onReasoningDelta?.(event.delta)
    if (event.type === 'thinking_end') callbacks?.onReasoningComplete?.(event.content)
    if (event.type === 'text_start') callbacks?.onContentStart?.()
    if (event.type === 'text_delta') callbacks?.onContentDelta?.(event.delta)
    if (event.type === 'text_end') callbacks?.onContentComplete?.(event.content)

    if (event.type === 'toolcall_start') {
      const partial = event.partial.content[event.contentIndex]
      if (partial?.type === 'toolCall') {
        toolCallIdByIndex?.set(event.contentIndex, partial.id)
        onToolCallStart?.({
          id: partial.id,
          type: 'function',
          function: { name: partial.name, arguments: JSON.stringify(partial.arguments || {}) },
        })
      }
    }
    if (event.type === 'toolcall_delta') {
      callbacks?.onToolCallDelta?.(event.contentIndex, event.delta, toolCallIdByIndex?.get(event.contentIndex))
    }
  }

  private async runWithPiAgentCore(
    messages: Message[],
    callbacks?: AgentCallbacks
  ): Promise<Message[]> {
    const signal = this.abortController?.signal
    if (!signal) return messages

    let allMessages = messages
    let shouldStopForElicitation = false
    let assistantMessageCount = 0
    let reachedMaxIterations = false
    let assistantMessageStarted = false
    const startedToolCalls = new Set<string>()
    const toolCallIdByIndex = new Map<number, string>()
    const toolCallArgsById = new Map<string, Record<string, unknown>>()
    const pendingToolCompletions = new Map<string, { toolCall: ToolCall; resultText: string }>()
    const model = this.provider.getModel()
    const apiKey = this.provider.getApiKey()

    const agentTools: AgentTool[] = this.toolRegistry.getToolDefinitions().map((toolDef) => ({
      name: toolDef.function.name,
      label: toolDef.function.name,
      description: toolDef.function.description || '',
      parameters: toolDef.function.parameters as never,
      execute: async (toolCallId, params) => {
        const args = (params || {}) as Record<string, unknown>
        const toolCall: ToolCall = {
          id: toolCallId,
          type: 'function',
          function: {
            name: toolDef.function.name,
            arguments: JSON.stringify(args),
          },
        }

        try {
          const result = await this.executeToolWithTimeout(
            toolDef.function.name,
            args,
            this.toolExecutionTimeout
          )

          let elicitationData: {
            mode: 'binary'
            message: string
            toolName: string
            args: Record<string, unknown>
            serverId: string
          } | null = null
          try {
            const parsedResult = JSON.parse(result)
            if (parsedResult._elicitation?.mode === 'binary') {
              elicitationData = parsedResult._elicitation
            }
          } catch {
            // non-json tool output
          }

          if (elicitationData && callbacks?.onElicitation) {
            shouldStopForElicitation = true
            callbacks.onElicitation({
              ...elicitationData,
              toolCallId,
            })
            this.abortController?.abort()
          }

          if (toolDef.function.name === 'run_python_code' && result) {
            try {
              const parsedResult = JSON.parse(result)
              if (parsedResult.fileChanges) {
                const { useWorkspaceStore } = await import('@/store/workspace.store')
                useWorkspaceStore.getState().addChanges(parsedResult.fileChanges)
              }
            } catch {
              // ignore non-json outputs
            }
          }

          return {
            content: [{ type: 'text', text: result }],
            details: { raw: result },
          }
        } catch (toolError) {
          if (toolError instanceof Error && toolError.message.includes('timed out')) {
            callbacks?.onToolTimeout?.(toolCall)
          }
          throw toolError
        }
      },
    }))

    const context = {
      systemPrompt: this.contextManager.getConfig().systemPrompt || this.baseSystemPrompt,
      messages: this.internalToPiMessages(messages),
      tools: agentTools,
    }

    const loop = agentLoopContinue(
      context,
      {
        model,
        getApiKey: () => apiKey,
        maxTokens: model.maxTokens,
        convertToLlm: async (agentMessages) => {
          this.convertCallCount++
          const internalMessages = agentMessages
            .map((m) => this.piToInternalMessage(m))
            .filter((m): m is Message => m !== null)
          const summaryTokenBudget = Math.min(
            1200,
            Math.max(256, Math.floor(this.contextManager.getConfig().maxContextTokens * 0.01))
          )
          const trimmedResult = this.contextManager.trimMessages(
            messagesToChatMessages(internalMessages),
            {
              createSummary: true,
              maxSummaryTokens: summaryTokenBudget,
              summaryStrategy: 'external',
            }
          )
          let trimmed = trimmedResult.messages
          if (
            trimmedResult.droppedContent &&
            this.shouldCallLLMSummary(trimmedResult.droppedGroups, trimmedResult.droppedContent)
          ) {
            callbacks?.onContextCompressionStart?.()
            const llmSummary = await this.generateContextSummaryWithLLM(
              trimmedResult.droppedContent,
              summaryTokenBudget
            )
            if (llmSummary) {
              this.lastSummaryConvertCall = this.convertCallCount
              trimmed = this.injectSummaryMessage(trimmed, llmSummary)
              // Final safety pass: summary injection must still fit the context budget.
              trimmed = this.contextManager.trimMessages(trimmed, { createSummary: false }).messages
            }
            callbacks?.onContextCompressionComplete?.(llmSummary)
          }
          return this.internalToPiMessages(
            trimmed.map((msg) => ({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              role: msg.role,
              content: msg.content,
              toolCalls: msg.tool_calls?.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
              toolCallId: msg.tool_call_id,
              name: msg.name,
              timestamp: Date.now(),
            }))
          )
        },
      },
      signal
    )

    try {
      for await (const event of loop) {
        const typedEvent = event as PiAgentEvent
        if (typedEvent.type === 'message_start' && typedEvent.message.role === 'assistant') {
          assistantMessageStarted = true
          callbacks?.onMessageStart?.()
        }

        if (typedEvent.type === 'message_update') {
          if (!assistantMessageStarted) {
            assistantMessageStarted = true
            callbacks?.onMessageStart?.()
          }
          this.applyPiAssistantUpdate(
            typedEvent.assistantMessageEvent,
            callbacks,
            (toolCall) => {
              if (startedToolCalls.has(toolCall.id)) return
              startedToolCalls.add(toolCall.id)
              callbacks?.onToolCallStart?.(toolCall)
            },
            toolCallIdByIndex
          )
        }

        if (typedEvent.type === 'tool_execution_start') {
          const args = (typedEvent.args || {}) as Record<string, unknown>
          toolCallArgsById.set(typedEvent.toolCallId, args)
          if (!startedToolCalls.has(typedEvent.toolCallId)) {
            startedToolCalls.add(typedEvent.toolCallId)
            callbacks?.onToolCallStart?.({
              id: typedEvent.toolCallId,
              type: 'function',
              function: {
                name: typedEvent.toolName,
                arguments: JSON.stringify(args),
              },
            })
          }
        }

        if (typedEvent.type === 'tool_execution_end') {
          const resultText = this.extractTextContent((typedEvent.result as PiToolResultMessage)?.content) || ''
          pendingToolCompletions.set(typedEvent.toolCallId, {
            toolCall: {
              id: typedEvent.toolCallId,
              type: 'function',
              function: {
                name: typedEvent.toolName,
                arguments: JSON.stringify(toolCallArgsById.get(typedEvent.toolCallId) || {}),
              },
            },
            resultText,
          })
        }

        if (typedEvent.type === 'message_end') {
          const mapped = this.piToInternalMessage(typedEvent.message)
          if (!mapped || mapped.role === 'user') continue
          if (mapped.role === 'assistant') {
            assistantMessageStarted = false
          }
          if (mapped.role === 'assistant') {
            assistantMessageCount++
            if (assistantMessageCount > this.maxIterations) {
              reachedMaxIterations = true
              break
            }
          }
          allMessages = produce(allMessages, (draft) => {
            draft.push(mapped)
          })
          callbacks?.onMessagesUpdated?.(allMessages)
          if (mapped.role === 'tool' && mapped.toolCallId) {
            const pending = pendingToolCompletions.get(mapped.toolCallId)
            if (pending) {
              callbacks?.onToolCallComplete?.(pending.toolCall, pending.resultText)
              pendingToolCompletions.delete(mapped.toolCallId)
            }
          }
        }
      }
    } catch (error) {
      if (signal.aborted) {
        callbacks?.onComplete?.(allMessages)
        return allMessages
      }
      throw error
    }

    for (const pending of pendingToolCompletions.values()) {
      callbacks?.onToolCallComplete?.(pending.toolCall, pending.resultText)
    }

    if (shouldStopForElicitation) {
      callbacks?.onComplete?.(allMessages)
      return allMessages
    }

    if (reachedMaxIterations) {
      callbacks?.onIterationLimitReached?.(this.maxIterations)
    }

    if (this.onLoopComplete) {
      try {
        await this.onLoopComplete()
      } catch (error) {
        console.warn('[AgentLoop] onLoopComplete callback failed:', error)
      }
    }

    callbacks?.onComplete?.(allMessages)
    return allMessages
  }

  /**
   * Run the agent loop with a list of messages.
   * Appends new assistant/tool messages and returns the full updated list.
   */
  async run(messages: Message[], callbacks?: AgentCallbacks): Promise<Message[]> {
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    // Phase 2 P1: Trigger predictive file loading before processing
    await this.triggerPrefetchIfNeeded(messages)

    // Inject matching skills and MCP services into system prompt
    await this.injectEnhancements(messages)

    try {
      return await this.runWithPiAgentCore(messages, callbacks)
    } catch (error) {
      if (signal.aborted) {
        callbacks?.onComplete?.(messages)
        return messages
      }
      const err = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(err)
      throw err
    } finally {
      this.abortController = null
    }
  }
}
