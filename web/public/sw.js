/**
 * PWA Service Worker
 *
 * Handles offline caching, push notifications, and background sync.
 */

const CACHE_NAME = 'app-v1'
const STATIC_CACHE = 'static-v1'
const DYNAMIC_CACHE = 'dynamic-v1'

// Resources to cache immediately
const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/manifest.json',
]

// API endpoints to cache with network-first strategy
const API_PATTERNS = [
  /\/api\//,
  /\/mcp\//,
]

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...')

  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      console.log('[ServiceWorker] Caching static resources')
      // Cache resources individually to handle failures gracefully
      for (const url of STATIC_RESOURCES) {
        try {
          await cache.add(url)
          console.log('[ServiceWorker] Cached:', url)
        } catch (error) {
          console.warn('[ServiceWorker] Failed to cache:', url, error)
          // Continue with other resources even if one fails
        }
      }
    })
  )

  // Activate immediately
  self.skipWaiting()
})

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...')

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map((name) => {
            console.log('[ServiceWorker] Deleting old cache:', name)
            return caches.delete(name)
          })
      )
    })
  )

  // Claim all clients immediately
  self.clients.claim()
})

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return
  }

  // Skip cross-origin requests (except for CDN resources)
  if (url.origin !== location.origin) {
    // Allow CDN resources
    if (url.hostname.includes('cdn') || url.hostname.includes('unpkg') || url.hostname.includes('jsdelivr')) {
      event.respondWith(networkFirstStrategy(request))
    }
    return
  }

  // API requests - network first
  if (API_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(networkFirstStrategy(request))
    return
  }

  // Static resources - cache first
  if (isStaticResource(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request))
    return
  }

  // HTML pages - network first with cache fallback
  event.respondWith(networkFirstWithCacheFallback(request))
})

//=============================================================================
// Cache Strategies
//=============================================================================

/**
 * Cache first - try cache, fall back to network
 */
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request)
  if (cached) {
    return cached
  }

  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    console.error('[ServiceWorker] Cache first failed:', error)
    return new Response('Offline', { status: 503 })
  }
}

/**
 * Network first - try network, fall back to cache
 */
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    console.log('[ServiceWorker] Network failed, trying cache:', request.url)
    const cached = await caches.match(request)
    if (cached) {
      return cached
    }
    return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Network first with cache fallback for HTML
 */
async function networkFirstWithCacheFallback(request) {
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) {
      return cached
    }

    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html')
      if (offlinePage) {
        return offlinePage
      }
    }

    return new Response('Offline', { status: 503 })
  }
}

/**
 * Check if URL is a static resource
 */
function isStaticResource(pathname) {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf']
  return staticExtensions.some((ext) => pathname.endsWith(ext))
}

//=============================================================================
// Background Sync
//=============================================================================

self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Sync event:', event.tag)

  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages())
  }
})

async function syncMessages() {
  console.log('[ServiceWorker] Syncing messages...')

  // Get pending messages from IndexedDB
  // This would integrate with main app's offline queue

  // In a real implementation, this would:
  // 1. Open IndexedDB
  // 2. Get pending messages
  // 3. Send to server
  // 4. Update IndexedDB on success

  console.log('[ServiceWorker] Message sync complete')
}

//=============================================================================
// Push Notifications
//=============================================================================

self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received:', event)

  let data = {
    title: 'AI Workspace',
    body: 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: '/' },
  }

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() }
    } catch {
      data.body = event.data.text()
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [100, 50, 100],
    data: data.data,
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: 'app-notification',
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification clicked:', event.action)

  event.notification.close()

  if (event.action === 'dismiss') {
    return
  }

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }

      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})

//=============================================================================
// Message Handling
//=============================================================================

self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data)

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(DYNAMIC_CACHE)
        const urls = event.data.urls || []
        // Cache URLs individually to handle failures gracefully
        for (const url of urls) {
          try {
            await cache.add(url)
            console.log('[ServiceWorker] Cached URL:', url)
          } catch (error) {
            console.warn('[ServiceWorker] Failed to cache URL:', url, error)
          }
        }
      })()
    )
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)))
      })
    )
  }
})

//=============================================================================
// Error Handling
//=============================================================================

self.addEventListener('error', (error) => {
  console.error('[ServiceWorker] Error:', error.message)
})

self.addEventListener('unhandledrejection', (reason) => {
  console.error('[ServiceWorker] Unhandled rejection:', reason.reason)
})
