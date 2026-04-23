import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  LLMProvider,
  TokenUsage,
} from './llm-provider'
import { complete, stream, type Api, type Context, type Message, type Model, type Tool } from '@mariozechner/pi-ai'
import { estimateMessagesTokens } from './token-counter'
import type { LLMProviderType } from '@/agent/providers/types'
import { resolvePiAIModel } from './pi-ai-model-resolver'
import { ensurePiAICustomProvidersRegistered } from './pi-ai-custom-openai-fetch'

const MAX_CONTEXT_TOKENS = 128000

export interface PiAIProviderConfig {
  apiKey: string
  providerType: LLMProviderType
  baseUrl: string
  model: string
}

export class PiAIProvider implements LLMProvider {
  readonly name = 'PiAI'
  readonly maxContextTokens: number

  private apiKey: string
  private model: Model<Api>

  constructor(config: PiAIProviderConfig) {
    ensurePiAICustomProvidersRegistered()
    this.apiKey = config.apiKey
    this.model = resolvePiAIModel(config.providerType, config.model, config.baseUrl)
    this.maxContextTokens = this.model.contextWindow || MAX_CONTEXT_TOKENS
  }

  getModel(): Model<Api> {
    return this.model
  }

  getApiKey(): string {
    return this.apiKey
  }

  async chat(request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse> {
    const context = this.toPiAIContext(request)
    const message = await complete(this.model, context, {
      apiKey: this.apiKey,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      signal,
    })

    const content = this.textFromContent(message.content)
    const toolCalls = message.content
      .filter((item): item is Extract<typeof item, { type: 'toolCall' }> => item.type === 'toolCall')
      .map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments || {}),
        },
      }))

    return {
      id: this.createId(),
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: content || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          },
          finish_reason: this.toFinishReason(message.stopReason),
        },
      ],
      usage: {
        prompt_tokens: message.usage.input,
        completion_tokens: message.usage.output,
        total_tokens: message.usage.totalTokens,
      },
    }
  }

  chatStream(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): AsyncGenerator<ChatCompletionChunk> {
    return this.streamPiAI(request, signal)
  }

  estimateTokens(messages: ChatMessage[]): number {
    return estimateMessagesTokens(messages)
  }

  private toPiAIContext(request: ChatCompletionRequest): Context {
    const systemPrompts: string[] = []
    const messages: Message[] = []

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        if (msg.content) systemPrompts.push(msg.content)
        continue
      }

      if (msg.role === 'user') {
        messages.push({
          role: 'user',
          content: msg.content || '',
          timestamp: Date.now(),
        })
        continue
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
        if (msg.tool_calls?.length) {
          for (const toolCall of msg.tool_calls) {
            content.push({
              type: 'toolCall',
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: this.safeParseArgs(toolCall.function.arguments),
            })
          }
        }

        messages.push({
          role: 'assistant',
          content,
          api: this.model.api,
          provider: this.model.provider,
          model: this.model.id,
          usage: this.emptyUsage(),
          stopReason: 'stop',
          timestamp: Date.now(),
        })
        continue
      }

      if (msg.role === 'tool') {
        messages.push({
          role: 'toolResult',
          toolCallId: msg.tool_call_id || '',
          toolName: msg.name || 'tool',
          content: [{ type: 'text', text: msg.content || '' }],
          isError: msg.content?.startsWith('Error:') ?? false,
          timestamp: Date.now(),
        })
      }
    }

    const tools: Tool[] | undefined = request.tools?.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description || '',
      parameters: tool.function.parameters as never,
    }))

    return {
      systemPrompt: systemPrompts.length > 0 ? systemPrompts.join('\n\n') : undefined,
      messages,
      tools,
    }
  }

  private async *streamPiAI(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): AsyncGenerator<ChatCompletionChunk> {
    const context = this.toPiAIContext(request)
    const streamId = this.createId()
    const seenToolDelta = new Set<number>()

    const eventStream = stream(this.model, context, {
      apiKey: this.apiKey,
      signal,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    })

    for await (const event of eventStream) {
      switch (event.type) {
        case 'text_delta':
          yield this.makeChunk(streamId, { content: event.delta }, null)
          break
        case 'thinking_delta':
          yield this.makeChunk(streamId, { reasoning_content: event.delta }, null)
          break
        case 'toolcall_start': {
          const partial = event.partial.content[event.contentIndex]
          if (partial?.type !== 'toolCall') break
          yield this.makeChunk(
            streamId,
            {
              tool_calls: [
                {
                  index: event.contentIndex,
                  id: partial.id,
                  type: 'function',
                  function: { name: partial.name, arguments: '' },
                },
              ],
            },
            null
          )
          break
        }
        case 'toolcall_delta': {
          seenToolDelta.add(event.contentIndex)
          const partial = event.partial.content[event.contentIndex]
          if (partial?.type !== 'toolCall') break
          yield this.makeChunk(
            streamId,
            {
              tool_calls: [
                {
                  index: event.contentIndex,
                  id: partial.id,
                  type: 'function',
                  function: { name: partial.name, arguments: event.delta },
                },
              ],
            },
            null
          )
          break
        }
        case 'toolcall_end':
          if (!seenToolDelta.has(event.contentIndex)) {
            yield this.makeChunk(
              streamId,
              {
                tool_calls: [
                  {
                    index: event.contentIndex,
                    id: event.toolCall.id,
                    type: 'function',
                    function: {
                      name: event.toolCall.name,
                      arguments: JSON.stringify(event.toolCall.arguments || {}),
                    },
                  },
                ],
              },
              null
            )
          }
          break
        case 'done':
          yield this.makeChunk(
            streamId,
            {},
            this.toFinishReason(event.reason),
            this.mapUsage(event.message.usage)
          )
          break
        case 'error':
          throw new Error(event.error.errorMessage || 'pi-ai streaming failed')
        default:
          break
      }
    }
  }

  private makeChunk(
    id: string,
    delta: ChatCompletionChunk['choices'][0]['delta'],
    finishReason: ChatCompletionChunk['choices'][0]['finish_reason'],
    usage?: TokenUsage
  ): ChatCompletionChunk {
    return {
      id,
      choices: [
        {
          index: 0,
          delta,
          finish_reason: finishReason,
        },
      ],
      usage,
    }
  }

  private mapUsage(usage: {
    input: number
    output: number
    totalTokens: number
  }): TokenUsage {
    return {
      prompt_tokens: usage.input,
      completion_tokens: usage.output,
      total_tokens: usage.totalTokens,
    }
  }

  private toFinishReason(reason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted') {
    if (reason === 'toolUse') return 'tool_calls'
    if (reason === 'length') return 'length'
    return 'stop'
  }

  private textFromContent(
    content: Array<{ type: 'text'; text: string } | { type: 'thinking'; thinking: string } | unknown>
  ): string {
    const parts: string[] = []
    for (const item of content) {
      if ((item as { type?: string }).type === 'text') {
        parts.push((item as { text: string }).text)
      }
    }
    return parts.join('')
  }

  private safeParseArgs(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
      return {}
    } catch {
      return {}
    }
  }

  private emptyUsage() {
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

  private createId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return `pi-ai-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}
