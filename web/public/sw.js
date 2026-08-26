"use strict";
(() => {
  // sw.ts
  var STATIC_CACHE = "static-v2";
  var DYNAMIC_CACHE = "dynamic-v2";
  function buildConversationNotificationUrl(projectId, conversationId) {
    return `/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(conversationId)}`;
  }
  var IS_DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1" || self.location.hostname === "";
  var STATIC_RESOURCES = ["/", "/manifest.json"];
  var API_PATTERNS = [/\/api\//, /\/mcp\//];
  var PYODIDE_WHEEL_PATTERN = /^\/assets\/pyodide\/.+\.(?:whl|tar)$/i;
  var PYODIDE_VERSION = "0.29.3";
  var PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  var IMMUTABLE_ASSET_PATTERN = /^\/assets\/.+-[A-Za-z0-9_-]{6,}\.(?:js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|wasm)$/i;
  var PRECACHE_URLS = (self.__WB_MANIFEST ?? []).map((entry) => typeof entry === "string" ? entry : entry.url).filter((url) => typeof url === "string" && url.startsWith("/"));
  self.addEventListener("install", (event) => {
    if (IS_DEV) {
      event.waitUntil(self.skipWaiting());
      return;
    }
    event.waitUntil(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const urlsToCache = Array.from(/* @__PURE__ */ new Set([...STATIC_RESOURCES, ...PRECACHE_URLS]));
        for (const url of urlsToCache) {
          try {
            await cache.add(url);
          } catch (error) {
            console.warn("[ServiceWorker] Failed to precache:", url, error);
          }
        }
      })()
    );
    self.skipWaiting();
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys().then(
        (cacheNames) => Promise.all(
          cacheNames.filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE).map((name) => caches.delete(name))
        )
      )
    );
    self.clients.claim();
  });
  self.addEventListener("fetch", (event) => {
    if (IS_DEV) return;
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== "GET") return;
    if (url.protocol === "ws:" || url.protocol === "wss:") return;
    if (url.origin !== self.location.origin) {
      if (url.hostname.includes("cdn") || url.hostname.includes("unpkg") || url.hostname.includes("jsdelivr")) {
        event.respondWith(networkFirstStrategy(request));
      }
      return;
    }
    if (API_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
      event.respondWith(networkFirstStrategy(request));
      return;
    }
    if (isNavigationRequest(request)) {
      event.respondWith(networkFirstWithCacheFallback(request));
      return;
    }
    if (isPyodideWheel(url.pathname)) {
      event.respondWith(pyodideWheelCacheWithCdnFallback(request, url));
      return;
    }
    if (isImmutableAsset(url.pathname)) {
      event.respondWith(cacheFirstStrategy(request));
      return;
    }
    if (isStaticResource(url.pathname)) {
      event.respondWith(networkFirstStrategy(request));
      return;
    }
    event.respondWith(networkFirstStrategy(request));
  });
  async function cacheFirstStrategy(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      console.error("[ServiceWorker] Cache first failed:", error);
      return new Response("Offline", { status: 503 });
    }
  }
  async function networkFirstStrategy(request) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        const cache = await caches.open(DYNAMIC_CACHE);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      return new Response(JSON.stringify({ error: "Offline", cached: false }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  async function networkFirstWithCacheFallback(request) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        const cache = await caches.open(DYNAMIC_CACHE);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      const appShell = await caches.match("/");
      if (appShell) return appShell;
      return new Response("Offline", { status: 503 });
    }
  }
  async function pyodideWheelCacheWithCdnFallback(request, url) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const fileName = url.pathname.split("/").pop();
    if (!fileName) {
      return new Response("Bad Request", { status: 400 });
    }
    const cdnUrl = `${PYODIDE_CDN_BASE}${fileName}`;
    try {
      const cdnResponse = await fetch(cdnUrl, { mode: "cors" });
      if (cdnResponse.ok) {
        await cache.put(request, cdnResponse.clone());
      }
      return cdnResponse;
    } catch {
      return new Response(JSON.stringify({ error: "Offline", cached: false }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  function isStaticResource(pathname) {
    const staticExtensions = [
      ".js",
      ".css",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".ico",
      ".woff",
      ".woff2",
      ".ttf",
      ".wasm"
    ];
    return staticExtensions.some((ext) => pathname.endsWith(ext));
  }
  function isImmutableAsset(pathname) {
    return IMMUTABLE_ASSET_PATTERN.test(pathname);
  }
  function isPyodideWheel(pathname) {
    return PYODIDE_WHEEL_PATTERN.test(pathname);
  }
  function isNavigationRequest(request) {
    if (request.mode === "navigate") return true;
    const accept = request.headers.get("accept") ?? "";
    return accept.includes("text/html");
  }
  self.addEventListener("sync", (event) => {
    if (event.tag === "sync-messages") {
      event.waitUntil(syncMessages());
    }
  });
  async function syncMessages() {
    return;
  }
  self.addEventListener("push", (event) => {
    let data = {
      title: "EO2Weave",
      body: "You have a new notification",
      icon: "/favicon.svg",
      badge: "/icons/badge-72.png",
      data: { url: "/" }
    };
    if (event.data) {
      try {
        data = { ...data, ...event.data.json() };
      } catch {
        data.body = event.data.text();
      }
    }
    const options = {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      data: data.data,
      actions: [
        { action: "open", title: "Open" },
        { action: "dismiss", title: "Dismiss" }
      ],
      tag: "app-notification",
      renotify: true
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  });
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    if (event.action === "dismiss") return;
    const data = event.notification.data ?? {};
    const { clientId, conversationId, projectId } = data;
    event.waitUntil((async () => {
      if (clientId) {
        try {
          const original = await self.clients.get(clientId);
          if (original?.type === "window") {
            await original.focus();
            original.postMessage({
              type: "NAVIGATE_TO_CONVERSATION",
              conversationId,
              projectId
              // 注意：不带 url — 客户端自己拼
            });
            return;
          }
        } catch (err) {
          console.warn("[ServiceWorker] clients.get failed:", err);
        }
      }
      if (self.clients.openWindow && projectId && conversationId) {
        return self.clients.openWindow(buildConversationNotificationUrl(projectId, conversationId));
      }
    })());
  });
  self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") {
      self.skipWaiting();
    }
    if (event.data?.type === "GET_CLIENT_ID") {
      const clientId = event.source?.id ?? null;
      event.ports[0]?.postMessage({ clientId });
      return;
    }
    if (event.data?.type === "CACHE_URLS") {
      event.waitUntil(
        (async () => {
          const cache = await caches.open(DYNAMIC_CACHE);
          const urls = Array.isArray(event.data?.urls) ? event.data.urls : [];
          for (const url of urls) {
            try {
              await cache.add(url);
            } catch (error) {
              console.warn("[ServiceWorker] Failed to cache URL:", url, error);
            }
          }
        })()
      );
    }
    if (event.data?.type === "CLEAR_CACHE") {
      event.waitUntil(caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))));
    }
  });
  self.addEventListener("error", (event) => {
    console.error("[ServiceWorker] Error:", event.message);
  });
  self.addEventListener("unhandledrejection", (event) => {
    console.error("[ServiceWorker] Unhandled rejection:", event.reason);
  });
})();
