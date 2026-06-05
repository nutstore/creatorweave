/**
 * Extension Store — manages browser extension detection state and install guide UI.
 *
 * Persists: banner dismissed timestamp, install guide step progress.
 * Also handles auto-registration of the codex-oauth LLM provider when
 * the browser extension is installed and authorized.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isWebBridgeAvailable } from '@/agent/tools/web-bridge.tool'
import {
  registerDynamicProvider,
  unregisterDynamicProvider,
} from '@/agent/providers/types'

export type ExtensionStatus = 'checking' | 'installed' | 'not_installed' | 'error'

const BANNER_DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const OUTDATED_BANNER_DISMISS_DURATION_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

/** The provider ID used for Codex OAuth */
const CODEX_OAUTH_PROVIDER_ID = 'codex-oauth'

/** Virtual API key for codex-oauth (real token is in the extension) */
export const CODEX_OAUTH_API_KEY = '__codex_oauth_extension_bridge__'

/** Default models for Codex OAuth (fallback if extension doesn't return models) */
const CODEX_OAUTH_FALLBACK_MODELS = [
  { id: 'gpt-5.4', name: 'GPT-5.4', capabilities: ['code', 'reasoning'] as const, contextWindow: 200000 },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', capabilities: ['code', 'reasoning'] as const, contextWindow: 128000 },
  { id: 'gpt-5.5', name: 'GPT-5.5', capabilities: ['code', 'reasoning'] as const, contextWindow: 200000 },
]

/** Compare two semver strings. Returns -1 if a < b, 0 if equal, 1 if a > b. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return 0
}

/** Fetch installed extension version via the bridge API. */
async function fetchInstalledVersion(): Promise<string | null> {
  try {
    const bridge = (window as any).__agentWeb
    if (!bridge?.getVersion) return null
    const resp = await bridge.getVersion()
    return resp?.ok && resp?.version ? resp.version : null
  } catch {
    return null
  }
}

/**
 * Register the codex-oauth provider into the dynamic provider registry.
 * Accepts models from the extension response; falls back to defaults if not provided.
 * Also persists a virtual API key so the standard provider pipeline works.
 */
async function registerCodexOAuthProvider(extensionModels?: Array<{ id: string; name: string; contextWindow?: number; capabilities?: string[] }>) {
  const models = (extensionModels && extensionModels.length > 0 ? extensionModels : CODEX_OAUTH_FALLBACK_MODELS).map(m => ({
    id: m.id,
    name: m.name,
    capabilities: (m.capabilities || ['code', 'reasoning']) as ['code', 'reasoning'],
    contextWindow: m.contextWindow || 200000,
  }))

  registerDynamicProvider(
    CODEX_OAUTH_PROVIDER_ID,
    {
      baseURL: 'https://chatgpt.com/backend-api/codex',
      modelName: models[0].id,
      headers: {},
      apiMode: 'responses',
    },
    {
      category: 'custom',
      displayName: 'Codex (Browser OAuth)',
      models,
    },
  )

  // Persist a virtual API key so apiKeyRepo.load() returns non-null
  try {
    const { getApiKeyRepository } = await import('@/sqlite')
    await getApiKeyRepository().save(CODEX_OAUTH_PROVIDER_ID, CODEX_OAUTH_API_KEY)
  } catch (err) {
    console.warn('[extension.store] Failed to save codex-oauth virtual API key:', err)
  }
}

function unregisterCodexOAuthProvider() {
  unregisterDynamicProvider(CODEX_OAUTH_PROVIDER_ID)
}

interface ExtensionState {
  // --- Runtime state (not persisted) ---
  status: ExtensionStatus
  lastCheckAt: number | null
  /** Whether the codex-oauth provider is currently registered */
  codexOAuthRegistered: boolean
  /** Installed extension version, or null if not installed/unknown */
  extensionVersion: string | null
  /** Whether the installed extension is older than the latest */
  outdated: boolean

  // --- Persisted state ---
  bannerDismissedAt: number | null
  installGuideStep: number
  installGuideOpen: boolean
  /** When the outdated banner was last dismissed */
  outdatedBannerDismissedAt: number | null

  // --- Actions ---
  checkStatus: () => ExtensionStatus
  /**
   * Ensure the codex-oauth provider is registered before checking API keys.
   * Must be awaited before checkHasApiKey() so getProviderConfig('codex-oauth')
   * returns a valid config instead of null.
   * No-op if extension is not installed or not authorized.
   */
  ensureCodexRegistered: () => Promise<void>
  dismissBanner: () => void
  shouldShowBanner: () => boolean
  shouldShowOutdatedBanner: () => boolean
  dismissOutdatedBanner: () => void
  openInstallGuide: () => void
  closeInstallGuide: () => void
  goToStep: (step: number) => void
  resetInstallGuide: () => void
  setStatus: (status: ExtensionStatus) => void
}

