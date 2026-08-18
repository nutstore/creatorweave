# Browser Extension

A browser extension that provides `web_search`, `web_fetch`, **Codex OAuth proxy**, and **WebMCP tool discovery** capabilities for CreatorWeave.

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
npm run build:store    # Store build (CW_CODEX_OAUTH=0, strips Codex OAuth)
npm run zip:store      # Store zip (Codex-stripped)
```

## Features

### Web Search & Fetch

### WebMCP Tool Discovery

Both core features work identically in every distribution (community & store):

After installation, `window.__agentWeb` is injected into the page:

```javascript
if (window.__agentWeb?.ready) {
  // Search
  const results = await window.__agentWeb.search('svelte 5 runes');
  // { ok: true, results: [{ title, url, snippet }, ...] }

  // Fetch a webpage (returns clean Markdown via Readability + Turndown)
  const article = await window.__agentWeb.fetch('https://example.com/blog-post');
  // {
  //   ok: true, status: 200, body: '# Article title\n\nMarkdown content...',
  //   readability: { title, excerpt, byline, siteName, length }
  // }

  // SPAs and JS-heavy sites are detected automatically: when the initial
  // HTML body is too short, a second request is made with a document
  // parser to extract the rendered content.
}
```

## WebMCP Tools — Integration Guide for Websites

Any website can expose tools (functions the AI agent can call) to CreatorWeave by registering them via the **standard WebMCP API** (`document.modelContext`). There is **no private protocol, no allowlist, no registration process** — the extension discovers standard-conforming tools automatically.

### How a website registers tools

**Option A — native API** (Chrome 140+ ships `document.modelContext`):

```javascript
await document.modelContext.registerTool({
  name: 'search_orders',
  description: 'Search the current user\'s orders',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: 'Search term' },
    },
    required: ['keyword'],
  },
  execute: async (args) => {
    const results = await fetch(`/api/orders?q=${encodeURIComponent(args.keyword)}`).then(r => r.json());
    return JSON.stringify(results);
  },
});
```

**Option B — polyfill** (other browsers / older Chrome, one import):

```html
<script type="module">
  import 'https://esm.sh/@mcp-b/global'; // auto-installs document.modelContext
  // then registerTool exactly as above
</script>
```

That's all the site needs to do. Registration can happen at any time — SPA hydration, lazy routes, late script loads are all picked up (the extension re-resolves the page API on a 2s poll in addition to the standard `toolchange` event).

### How discovery works (site developers don't need to do anything)

```
page registers tools
  → webmcp-injected.content.ts (MAIN world, static)
      pushes ready/snapshot events on toolchange + diff-poll
  → webmcp.content.ts (ISOLATED world, static)
      validates and relays as webmcp_tab_report
  → background registry (storage.session-persisted)
      → popup lists sites/groups instantly (no tab scan)
      → CreatorWeave web app discovers tools via window.__agentWeb.webmcpDiscoverTools()
  → agent invokes a tool via webmcpInvokeTool()
      → authorization gate (host + group) → relayed back into the source tab
