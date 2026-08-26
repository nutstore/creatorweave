import { beforeEach, describe, expect, it, vi } from 'vitest'

const { isSidePanelMode, getSidePanelBindingId } = vi.hoisted(() => ({
  isSidePanelMode: vi.fn(() => true),
  getSidePanelBindingId: vi.fn(() => '7e30f3b0-d790-4d42-9e05-8f3d38e90be4'),
}))

vi.mock('@/agent/workspace-assistant-context', () => ({ isSidePanelMode, getSidePanelBindingId }))

import { captureDataUrlAsFile, captureTab, runPageAction } from '../page-action-bridge'

describe('captureDataUrlAsFile', () => {
  it('converts an extension screenshot data URL into a PNG file attachment', async () => {
    const file = await captureDataUrlAsFile('data:image/png;base64,aGVsbG8=', 'page-capture.png')

    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('page-capture.png')
    expect(file.type).toBe('image/png')
    expect(await file.text()).toBe('hello')
  })
})

describe('bound page action bridge', () => {
  beforeEach(() => {
    Object.assign(window, { __agentWeb: undefined })
  })

  it('sends the session-restored opaque binding for page actions', async () => {
    const runBoundPageAction = vi.fn().mockResolvedValue({ ok: true })
    Object.assign(window, { __agentWeb: { ready: true, runBoundPageAction } })

    await runPageAction({ type: 'snapshot' })

    expect(runBoundPageAction).toHaveBeenCalledWith(
      '7e30f3b0-d790-4d42-9e05-8f3d38e90be4',
      { type: 'snapshot' },
    )
  })

  it('sends the session-restored opaque binding for screenshots', async () => {
    const captureBoundTab = vi.fn().mockResolvedValue({ ok: true, dataUrl: 'data:image/png;base64,aGVsbG8=' })
    Object.assign(window, { __agentWeb: { ready: true, runBoundPageAction: vi.fn(), captureBoundTab } })

    await captureTab('png')

    expect(captureBoundTab).toHaveBeenCalledWith(
      '7e30f3b0-d790-4d42-9e05-8f3d38e90be4',
      'png',
      undefined,
    )
  })
})
