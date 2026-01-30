/**
 * Token estimation for LLM context management.
 * Uses heuristic: ~3 characters per token for mixed CJK/English text.
 */

import type { ChatMessage } from './llm-provider'

/** Estimate tokens for a single string */
export function estimateStringTokens(text: string): number {
  if (!text) return 0

  // CJK characters count as ~1.5 tokens each
  // ASCII characters average ~0.25 tokens each (4 chars per token)
  // Mixed content averages ~0.33 tokens per char (3 chars per token)
  let cjkChars = 0
  let asciiChars = 0

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0x3000 && code <= 0x303f) || // CJK Punctuation
      (code >= 0xff00 && code <= 0xffef) // Fullwidth forms
    ) {
      cjkChars++
    } else {
      asciiChars++
    }
  }

  return Math.ceil(cjkChars * 1.5 + asciiChars * 0.25)
}

/** Estimate tokens for a chat message */
export function estimateMessageTokens(message: ChatMessage): number {
  let tokens = 4 // Message overhead (role, separators)

  if (message.content) {
    tokens += estimateStringTokens(message.content)
  }

  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      tokens += estimateStringTokens(tc.function.name)
      tokens += estimateStringTokens(tc.function.arguments)
      tokens += 10 // tool call structure overhead
    }
  }

  if (message.name) {
    tokens += estimateStringTokens(message.name)
  }

  return tokens
}

/** Estimate total tokens for an array of messages */
export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 3 // Conversation overhead
  for (const msg of messages) {
    total += estimateMessageTokens(msg)
  }
  return total
}
