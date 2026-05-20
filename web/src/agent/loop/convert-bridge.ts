import type { AgentMessage as PiAgentMessage } from '@mariozechner/pi-agent-core'
import type { Api, Message as PiMessage, Model } from '@mariozechner/pi-ai'
import {
  applyCompressionBaseline,
  getCompressionCutoffTimestamp,
  injectSummaryMessage,
  COMPRESSION_TRIGGER_RATIO,
  type CompressionBaselineState,
} from './context-compression'
import { internalToPiMessages, piToInternalMessage } from './message-mappers'
import { messagesToChatMessages } from '../llm/llm-provider'
import type { AgentCallbacks, CompressionSummaryMode } from './types'
import type { PiAIProvider } from '../llm/pi-ai-provider'

export interface ConvertAgentMessagesToLlmInput {
  agentMessages: PiAgentMessage[]
  model: Model<Api>
  provider: PiAIProvider
  callbacks?: AgentCallbacks
  compressedMemoryPrefix: string
  convertCallCount: number
  lastSummaryConvertCall: number
  compressionBaseline: CompressionBaselineState | null
  maxContextTokens: number
  reserveTokens: number
  generateContextSummaryWithLLM: (
    droppedContent: string,
    maxSummaryTokens: number
  ) => Promise<{ summary: string | null; mode: CompressionSummaryMode }>
  onSummaryInjected?: (summary: string, cutoffTimestamp: number) => void
}

export interface ConvertAgentMessagesToLlmResult {
  piMessages: PiMessage[]
  convertCallCount: number
  lastSummaryConvertCall: number
  compressionBaseline: CompressionBaselineState | null
}

/**
 * Extract the real token usage from the most recent assistant message
 * in the agent message list.  Returns totalTokens when available; otherwise
 * falls back to input + output + cacheRead tokens.
 * This is the accurate "context already consumed" number.
 */
function extractLastTurnUsedTokens(agentMessages: PiAgentMessage[]): number | null {
  for (let i = agentMessages.length - 1; i >= 0; i--) {
    const msg = agentMessages[i]
    if (msg.role === 'assistant') {
      const usage = (msg as unknown as {
        usage?: { input?: number; output?: number; cacheRead?: number; totalTokens?: number }
      }).usage
      if (usage) {
        if (typeof usage.totalTokens === 'number' && usage.totalTokens > 0) {
          return usage.totalTokens
        }
        const input = typeof usage.input === 'number' ? usage.input : 0
        const output = typeof usage.output === 'number' ? usage.output : 0
        const cacheRead = typeof usage.cacheRead === 'number' ? usage.cacheRead : 0
        const total = input + output + cacheRead
        if (total > 0) {
          return total
        }
      }
    }
  }
  return null
}

