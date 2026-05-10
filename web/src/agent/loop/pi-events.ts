import type { AssistantMessageEvent as PiAssistantMessageEvent } from '@mariozechner/pi-ai'
import type { ToolCall } from '../message-types'
import type { AgentCallbacks } from './types'

export function applyPiAssistantUpdate(
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
      const existingId = toolCallIdByIndex?.get(event.contentIndex)
      const fallbackId = existingId || `pending_tool_${event.contentIndex}`
      const stableId = partial.id || fallbackId
      toolCallIdByIndex?.set(event.contentIndex, stableId)
      onToolCallStart?.({
        id: stableId,
        type: 'function',
        function: { name: partial.name, arguments: JSON.stringify(partial.arguments || {}) },
      })
    }
  }
  if (event.type === 'toolcall_delta') {
    callbacks?.onToolCallDelta?.(event.contentIndex, event.delta, toolCallIdByIndex?.get(event.contentIndex))
  }
}
