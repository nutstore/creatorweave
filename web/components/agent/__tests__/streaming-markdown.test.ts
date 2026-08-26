/**
 * streaming-markdown.test.ts — unit tests for the streaming markdown scheduler.
 *
 * The reducer is pure/deterministic (no timers, no DOM), so these tests fully
 * characterize the plain→markdown promotion policy:
 *
 *   - small content (< IMMEDIATE_THRESHOLD): renders markdown on every token
 *   - large content: stays plain until quiet window, then promotes
 *   - while in markdown mode, new tokens refresh the snapshot on a throttled
 *     cadence instead of flashing back to plain
 *   - finish() always renders the final content exactly once
 */

import { describe, expect, it } from 'vitest'
import {
  createInitialStreamingMarkdownState,
  streamingMarkdownReducer,
  STREAMING_MARKDOWN_IMMEDIATE_THRESHOLD,
  STREAMING_MARKDOWN_QUIET_MS,
  STREAMING_MARKDOWN_MIN_UPDATE_MS,
} from '../streaming-markdown'

const T0 = 1_000_000

function token(content: string, now = T0) {
  return streamingMarkdownReducer(createInitialStreamingMarkdownState(), {
    type: 'token',
    content,
    now,
  })
}

describe('streamingMarkdownReducer', () => {
  describe('small content (< IMMEDIATE_THRESHOLD)', () => {
    it('renders markdown immediately on the first token', () => {
      const s = token('hello')
      expect(s.mode).toBe('markdown')
      expect(s.snapshot).toBe('hello')
      expect(s.promotionAt).toBeNull()
    })

    it('tracks every new token without scheduling timers', () => {
      let s = token('hello')
      s = streamingMarkdownReducer(s, { type: 'token', content: 'hello world', now: T0 + 16 })
      expect(s.mode).toBe('markdown')
      expect(s.latest).toBe('hello world')
      expect(s.snapshot).toBe('hello world')
      expect(s.refreshAt).toBeNull()
      expect(s.promotionAt).toBeNull()
    })
  })

  describe('large content (>= IMMEDIATE_THRESHOLD)', () => {
    const BIG = 'x'.repeat(STREAMING_MARKDOWN_IMMEDIATE_THRESHOLD + 10)

    it('stays plain on the first token and schedules a promotion', () => {
      const s = token(BIG)
      expect(s.mode).toBe('plain')
      expect(s.promotionAt).not.toBeNull()
      expect(s.promotionAt).toBe(T0 + STREAMING_MARKDOWN_QUIET_MS)
    })

    it('promotes to markdown when the quiet window elapses', () => {
      let s = token(BIG)
      s = streamingMarkdownReducer(s, { type: 'promotion_tick', now: T0 + STREAMING_MARKDOWN_QUIET_MS })
      expect(s.mode).toBe('markdown')
      expect(s.snapshot).toBe(BIG)
      expect(s.promotionAt).toBeNull()
    })

    it('does NOT promote before the quiet window elapses', () => {
      let s = token(BIG)
      // Timer fired 1ms early (setTimeout can fire early) — must NOT promote,
      // and must push the deadline forward so the effect re-schedules.
      const before = s.promotionAt!
      s = streamingMarkdownReducer(s, { type: 'promotion_tick', now: before - 1 })
      expect(s.mode).toBe('plain')
      expect(s.snapshot).toBe('')
      expect(s.promotionAt).toBeGreaterThan(before)
    })

    it('a new token during the quiet window reschedules the promotion', () => {
      let s = token(BIG)
      // A new token arrives 100ms later (before the 240ms quiet window ends)
      const bigger = BIG + 'more tokens keep coming'
      s = streamingMarkdownReducer(s, { type: 'token', content: bigger, now: T0 + 100 })
      expect(s.mode).toBe('plain')
      // promotion is now scheduled relative to the new token's arrival
      expect(s.promotionAt).toBe(T0 + 100 + STREAMING_MARKDOWN_QUIET_MS)
    })
  })

  describe('markdown mode with live stream', () => {
    const BIG = 'x'.repeat(STREAMING_MARKDOWN_IMMEDIATE_THRESHOLD + 10)

    function promoteToMarkdown(content: string, at = T0 + 1000): ReturnType<typeof streamingMarkdownReducer> {
      let s = token(content, at - 1000)
      s = streamingMarkdownReducer(s, { type: 'promotion_tick', now: at })
      return s
    }

    it('new tokens while in markdown schedule a throttled refresh, not a flash back to plain', () => {
      let s = promoteToMarkdown(BIG)
      expect(s.mode).toBe('markdown')
      const newContent = BIG + '\n\nNew paragraph after promotion'
      s = streamingMarkdownReducer(s, { type: 'token', content: newContent, now: T0 + 1100 })
      expect(s.mode).toBe('markdown') // stays markdown — no flash
      expect(s.latest).toBe(newContent)
      expect(s.snapshot).toBe(BIG) // old snapshot until refresh fires
      expect(s.refreshAt).toBe(T0 + 1100 + STREAMING_MARKDOWN_MIN_UPDATE_MS)
    })

    it('refresh_tick after the min interval updates the snapshot', () => {
      let s = promoteToMarkdown(BIG)
      const newContent = BIG + '\n\nNew paragraph'
      s = streamingMarkdownReducer(s, { type: 'token', content: newContent, now: T0 + 1100 })
      s = streamingMarkdownReducer(s, {
        type: 'refresh_tick',
        now: T0 + 1100 + STREAMING_MARKDOWN_MIN_UPDATE_MS,
      })
      expect(s.mode).toBe('markdown')
      expect(s.snapshot).toBe(newContent)
      expect(s.refreshAt).toBeNull()
    })

    it('refresh_tick before the min interval keeps the old snapshot', () => {
      let s = promoteToMarkdown(BIG)
      const newContent = BIG + 'x'
      s = streamingMarkdownReducer(s, { type: 'token', content: newContent, now: T0 + 1100 })
      const before = s.refreshAt!
      s = streamingMarkdownReducer(s, {
        type: 'refresh_tick',
        now: before - 1,
      })
      expect(s.snapshot).toBe(BIG)
      expect(s.refreshAt).not.toBeNull() // still pending
      expect(s.refreshAt).toBeGreaterThan(before) // deadline pushed forward
    })

    it('token with content identical to the snapshot does nothing', () => {
      let s = promoteToMarkdown(BIG)
      s = streamingMarkdownReducer(s, { type: 'token', content: BIG, now: T0 + 2000 })
      expect(s.mode).toBe('markdown')
      expect(s.snapshot).toBe(BIG)
      expect(s.refreshAt).toBeNull()
    })
  })

  describe('finish', () => {
    it('always renders the final content exactly once', () => {
      const s = streamingMarkdownReducer(createInitialStreamingMarkdownState(), {
        type: 'finish',
        content: 'final markdown **bold**',
        now: T0,
      })
      expect(s.mode).toBe('markdown')
      expect(s.snapshot).toBe('final markdown **bold**')
      expect(s.promotionAt).toBeNull()
      expect(s.refreshAt).toBeNull()
    })

    it('finish from a plain state (huge content that never got quiet) still renders', () => {
      let s = token('y'.repeat(STREAMING_MARKDOWN_IMMEDIATE_THRESHOLD + 50), T0)
      expect(s.mode).toBe('plain')
      s = streamingMarkdownReducer(s, { type: 'finish', content: s.latest, now: T0 + 500 })
      expect(s.mode).toBe('markdown')
      expect(s.snapshot).toBe(s.latest)
    })
  })
})
