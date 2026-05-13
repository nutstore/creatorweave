import type { AgentTool } from '@mariozechner/pi-agent-core'
import { isToolAllowedInMode, type AgentMode } from '../agent-mode'
import type { ContextManager } from '../context-manager'
import { messagesToChatMessages } from '../llm/llm-provider'
import type { PiAIProvider } from '../llm/pi-ai-provider'
import type { Message, ToolCall } from '../message-types'
import type { ToolRegistry } from '../tool-registry'
import { notifyOtherToolCall } from '../tools/loop-guard'
import type { ToolContext } from '../tools/tool-types'
import { isToolEnvelopeV2 } from '../tools/tool-envelope'
import type { AgentCallbacks, AgentLoopConfig } from './types'
import {
  coerceToolArgs,
  executeToolWithTimeout,
  normalizeToolResult,
  truncateLargeToolResult,
} from './tool-execution'

export interface BuildAgentToolsInput {
  toolRegistry: ToolRegistry
  mode: AgentMode
  callbacks?: AgentCallbacks
  beforeToolCall?: AgentLoopConfig['beforeToolCall']
  afterToolCall?: AgentLoopConfig['afterToolCall']
  getAllMessages: () => Message[]
  getAbortSignal: () => AbortSignal | undefined
  getToolContext: () => ToolContext
  setToolContext: (context: ToolContext) => void
  provider: PiAIProvider
  contextManager: ContextManager
  toolExecutionTimeout: number
  toolTimeoutExemptions: Set<string>
  onElicitationDetected?: () => void
}

export function buildAgentTools(input: BuildAgentToolsInput): AgentTool[] {
  return input.toolRegistry.getToolDefinitionsForMode(input.mode).map((toolDef) => ({
    name: toolDef.function.name,
    label: toolDef.function.name,
    description: toolDef.function.description || '',
    parameters: toolDef.function.parameters as never,
    execute: async (toolCallId, params) => {
      const args = coerceToolArgs(params)
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
        if (!isToolAllowedInMode(toolDef.function.name, input.mode)) {
          throw new Error(
            `Tool "${toolDef.function.name}" is not available in ${input.mode} mode. ` +
            `This tool requires write access. Switch to Act mode to use it.`
          )
        }

        if (input.beforeToolCall) {
          const before = await input.beforeToolCall({
            toolName: toolDef.function.name,
            toolCallId,
            args,
          })
          if (before?.block) {
            throw new Error(before.reason || 'Tool execution was blocked by policy.')
          }
        }

        // 计算当前上下文使用情况，传递给工具用于自我调节
        // 注意：必须用 contextManager.trimMessages 后的消息来估算，而非全量消息。
        // 全量消息可能远大于实际发送给 LLM 的上下文，导致 truncateLargeToolResult 误判可用预算不足。
        const existingMessages = messagesToChatMessages(input.getAllMessages())
        const contextConfig = input.contextManager.getConfig()
        const maxContextTokens = contextConfig.maxContextTokens || input.provider.maxContextTokens || 200000
        const reserveTokens = contextConfig.reserveTokens ?? 8192
        const trimmedMessages = input.contextManager.trimMessages(existingMessages).messages
        const usedTokens = input.provider.estimateTokens(trimmedMessages)

        // 在调用工具前更新 toolContext 的 contextUsage
        const originalToolContext = input.getToolContext()
        const toolContextWithUsage: ToolContext = {
          ...originalToolContext,
          contextUsage: {
            usedTokens,
            maxTokens: maxContextTokens - reserveTokens,
          },
        }
        input.setToolContext(toolContextWithUsage)

        let rawResult = ''
        try {
          // Resolve effective timeout: respect per-call timeout for tools that declare one
          // (e.g. python tool accepts a `timeout` parameter). Use the larger of the per-call
          // value or the global default so we never accidentally reduce a legitimate timeout.
          let effectiveTimeoutMs: number | null = input.toolExecutionTimeout
          if (input.toolTimeoutExemptions.has(toolDef.function.name)) {
            effectiveTimeoutMs = null
          } else if (typeof args.timeout === 'number' && args.timeout > 0) {
            effectiveTimeoutMs = Math.min(args.timeout, 300_000) // cap at 5 min for safety
          }

          rawResult = await executeToolWithTimeout({
            toolName: toolDef.function.name,
            args,
            timeoutMs: effectiveTimeoutMs,
            runAbortSignal: input.getAbortSignal(),
            externalAbortSignal: toolContextWithUsage.abortSignal,
            execute: (abortSignal) =>
              input.toolRegistry.execute(toolDef.function.name, args, {
                ...toolContextWithUsage,
                abortSignal,
                currentToolCallId: toolCallId,
              }),
          })
        } finally {
          // 无论工具执行成功或失败，都恢复原始上下文
          input.setToolContext(originalToolContext)
          // Loop guard: reset consecutive counter after non-read/non-search tool execution.
          // This ensures that read→write→read doesn't accumulate consecutive reads.
          const toolName = toolDef.function.name
          if (toolName !== 'read' && toolName !== 'search') {
            notifyOtherToolCall(originalToolContext)
          }
        }

        // 在 normalizeToolResult 之前就截断过大的结果
        rawResult = truncateLargeToolResult({
          rawResult,
          toolName: toolDef.function.name,
          existingTokens: usedTokens,
          maxContextTokens,
          reserveTokens,
          estimateTextTokens: (text) =>
            input.provider.estimateTokens([
              {
                role: 'assistant',
                content: text,
              },
            ]),
        })

        const normalized = normalizeToolResult(rawResult)

        let finalContent = normalized.content
        let finalDetails = normalized.details
        let finalIsError = normalized.isError

        if (input.afterToolCall) {
          const patched = await input.afterToolCall({
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
          // If the error is already wrapped in a ToolEnvelopeV2 (e.g. from MCP tools),
          // return the raw envelope JSON as-is so the LLM receives structured error data.
          // Only throw for non-envelope errors (legacy/internal tools).
          if (isToolEnvelopeV2(finalDetails.parsed)) {
            finalContent = rawResult
            finalIsError = false
          } else {
            throw new Error(
              finalContent.replace(/^Error(?:\s*\[[^\]]+\])?:\s*/i, '') || 'Tool execution failed'
            )
          }
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

        if (elicitationData && input.callbacks?.onElicitation) {
          console.warn('[#LoopStop] elicitation_detected', {
            toolCallId,
            toolName: elicitationData.toolName,
            serverId: elicitationData.serverId,
          })
          input.callbacks.onElicitation({
            ...elicitationData,
            toolCallId,
          })
          input.onElicitationDetected?.()
        }

        if (toolDef.function.name === 'python' && rawResult) {
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
          input.callbacks?.onToolTimeout?.(toolCall)
        }
        throw toolError
      }
    },
  }))
}
