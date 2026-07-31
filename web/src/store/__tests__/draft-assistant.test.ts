import { describe, expect, it, vi } from 'vitest'
import { applyDraftAssistantEvent, createEmptyDraftAssistant } from '../draft-assistant'

describe('draft assistant reasoning duration', () => {
  it('freezes a reasoning step duration when the reasoning stream completes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'))
    const holder = { draftAssistant: createEmptyDraftAssistant() }

    applyDraftAssistantEvent(holder, { type: 'message_start' })
    applyDraftAssistantEvent(holder, { type: 'reasoning_start' })
    vi.advanceTimersByTime(2_500)
    applyDraftAssistantEvent(holder, { type: 'reasoning_complete', reasoning: 'Checking the implementation.' })

    const step = holder.draftAssistant?.steps.find((candidate) => candidate.type === 'reasoning')
    expect(step).toMatchObject({
      content: 'Checking the implementation.',
      streaming: false,
      durationMs: 2_500,
    })

    vi.useRealTimers()
  })

  it('freezes the duration for reasoning extracted from inline think tags', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'))
    const holder = { draftAssistant: createEmptyDraftAssistant() }

    applyDraftAssistantEvent(holder, { type: 'message_start' })
    applyDraftAssistantEvent(holder, { type: 'content_start' })
    applyDraftAssistantEvent(holder, {
      type: 'content_stream_sync',
      content: '<think>Inspecting the data flow.</think>Answer',
    })
    vi.advanceTimersByTime(1_200)
    applyDraftAssistantEvent(holder, {
      type: 'content_complete',
      content: '<think>Inspecting the data flow.</think>Answer',
    })

    const step = holder.draftAssistant?.steps.find((candidate) => candidate.type === 'reasoning')
    expect(step).toMatchObject({
      content: 'Inspecting the data flow.',
      streaming: false,
      durationMs: 1_200,
    })

    vi.useRealTimers()
  })
})
