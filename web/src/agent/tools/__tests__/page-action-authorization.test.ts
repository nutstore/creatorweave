import { describe, expect, it } from 'vitest'
import * as pageActionAuthorization from '../../../../../browser-extension/lib/page-action-authorization'
import {
  CW_WEBAPP_ORIGIN_CN,
  CW_WEBAPP_ORIGIN_COM,
  CW_WEBAPP_ORIGIN_LEGACY,
} from '../../../../../browser-extension/lib/webapp-origins'

const { isTrustedCreatorWeaveSenderUrl } = pageActionAuthorization

describe('page action extension authorization', () => {
  it('allows only the exact eo2weave production, legacy, and local development origins', () => {
    expect(isTrustedCreatorWeaveSenderUrl(`${CW_WEBAPP_ORIGIN_CN}/`)).toBe(true)
    expect(isTrustedCreatorWeaveSenderUrl(`${CW_WEBAPP_ORIGIN_COM}/side-panel`)).toBe(true)
    // Legacy origin stays trusted during the migration window.
    expect(isTrustedCreatorWeaveSenderUrl(`${CW_WEBAPP_ORIGIN_LEGACY}/`)).toBe(true)
    expect(isTrustedCreatorWeaveSenderUrl('http://localhost:5173/side-panel')).toBe(true)
  })

  it('rejects missing and lookalike sender URLs', () => {
    expect(isTrustedCreatorWeaveSenderUrl(undefined)).toBe(false)
    expect(isTrustedCreatorWeaveSenderUrl(`${CW_WEBAPP_ORIGIN_LEGACY}.attacker.example`)).toBe(false)
    expect(isTrustedCreatorWeaveSenderUrl(`https://evil.example/${CW_WEBAPP_ORIGIN_LEGACY}`)).toBe(false)
    expect(isTrustedCreatorWeaveSenderUrl(`${CW_WEBAPP_ORIGIN_LEGACY}:444`)).toBe(false)
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
