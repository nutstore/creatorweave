import { produce } from 'immer'
import { agentLoopContinue, type StreamFn } from '@mariozechner/pi-agent-core'
import { streamSimple as piAiStreamSimple } from '@mariozechner/pi-ai'
import { useSettingsStore } from '@/store/settings.store'
import type { AgentMode } from '../agent-mode'
import type { ContextManager } from '../context-manager'
import type { PiAIProvider } from '../llm/pi-ai-provider'
import { createAssistantMessage, type Message } from '../message-types'
import type { ToolRegistry } from '../tool-registry'
import type { ToolContext } from '../tools/tool-types'
import type { CompressionBaselineState } from './context-compression'
import { buildAgentTools } from './build-agent-tools'
import { convertAgentMessagesToLlm } from './convert-bridge'
import { extractTextContent, piToInternalMessage, internalToPiMessages } from './message-mappers'
import { applyPiAssistantUpdate } from './pi-events'
import { processPiLoopEvents } from './process-loop-events'
import type { AgentCallbacks, AgentLoopConfig, CompressionSummaryMode } from './types'

export interface ExecutePiCoreLoopInput {
  signal?: AbortSignal
  initialMessages: Message[]
  callbacks?: AgentCallbacks
  baseSystemPrompt: string
  mode: AgentMode
  toolRegistry: ToolRegistry
  beforeToolCall?: AgentLoopConfig['beforeToolCall']
  afterToolCall?: AgentLoopConfig['afterToolCall']
  getToolContext: () => ToolContext
  setToolContext: (context: ToolContext) => void
  provider: PiAIProvider
  contextManager: ContextManager
  toolExecutionTimeout: number
  toolTimeoutExemptions: Set<string>
  maxIterations: number
  convertCallCount: number
  lastSummaryConvertCall: number
  summaryMinDroppedGroups: number
  summaryMinDroppedContentChars: number
  summaryMinIntervalConvertCalls: number
  compressionTargetRatio: number
  compressedMemoryPrefix: string
  generateContextSummaryWithLLM: (
    droppedContent: string,
    maxSummaryTokens: number
  ) => Promise<{ summary: string | null; mode: CompressionSummaryMode }>
  onAbortRequested?: () => void
  /** Restored compression baseline from a previous run's persisted state. */
  initialCompressionBaseline?: CompressionBaselineState | null
}

export interface ExecutePiCoreLoopResult {
  allMessages: Message[]
  shouldStopForElicitation: boolean
  reachedMaxIterations: boolean
  convertCallCount: number
  lastSummaryConvertCall: number
}

export async function executePiCoreLoop(
  input: ExecutePiCoreLoopInput
): Promise<ExecutePiCoreLoopResult> {
  if (!input.signal) {
    return {
      allMessages: input.initialMessages,
      shouldStopForElicitation: false,
      reachedMaxIterations: false,
      convertCallCount: input.convertCallCount,
      lastSummaryConvertCall: input.lastSummaryConvertCall,
    }
  }

  let allMessages = input.initialMessages
  const messageState = { allMessages }
  let shouldStopForElicitation = false
  let reachedMaxIterations = false
  let compressionBaseline: CompressionBaselineState | null = input.initialCompressionBaseline ?? null
  let convertCallCount = input.convertCallCount
  let lastSummaryConvertCall = input.lastSummaryConvertCall

  const model = input.provider.getModel()
  const apiKey = input.provider.getApiKey()

  const agentTools = buildAgentTools({
    toolRegistry: input.toolRegistry,
    mode: input.mode,
    callbacks: input.callbacks,
    beforeToolCall: input.beforeToolCall,
    afterToolCall: input.afterToolCall,
    getAllMessages: () => allMessages,
    getAbortSignal: () => input.signal,
    getToolContext: input.getToolContext,
    setToolContext: input.setToolContext,
    provider: input.provider,
    contextManager: input.contextManager,
    toolExecutionTimeout: input.toolExecutionTimeout,
    toolTimeoutExemptions: input.toolTimeoutExemptions,
    onElicitationDetected: () => {
      shouldStopForElicitation = true
      input.onAbortRequested?.()
    },
  })

  const context = {
    systemPrompt: input.contextManager.getConfig().systemPrompt || input.baseSystemPrompt,
    messages: internalToPiMessages(input.initialMessages, model, input.compressedMemoryPrefix),
    tools: agentTools,
  }

  const streamFn = piAiStreamSimple as unknown as StreamFn

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
        const converted = await convertAgentMessagesToLlm({
          agentMessages,
          model,
          provider: input.provider,
          contextManager: input.contextManager,
          callbacks: input.callbacks,
          compressedMemoryPrefix: input.compressedMemoryPrefix,
          convertCallCount,
          lastSummaryConvertCall,
          compressionBaseline,
          summaryMinDroppedGroups: input.summaryMinDroppedGroups,
          summaryMinDroppedContentChars: input.summaryMinDroppedContentChars,
          summaryMinIntervalConvertCalls: input.summaryMinIntervalConvertCalls,
          compressionTargetRatio: input.compressionTargetRatio,
          generateContextSummaryWithLLM: input.generateContextSummaryWithLLM,
          onSummaryInjected: (summary, cutoffTimestamp) => {
            const summaryMsg = createAssistantMessage(
              `${input.compressedMemoryPrefix}\n${summary}`,
              undefined,
              undefined,
              null,
              'context_summary'
            )
            summaryMsg.timestamp = Math.max(0, cutoffTimestamp - 1)
            const nextMessages = produce(messageState.allMessages, (draft) => {
              draft.push(summaryMsg)
            })
            messageState.allMessages = nextMessages
            allMessages = nextMessages
            input.callbacks?.onMessagesUpdated?.(nextMessages)
          },
        })

        convertCallCount = converted.convertCallCount
        lastSummaryConvertCall = converted.lastSummaryConvertCall
        compressionBaseline = converted.compressionBaseline
        return converted.piMessages
      },
    },
    input.signal,
    streamFn
  )

  const processed = await processPiLoopEvents({
    loop,
    initialMessages: messageState.allMessages,
    messageState,
    callbacks: input.callbacks,
    maxIterations: input.maxIterations,
    applyAssistantUpdate: applyPiAssistantUpdate,
    mapPiToInternal: (message) => piToInternalMessage(message),
    extractTextContent,
  })
  allMessages = processed.allMessages
  reachedMaxIterations = processed.reachedMaxIterations

  return {
    allMessages,
    shouldStopForElicitation,
    reachedMaxIterations,
    convertCallCount,
    lastSummaryConvertCall,
  }
}
