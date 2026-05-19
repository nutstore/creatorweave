/**
 * Token estimation for LLM context management.
 *
 * NOTE: The heuristic intentionally estimates LOW (conservative) so that
 * trimMessages() — which relies solely on these estimates for the basic
 * group-fit check — does NOT drop message groups prematurely.  The proactive
 * compression trigger (in convert-bridge.ts) uses real API usage numbers
 * (usedRealTokens) for its threshold decision, which compensates for the
 * undercount at that level.  Raising the coefficient would cause trimMessages
 * to over-estimate and drop groups while real usage is still well below the
 * budget, creating a visible mismatch between the UI percentage (derived from
 * real usage) and compression behaviour.
 */

import type { ChatMessage } from './llm-provider'

/** Estimate tokens for a single string */
export function estimateStringTokens(text: string): number {
  if (!text) return 0

  // CJK characters count as ~1.5 tokens each
  // Non-CJK characters average ~0.25 tokens each (~4 chars per token).
  let cjkChars = 0
  let otherChars = 0

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
      otherChars++
    }
  }

  return Math.ceil(cjkChars * 1.5 + otherChars * 0.25)
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
