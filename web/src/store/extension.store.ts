/**
 * Extension Store — manages browser extension detection state and install guide UI.
 *
 * Persists: banner dismissed timestamp, install guide step progress.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isWebBridgeAvailable } from '@/agent/tools/web-bridge.tool'

export type ExtensionStatus = 'checking' | 'installed' | 'not_installed' | 'error'

const BANNER_DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface ExtensionState {
  // --- Runtime state (not persisted) ---
  status: ExtensionStatus
  lastCheckAt: number | null

  // --- Persisted state ---
  bannerDismissedAt: number | null
  installGuideStep: number
  installGuideOpen: boolean

  // --- Actions ---
  checkStatus: () => ExtensionStatus
  dismissBanner: () => void
  shouldShowBanner: () => boolean
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
      status: 'checking',
      lastCheckAt: null,

      // Persisted state
      bannerDismissedAt: null,
      installGuideStep: 1,
      installGuideOpen: false,

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
        return newStatus
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
      }),
    },
  ),
)
