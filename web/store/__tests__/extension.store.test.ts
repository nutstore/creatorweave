import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  saveApiKey: vi.fn(async () => undefined),
  registerDynamicProvider: vi.fn(),
  unregisterDynamicProvider: vi.fn(),
  checkHasApiKey: vi.fn(async () => true),
  invalidateApiKeyCache: vi.fn(),
  triggerProviderRefresh: vi.fn(),
}))

vi.mock('@/security/api-key-store', () => ({ saveApiKey: mocks.saveApiKey }))

vi.mock('@/agent/providers/types', () => ({
  registerDynamicProvider: mocks.registerDynamicProvider,
  unregisterDynamicProvider: mocks.unregisterDynamicProvider,
}))

vi.mock('@/agent/tools/web-bridge.tool', () => ({ isWebBridgeAvailable: () => true }))

vi.mock('@/store/settings.store', () => ({
  useSettingsStore: {
    getState: () => ({
      pinnedModelsByProvider: {},
      setPinnedModels: vi.fn(),
      triggerProviderRefresh: mocks.triggerProviderRefresh,
      invalidateApiKeyCache: mocks.invalidateApiKeyCache,
      checkHasApiKey: mocks.checkHasApiKey,
    }),
  },
}))

import { CODEX_OAUTH_API_KEY, useExtensionStore } from '../extension.store'

describe('extension store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('__EXTENSION_LATEST_VERSION__', '0.0.0')
    Object.defineProperty(window, '__agentWeb', {
      configurable: true,
      value: {
        codexGetStatus: vi.fn(async () => ({
          ok: true,
          data: { authorized: true, models: [{ id: 'gpt-5.4', name: 'GPT-5.4' }] },
        })),
      },
    })
    useExtensionStore.setState({ codexOAuthRegistered: false })
  })

  it('saves the Codex OAuth virtual key through the initialized key store', async () => {
    await useExtensionStore.getState().ensureCodexRegistered()

    expect(mocks.saveApiKey).toHaveBeenCalledWith('codex-oauth', CODEX_OAUTH_API_KEY)
  })
})
