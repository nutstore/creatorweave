import {
  createAssistantMessageEventStream,
  parseStreamingJson,
  registerApiProvider,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type StreamOptions,
  type ToolCall,
  type Usage,
} from '@mariozechner/pi-ai'
import '@mariozechner/pi-ai/openai-responses'
import { normalizeBaseUrl } from './pi-ai-url-utils'

export const CW_OPENAI_FETCH_API = 'cw-openai-fetch' as const

const CUSTOM_PROVIDER_SOURCE_ID = 'creatorweave/cw-openai-fetch'

let customProviderRegistered = false

// ── Chat Completions stream chunk ──

interface OpenAIStreamChunk {
  choices?: Array<{
    finish_reason?: string | null
    delta?: {
      content?: string | null
      reasoning_content?: string
      reasoning?: string
      reasoning_text?: string
      tool_calls?: Array<{
        id?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: {
      cached_tokens?: number
    }
    completion_tokens_details?: {
      reasoning_tokens?: number
    }
  }
}

type MutableToolCall = ToolCall & {
  partialArgs?: string
}

type MutableContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; thinkingSignature?: string }
  | MutableToolCall

export function ensurePiAICustomProvidersRegistered(): void {
  if (customProviderRegistered) return

  // Register Chat Completions API handler
  registerApiProvider(
    {
      api: CW_OPENAI_FETCH_API,
      stream: streamCwOpenAIChatCompletions,
      streamSimple: streamCwOpenAIChatCompletions,
    },
    CUSTOM_PROVIDER_SOURCE_ID
  )

  // Note: OpenAI Responses API is handled by the official pi-ai provider
  // (imported above via '@mariozechner/pi-ai/openai-responses').
  // When apiMode === 'responses', models use api = 'openai-responses' directly.

  customProviderRegistered = true
}

// =============================================================================
// Chat Completions API Implementation
// =============================================================================

function streamCwOpenAIChatCompletions(
  model: Model<typeof CW_OPENAI_FETCH_API>,
  context: Context,
  options?: StreamOptions
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()

  void (async () => {
    const output = createEmptyAssistantOutput(model)

    try {
      const apiKey = options?.apiKey?.trim()
      if (!apiKey) {
        throw new Error(`No API key for provider: ${String(model.provider)}`)
      }

      const payload = buildChatCompletionsPayload(model, context, options)
      options?.onPayload?.(payload)

      const response = await fetch(`${normalizeBaseUrl(model.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(model.headers || {}),
          ...(options?.headers || {}),
        },
        body: JSON.stringify(payload),
        signal: options?.signal,
      })

      if (!response.ok) {
        const errorBody = await safeReadText(response)
        throw new Error(`HTTP ${response.status}: ${errorBody}`)
      }

      if (!response.body) {
        throw new Error('Empty response body')
      }

      stream.push({ type: 'start', partial: output })

      let currentBlock: MutableContentBlock | null = null
      const blocks = output.content
      const blockIndex = () => blocks.length - 1

      const finishCurrentBlock = createBlockFinisher(stream, output)

      await readSSE(response.body, (rawData) => {
        if (rawData === '[DONE]') {
          return
        }

        const chunk = safeParseChunk(rawData)
        if (!chunk) return

        if (chunk.usage) {
          const cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens || 0
          const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || 0
          const input = (chunk.usage.prompt_tokens || 0) - cachedTokens
          const outputTokens = (chunk.usage.completion_tokens || 0) + reasoningTokens
          output.usage = {
            input,
            output: outputTokens,
            cacheRead: cachedTokens,
            cacheWrite: 0,
            totalTokens: input + outputTokens + cachedTokens,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          }
        }

        const choice = chunk.choices?.[0]
        if (!choice) return

        if (choice.finish_reason) {
          output.stopReason = mapStopReason(choice.finish_reason)
        }

        const delta = choice.delta
        if (!delta) return

        if (delta.content) {
          if (!currentBlock || currentBlock.type !== 'text') {
            finishCurrentBlock(currentBlock)
            currentBlock = { type: 'text', text: '' }
            blocks.push(currentBlock)
            stream.push({ type: 'text_start', contentIndex: blockIndex(), partial: output })
          }

          currentBlock.text += delta.content
          stream.push({
            type: 'text_delta',
            contentIndex: blockIndex(),
            delta: delta.content,
            partial: output,
          })
        }

        const reasoningDelta = delta.reasoning_content || delta.reasoning || delta.reasoning_text
        if (reasoningDelta) {
          if (!currentBlock || currentBlock.type !== 'thinking') {
            finishCurrentBlock(currentBlock)
            currentBlock = { type: 'thinking', thinking: '', thinkingSignature: 'reasoning_content' }
            blocks.push(currentBlock)
            stream.push({ type: 'thinking_start', contentIndex: blockIndex(), partial: output })
          }

          currentBlock.thinking += reasoningDelta
          stream.push({
            type: 'thinking_delta',
            contentIndex: blockIndex(),
            delta: reasoningDelta,
            partial: output,
          })
        }

        if (delta.tool_calls && delta.tool_calls.length > 0) {
          for (const toolCallDelta of delta.tool_calls) {
            if (
              !currentBlock ||
              currentBlock.type !== 'toolCall' ||
              (toolCallDelta.id && currentBlock.id !== toolCallDelta.id)
            ) {
              finishCurrentBlock(currentBlock)
              currentBlock = {
                type: 'toolCall',
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: {},
                partialArgs: '',
              }
              blocks.push(currentBlock)
              stream.push({ type: 'toolcall_start', contentIndex: blockIndex(), partial: output })
            }

            if (toolCallDelta.id) currentBlock.id = toolCallDelta.id
            if (toolCallDelta.function?.name) currentBlock.name = toolCallDelta.function.name

            const argsDelta = toolCallDelta.function?.arguments || ''
            if (argsDelta.length > 0) {
              currentBlock.partialArgs = (currentBlock.partialArgs || '') + argsDelta
              currentBlock.arguments = parseStreamingJson(currentBlock.partialArgs)
            }

            stream.push({
              type: 'toolcall_delta',
              contentIndex: blockIndex(),
              delta: argsDelta,
              partial: output,
            })
          }
        }
      })

      finishCurrentBlock(currentBlock)

      if (options?.signal?.aborted) {
        throw new Error('Request was aborted')
      }

      if (output.stopReason === 'aborted' || output.stopReason === 'error') {
        throw new Error('An unknown error occurred')
      }

      stream.push({
        type: 'done',
        reason: output.stopReason,
        message: output,
      })
      stream.end()
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? 'aborted' : 'error'
      output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      stream.push({ type: 'error', reason: output.stopReason, error: output })
      stream.end()
    }
  })()

  return stream
}

// =============================================================================
// Block finisher helper
// =============================================================================

function createBlockFinisher(
  stream: AssistantMessageEventStream,
  output: AssistantMessage
) {
  const blocks = output.content
  const blockIndex = () => blocks.length - 1

  return (block: MutableContentBlock | null) => {
    if (!block) return

    if (block.type === 'text') {
      stream.push({
        type: 'text_end',
        contentIndex: blockIndex(),
        content: block.text,
        partial: output,
      })
      return
    }

    if (block.type === 'thinking') {
      stream.push({
        type: 'thinking_end',
        contentIndex: blockIndex(),
        content: block.thinking,
        partial: output,
      })
      return
    }

    if (block.type === 'toolCall') {
      block.arguments = parseStreamingJson(block.partialArgs || '')
      delete block.partialArgs
      stream.push({
        type: 'toolcall_end',
        contentIndex: blockIndex(),
        toolCall: block,
        partial: output,
      })
    }
  }
}

// =============================================================================
// Payload Builders
// =============================================================================

export function buildChatCompletionsPayload(
  model: Model<typeof CW_OPENAI_FETCH_API>,
  context: Context,
  options?: StreamOptions
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: model.id,
    messages: convertContextMessages(context, model),
    stream: true,
    stream_options: { include_usage: true },
  }

  const normalizedTemperature = normalizeTemperatureForProvider(model.provider, options?.temperature)
  if (normalizedTemperature !== undefined) {
    payload.temperature = normalizedTemperature
  }

  if (options?.maxTokens !== undefined) {
    payload.max_tokens = options.maxTokens
  }

  if (context.tools && context.tools.length > 0) {
    payload.tools = context.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.parameters,
      },
    }))
  }

  return payload
}

// =============================================================================
// Message Converters (Chat Completions format)
// =============================================================================

function convertContextMessages(context: Context, model: Model<Api>): unknown[] {
  const messages: unknown[] = []

  if (context.systemPrompt) {
    messages.push({
      role: 'system',
      content: context.systemPrompt,
    })
  }

  for (const message of context.messages) {
    if (message.role === 'user') {
      if (typeof message.content === 'string') {
        messages.push({
          role: 'user',
          content: message.content,
        })
      } else {
        const content = message.content
          .map((item) => {
            if (item.type === 'text') {
              return {
                type: 'text',
                text: item.text,
              }
            }
            if (!model.input.includes('image')) return null
            return {
              type: 'image_url',
              image_url: {
                url: `data:${item.mimeType};base64,${item.data}`,
              },
            }
          })
          .filter((item) => item !== null)

        if (content.length > 0) {
          messages.push({
            role: 'user',
            content,
          })
        }
      }
      continue
    }

    if (message.role === 'assistant') {
      const textContent = message.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('')

      const assistantMessage: Record<string, unknown> = {
        role: 'assistant',
        content: textContent.length > 0 ? textContent : null,
      }

      const toolCalls = message.content.filter((part): part is ToolCall => part.type === 'toolCall')
      if (toolCalls.length > 0) {
        assistantMessage.tool_calls = toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments || {}),
          },
        }))
      }

      if (assistantMessage.content !== null || toolCalls.length > 0) {
        messages.push(assistantMessage)
      }
      continue
    }

    if (message.role === 'toolResult') {
      const text = message.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('\n')

      const toolMessage: Record<string, unknown> = {
        role: 'tool',
        content: text || '(empty tool result)',
        tool_call_id: message.toolCallId,
      }

      if (message.toolName) {
        toolMessage.name = message.toolName
      }

      messages.push(toolMessage)
    }
  }

  return messages
}

// =============================================================================
// SSE Utilities
// =============================================================================

async function readSSE(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    let separator = findSSESeparator(buffer)

    while (separator) {
      const rawEvent = buffer.slice(0, separator.index)
      buffer = buffer.slice(separator.index + separator.length)
      const data = extractSSEData(rawEvent)
      if (data !== null) {
        onData(data)
      }
      separator = findSSESeparator(buffer)
    }
  }

  buffer += decoder.decode()
  const trailingData = extractSSEData(buffer)
  if (trailingData !== null) {
    onData(trailingData)
  }
}

function findSSESeparator(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf('\n\n')
  const crlf = buffer.indexOf('\r\n\r\n')

  if (lf === -1 && crlf === -1) return null
  if (lf === -1) return { index: crlf, length: 4 }
  if (crlf === -1) return { index: lf, length: 2 }
  return lf < crlf ? { index: lf, length: 2 } : { index: crlf, length: 4 }
}

function extractSSEData(rawEvent: string): string | null {
  const lines = rawEvent.split(/\r?\n/)
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (dataLines.length === 0) return null
  return dataLines.join('\n')
}

function safeParseChunk(data: string): OpenAIStreamChunk | null {
  try {
    return JSON.parse(data) as OpenAIStreamChunk
  } catch {
    return null
  }
}

function mapStopReason(
  finishReason: string
): 'stop' | 'length' | 'toolUse' | 'error' | 'aborted' {
  if (finishReason === 'tool_calls') return 'toolUse'
  if (finishReason === 'length') return 'length'
  if (finishReason === 'stop') return 'stop'
  return 'stop'
}

function createEmptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  }
}

function createEmptyAssistantOutput(model: Model<Api>): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: createEmptyUsage(),
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text || 'No response body'
  } catch {
    return 'Failed to read response body'
  }
}

function normalizeTemperatureForProvider(
  provider: string | undefined,
  temperature: number | undefined
): number | undefined {
  if (temperature === undefined || Number.isNaN(temperature)) return undefined
  if (provider !== 'minimax' && provider !== 'minimax-cn') return temperature

  // MiniMax OpenAI-compatible API requires temperature in (0.0, 1.0].
  return Math.min(1, Math.max(0.01, temperature))
}
