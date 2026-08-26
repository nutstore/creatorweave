import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSidePanelHostnameMock } = vi.hoisted(() => ({
  getSidePanelHostnameMock: vi.fn(),
}))

vi.mock('@/agent/workspace-assistant-context', () => ({
  getSidePanelHostname: getSidePanelHostnameMock,
}))

import { resolveWriteAuthorization } from '../page-action-auth'
import { usePageActionSessionStore } from '@/store/page-action-session.store'

describe('page action write authorization', () => {
  beforeEach(() => {
    getSidePanelHostnameMock.mockReturnValue('docs.example.com')
    usePageActionSessionStore.setState({ pageActionYolo: false })
  })

  it('prompts by default', () => {
    expect(resolveWriteAuthorization('page_click')).toMatchObject({
      decision: 'prompt',
      reason: 'DEFAULT_PROMPT',
    })
  })

  it('allows writes when YOLO is enabled for this page session', () => {
    usePageActionSessionStore.getState().setPageActionYolo(true)

    expect(resolveWriteAuthorization('page_click')).toEqual({
      decision: 'allow',
      reason: 'YOLO_AUTO_ALLOW',
    })
  })

  it('denies blacklisted pages even when session YOLO is enabled', () => {
    getSidePanelHostnameMock.mockReturnValue('checkout.paypal.com')
    usePageActionSessionStore.getState().setPageActionYolo(true)

    expect(resolveWriteAuthorization('page_click')).toMatchObject({
      decision: 'deny',
      reason: 'URL_BLACKLISTED:paypal',
    })
  })
})
