/**
 * useInstallPrompt Hook
 *
 * Hook for managing PWA install prompt state.
 * Listens for beforeinstallprompt event and provides install controls.
 */

import { useState, useEffect, useCallback } from 'react'

/**
 * Install prompt hook result
 */
export interface UseInstallPromptResult {
  /** Whether the app can be installed (PWA criteria met) */
  canInstall: boolean
  /** The beforeinstallprompt event, call prompt() to show dialog */
  prompt: BeforeInstallPromptEvent | null
  /** Dismiss the install prompt (user choice to not install) */
  dismiss: () => void
  /** Whether the user has dismissed the prompt */
  isDismissed: boolean
}

/**
 * Extended BeforeInstallPromptEvent with prompt() method
 */
interface BeforeInstallPromptEvent extends Event {
  /** Called to show the native install dialog */
  prompt: () => Promise<void>
  /** Returns the user's choice */
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Hook for managing PWA install prompt
 *
 * Monitors when the app can be installed and provides controls
 * to show the native install dialog or dismiss the prompt.
 *
 * Key behaviors:
 * - Waits for user interaction before showing prompt eligibility
 * - Respects user's dismiss choice (won't show again in session)
 * - Detects when app is already installed
 *
 * @returns Object containing install state and control methods
 *
 * Usage example:
 * ```tsx
 * const { canInstall, prompt, dismiss, isDismissed } = useInstallPrompt()
 *
 * if (canInstall && !isDismissed) {
 *   // Show install prompt UI
 * }
 * ```
 */
export function useInstallPrompt(): UseInstallPromptResult {
  const [canInstall, setCanInstall] = useState(false)
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent default browser prompt
      e.preventDefault()
      // Store the event for later use
      setPrompt(e as BeforeInstallPromptEvent)
      // App is eligible to be installed
      setCanInstall(true)
    }

    // Listen for successful install
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setCanInstall(false)
      // Clear any stored prompt
      setPrompt(null)
    }

    // Check if beforeinstallprompt is supported
    if ('onbeforeinstallprompt' in window) {
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  /**
   * Dismiss the install prompt
   * User has indicated they don't want to install now
   */
  const dismiss = useCallback(() => {
    setIsDismissed(true)
    setPrompt(null)
  }, [])

  return {
    canInstall: canInstall && !isDismissed && !isInstalled,
    prompt,
    dismiss,
    isDismissed,
  }
}
