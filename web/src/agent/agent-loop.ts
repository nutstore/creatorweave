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
import { buildAvailableWorkflowsBlock } from './workflow/workflow-injection'
// Phase 2: Intelligence enhancements
import { getIntelligenceCoordinator } from './intelligence-coordinator'
// Phase 2 P1: Predictive file loading
import { triggerPrefetch } from './prefetch'
import { agentLoopContinue, type AgentTool, type StreamFn } from '@mariozechner/pi-agent-core'
import type {
  AgentEvent as PiAgentEvent,
  AgentMessage as PiAgentMessage,
} from '@mariozechner/pi-agent-core'
import type {
  AssistantMessageEvent as PiAssistantMessageEvent,
  Message as PiMessage,
  ToolResultMessage as PiToolResultMessage,
} from '@mariozechner/pi-ai'
import { streamSimple as piAiStreamSimple } from '@mariozechner/pi-ai'
import { PiAIProvider } from './llm/pi-ai-provider'
import { useSettingsStore } from '@/store/settings.store'
import { isToolAllowedInMode, type AgentMode } from './agent-mode'
import { isToolEnvelopeV2 } from './tools/tool-envelope'
import { notifyOtherToolCall } from './tools/loop-guard'

const MAX_ITERATIONS = 20
const DEFAULT_SYSTEM_PROMPT = UNIVERSAL_SYSTEM_PROMPT
const DEFAULT_TOOL_TIMEOUT = 30000
const TOOL_TIMEOUT_EXEMPTIONS = new Set<string>(['run_workflow'])
const SUMMARY_MIN_DROPPED_GROUPS = 2
const SUMMARY_MIN_DROPPED_CONTENT_CHARS = 800
const SUMMARY_MIN_INTERVAL_CONVERT_CALLS = 8
/** After compression, ensure context usage is at or below this ratio of the input budget.
 *  Prevents repeated compression on successive convert calls. */
const COMPRESSION_TARGET_RATIO = 0.7
const CONTEXT_SUMMARY_SYSTEM_PROMPT = `You are compressing an earlier conversation into a dense memory snapshot. Another AI will continue from this summary, so you must preserve:

1. **User's goals and intentions** - what the user was trying to accomplish
2. **Key decisions made** - architectural choices, file changes, tool selections
3. **Important constraints** - requirements, limits, conventions being followed
4. **File paths and locations** - files created/modified/deleted, important references
5. **Tool findings and results** - search results, read file contents, critical outputs
6. **Unresolved tasks** - what still needs to be done, next steps, open questions
7. **Error context** - failures encountered and how they were addressed

Output format:
- Use bullet points for scanability
- Group by topic rather than chronologically
- Preserve specific names, paths, and numbers (don't generalize)
- Keep the most recent and relevant information
- Total output should be dense but complete - prefer specifics over vagaries

Example:
**User Goal**: Implement user authentication with JWT
**Decisions**: Use bcrypt for passwords, JWT with 24h expiry, store refresh tokens in httpOnly cookies
**Files**: src/auth/login.ts (new), src/auth/jwt.ts (new), src/middleware/auth.ts (modified)
**Progress**: Login endpoint complete, registration WIP, refresh token not yet implemented
**Errors**: CORS error on first attempt, resolved by adding credentials: 'include'`
const COMPRESSED_MEMORY_PREFIX = 'Earlier conversation summary:'
type CompressionSummaryMode = 'llm' | 'fallback' | 'skip'
type CompressionBaselineState = {
  summary: string
  cutoffTimestamp: number
}

export interface BeforeToolCallHookContext {
  toolName: string
  toolCallId: string
  args: Record<string, unknown>
}

export interface BeforeToolCallHookResult {
  block?: boolean
  reason?: string
}

export interface AfterToolCallHookContext {
  toolName: string
  toolCallId: string
  args: Record<string, unknown>
  content: string
  details: Record<string, unknown>
  isError: boolean
}

