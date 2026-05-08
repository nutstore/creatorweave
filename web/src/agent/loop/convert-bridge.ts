import type { AgentMessage as PiAgentMessage } from '@mariozechner/pi-agent-core'
import type { Api, Message as PiMessage, Model } from '@mariozechner/pi-ai'
import {
  applyCompressionBaseline,
  getCompressionCutoffTimestamp,
  injectSummaryMessage,
  shouldCallLLMSummary,
  type CompressionBaselineState,
} from './context-compression'
import { internalToPiMessages, piToInternalMessage } from './message-mappers'
import {
  buildContextOverflowError,
  ensureLatestToolResultFitsContext,
} from './tool-execution'
import type { AgentCallbacks, CompressionSummaryMode } from './types'
import type { ContextManager } from '../context-manager'
import { messagesToChatMessages } from '../llm/llm-provider'
import type { PiAIProvider } from '../llm/pi-ai-provider'

export interface ConvertAgentMessagesToLlmInput {
  agentMessages: PiAgentMessage[]
  model: Model<Api>
  provider: PiAIProvider
  contextManager: ContextManager
  callbacks?: AgentCallbacks
  compressedMemoryPrefix: string
  convertCallCount: number
  lastSummaryConvertCall: number
  compressionBaseline: CompressionBaselineState | null
  summaryMinDroppedGroups: number
  summaryMinDroppedContentChars: number
  summaryMinIntervalConvertCalls: number
  compressionTargetRatio: number
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

  const contextConfig = input.contextManager.getConfig()
  const maxContextTokens = contextConfig.maxContextTokens || input.provider.maxContextTokens || 128000
  const reserveTokens = contextConfig.reserveTokens ?? 0
  const inputBudget = Math.max(1, maxContextTokens - reserveTokens)
  const chatMessages = messagesToChatMessages(internalMessages)
  const preTrimTokens = input.provider.estimateTokens(chatMessages)
  const summaryTokenBudget = Math.min(2400, Math.max(500, Math.floor(maxContextTokens * 0.02)))
  let compressionTriggered = false
  let compressionCompletePayload:
    | {
        mode: CompressionSummaryMode
        summary: string | null
        droppedGroups: number
        droppedContentChars: number
        summaryChars: number
        latencyMs: number
      }
    | null = null
  const trimmedResult = input.contextManager.trimMessages(chatMessages, {
    createSummary: true,
    maxSummaryTokens: summaryTokenBudget,
    summaryStrategy: 'external',
  })
  let trimmed = trimmedResult.messages

