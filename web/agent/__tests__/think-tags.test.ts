import { describe, expect, it } from 'vitest'
import { parseThinkTags } from '@/agent/think-tags'
import { createAssistantMessage } from '@/agent/message-types'

describe('think tags', () => {
  it('extracts closed <think> blocks', () => {
    const parsed = parseThinkTags('Before<think>hidden reasoning</think>After')
    expect(parsed.hasThinkTag).toBe(true)
    expect(parsed.reasoning).toBe('hidden reasoning')
    expect(parsed.content).toBe('BeforeAfter')
  })

  it('extracts dangling <think> tail as reasoning', () => {
    const parsed = parseThinkTags('Answer<think>streaming reasoning...')
    expect(parsed.hasThinkTag).toBe(true)
    expect(parsed.reasoning).toBe('streaming reasoning...')
    expect(parsed.content).toBe('Answer')
  })

  it('extracts closed <thinking> blocks', () => {
    const parsed = parseThinkTags('Before<thinking>hidden reasoning</thinking>After')
    expect(parsed.hasThinkTag).toBe(true)
    expect(parsed.reasoning).toBe('hidden reasoning')
    expect(parsed.content).toBe('BeforeAfter')
  })

  it('extracts dangling <thinking> tail as reasoning', () => {
    const parsed = parseThinkTags('Answer<thinking>streaming reasoning...')
    expect(parsed.hasThinkTag).toBe(true)
    expect(parsed.reasoning).toBe('streaming reasoning...')
    expect(parsed.content).toBe('Answer')
  })

  it('normalizes assistant message by moving think content into reasoning', () => {
    const message = createAssistantMessage('A<think>B</think>C', undefined, undefined, null)
    expect(message.content).toBe('AC')
    expect(message.reasoning).toBe('B')
  })

  it('keeps explicit reasoning and strips think tags from content', () => {
    const message = createAssistantMessage('Visible<think>Inline</think>', undefined, undefined, 'Explicit')
    expect(message.content).toBe('Visible')
    expect(message.reasoning).toBe('Explicit')
  })
})
