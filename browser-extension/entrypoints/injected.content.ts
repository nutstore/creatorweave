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

    // ── Pending stream callbacks, keyed by id ──
    const _streaming = new Map<string, {
      onChunk: (data: string) => void
      onDone: () => void
      onError: (errorCode: string, message: string) => void
    }>();

    // Listen for responses from the ISOLATED-world relay
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.__agentWebBridge !== true) return;

      // ── Regular response ──
      if (data.__agentWebResponse === true) {
        const pending = _pending.get(data.id);
        if (pending) {
          _pending.delete(data.id);
          pending.resolve(data.response);
        }
        return;
      }

      // ── Streaming chunk/event ──
      if (data.__agentWebStream === true) {
        const stream = _streaming.get(data.id);
        if (!stream) return;

        if (data.type === 'chunk' && typeof data.data === 'string') {
          stream.onChunk(data.data);
        } else if (data.type === 'done') {
          _streaming.delete(data.id);
          stream.onDone();
        } else if (data.type === 'error') {
          _streaming.delete(data.id);
          stream.onError(data.errorCode || 'STREAM_ERROR', data.message || 'Unknown stream error');
        } else if (data.type === 'disconnected') {
          // Unexpected disconnect — treat as error
          _streaming.delete(data.id);
          stream.onError('EXTENSION_UNAVAILABLE', 'Extension disconnected unexpectedly');
        }
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
     * Send a streaming request through the bridge.
     * Returns an async iterable of raw SSE text chunks.
     */
    function sendToBridgeStream(type: string, payload: Record<string, any>): AsyncIterable<string> & { cancel: () => void } {
      const id = '__aw_' + (++_requestId) + '_' + Date.now();
      let cancelled = false;

      // The async iterable implementation
      const chunkQueue: string[] = [];
      let resolveChunk: ((result: IteratorResult<string>) => void) | null = null;
      let rejectChunk: ((err: Error) => void) | null = null;
      let streamFinished = false;
      let streamError: Error | null = null;

      function enqueueChunk(data: string) {
        if (cancelled) return;
        if (resolveChunk) {
          const r = resolveChunk;
          resolveChunk = null;
          r({ value: data, done: false });
        } else {
          chunkQueue.push(data);
        }
      }

      function finishStream() {
        streamFinished = true;
        clearTimeout(timeout);
        if (resolveChunk) {
          const r = resolveChunk;
          resolveChunk = null;
          r({ value: undefined, done: true });
        }
      }

      function failStream(err: Error) {
        streamError = err;
        clearTimeout(timeout);
        if (rejectChunk) {
          const r = rejectChunk;
          rejectChunk = null;
          r(err);
        } else if (resolveChunk) {
          const r = resolveChunk;
          resolveChunk = null;
          r({ value: undefined, done: true });
        }
      }

      _streaming.set(id, {
        onChunk: enqueueChunk,
        onDone: finishStream,
        onError: (errorCode, message) => failStream(new Error(`[${errorCode}] ${message}`)),
      });

      // Send to content.ts relay
      window.postMessage({
        __agentWebBridge: true,
        id,
        type,
        payload,
      }, '*');

      // Timeout safety
      const timeout = setTimeout(() => {
        if (!streamFinished && !streamError) {
          _streaming.delete(id);
          failStream(new Error('Stream timeout (35s)'));
        }
      }, 120000); // 2 min for streaming

      const asyncIterator: AsyncIterable<string> & { cancel: () => void } = {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<string>> {
              if (streamError) throw streamError;
              if (cancelled || streamFinished) return { value: undefined, done: true };
              if (chunkQueue.length > 0) {
                return { value: chunkQueue.shift()!, done: false };
              }
              // Wait for next chunk
              return new Promise<IteratorResult<string>>((resolve, reject) => {
                resolveChunk = resolve;
                rejectChunk = reject;
              });
            },
            return() {
              cancelled = true;
              clearTimeout(timeout);
              _streaming.delete(id);
              return Promise.resolve({ value: undefined, done: true });
            },
          };
        },
        cancel() {
          cancelled = true;
          clearTimeout(timeout);
          _streaming.delete(id);
          finishStream();
        },
      };

      return asyncIterator;
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

        const messageType = useRender ? 'web_fetch_render' : 'web_fetch';
        const messagePayload = useRender
          ? { url }
          : {
              url,
              method: opts.method || 'GET',
              headers: opts.headers || {},
              body: opts.body || null,
              extract: 'raw',
            };

        const response = await sendToBridge(messageType, messagePayload);

        if (!response.ok) return response;

        const extracted = extractContent(response.body, extractMode);

        return {
          ...response,
          body: extracted.body,
          ...(extracted.readability ? { readability: extracted.readability } : {}),
        };
      },

      /**
       * Get Codex OAuth authorization status
       */
      async codexGetStatus() {
        return sendToBridge('codex_get_status', {});
      },

      /**
       * Proxy a Codex API request through the extension
       */
      async codexProxyFetch(body: Record<string, any>) {
        return sendToBridge('codex_proxy_fetch', { body });
      },

      /**
       * Proxy a Codex API request through the extension with SSE streaming.
       * Returns an async iterable of raw SSE text chunks.
       * The caller should parse SSE events from the yielded strings.
       */
      codexProxyFetchStream(body: Record<string, any>): AsyncIterable<string> & { cancel: () => void } {
        return sendToBridgeStream('codex_proxy_fetch_stream', { body });
      },
    };

    console.log('[Browser Extension] ✅ Ready, window.__agentWeb available');
  },
});
