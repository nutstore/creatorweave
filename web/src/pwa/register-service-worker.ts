interface RegisterServiceWorkerOptions {
  buildId: string
  scope?: string
  updateIntervalMs?: number
  windowTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>
  reload?: () => void
}

const DEFAULT_UPDATE_INTERVAL_MS = 5 * 60 * 1000

/**
 * Registers the app service worker with an explicit build version in script URL.
 * This guarantees each deployment triggers a SW update check and activation path.
 */
export function registerServiceWorker(options: RegisterServiceWorkerOptions): () => void {
  const {
    buildId,
    scope = '/',
    updateIntervalMs = DEFAULT_UPDATE_INTERVAL_MS,
    windowTarget = window,
    reload = () => window.location.reload(),
  } = options

  if (!('serviceWorker' in navigator)) {
    return () => {}
  }

  let registration: ServiceWorkerRegistration | null = null
  let updateIntervalId: ReturnType<typeof setInterval> | null = null
  let isReloading = false

  const handleControllerChange = () => {
    if (isReloading) return
    isReloading = true
    reload()
  }

  const handleUpdateFound = () => {
    if (!registration?.installing) return

    const installingWorker = registration.installing
    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
      }
    })
  }

  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(buildId)}`, {
        scope,
        updateViaCache: 'none',
      })

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
      registration.addEventListener('updatefound', handleUpdateFound)

      // If a worker is already waiting, activate it immediately.
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' })

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

    navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)

    if (updateIntervalId) {
      clearInterval(updateIntervalId)
      updateIntervalId = null
    }
  }
}
