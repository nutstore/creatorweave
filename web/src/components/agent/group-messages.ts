/**
 * group-messages.ts - Groups flat Message[] into Turn[] for UI rendering.
 *
 * A "Turn" is either a single user message or a consecutive run of
 * assistant (+ tool) messages between two user messages.
 * Token usage is aggregated across all assistant messages in the turn.
 */

import type { Message, MessageUsage } from '@/agent/message-types'

export type Turn =
  | { type: 'user'; message: Message }
  | {
      type: 'assistant'
      messages: Message[] // assistant messages only (tool msgs excluded)
      timestamp: number // last assistant message timestamp
      totalUsage: MessageUsage | null
    }

/**
 * Walk through a flat message list and produce Turn groups.
 *
 * Rules:
 * - system / tool messages are skipped (tool results are looked up via toolResults map)
 * - user message → standalone UserTurn
 * - consecutive assistant messages → single AssistantTurn with aggregated usage
 */
export function groupMessagesIntoTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = []
  let currentAssistant: Message[] | null = null

  const flushAssistant = () => {
    if (currentAssistant && currentAssistant.length > 0) {
      const usage = aggregateUsage(currentAssistant)
      turns.push({
        type: 'assistant',
        messages: currentAssistant,
        timestamp: currentAssistant[currentAssistant.length - 1].timestamp,
        totalUsage: usage,
      })
      currentAssistant = null
    }
  }

  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'tool') {
      continue
    }

    if (msg.role === 'user') {
      flushAssistant()
      turns.push({ type: 'user', message: msg })
    } else if (msg.role === 'assistant') {
      if (!currentAssistant) {
        currentAssistant = []
      }
      currentAssistant.push(msg)
    }
  }

  flushAssistant()
  return turns
}

function aggregateUsage(messages: Message[]): MessageUsage | null {
  let hasUsage = false
  let prompt = 0
  let completion = 0
  let total = 0
  let cacheRead = 0

  for (const msg of messages) {
    if (msg.usage) {
      hasUsage = true
      prompt += msg.usage.promptTokens
      completion += msg.usage.completionTokens
      total += msg.usage.totalTokens
      cacheRead += msg.usage.cacheReadTokens || 0
    }
  }

  return hasUsage
    ? { promptTokens: prompt, completionTokens: completion, totalTokens: total, cacheReadTokens: cacheRead }
    : null
}
