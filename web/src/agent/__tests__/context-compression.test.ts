import { describe, expect, it } from 'vitest'
import type { Message } from '../message-types'
import {
  applyCompressionBaseline,
  getCompressionCutoffTimestamp,
  shouldCallLLMSummary,
} from '../loop/context-compression'

describe('context-compression helpers', () => {
  it('getCompressionCutoffTimestamp returns just after latest message timestamp', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'first', timestamp: 10 },
      { id: '2', role: 'assistant', content: 'ok', timestamp: 11 },
      { id: '3', role: 'user', content: 'latest', timestamp: 42 },
      { id: '4', role: 'tool', content: 'result', toolCallId: 'tc1', name: 'read', timestamp: 43 },
    ]
    expect(getCompressionCutoffTimestamp(messages)).toBe(44)
  })

  it('applyCompressionBaseline prepends summary and can return summary-only context', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'old', timestamp: 10 },
      { id: '2', role: 'assistant', content: 'new', timestamp: 20 },
    ]
    const compressed = applyCompressionBaseline(messages, { summary: 'S', cutoffTimestamp: 21 }, 'Earlier:')

    expect(compressed).toHaveLength(1)
    expect(compressed[0]).toMatchObject({
      role: 'user',
      kind: 'context_summary',
      content: 'S',
      timestamp: 20,
    })
  })

  it('shouldCallLLMSummary enforces thresholds and cadence', () => {
    expect(
      shouldCallLLMSummary({
        droppedGroups: 3,
        droppedContent: 'x'.repeat(1000),
        convertCallCount: 20,
        lastSummaryConvertCall: 8,
        minDroppedGroups: 2,
        minDroppedContentChars: 800,
        minIntervalConvertCalls: 8,
      })
    ).toBe(true)

    expect(
      shouldCallLLMSummary({
        droppedGroups: 1,
        droppedContent: 'x'.repeat(1000),
        convertCallCount: 20,
        lastSummaryConvertCall: 8,
        minDroppedGroups: 2,
        minDroppedContentChars: 800,
        minIntervalConvertCalls: 8,
      })
    ).toBe(false)
  })
})
