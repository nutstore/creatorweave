---
title: Side Panel Context Provider Integration Guide
order: 150
---

# Side Panel Context Provider Integration Guide

This guide is for **third-party website developers** (e.g. Jianguoyun workbench, webmail, docs, internal enterprise systems). It explains how to make your website provide "current page context" to the EO2Weave agent when opened from the EO2Weave browser extension's side panel.

## 1. What Is a Context Provider

When the user clicks the EO2Weave sidebar button on your site, the browser extension opens the EO2Weave side panel. The EO2Weave agent wants to know "what the user is currently looking at" so it can answer based on the current context.

All you need to do is expose a global function on your site (or via a userscript):

```js
window.__sidePanelContextProvider = {
  getContext: () => {
    // Return an object of any shape (EO2Weave does not parse fields)
    return {
      type: 'ticket',
      id: '484514',
      title: document.title,
      url: location.href,
      // ...any fields
    }
  }
}
```

Before every LLM call, EO2Weave pulls this function's result through the browser extension and appends it **verbatim** to the system prompt.

## 2. Core Contract

### 2.1 Global object name

Fixed as `window.__sidePanelContextProvider`. It **must** be attached to `window`, not to any other object.

### 2.2 Method signature

```ts
interface SidePanelContextProvider {
  getContext: () => unknown | Promise<unknown>
}
```

- **Synchronous** or **asynchronous** (Promise) returns both work — EO2Weave supports both
- **Any return type** — string / object / array / any JS value
- EO2Weave **does not parse fields**; the value is stringified as-is and injected into the LLM
- Returning `null` / `undefined` / throwing = telling EO2Weave "no context right now"

### 2.3 When it is called

EO2Weave calls it **every time it builds the system prompt** (i.e. before every LLM call). So:

- Your `getContext` should return the **current** page state (don't cache for too long)
- If context is expensive to compute, add internal caching (e.g. a 5-second TTL)
- Keep each call lightweight (< 100ms is ideal)

## 3. Implementation Options

### 3.1 Expose from your own site JS (recommended)

If you control the site source, the simplest way is to attach the provider on every page:

```js
// Your site JS (e.g. main.tsx)
;(window as any).__sidePanelContextProvider = {
  getContext: () => {
    const ticket = getCurrentTicket()  // your own logic
    return {
      type: 'ticket',
      id: ticket.id,
      title: ticket.title,
      url: location.href,
      participants: ticket.participants.map(p => p.name),
      status: ticket.status,
    }
  }
}
```

### 3.2 Userscript (no site source changes needed)

If you don't maintain the site, use a userscript:

```js
// ==UserScript==
// @name         My Site → EO2Weave Context Provider
// @namespace    https://yourcompany.com
// @version      1.0.0
// @match        https://your-site.example.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // Wait for the page to load
  window.addEventListener('load', () => {
    window.__sidePanelContextProvider = {
      getContext: () => {
        return {
          type: 'document',
          url: location.href,
          title: document.title,
          // Extract info from the DOM
          currentSection: document.querySelector('.active-section')?.textContent,
          selectedText: window.getSelection()?.toString() || '',
        }
      }
    }
  });

  // Watch SPA route changes (if any)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // EO2Weave re-pulls on the next LLM call; no need to notify
    }
  }).observe(document, { subtree: true, childList: true });
})();
```

### 3.3 Browser extension content script (when you have an extension)

```js
// content-script.js
(function() {
  window.__sidePanelContextProvider = {
    getContext: async () => {
      // Can read the DOM from the content script's isolated environment
      return {
        type: 'page',
        url: location.href,
        title: document.title,
        bodyText: document.body.innerText.slice(0, 500),
      }
    }
  }
})();
```

## 4. What Fields to Return

**Completely free.** EO2Weave does not parse them. Suggestions:

| Scenario | Recommended fields |
|------|---------|
| Task/ticket system | `type`, `id`, `title`, `status`, `assignee`, `url` |
| Mail system | `type: 'email'`, `messageId`, `from`, `to`, `subject`, `body` |
| Code hosting | `type: 'pr'`, `id`, `branch`, `files`, `title` |
| Document collaboration | `type: 'doc'`, `docId`, `cursor`, `selection` |
| Generic page | `type: 'page'`, `url`, `title`, `selectedText` |

**Any** fields work — the LLM infers meaning from field names.

## 5. Complete Examples

### 5.1 Ticket system (TypeScript + React)

```tsx
// At the top level of App.tsx
useEffect(() => {
  const ticket = useTicketStore.getState().currentTicket
  if (!ticket) return

  ;(window as any).__sidePanelContextProvider = {
    getContext: () => ({
      type: 'ticket',
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      assignee: ticket.assignee?.name,
      priority: ticket.priority,
      labels: ticket.labels,
      url: window.location.href,
      selectedText: window.getSelection()?.toString() || '',
      description: ticket.description.slice(0, 1000), // truncate to avoid bloat
    })
  }
}, [ticket])
```

### 5.2 Mail system (userscript)

```js
// ==UserScript==
// @name         Mail → EO2Weave
// @match        https://mail.example.com/*
// ==/UserScript==

(function() {
  'use strict';

  window.addEventListener('load', () => {
    window.__sidePanelContextProvider = {
      getContext: () => {
        const messageEl = document.querySelector('.message-view');
        if (!messageEl) return null;

        return {
          type: 'email',
          messageId: messageEl.dataset.messageId,
          from: messageEl.querySelector('.from')?.textContent,
          to: Array.from(messageEl.querySelectorAll('.to')).map(e => e.textContent),
          subject: messageEl.querySelector('.subject')?.textContent,
          body: messageEl.querySelector('.body')?.textContent?.slice(0, 5000),
          timestamp: messageEl.querySelector('.timestamp')?.dataset.value,
        }
      }
    };
  });
})();
```

## 6. Debugging

With the EO2Weave side panel open, the browser console (DevTools for the side panel) shows:

```
[Workspace Assistant] Side panel mode: hostname: workspace.jianguoyun.com tabId: 123
```

If context fetching fails:

```
[Workspace Assistant] fetch context failed: Error: context fetch timeout
```

Possible causes:
- `__sidePanelContextProvider` is not attached to window
- `getContext` throws (check the browser console)
- The workbench tab is closed or inaccessible
- The provider never resolves

## 7. Don't Do These

❌ **Don't append fields to the URL** (e.g. `?ticket_id=484514&title=...`):
   - URLs have length limits
   - Hardcoded field names; EO2Weave doesn't parse them

❌ **Don't register as a WebMCP tool**:
   - WebMCP tools appear in the agent's tool catalog
   - That has different semantics from "system prompt injection"

❌ **Don't push to EO2Weave's window**:
   - EO2Weave pulls (pull mode); it doesn't accept pushes
   - EO2Weave attaches no setContext callback

## 8. Security Considerations

- `getContext` should return **only** data the current user can access
- Don't include sensitive info (passwords, tokens, etc.)
- The extension executes your `getContext` in the main world, so it can access everything on window — **assess the risks yourself**

## 9. Related Docs

- [Integrating Out-of-Page MCP Services](./mcp-page-outside-services.md) — EO2Weave-side integration architecture
- Browser extension source: the `requestSidePanelContext` handler in `browser-extension/entrypoints/background.ts`
