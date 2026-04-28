import type { AgentMessage as PiAgentMessage } from '@mariozechner/pi-agent-core'
import type { Api, Message as PiMessage, Model } from '@mariozechner/pi-ai'
import { createAssistantMessage, createToolMessage, type Message, type ToolCall } from '../message-types'

/** Format file size for display in asset metadata */
function formatAssetSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function parseToolArgs(args: string): Record<string, unknown> {
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

export function extractTextContent(content: unknown): string | null {
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

export function internalToPiMessages(
  messages: Message[],
  model: Model<Api>,
  compressedMemoryPrefix: string
): PiMessage[] {
  const lastSummaryIndex = messages.map((m) => m.kind).lastIndexOf('context_summary')
  const modelMessages = lastSummaryIndex >= 0 ? messages.slice(lastSummaryIndex) : messages
  return modelMessages.flatMap((msg): PiMessage[] => {
    if (msg.kind === 'context_summary') {
      return [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `${compressedMemoryPrefix}\n${msg.content || ''}`,
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
      // Inject asset metadata into user message so the LLM knows about uploaded files
      let userContent = msg.content || ''
      if (msg.assets && msg.assets.length > 0) {
        const assetLines = msg.assets.map((a) => {
          const dir = a.direction === 'upload' ? 'Uploaded' : 'Generated'
          return `- ${dir}: ${a.name} (${a.mimeType}, ${formatAssetSize(a.size)})`
        })
        userContent += `\n\n[Attached files]\n${assetLines.join('\n')}\nUse read vfs://assets/<filename> to read file contents.`
      }
      return [
        {
          role: 'user',
          content: userContent,
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
          arguments: parseToolArgs(toolCall.function.arguments),
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

export function piToInternalMessage(message: PiAgentMessage): Message | null {
  const now = Date.now()
  if (typeof message !== 'object' || !message || !('role' in message)) return null

  if (message.role === 'user') {
    return {
      id: `${now}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'user',
      content: extractTextContent(message.content),
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
    const text = extractTextContent(message.content) || ''
    return createToolMessage({
      toolCallId: message.toolCallId,
      name: message.toolName,
      content: text,
    })
  }

  return null
}
