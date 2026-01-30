/**
 * Context Manager - manages token window and message truncation.
 * Ensures messages fit within the LLM's context window while
 * preserving tool_call/tool_result pairs.
 */

import type { ChatMessage } from './llm/llm-provider'
import { estimateMessageTokens, estimateStringTokens } from './llm/token-counter'

export interface ContextManagerConfig {
  maxContextTokens: number
  /** Reserve tokens for the response */
  reserveTokens?: number
  /** System prompt (always included) */
  systemPrompt?: string
}

export class ContextManager {
  private maxTokens: number
  private reserveTokens: number
  private systemPrompt: string

  constructor(config: ContextManagerConfig) {
    this.maxTokens = config.maxContextTokens
    this.reserveTokens = config.reserveTokens || 4096
    this.systemPrompt = config.systemPrompt || ''
  }

  /** Update system prompt */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt
  }

  /**
   * Trim messages to fit within token budget.
   * Strategy: Keep system prompt + recent messages, remove older ones.
   * Never split tool_call/tool_result pairs.
   */
  trimMessages(messages: ChatMessage[]): ChatMessage[] {
    const budget = this.maxTokens - this.reserveTokens

    // System message always included
    const systemMessage: ChatMessage | null = this.systemPrompt
      ? { role: 'system', content: this.systemPrompt }
      : null

    const systemTokens = systemMessage ? estimateMessageTokens(systemMessage) : 0
    let availableTokens = budget - systemTokens

    if (availableTokens <= 0) {
      // System prompt alone exceeds budget - truncate it
      const truncatedPrompt = this.truncateToTokens(this.systemPrompt, budget - 100)
      return [{ role: 'system', content: truncatedPrompt }]
    }

    // Group messages: keep tool_calls and their results together
    const groups = this.groupMessages(messages)

    // Fill from newest to oldest
    const selectedGroups: ChatMessage[][] = []
    let usedTokens = 0

    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i]
      const groupTokens = group.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)

      if (usedTokens + groupTokens <= availableTokens) {
        selectedGroups.unshift(group)
        usedTokens += groupTokens
      } else {
        // Can't fit this group - stop
        break
      }
    }

    // Build final message list
    const result: ChatMessage[] = []
    if (systemMessage) {
      result.push(systemMessage)
    }
    for (const group of selectedGroups) {
      result.push(...group)
    }

    return result
  }

  /**
   * Group messages so that assistant messages with tool_calls
   * are kept together with their corresponding tool result messages.
   */
  private groupMessages(messages: ChatMessage[]): ChatMessage[][] {
    const groups: ChatMessage[][] = []
    let i = 0

    while (i < messages.length) {
      const msg = messages[i]

      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        // Start a group: assistant with tool_calls + all following tool results
        const group: ChatMessage[] = [msg]
        const toolCallIds = new Set(msg.tool_calls.map((tc) => tc.id))
        i++

        while (i < messages.length && messages[i].role === 'tool') {
          const toolMsg = messages[i]
          if (toolMsg.tool_call_id && toolCallIds.has(toolMsg.tool_call_id)) {
            group.push(toolMsg)
            i++
          } else {
            break
          }
        }

        groups.push(group)
      } else {
        // Single message group
        groups.push([msg])
        i++
      }
    }

    return groups
  }

  /** Truncate a string to approximately the given token count */
  private truncateToTokens(text: string, maxTokens: number): string {
    // Rough estimate: 3 chars per token
    const maxChars = maxTokens * 3
    if (text.length <= maxChars) return text
    return text.slice(0, maxChars) + '\n...[truncated]'
  }

  /** Estimate token count for current context */
  estimateContextTokens(messages: ChatMessage[]): number {
    const systemTokens = this.systemPrompt ? estimateStringTokens(this.systemPrompt) + 4 : 0
    const messageTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
    return systemTokens + messageTokens + 3 // conversation overhead
  }
}
