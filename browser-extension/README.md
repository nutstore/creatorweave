# Browser Extension

A browser extension that provides `web_search` and `web_fetch` capabilities for in-browser Agents.

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

## Usage

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

## Project Structure

```
browser-extension/
├── wxt.config.ts              # WXT config (manifest, permissions, etc.)
├── package.json
├── entrypoints/
│   ├── background.ts          # Background service worker (search + fetch)
│   ├── content.ts             # Content script — message relay (ISOLATED world)
│   └── injected.content.ts    # Content script — API + Readability (MAIN world)
└── assets/                    # Icons and static assets
```

## Architecture

```
Agent Page
  │
  └──→ window.__agentWeb (injected by injected.content.ts, MAIN world)
          │                                 │
          │  extract: 'raw' | 'text'        │  extract: 'readability'
          │                                 │
          │         ┌───────────────────────┘
          │         │  Readability (DOMParser, runs in page context)
          │         │
          └──→ window.postMessage (bridge)
                  │
                  └──→ content.ts (ISOLATED world, relay)
                          │
                          └──→ chrome.runtime.sendMessage
                                  │
                                  └──→ background.ts (Service Worker)
                                          ├── web_search → DuckDuckGo HTML parsing
                                          └── web_fetch → Direct URL fetching (always raw)
```

Readability runs in the MAIN world (injected content script) because it needs `DOMParser`,
which is not available in the background service worker.
