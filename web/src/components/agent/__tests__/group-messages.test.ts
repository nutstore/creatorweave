import { describe, expect, it } from 'vitest'
import { groupMessagesIntoTurns } from '../group-messages'
import { createAssistantMessage, createUserMessage } from '@/agent/message-types'

describe('groupMessagesIntoTurns usage aggregation', () => {
  it('uses latest assistant usage instead of summing all assistant usage in a turn', () => {
    const user = createUserMessage('u1')
    const a1 = createAssistantMessage('a1')
    a1.usage = { promptTokens: 1200, completionTokens: 300, totalTokens: 1500 }
    const a2 = createAssistantMessage('a2')
    a2.usage = { promptTokens: 200, completionTokens: 100, totalTokens: 300 }

    const turns = groupMessagesIntoTurns([user, a1, a2])
    const assistantTurn = turns.find((t) => t.type === 'assistant')
    expect(assistantTurn?.type).toBe('assistant')
    if (!assistantTurn || assistantTurn.type !== 'assistant') return
    expect(assistantTurn.totalUsage).toEqual({
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
      cacheReadTokens: 0,
    })
  })
})

