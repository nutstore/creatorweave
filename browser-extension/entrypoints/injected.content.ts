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
import TurndownService from 'turndown'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  world: 'MAIN',

  main() {
    type PendingRequest = {
      resolve: (value: any) => void
      timeoutId: number
      invalidatedTimerId: number | null
    }

    type BridgeRuntimeState = {
      dispose?: () => void
    }

    // If a newer copy of this script was injected, tear down old listeners/state first.
    const existingState = (window as any).__agentWebBridgeState as BridgeRuntimeState | undefined
    if (existingState?.dispose) {
      try {
        existingState.dispose()
      } catch {
        // ignore stale cleanup errors
      }
    }

    let _requestId = 0;
    const INVALIDATED_FALLTHROUGH_WAIT_MS = 200

    // Pending request promises, keyed by id
    const _pending = new Map<string, PendingRequest>();

    // ── Pending stream callbacks, keyed by id ──
    const _streaming = new Map<string, {
      onChunk: (data: unknown) => void
      onDone: () => void
      onError: (errorCode: string, message: string) => void
    }>();

    const clearPending = (id: string): PendingRequest | null => {
      const pending = _pending.get(id)
      if (!pending) return null
      _pending.delete(id)
      clearTimeout(pending.timeoutId)
      if (pending.invalidatedTimerId !== null) {
        clearTimeout(pending.invalidatedTimerId)
      }
      return pending
    }

    const isExtensionContextInvalidatedResponse = (response: any): boolean => {
      if (!response || response.ok !== false) return false
      const code = typeof response.errorCode === 'string' ? response.errorCode : ''
      const message = typeof response.error === 'string' ? response.error : ''
      return (
        code === 'EXTENSION_CONTEXT_INVALIDATED' ||
        message.toLowerCase().includes('extension context invalidated')
      )
    }

    // Listen for responses from the ISOLATED-world relay
    const onBridgeMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.__agentWebBridge !== true) return;

      // ── Regular response ──
      if (data.__agentWebResponse === true) {
        const pending = _pending.get(data.id);
        if (pending) {
          if (isExtensionContextInvalidatedResponse(data.response)) {
            // Multiple content-script contexts may race to answer.
            // Give any healthy context a short chance to return a non-invalidated response first.
            if (pending.invalidatedTimerId === null) {
              pending.invalidatedTimerId = window.setTimeout(() => {
                const finalized = clearPending(data.id)
                if (finalized) {
                  finalized.resolve(data.response)
                }
              }, INVALIDATED_FALLTHROUGH_WAIT_MS)
            }
            return
          }

          const finalized = clearPending(data.id)
          if (finalized) {
            finalized.resolve(data.response)
          }
        }
        return;
      }

      // ── Streaming chunk/event ──
      if (data.__agentWebStream === true) {
        const stream = _streaming.get(data.id);
        if (!stream) return;

        if (data.type === 'chunk') {
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
    }

    window.addEventListener('message', onBridgeMessage);

    // Send request to ISOLATED relay → background
    function sendToBridge(type: string, payload: Record<string, any>, timeoutMs?: number): Promise<any> {
      return new Promise((resolve) => {
        const id = '__aw_' + (++_requestId) + '_' + Date.now();
        const timeoutId = window.setTimeout(() => {
          const pending = clearPending(id)
          if (pending) {
            pending.resolve({ ok: false, error: 'Bridge request timeout', errorCode: 'BRIDGE_TIMEOUT' });
          }
        }, timeoutMs || 35000)
        _pending.set(id, { resolve, timeoutId, invalidatedTimerId: null });

        window.postMessage({
          __agentWebBridge: true,
          id,
          type,
          payload,
        }, '*');
      });
    }

    /**
     * Send a streaming request through the bridge.
     * Returns an async iterable of raw SSE text chunks.
     */
    function sendToBridgeStream(type: string, payload: Record<string, any>): AsyncIterable<unknown> & { cancel: () => void } {
      const id = '__aw_' + (++_requestId) + '_' + Date.now();
      let cancelled = false;

      // The async iterable implementation
      const chunkQueue: unknown[] = [];
      let resolveChunk: ((result: IteratorResult<unknown>) => void) | null = null;
      let rejectChunk: ((err: Error) => void) | null = null;
      let streamFinished = false;
      let streamError: Error | null = null;

      function enqueueChunk(data: unknown) {
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

      const asyncIterator: AsyncIterable<unknown> & { cancel: () => void } = {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<unknown>> {
              if (streamError) throw streamError;
              if (cancelled || streamFinished) return { value: undefined, done: true };
              if (chunkQueue.length > 0) {
                return { value: chunkQueue.shift()!, done: false };
              }
              // Wait for next chunk
              return new Promise<IteratorResult<unknown>>((resolve, reject) => {
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

    // Shared Turndown instance with sensible defaults for AI consumption
    const _turndown = new TurndownService({
      headingStyle: 'atx',       // # style headings
      codeBlockStyle: 'fenced',  // ```code blocks```
      bulletListMarker: '-',     // - for lists
    })

    /**
     * Convert HTML to clean Markdown.
     * Pipeline: Readability (extract main content) → Turndown (HTML→Markdown).
     * Falls back to Turndown on the full page if Readability fails.
     */
    function htmlToMarkdown(body: string): {
      body: string;
      readability?: {
        title: string;
        excerpt: string;
        byline: string;
        siteName: string;
        length: number;
      };
    } {
      try {
        const doc = new DOMParser().parseFromString(body, 'text/html');
        // Set document URL so Readability can resolve relative links
        const baseHref = doc.querySelector('base')?.href;
        if (baseHref) {
          try { doc.documentURI = baseHref; } catch {}
        }
        const reader = new Readability(doc);
        const article = reader.parse();

        if (article?.content) {
          const markdown = _turndown.turndown(article.content);
          const titlePrefix = article.title ? `# ${article.title}\n\n` : '';
          return {
            body: titlePrefix + markdown,
            readability: {
              title: article.title || '',
              excerpt: article.excerpt || '',
              byline: article.byline || '',
              siteName: article.siteName || '',
              length: markdown.length,
            },
          };
        }

        // Readability couldn't extract (probably not an article page)
        // Fall back to converting the full page HTML to Markdown
        const markdown = _turndown.turndown(body);
        return { body: markdown };
      } catch {
        // Turndown/Readability failed — last resort: strip tags
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

    (window as any).__agentWeb = {
      ready: true,

      /**
       * Get the installed extension version.
       */
      async getVersion() {
        return sendToBridge('extension_get_version', {});
      },

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
       * Fetch a URL and return clean Markdown.
       * Pipeline: HTTP fetch → Readability (extract main content) → Turndown (HTML→Markdown).
       * Falls back to full-page Turndown if Readability can't extract.
       */
      async fetch(url: string, options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string | null;
      }) {
        const opts = options || {};

        // Try fast HTTP fetch first; fall back to render tab if response looks like an SPA shell
        let response = await sendToBridge('web_fetch', {
          url,
          method: opts.method || 'GET',
          headers: opts.headers || {},
          body: opts.body || null,
          extract: 'raw',
        });

        // If fast fetch failed or returned very little content, try render mode
        if (!response.ok || !response.body || response.body.length < 200) {
          const renderResponse = await sendToBridge('web_fetch_render', { url });
          if (renderResponse.ok && renderResponse.body && renderResponse.body.length > (response.body?.length || 0)) {
            response = renderResponse;
          }
        }

        if (!response.ok) return response;

        const result = htmlToMarkdown(response.body);

        return {
          ...response,
          body: result.body,
          ...(result.readability ? { readability: result.readability } : {}),
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
       * Proxy an MCP HTTP request through the extension.
       */
      async mcpProxyFetch(payload: {
        url: string
        method?: string
        headers?: Record<string, string>
        body?: string | null
        timeoutMs?: number
      }) {
        return sendToBridge('mcp_proxy_fetch', payload || {});
      },

      /**
       * Proxy an MCP HTTP request through the extension with SSE streaming.
       */
      mcpProxyFetchStream(payload: {
        url: string
        method?: string
        headers?: Record<string, string>
        body?: string | null
        timeoutMs?: number
      }): AsyncIterable<
        | {
            type: 'response_start'
            status?: number
            statusText?: string
            headers?: Record<string, string>
          }
        | {
            type: 'chunk'
            data: string
          }
      > & { cancel: () => void } {
        const source = sendToBridgeStream('mcp_proxy_fetch_stream', payload || {})
        const typed: AsyncIterable<
          | {
              type: 'response_start'
              status?: number
              statusText?: string
              headers?: Record<string, string>
            }
          | {
              type: 'chunk'
              data: string
            }
        > & { cancel: () => void } = {
          [Symbol.asyncIterator]() {
            const it = source[Symbol.asyncIterator]()
            return {
              async next(): Promise<
                IteratorResult<
                  | {
                      type: 'response_start'
                      status?: number
                      statusText?: string
                      headers?: Record<string, string>
                    }
                  | {
                      type: 'chunk'
                      data: string
                    }
                >
              > {
                const value = await it.next()
                if (value.done) return { value: undefined, done: true }
                if (!value.value || typeof value.value !== 'object') {
                  throw new Error('Expected MCP proxy stream frame object for mcpProxyFetchStream')
                }
                return {
                  value: value.value as
                    | {
                        type: 'response_start'
                        status?: number
                        statusText?: string
                        headers?: Record<string, string>
                      }
                    | {
                        type: 'chunk'
                        data: string
                      },
                  done: false,
                }
              },
              return() {
                return it.return ? it.return() : Promise.resolve({ value: undefined, done: true })
              },
            }
          },
          cancel() {
            source.cancel()
          },
        }
        return typed
      },

      /**
       * Discover WebMCP tools across tabs in current browser window.
       */
      async webMCPDiscover(options?: { force?: boolean }) {
        return sendToBridge('webmcp_discover_tools', { options: options || {} });
      },

      /**
       * Invoke a discovered WebMCP tool.
       */
      async webMCPInvoke(payload: {
        fullToolName: string
        args?: Record<string, unknown>
        preferredTabId?: number
      }) {
        return sendToBridge('webmcp_invoke_tool', payload || {});
      },

      /**
       * Proxy a Codex API request through the extension with SSE streaming.
       * Returns an async iterable of raw SSE text chunks.
       * The caller should parse SSE events from the yielded strings.
       */
      codexProxyFetchStream(body: Record<string, any>): AsyncIterable<string> & { cancel: () => void } {
        const source = sendToBridgeStream('codex_proxy_fetch_stream', { body })
        const typed: AsyncIterable<string> & { cancel: () => void } = {
          [Symbol.asyncIterator]() {
            const it = source[Symbol.asyncIterator]()
            return {
              async next(): Promise<IteratorResult<string>> {
                const value = await it.next()
                if (value.done) return { value: undefined, done: true }
                if (typeof value.value !== 'string') {
                  throw new Error('Expected string stream chunk for codexProxyFetchStream')
                }
                return { value: value.value, done: false }
              },
              return() {
                return it.return ? it.return() : Promise.resolve({ value: undefined, done: true })
              },
            }
          },
          cancel() {
            source.cancel()
          },
        }
        return typed
      },

      /**
       * Stream plugin download frames from extension background.
       */
      webMCPPluginDownloadStream(payload: {
        transferId: string
        downloadUrl: string
        savePath: string
        fileName: string
      }) {
        const source = sendToBridgeStream('webmcp_plugin_download_stream', { plan: payload })
        const typed: AsyncIterable<Record<string, unknown>> & { cancel: () => void } = {
          [Symbol.asyncIterator]() {
            const it = source[Symbol.asyncIterator]()
            return {
              async next(): Promise<IteratorResult<Record<string, unknown>>> {
                const value = await it.next()
                if (value.done) return { value: undefined, done: true }
                if (!value.value || typeof value.value !== 'object') {
                  throw new Error('Expected object frame for webMCPPluginDownloadStream')
                }
                return { value: value.value as Record<string, unknown>, done: false }
              },
              return() {
                return it.return ? it.return() : Promise.resolve({ value: undefined, done: true })
              },
            }
          },
          cancel() {
            source.cancel()
          },
        }
        return typed
      },

      /**
       * Finalize plugin download after main page persisted the file.
       */
      async webMCPPluginDownloadFinalize(payload: {
        transferId: string
        savedPath: string
      }) {
        return sendToBridge('webmcp_plugin_download_finalize', payload || {})
      },

      // ── Edge TTS (Text-to-Speech) ──

      /**
       * Check if Edge TTS is available through the extension.
       */
      async ttsStatus() {
        return sendToBridge('edge_tts_status', {});
      },

      /**
       * List all available Edge TTS voices.
       */
      async ttsListVoices() {
        return sendToBridge('edge_tts_list_voices', {});
      },

      /**
       * Synthesize speech using Edge TTS (neural, high quality).
       * Returns { ok, audioBase64, audioFormat, wordBoundaries }.
       * The audioBase64 can be decoded into an audio blob for playback.
       */
      async ttsSynthesize(text: string, options?: {
        voice?: string;
        rate?: string;
        pitch?: string;
        volume?: string;
        outputFormat?: string;
      }) {
        return sendToBridge('edge_tts_synthesize', {
          text,
          voice: options?.voice || 'en-US-AriaNeural',
          rate: options?.rate,
          pitch: options?.pitch,
          volume: options?.volume,
          outputFormat: options?.outputFormat,
        }, 60000); // 60s timeout for TTS synthesis
      },

      /**
       * Synthesize speech and play it immediately.
       * Returns { ok, playing } — the audio plays in the background.
       * Call ttsStop() to stop playback.
       */
      async ttsPlay(text: string, options?: {
        voice?: string;
        rate?: string;
        pitch?: string;
        volume?: string;
        outputFormat?: string;
      }): Promise<{ ok: boolean; playing?: boolean; error?: string }> {
        const result = await sendToBridge('edge_tts_synthesize', {
          text,
          voice: options?.voice || 'en-US-AriaNeural',
          rate: options?.rate,
          pitch: options?.pitch,
          volume: options?.volume,
          outputFormat: options?.outputFormat,
        }, 60000);

        if (!result.ok || !result.audioBase64) {
          return { ok: false, error: result.error || 'Synthesis failed' };
        }

        // Stop any currently playing TTS audio
        const prev = (window as any).__ttsAudio as HTMLAudioElement | undefined;
        if (prev) { prev.pause(); prev.src = ''; }

        const format = result.audioFormat || 'audio-24khz-48kbitrate-mono-mp3';
        const mimeType = format.includes('mp3') ? 'audio/mp3' : 'audio/ogg';
        const audio = new Audio(`data:${mimeType};base64,${result.audioBase64}`);
        (window as any).__ttsAudio = audio;
        audio.play();
        return { ok: true, playing: true };
      },

      /**
       * Stop currently playing TTS audio.
       */
      ttsStop(): void {
        const audio = (window as any).__ttsAudio as HTMLAudioElement | undefined;
        if (audio) { audio.pause(); audio.src = ''; }
        (window as any).__ttsAudio = undefined;
      },
    };

    ;(window as any).__agentWebBridgeState = {
      dispose() {
        window.removeEventListener('message', onBridgeMessage)
        for (const [id, pending] of _pending) {
          _pending.delete(id)
          clearTimeout(pending.timeoutId)
          if (pending.invalidatedTimerId !== null) {
            clearTimeout(pending.invalidatedTimerId)
          }
          pending.resolve({
            ok: false,
            errorCode: 'BRIDGE_REPLACED',
            error: 'Bridge instance replaced by a newer injection',
          })
        }
        _streaming.clear()
      },
    }

    console.log('[Browser Extension] ✅ Ready, window.__agentWeb available');
  },
});
