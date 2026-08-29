import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  useYoloModeStore,
  isYoloOn,
  syncLegacyPageActionYolo,
} from '../yolo-mode.store'
import { usePageActionSessionStore } from '../page-action-session.store'

describe('yolo-mode.store (conversation-scoped yolo)', () => {
  beforeEach(() => {
    useYoloModeStore.getState().clearAll()
    usePageActionSessionStore.setState({ pageActionYolo: false })
  })
  afterEach(() => {
    useYoloModeStore.getState().clearAll()
    usePageActionSessionStore.setState({ pageActionYolo: false })
  })

  it('scopes yolo per conversation and is off by default', () => {
    expect(isYoloOn('conv-1')).toBe(false)
    useYoloModeStore.getState().setYolo('conv-1', true)
    expect(isYoloOn('conv-1')).toBe(true)
    expect(isYoloOn('conv-2')).toBe(false)
  })

  it('isYoloOn without a conversation id is always off (no global fallback)', () => {
    useYoloModeStore.getState().setYolo('conv-1', true)
    expect(isYoloOn(null)).toBe(false)
    expect(isYoloOn(undefined)).toBe(false)
    expect(isYoloOn('conv-1')).toBe(true)
  })

  it('clearAll drops every conversation (LLM mode-switch safety valve)', () => {
    useYoloModeStore.getState().setYolo('conv-1', true)
    useYoloModeStore.getState().setYolo('conv-2', true)
    useYoloModeStore.getState().clearAll()
    expect(isYoloOn('conv-1')).toBe(false)
    expect(isYoloOn('conv-2')).toBe(false)
  })

  it('legacy shim mirrors the flag into page-action store', () => {
    syncLegacyPageActionYolo(true)
    expect(usePageActionSessionStore.getState().pageActionYolo).toBe(true)
    syncLegacyPageActionYolo(false)
    expect(usePageActionSessionStore.getState().pageActionYolo).toBe(false)
  })
})
