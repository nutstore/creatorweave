import { afterEach, describe, expect, it } from 'vitest'
import { usePageWriteAuthStore } from '../page-write-auth.store'

describe('page write authorization store', () => {
  afterEach(() => {
    usePageWriteAuthStore.getState().clear()
  })

  it('denies a pending confirmation when its run is aborted', async () => {
    const controller = new AbortController()
    const request = usePageWriteAuthStore.getState().request('page_click', 'Allow page_click?', controller.signal)
    controller.abort()

    const result = await Promise.race([
      request,
      new Promise<'still-pending'>((resolve) => setTimeout(() => resolve('still-pending'), 0)),
    ])

    expect(result).toBe(false)
    expect(usePageWriteAuthStore.getState().pending).toBeNull()
  })
})
