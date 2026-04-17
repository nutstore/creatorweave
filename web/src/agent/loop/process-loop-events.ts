import { produce } from 'immer'
import type { AgentEvent as PiAgentEvent, AgentMessage as PiAgentMessage } from '@mariozechner/pi-agent-core'
import type { AssistantMessageEvent as PiAssistantMessageEvent, ToolResultMessage as PiToolResultMessage } from '@mariozechner/pi-ai'
import type { AgentCallbacks } from './types'
import type { Message, ToolCall } from '../message-types'

export interface PiLoopMessageState {
  allMessages: Message[]
}

export interface ProcessPiLoopEventsInput {
  loop: AsyncIterable<PiAgentEvent>
  initialMessages: Message[]
  /**
   * Optional shared message state synchronized with external message injections
   * (e.g. context summary emitted during convertToLlm).
   */
  messageState?: PiLoopMessageState
  callbacks?: AgentCallbacks
  maxIterations: number
  applyAssistantUpdate: (
    event: PiAssistantMessageEvent,
    callbacks?: AgentCallbacks,
    onToolCallStart?: (toolCall: ToolCall) => void,
    toolCallIdByIndex?: Map<number, string>
  ) => void
  mapPiToInternal: (message: PiAgentMessage) => Message | null
  extractTextContent: (content: unknown) => string | null
}

export interface ProcessPiLoopEventsResult {
  allMessages: Message[]
  reachedMaxIterations: boolean
}

export async function processPiLoopEvents(
  input: ProcessPiLoopEventsInput
): Promise<ProcessPiLoopEventsResult> {
  let allMessages = input.messageState?.allMessages || input.initialMessages
  let assistantMessageCount = 0
  let reachedMaxIterations = false
  let assistantMessageStarted = false

  const getAllMessages = (): Message[] => input.messageState?.allMessages || allMessages
  const setAllMessages = (messages: Message[]): void => {
    allMessages = messages
    if (input.messageState) {
      input.messageState.allMessages = messages
    }
  }

  const emittedToolCallSignatures = new Map<string, string>()
  const toolCallIdByIndex = new Map<number, string>()
  const toolCallArgsById = new Map<string, Record<string, unknown>>()
  const pendingToolCompletions = new Map<string, { toolCall: ToolCall; resultText: string }>()

  const emitToolCallStartIfChanged = (toolCall: ToolCall) => {
    const signature = `${toolCall.function.name}:${toolCall.function.arguments}`
    const previous = emittedToolCallSignatures.get(toolCall.id)
    if (previous === signature) return
    emittedToolCallSignatures.set(toolCall.id, signature)
    input.callbacks?.onToolCallStart?.(toolCall)
  }

  for await (const event of input.loop) {
    const typedEvent = event as PiAgentEvent
    if (typedEvent.type === 'message_start' && typedEvent.message.role === 'assistant') {
      assistantMessageStarted = true
      input.callbacks?.onMessageStart?.()
    }

    if (typedEvent.type === 'message_update') {
      if (!assistantMessageStarted) {
        assistantMessageStarted = true
        input.callbacks?.onMessageStart?.()
      }
      input.applyAssistantUpdate(
        typedEvent.assistantMessageEvent,
        input.callbacks,
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
      const resultText = input.extractTextContent((typedEvent.result as PiToolResultMessage)?.content) || ''
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
      const mapped = input.mapPiToInternal(typedEvent.message)
      if (!mapped || mapped.role === 'user') continue
      if (mapped.role === 'assistant') {
        assistantMessageStarted = false
      }
      if (mapped.role === 'assistant') {
        assistantMessageCount++
        const hasIterationLimit = input.maxIterations > 0
        if (hasIterationLimit && assistantMessageCount > input.maxIterations) {
          console.warn('[#LoopStop] max_iterations_reached', {
            assistantMessageCount,
            maxIterations: input.maxIterations,
          })
          reachedMaxIterations = true
          break
        }
      }
      const nextMessages = produce(getAllMessages(), (draft) => {
        draft.push(mapped)
      })
      setAllMessages(nextMessages)
      input.callbacks?.onMessagesUpdated?.(nextMessages)
      if (mapped.role === 'tool' && mapped.toolCallId) {
        const pending = pendingToolCompletions.get(mapped.toolCallId)
        if (pending) {
          input.callbacks?.onToolCallComplete?.(pending.toolCall, pending.resultText)
          pendingToolCompletions.delete(mapped.toolCallId)
        }
      }
    }
  }

  for (const pending of pendingToolCompletions.values()) {
    input.callbacks?.onToolCallComplete?.(pending.toolCall, pending.resultText)
  }

  return { allMessages: getAllMessages(), reachedMaxIterations }
}
