/**
 * useServiceWorker Hook
 *
 * Hook for managing PWA Service Worker state and updates.
 * Provides methods to control when new versions are applied.
 */

import { useState, useEffect, useCallback } from 'react'

/**
 * Service Worker hook result
 */
export interface UseServiceWorkerResult {
  /** Whether the page needs to be refreshed to use the new SW version */
  needsRefresh: boolean
  /** Whether a new SW version is available */
  updateAvailable: boolean
  /** Trigger an immediate update check */
  update: () => void
  /** Skip waiting and activate the new SW version immediately */
  skipWaiting: () => void
  /** The current ServiceWorkerRegistration, or null if not registered */
  registration: ServiceWorkerRegistration | null
}

/**
 * Hook for managing Service Worker state
 *
 * Monitors SW updates and provides controls for when to apply them.
 * The typical PWA flow:
 * 1. SW installs but waits (skipWaiting=false by default)
 * 2. User sees "Update available" notification
 * 3. User clicks update -> skipWaiting() -> page reloads
 *
 * @returns Object containing SW state and control methods
 *
 * Usage example:
 * ```tsx
 * const { needsRefresh, updateAvailable, skipWaiting, registration } = useServiceWorker()
 *
 * if (needsRefresh) {
 *   // Show update notification to user
 * }
 * ```
 */
export function useServiceWorker(): UseServiceWorkerResult {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)

  useEffect(() => {
    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      return
    }

    let currentRegistration: ServiceWorkerRegistration | null = null

    /**
     * Handle SW update found
     */
    const handleUpdateFound = () => {
      if (currentRegistration) {
        setRegistration(currentRegistration)
        setNeedsRefresh(true)
      }
    }

    /**
     * Handle SW controller change
     */
    const handleControllerChange = () => {
      // New SW took control, page will need refresh
      setNeedsRefresh(true)
    }

    /**
     * Register the service worker
     */
    const registerSW = async () => {
      try {
        currentRegistration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })

        setRegistration(currentRegistration)

        // Listen for updates
        currentRegistration.addEventListener('updatefound', handleUpdateFound)

        // Check if there's already an update waiting
        if (currentRegistration.waiting) {
          setNeedsRefresh(true)
        }

        // Listen for controller changes (when SW takes control)
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
      } catch (error) {
        console.error('[useServiceWorker] Registration failed:', error)
      }
    }

    registerSW()

    // Cleanup
    return () => {
      if (currentRegistration) {
        currentRegistration.removeEventListener('updatefound', handleUpdateFound)
      }
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  /**
   * Trigger an immediate update check
   */
  const update = useCallback(() => {
    if (registration?.installing) {
      // Wait for the installing worker to complete
      registration.installing.addEventListener('statechange', () => {
        if (registration.waiting) {
          setNeedsRefresh(true)
        }
      })
    } else {
      // No installing worker, trigger update
      navigator.serviceWorker.ready.then((reg) => {
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
      })
    }
  }, [registration])

  /**
   * Skip waiting and activate the new SW version
   * This will cause the new SW to take control immediately
   */
  const skipWaiting = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  }, [registration])

  return {
    needsRefresh,
    updateAvailable: needsRefresh,
    update,
    skipWaiting,
    registration,
  }
}