```

The legacy scan-on-demand probe still exists as a fallback for tabs opened before the extension was (re)loaded; new tabs are pure push.

### Authorization model

- **Default allow, opt-out per site and per tool group.** Users manage switches in the extension popup.
- Tools from disabled sites/groups are **removed from discovery responses entirely** — they simply don't exist for pages or agents.
- The invoke path independently enforces `HOST_DISABLED` / `GROUP_DISABLED` regardless of what any UI shows.
- Websites cannot detect or influence their authorization state.

### Constraints & known limits

| Item | Limit |
|------|-------|
| Tools per page entering the catalog | 100 (extra tools dropped) |
| Tool description length | 2000 chars (longer is truncated) |
| Tool full names | Provider-safe: `hostname__toolName`, `[a-zA-Z0-9_-]`, ≤ 64 chars (hash suffix on collision) |
| Declarative form tools (annotated HTML forms) | **Not discovered** — only JS-registered (imperative) tools are |
| `execute` return values | JSON-serializable; must survive `JSON.parse(JSON.stringify(v))` |

### Site-side auth & security

`execute` runs the site's own code in the site's own tab, with the site's own cookies/session. Sites should treat tool arguments as **untrusted input**: validate args, check login state, rate-limit, and throw on invalid input — the error message propagates back to the agent.

### Debugging tips

- Check discovery: open the extension popup — your site's hostname and tool groups should appear within ~2s of registration.
- Test shim: `navigator.modelContextTesting` is also detected (listTools/executeTool), useful for pages that can't install the real API.
- The registry is per-tab: navigate away or unregister tools and the tab disappears from the catalog automatically.

## API

### `window.__agentWeb.search(query, options?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| query | string | - | Search query |
| options.count | number | 10 | Number of results (max 20) |

### `window.__agentWeb.fetch(url, options?)`

Returns the page rendered as **clean Markdown** (via [Mozilla Readability](https://github.com/mozilla/readability) + Turndown HTML-to-Markdown). SPA / JS-heavy pages are detected automatically and re-fetched with a DOM parser when the initial body is too short.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| url | string | - | Target URL |
| options.method | string | 'GET' | HTTP method |
| options.headers | object | {} | Request headers |
| options.body | string | null | Request body |

**Response shape:**

```javascript
{
  ok: true,
  status: 200,
  body: '# Article title\n\nMarkdown content...',
  readability: { title, excerpt, byline, siteName, length }
}
```

## Codex OAuth Proxy (Open-Source Community Version)

> **Distribution note:** this feature ships with the **open-source community version** (build from source or grab the release from GitHub). The **Chrome Web Store version does not include it** — the store build (`build:store` / `zip:store`) strips the Codex OAuth feature entirely at build time (popup box, background handlers, i18n keys).
>
> **Roadmap:** this proxy is planned to migrate into the Rust **native host**. Once it lives behind the native-messaging channel, the extension side reduces to a thin relay and the build-time strip becomes unnecessary.

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

**Usage display:** After the first request, the popup shows rate-limit usage windows with progress bars and reset times. Each window's label (e.g. `5h` / `Wk` / `Mo`) is derived from the duration reported by the server, and windows that the server does not return are hidden automatically.

**Security:** OAuth tokens never leave the extension boundary. The web app only communicates through the extension bridge (`window.__agentWeb`).

### `window.__agentWeb.codexGetStatus()` (community version)

Returns the current Codex OAuth authorization status:

```javascript
const resp = await window.__agentWeb.codexGetStatus();
// { ok: true, data: { authorized: true, authState: 'authorized', models: [...] } }
```

### `window.__agentWeb.codexProxyFetchStream(body)` (community version)

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
├── wxt.config.ts              # WXT config (manifest, permissions, Codex strip, stable extension key)
├── package.json
├── native-host/               # Rust native host (disk IO + exec, Chrome Native Messaging)
│   └── src/
│       ├── main.rs            # NM framing (4-byte length prefix, 1MB limit), stateless/streaming modes
│       ├── nm.rs              # Message read/write
│       ├── scope.rs           # Authorized directory scopes
│       ├── shell_env.rs       # Login-shell PATH/env inheritance
│       ├── process_registry.rs# Background processes (exec_start/status/stop/logs)
│       └── actions/           # read_file/write_file/exec_sync/execpolicy/... per action
├── entrypoints/
│   ├── background.ts          # Service worker (search, fetch, Codex OAuth, WebMCP registry, native host relay)
│   ├── content.ts             # Content script — message relay (ISOLATED world)
│   ├── injected.content.ts    # Content script — __agentWeb API + Readability (MAIN world)
│   ├── webmcp.content.ts      # Content script — WebMCP relay (ISOLATED world, static)
│   ├── webmcp-injected.content.ts # Content script — WebMCP page agent (MAIN world, static)
│   ├── page-action-runner.content.ts # Bound page actions (ACT ON PAGES)
│   ├── side-panel-button.content.ts  # Floating "唤起怡氧知知" button
│   ├── popup/
│   │   ├── index.html
│   │   └── main.ts            # Popup: injection status, WebMCP site/group switches, Codex box (community version)
│   └── webmcp/                # WebMCP background modules
│       ├── relay-protocol.ts  # Dual-world envelope + parsers (tool/desc clamps)
│       ├── agent-core.ts      # Page-API resolution ladder (document→navigator→testing)
│       ├── registry.ts        # Tab registry (storage.session, seen-set)
│       ├── discovery.ts       # Registry-first discover + legacy probe fallback
│       ├── invoke.ts          # Authorization gates + relay-first invoke
│       ├── authorization.ts   # Per-host / per-group opt-out store
│       └── ...
└── public/                    # Icons, _locales, static assets
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
                                          ├── codex_proxy_fetch_stream → chatgpt.com/codex
                                          ├── webmcp_tab_report → tab registry (storage.session)
                                          ├── webmcp_discover_tools → registry + fallback probe
                                          ├── webmcp_invoke_tool → auth gates → tabs.sendMessage relay
                                          └── native_host_call → Rust host (disk IO, exec_sync)
```

### WebMCP Discovery Flow (per tab)

```
website page (standard WebMCP registration)
  → webmcp-injected.content.ts (MAIN world, document_idle)
      resolveAgentApi() → ready snapshot → toolchange events + 2s diff-poll
  → window.postMessage (relay envelope, validated)
  → webmcp.content.ts (ISOLATED world)
  → chrome.runtime.sendMessage('webmcp_tab_report')
  → background: registry.ts (identity from browser-verified sender.tab)
  → popup (instant list + live refresh) / web app (webmcpDiscoverTools)

invoke: web app → webmcpInvokeTool → invoke.ts
  → host/group authorization gates → tabs.sendMessage('webmcp_invoke_in_tab')
  → relay → page agent → executeTool → response
  (legacy executeScript probe only for tabs predating extension load)
```

### Codex Request Flow (community version)

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
