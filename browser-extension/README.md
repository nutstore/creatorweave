# Browser Extension

A browser extension that provides `web_search`, `web_fetch`, and **Codex OAuth proxy** capabilities for CreatorWeave.

Built with [WXT](https://wxt.dev/).

## Setup

```bash
cd browser-extension
npm install
```

## Development (Recommended)

```bash
npm run watch
```

Then load the extension **once** in your own Chrome:

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `browser-extension/dist/chrome-mv3/`

After that, code changes trigger automatic extension reload — no need to reload manually.

## Other Commands

```bash
npm run dev            # Auto-launch a new Chrome instance with extension loaded
npm run build          # Production build to dist/chrome-mv3/
npm run zip            # Package as .zip for Chrome Web Store
```

## Features

### Web Search & Fetch

After installation, `window.__agentWeb` is injected into the page:

```javascript
if (window.__agentWeb?.ready) {
  // Search
  const results = await window.__agentWeb.search('svelte 5 runes');
  // { ok: true, results: [{ title, url, snippet }, ...] }

  // Fetch a webpage (raw HTML)
  const page = await window.__agentWeb.fetch('https://example.com');
  // { ok: true, status: 200, headers: {...}, body: '<html>...' }

  // Fetch with text extraction (strips all tags)
  const text = await window.__agentWeb.fetch('https://example.com', {
    extract: 'text'
  });

  // Fetch with Readability extraction (clean article content)
  const article = await window.__agentWeb.fetch('https://example.com/blog-post', {
    extract: 'readability'
  });
  // {
  //   ok: true, status: 200, body: 'Clean article text...',
  //   readability: { title, excerpt, byline, siteName, length }
  // }
}
```

### Codex OAuth Proxy

The extension enables using OpenAI Codex models directly from CreatorWeave, without exposing OAuth tokens to the web app.

**Flow:**

1. Click the extension icon → **Start Device Code Login**
2. A new tab opens to `auth.openai.com` — complete authorization
3. The extension exchanges the device code for access/refresh tokens (stored in `chrome.storage.local`)
4. CreatorWeave auto-detects the authorized extension and registers `codex-oauth` as an available LLM provider
5. All Codex API requests are proxied through the extension's background service worker

**Supported models:**

| Model ID | Name | Context Window |
|----------|------|----------------|
| `gpt-5.4` | GPT-5.4 | 200K |
| `gpt-5.4-mini` | GPT-5.4 Mini | 128K |
| `gpt-5.5` | GPT-5.5 | 200K |

**Usage display:** After the first request, the popup shows rate-limit usage — primary (5h window) and secondary (weekly window) with progress bars and reset times.

**Security:** OAuth tokens never leave the extension boundary. The web app only communicates through the extension bridge (`window.__agentWeb`).

## API

### `window.__agentWeb.search(query, options?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| query | string | - | Search query |
| options.count | number | 10 | Number of results (max 20) |

### `window.__agentWeb.fetch(url, options?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| url | string | - | Target URL |
| options.method | string | 'GET' | HTTP method |
| options.headers | object | {} | Request headers |
| options.body | string | null | Request body |
| options.extract | 'raw' \| 'text' \| 'readability' | 'raw' | Content extraction mode |

#### Extract Modes

| Mode | Description |
|------|-------------|
| `raw` | Returns full HTML as-is |
| `text` | Strips all HTML tags, returns plain text |
| `readability` | Uses [Mozilla Readability](https://github.com/mozilla/readability) to extract clean article content — removes ads, navigation, sidebars, footers. Returns `readability` metadata (title, excerpt, byline, siteName, length). |

### `window.__agentWeb.codexGetStatus()`

Returns the current Codex OAuth authorization status:

```javascript
const resp = await window.__agentWeb.codexGetStatus();
// { ok: true, data: { authorized: true, authState: 'authorized', models: [...] } }
```

### `window.__agentWeb.codexProxyFetchStream(body)`

Proxies a Codex Responses API request through the extension with SSE streaming:

```javascript
const stream = window.__agentWeb.codexProxyFetchStream({
  model: 'gpt-5.4',
  instructions: 'You are a helpful assistant.',
  stream: true,
  input: [...],
});
for await (const chunk of stream) {
  // SSE text chunks
}
stream.cancel(); // Abort early if needed
```

## Project Structure

```
browser-extension/
├── wxt.config.ts              # WXT config (manifest, permissions, etc.)
├── package.json
├── entrypoints/
│   ├── background.ts          # Background service worker (search, fetch, Codex OAuth + proxy)
│   ├── content.ts             # Content script — message relay (ISOLATED world)
│   ├── injected.content.ts    # Content script — API + Readability (MAIN world)
│   ├── popup.html             # Extension popup (auth flow + usage display)
│   └── popup/                 # (empty, popup is inline in popup.html)
└── public/                    # Icons and static assets
```

## Architecture

```
CreatorWeave Web App
  │
  ├── pi-ai library → fetch() → codex-bridge-fetch.ts (globalThis.fetch wrapper)
  │       │
  │       └──→ window.__agentWeb.codexProxyFetchStream(body)
  │               │
  │               └──→ [SSE streaming via port-based messaging]
  │
  └── window.__agentWeb (injected by injected.content.ts, MAIN world)
          │                                 │
          │  search / fetch / codexStatus   │  readability extraction
          │                                 │
          │         ┌───────────────────────┘
          │         │  Readability (DOMParser, runs in page context)
          │         │
          └──→ window.postMessage (bridge)
                  │
                  └──→ content.ts (ISOLATED world, relay)
                          │
                          ├── chrome.runtime.sendMessage (request/response)
                          └── chrome.runtime.connect (streaming)
                                  │
                                  └──→ background.ts (Service Worker)
                                          ├── web_search → DuckDuckGo
                                          ├── web_fetch → Direct URL fetch
                                          ├── codex_auth → Device Code OAuth
                                          └── codex_proxy_fetch_stream → chatgpt.com/codex
```

### Codex Request Flow

```
Web App → fetch(chatgpt.com/...)
  → codex-bridge-fetch.ts intercepts
    → window.__agentWeb.codexProxyFetchStream(body)
      → injected.content.ts → postMessage
        → content.ts → chrome.runtime.connect('codex_stream')
          → background.ts → fetch(chatgpt.com, { stream: true })
            → extract x-codex-* rate-limit headers → save to storage
            → SSE chunks → port.postMessage → ... → ReadableStream → Response
```
