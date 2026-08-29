import { afterEach, describe, expect, it } from 'vitest'
import { usePageWriteAuthStore } from '../page-write-auth.store'
import { useToolAuthStore } from '@/store/tool-auth.store'

/**
 * PR-1 migrated page-action write auth into the unified FIFO tool-auth.store.
 * The legacy single-slot semantics intentionally changed: a concurrent request
 * now queues behind the visible one instead of silently denying it.
 */
describe('page write authorization store (legacy wrapper → unified queue)', () => {
  afterEach(() => {
    useToolAuthStore.getState().clear()
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

    expect(result).toBe(false)
    expect(useToolAuthStore.getState().pending).toBeNull()
  })

  it('queues a concurrent request instead of denying it (single-slot → FIFO)', async () => {
    const first = usePageWriteAuthStore.getState().request('page_click', 'First')
    const second = usePageWriteAuthStore.getState().request('page_fill', 'Second')

    expect(useToolAuthStore.getState().pending?.toolName).toBe('page_click')
    expect(useToolAuthStore.getState().queue).toHaveLength(2)

    usePageWriteAuthStore.getState().approve()
    await expect(first).resolves.toBe(true)
    expect(useToolAuthStore.getState().pending?.toolName).toBe('page_fill')

    usePageWriteAuthStore.getState().deny()
    await expect(second).resolves.toBe(false)
  })

  it('requests carry the page-action-write memory key so the modal offers "always allow"', async () => {
    const request = usePageWriteAuthStore.getState().request('page_click', 'Allow?')
    expect(useToolAuthStore.getState().pending?.memoryKey).toBe('page-action-write')

    usePageWriteAuthStore.getState().approve()
    await expect(request).resolves.toBe(true)
  })
})
