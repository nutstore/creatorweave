import { afterEach, describe, expect, it } from 'vitest'
import { usePageWriteAuthStore } from '../page-write-auth.store'
import { useToolAuthStore } from '@/store/tool-auth.store'
import { useSessionAllowStore } from '@/store/session-allow.store'

/**
 * PR-1 migrated page-action write auth into the unified FIFO tool-auth.store.
 * The legacy single-slot semantics intentionally changed: a concurrent request
 * now queues behind the visible one instead of silently denying it.
 *
 * The wrapper resolves the FULL { approved, remembered } resolution so the
 * caller (page-write.tool.ts) can persist "Always allow" grants
 * (review finding: dropping `remembered` silently broke the button).
 */
describe('page write authorization store (legacy wrapper → unified queue)', () => {
  afterEach(() => {
    useToolAuthStore.getState().clear()
    useSessionAllowStore.getState().clearAll()
  })

  it('denies a pending confirmation when its run is aborted', async () => {
    const controller = new AbortController()
    const request = usePageWriteAuthStore
      .getState()
      .request('page_click', 'Allow page_click?', controller.signal)
    controller.abort()

    const result = await Promise.race([
      request,
      new Promise<'still-pending'>((resolve) => setTimeout(() => resolve('still-pending'), 0)),
    ])

    expect(result).toEqual({ approved: false, remembered: false })
    expect(useToolAuthStore.getState().pending).toBeNull()
  })

  it('queues a concurrent request instead of denying it (single-slot → FIFO)', async () => {
    const first = usePageWriteAuthStore.getState().request('page_click', 'First')
    const second = usePageWriteAuthStore.getState().request('page_fill', 'Second')

    expect(useToolAuthStore.getState().pending?.toolName).toBe('page_click')
    expect(useToolAuthStore.getState().queue).toHaveLength(2)

    usePageWriteAuthStore.getState().approve()
    await expect(first).resolves.toEqual({ approved: true, remembered: false })
    expect(useToolAuthStore.getState().pending?.toolName).toBe('page_fill')

    usePageWriteAuthStore.getState().deny()
    await expect(second).resolves.toEqual({ approved: false, remembered: false })
  })

  it('carries the page-action-write memory key, conversation id, and remembered flag', async () => {
    const request = usePageWriteAuthStore
      .getState()
      .request('page_click', 'Allow?', undefined, 'conv-9')
    const pending = useToolAuthStore.getState().pending
    expect(pending?.memoryKey).toBe('page-action-write')
    expect(pending?.conversationId).toBe('conv-9')

    // "Always allow" click → caller sees remembered=true and can persist it.
    usePageWriteAuthStore.getState().approve(true)
    await expect(request).resolves.toEqual({ approved: true, remembered: true })
  })
})