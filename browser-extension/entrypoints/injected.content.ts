// ============================================================
// Injected Content Script (MAIN world) — Page-side API
// Runs directly in the page's JS context via world: 'MAIN'.
// Sets up window.__agentWeb and communicates with the
// ISOLATED-world relay via window.postMessage.
//
// Readability processing happens here (MAIN world) because
// it needs DOMParser which is only available in page context,
// not in the background service worker.
// ============================================================

import { Readability } from '@mozilla/readability'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  world: 'MAIN',

  main() {
    // Prevent duplicate injection
    if ((window as any).__agentWeb) return;

    let _requestId = 0;

    // Pending request promises, keyed by id
    const _pending = new Map<string, { resolve: (value: any) => void }>();

    // Listen for responses from the ISOLATED-world relay
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.__agentWebResponse !== true) return;

      const pending = _pending.get(data.id);
      if (pending) {
        _pending.delete(data.id);
        pending.resolve(data.response);
      }
    });

    // Send request to ISOLATED relay → background
    function sendToBridge(type: string, payload: Record<string, any>): Promise<any> {
      return new Promise((resolve) => {
        const id = '__aw_' + (++_requestId) + '_' + Date.now();
        _pending.set(id, { resolve });

        window.postMessage({
          __agentWebBridge: true,
          id,
          type,
          payload,
        }, '*');

        // Timeout safety
        setTimeout(() => {
          if (_pending.has(id)) {
            _pending.delete(id);
            resolve({ ok: false, error: 'Bridge request timeout' });
          }
        }, 35000); // Longer timeout for render mode
      });
    }

    /**
     * Apply content extraction to a fetch response.
     * 'raw'       — return HTML as-is
     * 'text'      — strip all tags, return plain text
     * 'readability' — use Mozilla Readability to extract clean article content
     */
    function extractContent(body: string, mode: string): {
      body: string;
      readability?: {
        title: string;
        excerpt: string;
        byline: string;
        siteName: string;
        length: number;
      };
    } {
      if (mode === 'text') {
        return {
          body: body
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        };
      }

      if (mode === 'readability') {
        try {
          const doc = new DOMParser().parseFromString(body, 'text/html');
          // Set document URL so Readability can resolve relative links
          const baseHref = doc.querySelector('base')?.href;
          if (baseHref) {
            try { doc.documentURI = baseHref; } catch {}
          }
          const reader = new Readability(doc);
          const article = reader.parse();

          if (article) {
            // Return both clean HTML content and metadata
            return {
              body: article.textContent || article.content?.replace(/<[^>]+>/g, ' ').trim() || '',
              readability: {
                title: article.title || '',
                excerpt: article.excerpt || '',
                byline: article.byline || '',
                siteName: article.siteName || '',
                length: article.length || 0,
              },
            };
          }

          // Readability couldn't parse (probably not an article page)
          // Fall back to text extraction
          return {
            body: body
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim(),
            readability: {
              title: '',
              excerpt: '',
              byline: '',
              siteName: '',
              length: 0,
            },
          };
        } catch (err) {
          // Readability failed, return raw text fallback
          return {
            body: body
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim(),
          };
        }
      }

      // 'raw' — return as-is
      return { body };
    }

    (window as any).__agentWeb = {
      ready: true,

      /**
       * Search the web via DuckDuckGo
       */
      async search(query: string, options?: { count?: number }) {
        const opts = options || {};
        return sendToBridge('web_search', {
          query,
          count: opts.count || 10,
        });
      },

      /**
       * Fetch a URL with content extraction
       * extract modes:
       *   'raw'         — return HTML as-is (default)
       *   'text'        — strip all tags, return plain text
       *   'readability' — Mozilla Readability extraction (clean article content)
       * render options:
       *   render: false — fast HTTP fetch, may get empty shell for SPA sites (default)
       *   render: true  — use hidden tab to fully render JS, slower but complete
       */
      async fetch(url: string, options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string | null;
        extract?: 'raw' | 'text' | 'readability';
        render?: boolean;
      }) {
        const opts = options || {};
        const extractMode = opts.extract || 'raw';
        const useRender = opts.render === true;

        // Choose fetch path: render (hidden tab) or fast HTTP
        const messageType = useRender ? 'web_fetch_render' : 'web_fetch';
        const messagePayload = useRender
          ? { url }
          : {
              url,
              method: opts.method || 'GET',
              headers: opts.headers || {},
              body: opts.body || null,
              // Always get raw from background; we extract here in MAIN world
              extract: 'raw',
            };

        const response = await sendToBridge(messageType, messagePayload);

        if (!response.ok) return response;

        // Apply content extraction in page context (has DOMParser)
        const extracted = extractContent(response.body, extractMode);

        return {
          ...response,
          body: extracted.body,
          ...(extracted.readability ? { readability: extracted.readability } : {}),
        };
      },
    };

    console.log('[Browser Extension] ✅ Ready, window.__agentWeb available');
  },
});
