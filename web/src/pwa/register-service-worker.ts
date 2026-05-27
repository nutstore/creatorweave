interface RegisterServiceWorkerOptions {
  buildId: string
  scope?: string
  updateIntervalMs?: number
  windowTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>
  /** Called when a new SW version is ready. The callback should trigger a user-facing prompt. */
  onUpdateAvailable?: () => void
}

const DEFAULT_UPDATE_INTERVAL_MS = 5 * 60 * 1000

/**
 * sessionStorage key used to prevent showing duplicate update toasts
 * after a page reload triggered by applyServiceWorkerUpdate().
 */
const SW_NOTIFIED_KEY = 'sw-last-notified-build'

/**
 * Registers the app service worker with an explicit build version in script URL.
 * This guarantees each deployment triggers a SW update check and activation path.
 *
 * When a new version is detected, `onUpdateAvailable` is called instead of
 * automatically reloading. The caller should show a user-facing prompt and
 * call `applyServiceWorkerUpdate()` when the user confirms.
 */
export function registerServiceWorker(options: RegisterServiceWorkerOptions): () => void {
  const {
    buildId,
    scope = '/',
    updateIntervalMs = DEFAULT_UPDATE_INTERVAL_MS,
    windowTarget = window,
    onUpdateAvailable,
  } = options

  if (!('serviceWorker' in navigator)) {
    return () => {}
  }

  let registration: ServiceWorkerRegistration | null = null
  let updateIntervalId: ReturnType<typeof setInterval> | null = null

  /**
   * Notify the app that an update is available, but only if we haven't already
   * notified about this buildId in the current browser session (tab).
   * This prevents duplicate toasts after a reload triggered by applyServiceWorkerUpdate().
   */
  const notifyIfNew = () => {
    try {
      const lastNotified = sessionStorage.getItem(SW_NOTIFIED_KEY)
      if (lastNotified === buildId) {
        console.log('[SW] Already notified about build', buildId, '— skipping duplicate toast')
        return
      }
      sessionStorage.setItem(SW_NOTIFIED_KEY, buildId)
    } catch {
      // sessionStorage may be unavailable in some environments — just proceed
    }
    onUpdateAvailable?.()
  }

  const handleUpdateFound = () => {
    if (!registration?.installing) return

    const installingWorker = registration.installing
    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // New version is ready — notify the app instead of auto-activating.
        notifyIfNew()
      }
    })
  }

  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(buildId)}`, {
        scope,
        updateViaCache: 'none',
      })

      registration.addEventListener('updatefound', handleUpdateFound)

      // If a worker is already waiting from a previous session, notify immediately.
      if (registration.waiting && navigator.serviceWorker.controller) {
        notifyIfNew()
      }

      // Trigger an immediate update check on startup.
      await registration.update()

      updateIntervalId = setInterval(() => {
        registration?.update().catch((error) => {
          console.warn('[SW] Periodic update check failed:', error)
        })
      }, updateIntervalMs)
    } catch (error) {
      console.error('[SW] Registration failed:', error)
    }
  }

  windowTarget.addEventListener('load', register)

  return () => {
    windowTarget.removeEventListener('load', register)

    if (registration) {
      registration.removeEventListener('updatefound', handleUpdateFound)
    }

    if (updateIntervalId) {
      clearInterval(updateIntervalId)
      updateIntervalId = null
    }
  }
}

/**
 * Activate the waiting Service Worker and reload the page.
 * Call this after the user confirms they want to update.
 */
export function applyServiceWorkerUpdate(): void {
  navigator.serviceWorker.ready.then((reg) => {
    if (reg.waiting) {
      // Mark the current buildId as notified *before* reload so that
      // the refreshed page won't show a duplicate toast.
      try {
        sessionStorage.setItem(SW_NOTIFIED_KEY, __APP_BUILD_ID__)
      } catch {
        // ignore
      }

      // Listen for controller change, then reload
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload()
      })
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    } else {
      // No waiting worker — just reload
      window.location.reload()
    }
  })
}