export interface AfterToolCallHookResult {
  content?: string
  details?: Record<string, unknown>
  isError?: boolean
}

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
  onContextCompressionStart?: (payload: { droppedGroups: number; droppedContentChars: number }) => void
  /** Called when context compression completes */
  onContextCompressionComplete?: (payload: {
    mode: CompressionSummaryMode
    summary: string | null
    droppedGroups: number
    droppedContentChars: number
    summaryChars: number
    latencyMs: number
  }) => void
  /** Called before each model turn with estimated context usage */
  onContextUsageUpdate?: (payload: {
    /** Actual prompt input tokens sent to model for this turn */
    usedTokens: number
    /** Effective input budget E = modelMaxTokens - reserveTokens */
    maxTokens: number
    /** Reserved output tokens */
    reserveTokens: number
    /** usagePercent = usedTokens / maxTokens * 100 */
    usagePercent: number
  }) => void
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
  /** Optional hook called before tool execution */
  beforeToolCall?: (
    context: BeforeToolCallHookContext
  ) => Promise<BeforeToolCallHookResult | undefined> | BeforeToolCallHookResult | undefined
  /** Optional hook called after tool execution */
  afterToolCall?: (
    context: AfterToolCallHookContext
  ) => Promise<AfterToolCallHookResult | undefined> | AfterToolCallHookResult | undefined
  /** Agent execution mode: 'plan' (read-only) or 'act' (full access). Defaults to 'act'. */
  mode?: AgentMode
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
  private beforeToolCall?: AgentLoopConfig['beforeToolCall']
  private afterToolCall?: AgentLoopConfig['afterToolCall']
  private convertCallCount = 0
  private lastSummaryConvertCall = Number.NEGATIVE_INFINITY
  private mode: AgentMode

  constructor(config: AgentLoopConfig) {
    this.provider = config.provider
    this.toolRegistry = config.toolRegistry
    this.contextManager = config.contextManager
    this.toolContext = config.toolContext
    if (!this.toolContext.readFileState) {
      this.toolContext.readFileState = new Map()
    }
    this.maxIterations = config.maxIterations || MAX_ITERATIONS
    this.baseSystemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT
    this.sessionId = config.sessionId
    this.onLoopComplete = config.onLoopComplete
    this.toolExecutionTimeout = config.toolExecutionTimeout || DEFAULT_TOOL_TIMEOUT
    this.beforeToolCall = config.beforeToolCall
    this.afterToolCall = config.afterToolCall
    this.mode = config.mode || 'act'
    this.contextManager.setSystemPrompt(this.baseSystemPrompt)
  }

  /** Get current agent mode */
  getMode(): AgentMode {
    return this.mode
  }

  /** Set agent mode */
  setMode(mode: AgentMode): void {
    this.mode = mode
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

    // Start with base system prompt, enhanced with scenario detection and agent mode
    let enhancedPrompt = buildEnhancedSystemPrompt(this.baseSystemPrompt, userMessage, this.mode)

    // Phase 2: Inject intelligent enhancements (tool recs, project fingerprint, memory)
    try {
      const coordinator = getIntelligenceCoordinator()
      const intelligenceResult = await coordinator.enhanceSystemPrompt(enhancedPrompt, {
        directoryHandle: this.toolContext.directoryHandle || undefined,
        userMessage,
        sessionId: this.sessionId,
        currentAgentId: this.toolContext.currentAgentId ?? null,
      })

      enhancedPrompt = intelligenceResult.systemPrompt
    } catch (error) {
      console.warn('[AgentLoop] Failed to inject intelligence enhancements:', error)
      // Continue without intelligence enhancements
    }

    // Inject available workflow catalog block
    try {
      const workflowBlock = buildAvailableWorkflowsBlock()
      if (workflowBlock) {
        enhancedPrompt += '\n\n' + workflowBlock
      }
    } catch (error) {
      console.warn('[AgentLoop] Failed to inject workflow catalog:', error)
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
          if (tc.function.name === 'read') {
            try {
              const args = JSON.parse(tc.function.arguments)
              if (typeof args.path === 'string') {
                recentFiles.push(args.path)
              }
              if (Array.isArray(args.paths)) {
                for (const p of args.paths) {
                  if (typeof p === 'string') recentFiles.push(p)
                }
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
  ): Promise<{ summary: string | null; mode: CompressionSummaryMode }> {
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
      return { summary: summary || null, mode: 'llm' }
    } catch (error) {
      console.warn('[AgentLoop] LLM context summary failed, falling back to heuristic summary:', error)
      return { summary: this.createHeuristicSummary(droppedContent, maxSummaryTokens), mode: 'fallback' }
    }
  }

  private createHeuristicSummary(droppedContent: string, maxSummaryTokens: number): string {
    const lines = droppedContent
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const userGoals: string[] = []
    const decisions: string[] = []
    const files: string[] = []
    const toolFindings: string[] = []

    for (const line of lines) {
      if (line.startsWith('User:') && userGoals.length < 10) {
        userGoals.push(line.slice(5).trim())
      } else if (line.startsWith('Assistant:') && decisions.length < 10) {
        decisions.push(line.slice(10).trim().slice(0, 500))
      } else if (line.startsWith('Tool result:') && toolFindings.length < 8) {
        toolFindings.push(line.slice(12).trim().slice(0, 400))
      }
    }

    const parts: string[] = [COMPRESSED_MEMORY_PREFIX]
    if (userGoals.length > 0) {
      parts.push('**User Goal**: ' + userGoals[userGoals.length - 1]) // Most recent goal first
    }
    if (decisions.length > 0) {
      parts.push('**Key Decisions**:')
      decisions.slice(-5).forEach((d) => parts.push(`- ${d}`))
    }
    if (files.length > 0) {
      parts.push('**Files**: ' + files.join(', '))
    }
    if (toolFindings.length > 0) {
      parts.push('**Tool Findings**:')
      toolFindings.slice(-5).forEach((f) => parts.push(`- ${f}`))
    }

    const roughMaxChars = Math.max(200, maxSummaryTokens * 3)
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

  /**
   * Find cutoff timestamp for rebuilding context after compression.
   * We keep messages from the latest USER message onward.
   * The user's latest message must always be preserved so the agent knows what to do.
   */
  private getCompressionCutoffTimestamp(messages: Message[]): number | null {
    // Find the LAST (most recent) user message to use as the cutoff boundary.
    // We specifically look for 'user' role, not 'tool', because:
    // - Tool results come AFTER the user's message and should be summarizable
    // - The user's latest message must ALWAYS be preserved for the agent to know what to do
    // - Using a tool timestamp as cutoff would exclude the user's message on subsequent turns
    const boundary = [...messages].reverse().find((msg) => msg.role === 'user')
    return typeof boundary?.timestamp === 'number' ? boundary.timestamp : null
  }

  /**
   * Rebuild model input context from compression baseline:
   * [summary] + [messages at/after cutoff].
   */
  private applyCompressionBaseline(
    messages: Message[],
    baseline: CompressionBaselineState
  ): Message[] {
    const retained = messages.filter(
      (msg) => typeof msg.timestamp === 'number' && msg.timestamp >= baseline.cutoffTimestamp
    )

    if (retained.length === 0) {
      return messages
    }

    const summaryMessage = createAssistantMessage(
      `${COMPRESSED_MEMORY_PREFIX}\n${baseline.summary}`,
      undefined,
      undefined,
      null,
      'context_summary'
    )
    // Ensure summary stays before retained prompt boundary for stable ordering.
    summaryMessage.timestamp = Math.max(0, baseline.cutoffTimestamp - 1)
    return [summaryMessage, ...retained]
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
    timeoutMs: number | null
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
    const timeoutPromise =
      typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
        ? new Promise<string>((_, reject) => {
            timeoutId = setTimeout(() => {
              didTimeout = true
              reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`))
              timeoutController.abort()
            }, timeoutMs)
          })
        : null

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
      const racers: Array<Promise<string>> = [
        this.toolRegistry.execute(toolName, args, {
          ...this.toolContext,
          abortSignal: timeoutController.signal,
        }),
        abortPromise,
      ]
      if (timeoutPromise) {
        racers.push(timeoutPromise)
      }
      return await Promise.race(racers)
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      for (const cleanup of cleanupListeners) cleanup()
    }
  }

  private parseToolArgs(args: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(args) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
      return { __invalid_arguments: true }
    } catch {
      return { __invalid_arguments: true }
    }
  }

  private coerceToolArgs(params: unknown): Record<string, unknown> {
    if (params == null) return {}
    if (typeof params === 'object' && !Array.isArray(params)) {
      return params as Record<string, unknown>
    }
    throw new Error('invalid_arguments: Tool arguments must be a JSON object')
  }

  private buildContextOverflowError(payload: {
    maxContextLimit: number
    reserveTokens: number
    inputBudget: number
    historyTokens: number
    toolResultTokens: number
    totalInputTokens: number
  }): Error {
    return new Error(
      JSON.stringify({
        error: 'context_overflow',
        message:
          'Tool result is too large for current model context. Use filters like max_results, glob, or start_line to limit the output size.',
        modelContextLimit: payload.maxContextLimit,
        reserveTokens: payload.reserveTokens,
        inputBudget: payload.inputBudget,
        historyTokens: payload.historyTokens,
        toolResultTokens: payload.toolResultTokens,
        totalInputTokens: payload.totalInputTokens,
        suggestion: 'For search: use max_results parameter. For read: use start_line and line_count parameters.',
      })
    )
  }

  private ensureLatestToolResultFitsContext(
    internalMessages: Message[],
    trimmedMessages: ChatMessage[],
    maxContextTokens: number,
    reserveTokens: number
  ): ChatMessage[] {
    const latestTool = [...internalMessages].reverse().find((msg) => msg.role === 'tool')
    if (!latestTool || !latestTool.toolCallId) return trimmedMessages

    const toolStillIncluded = trimmedMessages.some(
      (msg) =>
        msg.role === 'tool' &&
        msg.tool_call_id === latestTool.toolCallId &&
        typeof msg.content === 'string' &&
        msg.content === latestTool.content
    )
    if (toolStillIncluded) return trimmedMessages

    const allMessages = messagesToChatMessages(internalMessages)
    const historyOnlyMessages = messagesToChatMessages(
      internalMessages.filter((msg) => msg.id !== latestTool.id)
    )
    const totalInputTokens = this.provider.estimateTokens(allMessages)
    const historyTokens = this.provider.estimateTokens(historyOnlyMessages)
    const toolResultTokens = Math.max(0, totalInputTokens - historyTokens)
    const inputBudget = Math.max(1, maxContextTokens - reserveTokens)

    // First fallback: degrade the latest tool result to a compact summary message,
    // then retry trimming without summary generation.
    const degradedToolContent = JSON.stringify({
      tool_result_truncated: true,
      toolCallId: latestTool.toolCallId,
      toolName: latestTool.name,
      originalToolTokens: toolResultTokens,
      note: 'too_large',
    })

    const degradedInternalMessages = internalMessages.map((msg) =>
      msg.id === latestTool.id ? { ...msg, content: degradedToolContent } : msg
    )
    const retrimmedMessages = this.contextManager.trimMessages(
      messagesToChatMessages(degradedInternalMessages),
      { createSummary: false }
    ).messages

    const degradedToolIncluded = retrimmedMessages.some(
      (msg) =>
        msg.role === 'tool' &&
        msg.tool_call_id === latestTool.toolCallId &&
        typeof msg.content === 'string' &&
        msg.content === degradedToolContent
    )
    if (degradedToolIncluded) {
      return retrimmedMessages
    }

    // If even degraded content cannot fit, fail explicitly.
    throw this.buildContextOverflowError({
      maxContextLimit: maxContextTokens,
      reserveTokens,
      inputBudget,
      historyTokens,
      toolResultTokens,
      totalInputTokens,
    })
  }

  /**
   * 在 normalizeToolResult 之前截断过大的工具结果
   * 防止原始结果在消息中就占满上下文
   *
   * @param rawResult 工具返回的原始结果
   * @param toolName 工具名称
   * @param existingTokens 现有消息的 token 数量
   * @param maxContextTokens 最大上下文 token 数
   * @param reserveTokens 预留 token 数
   * @returns 截断后的结果
   */
  private truncateLargeToolResult(
    rawResult: string,
    toolName: string,
    existingTokens: number,
    maxContextTokens: number,
    reserveTokens: number
  ): string {
    // 计算工具结果的最大可用预算（总预算 - 现有消息 - 预留）
    // 额外留 10% 余量防止估算误差
    const availableForTool = Math.max(
      1000, // 最少给 1000 tokens
      (maxContextTokens - reserveTokens - existingTokens) * 0.9
    )

    // 如果工具结果本身就在预算内，不需要截断
    const estimatedResultTokens = this.estimateTextTokens(rawResult)
    if (estimatedResultTokens <= availableForTool) {
      return rawResult
    }

    console.warn(
      `[AgentLoop] Tool result too large for context: result=${estimatedResultTokens}, available=${Math.floor(availableForTool)}, tool=${toolName}`
    )

    // 尝试解析 JSON 以进行智能截断
    const trimmed = rawResult.trim()
    try {
      const parsed = JSON.parse(trimmed) as unknown

      // 特殊处理 search 工具的结果
      const searchPayload =
        toolName === 'search' && isToolEnvelopeV2(parsed) && parsed.ok
          ? parsed.data
          : parsed
      if (
        toolName === 'search' &&
        searchPayload &&
        typeof searchPayload === 'object' &&
        'results' in searchPayload &&
        'totalMatches' in searchPayload &&
        Array.isArray((searchPayload as { results?: unknown[] }).results)
      ) {
        const searchResult = searchPayload as {
          results: Array<{
            path: string
            line: number
            match: string
            column?: number
            preview?: string
          }>
          totalMatches: number
          scannedFiles?: number
          truncated?: boolean
          message?: string
        }

        // 二分查找最大可容纳的结果数量（包含 0 条结果）
        let left = 0
        let right = Math.min(searchResult.results.length, 200) // 最多 200 条
        let bestCount = 0
        const emptySearchSummary = {
          ...searchResult,
          results: [],
          truncated: true,
          originalTotalMatches: searchResult.totalMatches,
          message: `Found ${searchResult.totalMatches} matches in ${searchResult.scannedFiles || 0} files. Results too large to display. Use filters like glob, path, or reduce search scope.`,
        }
        let bestResult: Record<string, unknown> =
          toolName === 'search' && isToolEnvelopeV2(parsed) && parsed.ok
            ? { ...parsed, data: emptySearchSummary }
            : emptySearchSummary

        while (left <= right) {
          const mid = Math.floor((left + right) / 2)
          const testResults = searchResult.results.slice(0, mid).map((hit) => ({
            path: hit.path,
            line: hit.line,
            match: hit.match,
          }))

          const testResult = {
            ...searchResult,
            results: testResults,
            truncated: true,
            originalTotalMatches: searchResult.totalMatches,
            message: `Found ${searchResult.totalMatches} matches in ${searchResult.scannedFiles || 0} files. Showing first ${testResults.length} results.`,
          }

          const candidateResult =
            toolName === 'search' && isToolEnvelopeV2(parsed) && parsed.ok
              ? { ...parsed, data: testResult }
              : testResult

          const testTokens = this.estimateTextTokens(JSON.stringify(candidateResult))

          if (testTokens <= availableForTool) {
            bestCount = testResults.length
            bestResult =
              toolName === 'search' && isToolEnvelopeV2(parsed) && parsed.ok
                ? { ...parsed, data: testResult }
                : testResult
            left = mid + 1
          } else {
            right = mid - 1
          }
        }

        // 如果一条都放不下，只返回摘要
        if (bestCount === 0) {
          return JSON.stringify(bestResult)
        }

        return JSON.stringify(bestResult)
      }

      // 其他 JSON 结果，简单截断
      const truncateRatio = availableForTool / estimatedResultTokens
      const truncateAt = Math.floor(rawResult.length * truncateRatio * 0.8)
      return rawResult.slice(0, truncateAt) +
        `\n\n... [Result truncated due to size: ${estimatedResultTokens} tokens, available ${Math.floor(availableForTool)} tokens. Use filters to reduce output.]`

    } catch {
      // 非 JSON 结果，直接截断
      const truncateRatio = availableForTool / estimatedResultTokens
      const truncateAt = Math.floor(rawResult.length * truncateRatio * 0.8)
      return rawResult.slice(0, truncateAt) +
        `\n\n... [Result truncated due to size: ${estimatedResultTokens} tokens, available ${Math.floor(availableForTool)} tokens. Use filters to reduce output.]`
    }
  }

  private estimateTextTokens(text: string): number {
    const pseudoMessages: ChatMessage[] = [
      {
        role: 'assistant',
        content: text,
      },
    ]
    return this.provider.estimateTokens(pseudoMessages)
  }

  private normalizeToolResult(
    rawResult: string
  ): { content: string; details: Record<string, unknown>; isError: boolean } {
    const details: Record<string, unknown> = { raw: rawResult }
    const trimmed = rawResult.trim()
    if (!trimmed) {
      return { content: '', details, isError: false }
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown
      details.parsed = parsed
      if (isToolEnvelopeV2(parsed)) {
        details.tool = parsed.tool
        details.version = parsed.version
        if (!parsed.ok) {
          details.errorCode = parsed.error.code
          details.error = parsed.error.message
          return {
            content: `Error [${parsed.error.code}]: ${parsed.error.message}`,
            details,
            isError: true,
          }
        }
        return { content: rawResult, details, isError: false }
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        'error' in parsed &&
        typeof (parsed as { error?: unknown }).error === 'string'
      ) {
        const errorMessage = (parsed as { error: string }).error
        details.error = errorMessage
        return { content: `Error: ${errorMessage}`, details, isError: true }
      }
    } catch {
      // Non-JSON output is a valid tool result.
    }

    const isError = /^error:/i.test(trimmed)
    return {
      content: rawResult,
      details,
      isError,
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
    const lastSummaryIndex = messages.map((m) => m.kind).lastIndexOf('context_summary')
    const modelMessages = lastSummaryIndex >= 0 ? messages.slice(lastSummaryIndex) : messages
    const model = this.provider.getModel()
    return modelMessages.flatMap((msg): PiMessage[] => {
      if (msg.kind === 'context_summary') {
        return [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: `${COMPRESSED_MEMORY_PREFIX}\n${msg.content || ''}`,
              },
            ],
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: msg.timestamp || Date.now(),
          },
        ]
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
    let compressionBaseline: CompressionBaselineState | null = null
    const emittedToolCallSignatures = new Map<string, string>()
    const toolCallIdByIndex = new Map<number, string>()
    const toolCallArgsById = new Map<string, Record<string, unknown>>()
    const pendingToolCompletions = new Map<string, { toolCall: ToolCall; resultText: string }>()
    const model = this.provider.getModel()
    const apiKey = this.provider.getApiKey()

    const agentTools: AgentTool[] = this.toolRegistry.getToolDefinitionsForMode(this.mode).map((toolDef) => ({
      name: toolDef.function.name,
      label: toolDef.function.name,
      description: toolDef.function.description || '',
      parameters: toolDef.function.parameters as never,
      execute: async (toolCallId, params) => {
        const args = this.coerceToolArgs(params)
        const toolCall: ToolCall = {
          id: toolCallId,
          type: 'function',
          function: {
            name: toolDef.function.name,
            arguments: JSON.stringify(args),
          },
        }

        try {
          // Mode-based tool access control
          if (!isToolAllowedInMode(toolDef.function.name, this.mode)) {
            throw new Error(
              `Tool "${toolDef.function.name}" is not available in ${this.mode} mode. ` +
              `This tool requires write access. Switch to Act mode to use it.`
            )
          }

          if (this.beforeToolCall) {
            const before = await this.beforeToolCall({
              toolName: toolDef.function.name,
              toolCallId,
              args,
            })
            if (before?.block) {
              throw new Error(before.reason || 'Tool execution was blocked by policy.')
            }
          }

          // 计算当前上下文使用情况，传递给工具用于自我调节
          const existingMessages = messagesToChatMessages(allMessages)
          const contextConfig = this.contextManager.getConfig()
          const maxContextTokens =
            contextConfig.maxContextTokens || this.provider.maxContextTokens || 200000
          const reserveTokens = contextConfig.reserveTokens ?? 8192
          const usedTokens = this.provider.estimateTokens(existingMessages)

          // 在调用工具前更新 toolContext 的 contextUsage
          const toolContextWithUsage: ToolContext = {
            ...this.toolContext,
            contextUsage: {
              usedTokens,
              maxTokens: maxContextTokens - reserveTokens,
            },
          }

          // 临时替换 toolContext 以传递 contextUsage
          const originalToolContext = this.toolContext
          this.toolContext = toolContextWithUsage

          let rawResult = ''
          try {
            rawResult = await this.executeToolWithTimeout(
              toolDef.function.name,
              args,
              TOOL_TIMEOUT_EXEMPTIONS.has(toolDef.function.name) ? null : this.toolExecutionTimeout
            )
          } finally {
            // 无论工具执行成功或失败，都恢复原始上下文
            this.toolContext = originalToolContext
            // Loop guard: reset consecutive counter after non-read/non-search tool execution.
            // This ensures that read→write→read doesn't accumulate consecutive reads.
            const toolName = toolDef.function.name
            if (toolName !== 'read' && toolName !== 'search') {
              notifyOtherToolCall(this.toolContext)
            }
          }

          // 在 normalizeToolResult 之前就截断过大的结果
          rawResult = this.truncateLargeToolResult(
            rawResult,
            toolDef.function.name,
            usedTokens,
            maxContextTokens,
            reserveTokens
          )

          const normalized = this.normalizeToolResult(rawResult)

          let finalContent = normalized.content
          let finalDetails = normalized.details
          let finalIsError = normalized.isError

          if (this.afterToolCall) {
            const patched = await this.afterToolCall({
              toolName: toolDef.function.name,
              toolCallId,
              args,
              content: finalContent,
              details: finalDetails,
              isError: finalIsError,
            })
            if (patched?.content !== undefined) finalContent = patched.content
            if (patched?.details !== undefined) finalDetails = patched.details
            if (patched?.isError !== undefined) finalIsError = patched.isError
          }

          if (finalIsError) {
            throw new Error(
              finalContent.replace(/^Error(?:\s*\[[^\]]+\])?:\s*/i, '') || 'Tool execution failed'
            )
          }

          let elicitationData: {
            mode: 'binary'
            message: string
            toolName: string
            args: Record<string, unknown>
            serverId: string
          } | null = null
          try {
            const parsedResult = JSON.parse(rawResult)
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

          if (toolDef.function.name === 'execute' && args.language === 'python' && rawResult) {
            try {
              const parsedResult = JSON.parse(rawResult)
              if (parsedResult.fileChanges) {
                const { useConversationContextStore } = await import('@/store/conversation-context.store')
                useConversationContextStore.getState().addChanges(parsedResult.fileChanges)
              }
            } catch {
              // ignore non-json outputs
            }
          }

          return {
            content: [{ type: 'text', text: finalContent }],
            details: finalDetails,
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

    const streamFn = piAiStreamSimple as unknown as StreamFn

    // Read thinking settings from store
    const settingsState = useSettingsStore.getState()
    const reasoning = settingsState.enableThinking ? settingsState.thinkingLevel : undefined

    const loop = agentLoopContinue(
      context,
      {
        model,
        getApiKey: () => apiKey,
        maxTokens: model.maxTokens,
        reasoning,
        convertToLlm: async (agentMessages) => {
          this.convertCallCount++
          const internalMessagesRaw = agentMessages
            .map((m) => this.piToInternalMessage(m))
            .filter((m): m is Message => m !== null)
          const internalMessages = compressionBaseline
            ? this.applyCompressionBaseline(internalMessagesRaw, compressionBaseline)
            : internalMessagesRaw
          if (compressionBaseline) {
            console.info('[AgentLoop] Using compression baseline', {
              convertCallCount: this.convertCallCount,
              cutoffTimestamp: compressionBaseline.cutoffTimestamp,
              summaryChars: compressionBaseline.summary.length,
              rawMessageCount: internalMessagesRaw.length,
              effectiveMessageCount: internalMessages.length,
            })
          }
          const contextConfig = this.contextManager.getConfig()
          const maxContextTokens =
            contextConfig.maxContextTokens || this.provider.maxContextTokens || 128000
          const reserveTokens = contextConfig.reserveTokens ?? 0
          const inputBudget = Math.max(1, maxContextTokens - reserveTokens)
          const chatMessages = messagesToChatMessages(internalMessages)
          const preTrimTokens = this.provider.estimateTokens(chatMessages)
          const summaryTokenBudget = Math.min(
            2400,
            Math.max(500, Math.floor(maxContextTokens * 0.02))
          )
          const trimmedResult = this.contextManager.trimMessages(chatMessages, {
            createSummary: true,
            maxSummaryTokens: summaryTokenBudget,
            summaryStrategy: 'external',
          })
          let trimmed = trimmedResult.messages
          if (trimmedResult.droppedContent) {
            const droppedContent = trimmedResult.droppedContent
            const droppedGroups = trimmedResult.droppedGroups
            const droppedContentChars = droppedContent.length
            const preTrimUsagePercent = Math.max(0, Math.min(100, (preTrimTokens / inputBudget) * 100))
            const shouldSummarize = this.shouldCallLLMSummary(droppedGroups, droppedContent)
            console.info('[AgentLoop] Context compression triggered', {
              convertCallCount: this.convertCallCount,
              droppedGroups,
              droppedContentChars,
              shouldSummarize,
              preTrimTokens,
              inputBudget,
              reserveTokens,
              modelMaxTokens: maxContextTokens,
              preTrimUsagePercent: Number(preTrimUsagePercent.toFixed(2)),
              triggerThresholdPercent: 85,
              targetPercent: COMPRESSION_TARGET_RATIO * 100,
            })

            if (shouldSummarize) {
              callbacks?.onContextCompressionStart?.({ droppedGroups, droppedContentChars })
              const startedAt = Date.now()
              const { summary, mode } = await this.generateContextSummaryWithLLM(
                droppedContent,
                summaryTokenBudget
              )
              const latencyMs = Date.now() - startedAt
              if (summary) {
                this.lastSummaryConvertCall = this.convertCallCount
                const cutoffTimestamp = this.getCompressionCutoffTimestamp(internalMessagesRaw)
                if (typeof cutoffTimestamp === 'number') {
                  compressionBaseline = { summary, cutoffTimestamp }
                }
                trimmed = this.injectSummaryMessage(trimmed, summary)
                // First safety pass: summary injection must still fit the context budget.
                trimmed = this.contextManager.trimMessages(trimmed, { createSummary: false }).messages
                // Headroom enforcement: ensure post-compression usage is below the target ratio
                // so that we don't immediately re-trigger compression on the next few turns.
                const cfg = this.contextManager.getConfig()
                const budget = cfg.maxContextTokens - (cfg.reserveTokens ?? 0)
                const targetTokens = Math.floor(budget * COMPRESSION_TARGET_RATIO)
                const postTrimTokens = this.provider.estimateTokens(trimmed)
                if (postTrimTokens > targetTokens) {
                  trimmed = this.contextManager.trimMessagesToTarget(trimmed, targetTokens)
                }
              }
              const postCompressionTokens = this.provider.estimateTokens(trimmed)
              const postCompressionUsagePercent = Math.max(
                0,
                Math.min(100, (postCompressionTokens / inputBudget) * 100)
              )
              console.info('[AgentLoop] Context compression complete', {
                convertCallCount: this.convertCallCount,
                mode,
                droppedGroups,
                droppedContentChars,
                summaryChars: summary?.length || 0,
                compressionBaselineCutoff: compressionBaseline?.cutoffTimestamp ?? null,
                postCompressionTokens,
                inputBudget,
                postCompressionUsagePercent: Number(postCompressionUsagePercent.toFixed(2)),
                targetPercent: COMPRESSION_TARGET_RATIO * 100,
              })
              callbacks?.onContextCompressionComplete?.({
                mode,
                summary,
                droppedGroups,
                droppedContentChars,
                summaryChars: summary?.length || 0,
                latencyMs,
              })

              // Inject the summary into allMessages so it appears in the
              // conversation at the correct position (alongside other
              // assistant/tool messages in the current turn), rather than
              // being appended at the very end after the loop completes.
              if (summary) {
                const summaryMessage = createAssistantMessage(
                  `${COMPRESSED_MEMORY_PREFIX}\n${summary}`,
                  undefined,
                  undefined,
                  null,
                  'context_summary'
                )
                allMessages = produce(allMessages, (draft) => {
                  draft.push(summaryMessage)
                })
                callbacks?.onMessagesUpdated?.(allMessages)
              }
            } else {
              callbacks?.onContextCompressionComplete?.({
                mode: 'skip',
                summary: null,
                droppedGroups,
                droppedContentChars,
                summaryChars: 0,
                latencyMs: 0,
              })
              const postCompressionTokens = this.provider.estimateTokens(trimmed)
              const postCompressionUsagePercent = Math.max(
                0,
                Math.min(100, (postCompressionTokens / inputBudget) * 100)
              )
              console.info('[AgentLoop] Context compression complete', {
                convertCallCount: this.convertCallCount,
                mode: 'skip',
                droppedGroups,
                droppedContentChars,
                summaryChars: 0,
                postCompressionTokens,
                inputBudget,
                postCompressionUsagePercent: Number(postCompressionUsagePercent.toFixed(2)),
                targetPercent: COMPRESSION_TARGET_RATIO * 100,
              })
            }
          }

          // If the latest tool result can't survive compression, fail explicitly
          // instead of silently hiding it from the model.
          trimmed = this.ensureLatestToolResultFitsContext(
            internalMessages,
            trimmed,
            maxContextTokens,
            reserveTokens
          )

          const usedTokens = this.provider.estimateTokens(trimmed)
          if (usedTokens > inputBudget) {
            throw this.buildContextOverflowError({
              maxContextLimit: maxContextTokens,
              reserveTokens,
              inputBudget,
              historyTokens: usedTokens,
              toolResultTokens: 0,
              totalInputTokens: usedTokens,
            })
          }
          // Use the same denominator as ContextManager (input budget, not raw max)
          // so the reported percentage aligns with compression trigger thresholds.
          const usagePercent = Math.max(0, Math.min(100, (usedTokens / Math.max(1, inputBudget)) * 100))
          callbacks?.onContextUsageUpdate?.({
            usedTokens,
            // Report the effective input budget (M - R), not raw model context limit.
            maxTokens: inputBudget,
            reserveTokens,
            usagePercent,
          })

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
      signal,
      streamFn
    )

    const emitToolCallStartIfChanged = (toolCall: ToolCall) => {
      const signature = `${toolCall.function.name}:${toolCall.function.arguments}`
      const previous = emittedToolCallSignatures.get(toolCall.id)
      if (previous === signature) return
      emittedToolCallSignatures.set(toolCall.id, signature)
      callbacks?.onToolCallStart?.(toolCall)
    }

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
              emitToolCallStartIfChanged(toolCall)
            },
            toolCallIdByIndex
          )
        }

        if (typedEvent.type === 'tool_execution_start') {
          const args = (typedEvent.args || {}) as Record<string, unknown>
          toolCallArgsById.set(typedEvent.toolCallId, args)
          emitToolCallStartIfChanged({
            id: typedEvent.toolCallId,
            type: 'function',
            function: {
              name: typedEvent.toolName,
              arguments: JSON.stringify(args),
            },
          })
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
