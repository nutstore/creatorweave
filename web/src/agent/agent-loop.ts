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

import type { ToolContext } from './tools/tool-types'
import type { Message } from './message-types'
import { ContextManager } from './context-manager'
import { ToolRegistry } from './tool-registry'
import { UNIVERSAL_SYSTEM_PROMPT } from './prompts/universal-system-prompt'
import { PiAIProvider } from './llm/pi-ai-provider'
import { type AgentMode } from './agent-mode'
import { generateContextSummaryWithLLM } from './loop/context-summary'
import { buildRuntimeEnhancedPrompt, triggerPrefetchForMessages } from './loop/enhancements'
import { executePiCoreLoop } from './loop/pi-core-runner'
import type { AgentCallbacks, AgentLoopConfig } from './loop/types'

export type {
  AfterToolCallHookContext,
  AfterToolCallHookResult,
  AgentCallbacks,
  AgentLoopConfig,
  BeforeToolCallHookContext,
  BeforeToolCallHookResult,
  CompressionSummaryMode,
} from './loop/types'

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
const COMPRESSED_MEMORY_PREFIX = 'Earlier conversation summary:'

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
  private onCompressionStateUpdate?: AgentLoopConfig['onCompressionStateUpdate']
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
    this.onCompressionStateUpdate = config.onCompressionStateUpdate
    this.mode = config.mode || 'act'
    this.convertCallCount = config.initialConvertCallCount ?? 0
    this.lastSummaryConvertCall =
      config.initialLastSummaryConvertCall ?? Number.NEGATIVE_INFINITY
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

  /** Cancel the current agent loop */
  cancel(): void {
    this.abortController?.abort()
  }

  private async runWithPiAgentCore(
    messages: Message[],
    callbacks?: AgentCallbacks
  ): Promise<Message[]> {
    const signal = this.abortController?.signal
    if (!signal) return messages

    let allMessages = messages
    let shouldStopForElicitation = false
    let reachedMaxIterations = false
    try {
      const result = await executePiCoreLoop({
        signal,
        initialMessages: messages,
        callbacks,
        baseSystemPrompt: this.baseSystemPrompt,
        mode: this.mode,
        toolRegistry: this.toolRegistry,
        beforeToolCall: this.beforeToolCall,
        afterToolCall: this.afterToolCall,
        getToolContext: () => this.toolContext,
        setToolContext: (context) => {
          this.toolContext = context
        },
        provider: this.provider,
        contextManager: this.contextManager,
        toolExecutionTimeout: this.toolExecutionTimeout,
        toolTimeoutExemptions: TOOL_TIMEOUT_EXEMPTIONS,
        maxIterations: this.maxIterations,
        convertCallCount: this.convertCallCount,
        lastSummaryConvertCall: this.lastSummaryConvertCall,
        summaryMinDroppedGroups: SUMMARY_MIN_DROPPED_GROUPS,
        summaryMinDroppedContentChars: SUMMARY_MIN_DROPPED_CONTENT_CHARS,
        summaryMinIntervalConvertCalls: SUMMARY_MIN_INTERVAL_CONVERT_CALLS,
        compressionTargetRatio: COMPRESSION_TARGET_RATIO,
        compressedMemoryPrefix: COMPRESSED_MEMORY_PREFIX,
        generateContextSummaryWithLLM: (droppedContent, maxSummaryTokens) =>
          generateContextSummaryWithLLM({
            provider: this.provider,
            droppedContent,
            maxSummaryTokens,
            compressedMemoryPrefix: COMPRESSED_MEMORY_PREFIX,
          }),
        onAbortRequested: () => this.abortController?.abort(),
      })
      allMessages = result.allMessages
      shouldStopForElicitation = result.shouldStopForElicitation
      reachedMaxIterations = result.reachedMaxIterations
      this.convertCallCount = result.convertCallCount
      this.lastSummaryConvertCall = result.lastSummaryConvertCall
      this.onCompressionStateUpdate?.({
        convertCallCount: this.convertCallCount,
        lastSummaryConvertCall: this.lastSummaryConvertCall,
      })
    } catch (error) {
      if (signal.aborted) {
        callbacks?.onComplete?.(allMessages)
        return allMessages
      }
      throw error
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
    await triggerPrefetchForMessages(messages, this.toolContext, this.sessionId)

    // Inject matching skills and MCP services into system prompt
    const enhancedPrompt = await buildRuntimeEnhancedPrompt({
      baseSystemPrompt: this.baseSystemPrompt,
      messages,
      mode: this.mode,
      toolRegistry: this.toolRegistry,
      toolContext: this.toolContext,
      sessionId: this.sessionId,
    })
    this.contextManager.setSystemPrompt(enhancedPrompt)

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
