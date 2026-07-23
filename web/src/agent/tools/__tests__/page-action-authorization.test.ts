import { describe, expect, it } from 'vitest'
import * as pageActionAuthorization from '../../../../../browser-extension/lib/page-action-authorization'

const { isTrustedCreatorWeaveSenderUrl } = pageActionAuthorization

describe('page action extension authorization', () => {
  it('allows only the exact CreatorWeave production and local development origins', () => {
    expect(isTrustedCreatorWeaveSenderUrl('https://creatorweave.eo2suite.cn/')).toBe(true)
    expect(isTrustedCreatorWeaveSenderUrl('http://localhost:5173/side-panel')).toBe(true)
  })

  it('rejects missing and lookalike sender URLs', () => {
    expect(isTrustedCreatorWeaveSenderUrl(undefined)).toBe(false)
    expect(isTrustedCreatorWeaveSenderUrl('https://creatorweave.eo2suite.cn.attacker.example')).toBe(false)
    expect(isTrustedCreatorWeaveSenderUrl('https://evil.example/https://creatorweave.eo2suite.cn')).toBe(false)
    expect(isTrustedCreatorWeaveSenderUrl('https://creatorweave.eo2suite.cn:444')).toBe(false)
  })

  it('accepts only opaque UUID side-panel bindings sent from session state', () => {
    const isSidePanelBindingId = (pageActionAuthorization as {
      isSidePanelBindingId?: (value: unknown) => boolean
    }).isSidePanelBindingId

    expect(isSidePanelBindingId?.('7e30f3b0-d790-4d42-9e05-8f3d38e90be4')).toBe(true)
    expect(isSidePanelBindingId?.('12')).toBe(false)
    expect(isSidePanelBindingId?.(undefined)).toBe(false)
  })
})