export async function convertAgentMessagesToLlm(
  input: ConvertAgentMessagesToLlmInput
): Promise<ConvertAgentMessagesToLlmResult> {
  const convertCallCount = input.convertCallCount + 1
  let lastSummaryConvertCall = input.lastSummaryConvertCall
  let compressionBaseline = input.compressionBaseline

  const internalMessagesRaw = input.agentMessages
    .map((m) => piToInternalMessage(m))
    .filter((m): m is NonNullable<typeof m> => m !== null)
  const internalMessages = compressionBaseline
    ? applyCompressionBaseline(internalMessagesRaw, compressionBaseline, input.compressedMemoryPrefix)
    : internalMessagesRaw
  if (compressionBaseline) {
    console.info('[AgentLoop] Using compression baseline', {
      convertCallCount,
      cutoffTimestamp: compressionBaseline.cutoffTimestamp,
      summaryChars: compressionBaseline.summary.length,
      rawMessageCount: internalMessagesRaw.length,
      effectiveMessageCount: internalMessages.length,
    })
  }

  const maxContextTokens = input.maxContextTokens || input.provider.maxContextTokens || 128000
  const reserveTokens = input.reserveTokens ?? 0
  const inputBudget = Math.max(1, maxContextTokens - reserveTokens)
  const chatMessages = messagesToChatMessages(internalMessages)
  const preTrimTokens = input.provider.estimateTokens(chatMessages)

  // --- Real token usage for compression trigger ---
  // Each assistant message records usage.input (prompt tokens) and usage.output
  // (completion tokens).  On the next turn, the output becomes part of the input,
  // so "context already consumed" = input + output of the last assistant message.
  // If the user deletes messages, the next API call will correct the numbers.
  const usedRealTokens = extractLastTurnUsedTokens(input.agentMessages)

  if (usedRealTokens !== null) {
    console.info('[AgentLoop] Real token usage from last turn', {
      convertCallCount,
      usedRealTokens,
      inputBudget,
      maxContextTokens,
      usagePercent: Number(((usedRealTokens / maxContextTokens) * 100).toFixed(2)),
      triggerThreshold: Math.floor(maxContextTokens * COMPRESSION_TRIGGER_RATIO),
    })
  }

  const compressionTriggerThreshold = Math.floor(maxContextTokens * COMPRESSION_TRIGGER_RATIO)
  // Only use real token usage from the last API response for the compression
  // gate.  The heuristic estimate (preTrimTokens) is inaccurate and can
  // trigger compression as early as 40% real usage.
  const shouldAllowCompression =
    typeof usedRealTokens === 'number' && usedRealTokens >= compressionTriggerThreshold
  console.info('[AgentLoop] Compression gate evaluation', {
    convertCallCount,
    preTrimTokens,
    usedRealTokens,
    compressionTriggerThreshold,
    maxContextTokens,
    allowCompression: shouldAllowCompression,
  })

  const summaryTokenBudget = Math.min(2400, Math.max(500, Math.floor(maxContextTokens * 0.02)))

  // No silent trimming.  When compression is not triggered, send all messages
  // as-is.  When compression IS triggered, the summary replaces all old
  // messages — no trimming needed either.
  let trimmed = chatMessages

  if (shouldAllowCompression) {
    // Compression: generate summary via LLM, then replace all messages with [summary].
    const droppedContent = internalMessages
      .filter((msg) => msg.role !== 'context_summary')
      .map((msg) => {
        if (msg.role === 'user') return `User: ${(msg.content || '').slice(0, 800)}`
        if (msg.role === 'assistant') return `Assistant: ${(msg.content || '').slice(0, 800)}`
        if (msg.role === 'tool') return `Tool result: ${(msg.content || '').slice(0, 600)}`
        return ''
      })
      .filter(Boolean)
      .join('\n')

    const droppedContentChars = droppedContent.length
    const droppedGroups = internalMessages.length

    if (droppedContent.length > 0) {
      input.callbacks?.onContextCompressionStart?.({ droppedGroups, droppedContentChars })
      const startedAt = Date.now()
      const { summary, mode } = await input.generateContextSummaryWithLLM(droppedContent, summaryTokenBudget)
      const latencyMs = Date.now() - startedAt

      if (summary) {
        const cutoffTimestamp = getCompressionCutoffTimestamp(internalMessagesRaw)
        if (typeof cutoffTimestamp === 'number') {
          compressionBaseline = { summary, cutoffTimestamp }
        }

        // Replace everything with just the summary
        trimmed = injectSummaryMessage(
          [],
          summary,
          input.compressedMemoryPrefix
        )

        if (typeof cutoffTimestamp === 'number') {
          input.onSummaryInjected?.(summary, cutoffTimestamp)
        }
      }

      const postCompressionTokens = input.provider.estimateTokens(trimmed)
      const postCompressionUsagePercent = Math.max(
        0,
        Math.min(100, (postCompressionTokens / inputBudget) * 100)
      )
      console.info('[AgentLoop] Context compression complete', {
        convertCallCount,
        mode,
        droppedGroups,
        droppedContentChars,
        summaryChars: summary?.length || 0,
        compressionBaselineCutoff: compressionBaseline?.cutoffTimestamp ?? null,
        postCompressionTokens,
        inputBudget,
        postCompressionUsagePercent: Number(postCompressionUsagePercent.toFixed(2)),
      })
      input.callbacks?.onContextCompressionComplete?.({
        mode,
        summary,
        droppedGroups,
        droppedContentChars,
        summaryChars: summary?.length || 0,
        latencyMs,
      })
    }
  }

  return {
    piMessages: internalToPiMessages(
      trimmed.map((msg) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: msg.role,
        content: msg.content,
        toolCalls: msg.tool_calls?.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
        toolCallId: msg.tool_call_id,
        name: msg.name,
        timestamp: Date.now(),
      })),
      input.model,
      input.compressedMemoryPrefix
    ),
    convertCallCount,
    lastSummaryConvertCall,
    compressionBaseline,
  }
}