export const useExtensionStore = create<ExtensionState>()(
  persist(
    (set, get) => ({
      // Runtime state
      status: 'checking' as ExtensionStatus,
      lastCheckAt: null as number | null,
      codexOAuthRegistered: false,
      extensionVersion: null as string | null,
      outdated: false,

      // Persisted state
      bannerDismissedAt: null as number | null,
      installGuideStep: 1,
      installGuideOpen: false,
      outdatedBannerDismissedAt: null as number | null,

      // Actions
      checkStatus: () => {
        let newStatus: ExtensionStatus
        try {
          newStatus = isWebBridgeAvailable() ? 'installed' : 'not_installed'
        } catch {
          newStatus = 'error'
        }

        // Only trigger re-render if status actually changed
        if (get().status !== newStatus) {
          set({ status: newStatus, lastCheckAt: Date.now() })
        }

        // Fire-and-forget: register codex-oauth + check version when extension is installed
        if (newStatus === 'installed') {
          get().ensureCodexRegistered().catch(() => {})
          // Fetch version and compare with latest
          fetchInstalledVersion().then((version) => {
            if (!version) return
            const latestVersion = __EXTENSION_LATEST_VERSION__
            const isOutdated = compareVersions(version, latestVersion) < 0
            set({ extensionVersion: version, outdated: isOutdated })
          }).catch(() => {})
        } else if (get().codexOAuthRegistered) {
          unregisterCodexOAuthProvider()
          set({ codexOAuthRegistered: false, extensionVersion: null, outdated: false })
        }

        return newStatus
      },

      ensureCodexRegistered: async () => {
        // Already registered — no-op
        if (get().codexOAuthRegistered) return

        const bridge = (window as any).__agentWeb
        if (!bridge?.codexGetStatus) return

        try {
          const resp = await bridge.codexGetStatus()
          if (resp?.ok && resp.data?.authorized && !get().codexOAuthRegistered) {
            await registerCodexOAuthProvider(resp.data.models)
            set({ codexOAuthRegistered: true })
            // Auto-pin codex models if none pinned yet + refresh provider list
            try {
              const { useSettingsStore } = await import('@/store/settings.store')
              const settings = useSettingsStore.getState()
              const existing = settings.pinnedModelsByProvider['codex-oauth']
              if (!existing || existing.length === 0) {
                const models = resp.data.models || []
                if (models.length > 0) {
                  settings.setPinnedModels(
                    'codex-oauth',
                    models.map((m: any) => m.id),
                  )
                }
              }
              useSettingsStore.getState().triggerProviderRefresh()
            } catch {}
            // Re-check API key now that the provider is registered,
            // so the UI updates from "model unavailable" to ready.
            try {
              const { useSettingsStore } = await import('@/store/settings.store')
              useSettingsStore.getState().invalidateApiKeyCache('codex-oauth')
              await useSettingsStore.getState().checkHasApiKey()
            } catch {}
          } else if ((!resp?.ok || !resp.data?.authorized) && get().codexOAuthRegistered) {
            unregisterCodexOAuthProvider()
            set({ codexOAuthRegistered: false })
          }
        } catch {
          // Silently ignore — extension may not support codex yet
        }
      },

      dismissBanner: () => {
        set({ bannerDismissedAt: Date.now() })
      },

      shouldShowBanner: () => {
        const { status, bannerDismissedAt } = get()
        if (status === 'installed') return false
        if (status === 'checking') return false
        if (bannerDismissedAt) {
          const elapsed = Date.now() - bannerDismissedAt
          if (elapsed < BANNER_DISMISS_DURATION_MS) return false
        }
        return true
      },

      openInstallGuide: () => {
        set({ installGuideOpen: true })
      },

      closeInstallGuide: () => {
        set({ installGuideOpen: false })
      },

      goToStep: (step: number) => {
        set({ installGuideStep: step })
      },

      resetInstallGuide: () => {
        set({ installGuideStep: 1, installGuideOpen: false })
      },

      shouldShowOutdatedBanner: () => {
        const { status, outdated, outdatedBannerDismissedAt } = get()
        if (status !== 'installed' || !outdated) return false
        if (outdatedBannerDismissedAt) {
          const elapsed = Date.now() - outdatedBannerDismissedAt
          if (elapsed < OUTDATED_BANNER_DISMISS_DURATION_MS) return false
        }
        return true
      },

      dismissOutdatedBanner: () => {
        set({ outdatedBannerDismissedAt: Date.now() })
      },

      setStatus: (status: ExtensionStatus) => {
        set({ status })
      },
    }),
    {
      name: 'creatorweave-extension-store',
      // Only persist these fields
      partialize: (state) => ({
        bannerDismissedAt: state.bannerDismissedAt,
        installGuideStep: state.installGuideStep,
        outdatedBannerDismissedAt: state.outdatedBannerDismissedAt,
      }),
    },
  ),
)
