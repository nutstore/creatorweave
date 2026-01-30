/**
 * GLM (Zhipu AI) LLM Provider.
 * Uses OpenAI-compatible API format.
 * Base URL: https://open.bigmodel.cn/api/paas/v4
 */

import type {
  LLMProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
} from './llm-provider'
import { estimateMessagesTokens } from './token-counter'

export interface GLMProviderConfig {
  apiKey: string
  baseUrl?: string
  model?: string
}

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const DEFAULT_MODEL = 'glm-4-flash'
const MAX_CONTEXT_TOKENS = 128000
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 1000

export class GLMProvider implements LLMProvider {
  readonly name = 'GLM'
  readonly maxContextTokens = MAX_CONTEXT_TOKENS

  private apiKey: string
  private baseUrl: string
  private model: string

  constructor(config: GLMProviderConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.model = config.model || DEFAULT_MODEL
  }

  async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const body = this.buildRequestBody(request, false)
    const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })

    return response.json()
  }

  async *chatStream(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): AsyncGenerator<ChatCompletionChunk> {
    const body = this.buildRequestBody(request, true)
    console.log(
      `[GLMProvider] Request: model=${this.model}, messages=${request.messages.length}, tools=${request.tools?.length ?? 0}, toolChoice=${request.toolChoice}`
    )
    console.log('[GLMProvider] Request body tools:', body.tools ? 'present' : 'absent')
    const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal,
    })

    if (!response.body) {
      throw new Error('No response body for streaming')
    }

    yield* this.parseSSEStream(response.body)
  }

  estimateTokens(messages: ChatMessage[]): number {
    return estimateMessagesTokens(messages)
  }

  /** Update API key (e.g. when user changes settings) */
  updateApiKey(apiKey: string): void {
    this.apiKey = apiKey
  }

  /** Update model */
  updateModel(model: string): void {
    this.model = model
  }

  /** Fetch with exponential backoff retry for 429 and 5xx errors */
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        console.log(`[GLMProvider] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`)
        await new Promise((r) => setTimeout(r, delay))
      }

      const response = await fetch(url, init)

      if (response.ok) return response

      const isRetryable = response.status === 429 || response.status >= 500
      if (isRetryable && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get('retry-after')
        if (retryAfter) {
          const retryMs = parseInt(retryAfter, 10) * 1000
          if (!isNaN(retryMs) && retryMs > 0) {
            console.log(`[GLMProvider] Server requested retry-after: ${retryMs}ms`)
            await new Promise((r) => setTimeout(r, retryMs))
          }
        }
        lastError = new Error(`GLM API error (${response.status})`)
        continue
      }

      const errorText = await response.text()
      throw new Error(`GLM API error (${response.status}): ${errorText}`)
    }

    throw lastError || new Error('GLM API request failed after retries')
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    }
  }

  private buildRequestBody(
    request: ChatCompletionRequest,
    stream: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: request.messages,
      stream,
    }

    // Request token usage in streaming responses (returned in the final chunk)
    if (stream) {
      body.stream_options = { include_usage: true }
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools
      body.tool_choice = request.toolChoice || 'auto'
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens
    }

    return body
  }

  private async *parseSSEStream(
    body: ReadableStream<Uint8Array>
  ): AsyncGenerator<ChatCompletionChunk> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE lines
        const lines = buffer.split('\n')
        // Keep the last potentially incomplete line in buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue // Skip empty lines and comments

          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6)
            if (data === '[DONE]') return

            try {
              const chunk: ChatCompletionChunk = JSON.parse(data)
              yield chunk
            } catch {
              // Skip malformed JSON chunks
              console.warn('[GLMProvider] Failed to parse SSE chunk:', data)
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim()
        if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
          try {
            yield JSON.parse(trimmed.slice(6))
          } catch {
            // Ignore trailing incomplete data
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