  if (trimmedResult.droppedContent) {
    compressionTriggered = true
    const droppedContent = trimmedResult.droppedContent
    const droppedGroups = trimmedResult.droppedGroups
    const droppedContentChars = droppedContent.length
    const preTrimUsagePercent = Math.max(0, Math.min(100, (preTrimTokens / inputBudget) * 100))
    const shouldSummarize = shouldCallLLMSummary({
      droppedGroups,
      droppedContent,
      convertCallCount,
      lastSummaryConvertCall,
      minDroppedGroups: input.summaryMinDroppedGroups,
      minDroppedContentChars: input.summaryMinDroppedContentChars,
      minIntervalConvertCalls: input.summaryMinIntervalConvertCalls,
    })
    console.info('[AgentLoop] Context compression triggered', {
      convertCallCount,
      droppedGroups,
      droppedContentChars,
      shouldSummarize,
      preTrimTokens,
      inputBudget,
      reserveTokens,
      modelMaxTokens: maxContextTokens,
      preTrimUsagePercent: Number(preTrimUsagePercent.toFixed(2)),
      triggerThresholdPercent: 85,
      targetPercent: input.compressionTargetRatio * 100,
    })

    if (shouldSummarize) {
      input.callbacks?.onContextCompressionStart?.({ droppedGroups, droppedContentChars })
      const startedAt = Date.now()
      const { summary, mode } = await input.generateContextSummaryWithLLM(droppedContent, summaryTokenBudget)
      const latencyMs = Date.now() - startedAt

      if (summary) {
        lastSummaryConvertCall = convertCallCount
        const cutoffTimestamp = getCompressionCutoffTimestamp(internalMessagesRaw)
        if (typeof cutoffTimestamp === 'number') {
          compressionBaseline = { summary, cutoffTimestamp }
        }
        trimmed = injectSummaryMessage(trimmed, summary, input.compressedMemoryPrefix)
        // First safety pass: summary injection must still fit the context budget.
        trimmed = input.contextManager.trimMessages(trimmed, { createSummary: false }).messages
        // Headroom enforcement: ensure post-compression usage is below the target ratio
        // so that we don't immediately re-trigger compression on the next few turns.
        const cfg = input.contextManager.getConfig()
        const budget = cfg.maxContextTokens - (cfg.reserveTokens ?? 0)
        const targetTokens = Math.floor(budget * input.compressionTargetRatio)
        const postTrimTokens = input.provider.estimateTokens(trimmed)
        if (postTrimTokens > targetTokens) {
          trimmed = input.contextManager.trimMessagesToTarget(trimmed, targetTokens)
        }
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
        targetPercent: input.compressionTargetRatio * 100,
      })
      compressionCompletePayload = {
        mode,
        summary,
        droppedGroups,
        droppedContentChars,
        summaryChars: summary?.length || 0,
        latencyMs,
      }

    } else {
      input.callbacks?.onContextCompressionComplete?.({
        mode: 'skip',
        summary: null,
        droppedGroups,
        droppedContentChars,
        summaryChars: 0,
        latencyMs: 0,
      })
      const postCompressionTokens = input.provider.estimateTokens(trimmed)
      const postCompressionUsagePercent = Math.max(0, Math.min(100, (postCompressionTokens / inputBudget) * 100))
      console.info('[AgentLoop] Context compression complete', {
        convertCallCount,
        mode: 'skip',
        droppedGroups,
        droppedContentChars,
        summaryChars: 0,
        postCompressionTokens,
        inputBudget,
        postCompressionUsagePercent: Number(postCompressionUsagePercent.toFixed(2)),
        targetPercent: input.compressionTargetRatio * 100,
      })
      compressionCompletePayload = {
        mode: 'skip',
        summary: null,
        droppedGroups,
        droppedContentChars,
        summaryChars: 0,
        latencyMs: 0,
      }
    }
  }

  // If the latest tool result can't survive compression, fail explicitly
  // instead of silently hiding it from the model.
  try {
    trimmed = ensureLatestToolResultFitsContext({
      internalMessages,
      trimmedMessages: trimmed,
      maxContextTokens,
      reserveTokens,
      contextManager: input.contextManager,
      estimateTokens: (messages) => input.provider.estimateTokens(messages),
    })
  } catch (error) {
    // Best-effort fallback: continue loop with aggressively trimmed context.
    // This avoids hard-stopping the run right after compression UI has completed.
    console.warn('[AgentLoop] latest tool result does not fit after compression; applying emergency trim', error)
    trimmed = input.contextManager.trimMessagesToTarget(trimmed, inputBudget)
  }

  const usedTokens = input.provider.estimateTokens(trimmed)
  if (usedTokens > inputBudget) {
    console.error('[#LoopStop] context_overflow_after_compression_check', {
      convertCallCount,
      usedTokens,
      inputBudget,
      reserveTokens,
      maxContextTokens,
      compressionTriggered,
      compressionMode: compressionCompletePayload?.mode ?? null,
    })
    throw buildContextOverflowError({
      maxContextLimit: maxContextTokens,
      reserveTokens,
      inputBudget,
      historyTokens: usedTokens,
      toolResultTokens: 0,
      totalInputTokens: usedTokens,
    })
  }
  if (compressionCompletePayload) {
    input.callbacks?.onContextCompressionComplete?.(compressionCompletePayload)
  }
  // Use the same denominator as ContextManager (input budget, not raw max)
  // so the reported percentage aligns with compression trigger thresholds.
  const usagePercent = Math.max(0, Math.min(100, (usedTokens / Math.max(1, inputBudget)) * 100))
  input.callbacks?.onContextUsageUpdate?.({
    usedTokens,
    // maxTokens is the effective input budget (M - R), modelMaxTokens is the raw model limit M.
    maxTokens: inputBudget,
    reserveTokens,
    usagePercent,
    modelMaxTokens: maxContextTokens,
  })

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
