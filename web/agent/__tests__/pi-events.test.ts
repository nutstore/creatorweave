import { describe, expect, it, vi } from 'vitest'
import { applyPiAssistantUpdate } from '../loop/pi-events'

describe('pi-events', () => {
  it('emits toolcall delta with mapped toolCallId', () => {
    const callbacks = {
      onToolCallDelta: vi.fn(),
    }
    const map = new Map<number, string>()

    applyPiAssistantUpdate(
      {
        type: 'toolcall_start',
        contentIndex: 1,
        partial: {
          content: [
            { type: 'text', text: 'ignored' },
            { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'a' } },
          ],
        },
      } as never,
      callbacks as never,
      undefined,
      map
    )

    applyPiAssistantUpdate(
      {
        type: 'toolcall_delta',
        contentIndex: 1,
        delta: '{"path":"b"}',
      } as never,
      callbacks as never,
      undefined,
      map
    )

    expect(callbacks.onToolCallDelta).toHaveBeenCalledWith(1, '{"path":"b"}', 'call_1')
  })

  it('uses stable fallback toolCallId when start event has empty id', () => {
    const onToolCallStart = vi.fn()
    const callbacks = {
      onToolCallDelta: vi.fn(),
    }
    const map = new Map<number, string>()

    applyPiAssistantUpdate(
      {
        type: 'toolcall_start',
        contentIndex: 0,
        partial: {
          content: [
            { type: 'toolCall', id: '', name: 'read', arguments: { path: 'a' } },
          ],
        },
      } as never,
      callbacks as never,
      onToolCallStart,
      map
    )

    applyPiAssistantUpdate(
      {
        type: 'toolcall_delta',
        contentIndex: 0,
        delta: '{"path":"b"}',
      } as never,
      callbacks as never,
      undefined,
      map
    )

    expect(onToolCallStart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pending_tool_0', function: expect.objectContaining({ name: 'read' }) })
    )
    expect(callbacks.onToolCallDelta).toHaveBeenCalledWith(0, '{"path":"b"}', 'pending_tool_0')
  })
})
