// ============================================================
// Content Script (ISOLATED world) — Message Relay
// Listens for window.postMessage from the MAIN-world script,
// forwards to background via chrome.runtime.sendMessage,
// then sends the response back via window.postMessage.
//
// Also handles port-based streaming for codex_proxy_fetch_stream:
// content.ts opens a chrome.runtime.Port, background streams
// chunks through it, and content.ts relays each chunk via
// window.postMessage to the MAIN-world script.
// ============================================================

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    function normalizeRelayError(err: unknown): { errorCode: string; error: string } {
      const message = err instanceof Error ? err.message : String(err || 'Unknown extension error')
      if (message.toLowerCase().includes('extension context invalidated')) {
        return { errorCode: 'EXTENSION_CONTEXT_INVALIDATED', error: message }
      }
      return { errorCode: 'EXTENSION_RELAY_ERROR', error: message }
    }

    // ── Request/Response relay (existing) ──

    window.addEventListener('message', (event) => {
      // Only accept messages from same window, with our bridge marker
      if (event.source !== window || event.data?.__agentWebBridge !== true) return;

      const { id, type, payload } = event.data;
      if (!id || !type) return;

      // ── Streaming request: use port-based messaging ──
      if (type === 'codex_proxy_fetch_stream') {
        try {
          const port = chrome.runtime.connect({ name: 'codex_stream' });

          // Relay port messages back to page as window.postMessage chunks
          port.onMessage.addListener((msg) => {
            window.postMessage({
              __agentWebBridge: true,
              __agentWebStream: true,
              id,
              ...msg, // { type: 'chunk'|'done'|'error', data?, errorCode?, ... }
            }, '*');
          });

          port.onDisconnect.addListener(() => {
            // Ensure stream end is signaled even on unexpected disconnect
            window.postMessage({
              __agentWebBridge: true,
              __agentWebStream: true,
              id,
              type: 'disconnected',
            }, '*');
          });

          // Send the initial request through the port
          port.postMessage({ type, ...payload });
        } catch (err) {
          window.postMessage({
            __agentWebBridge: true,
            __agentWebStream: true,
            id,
            type: 'error',
            errorCode: 'EXTENSION_UNAVAILABLE',
            message: err instanceof Error ? err.message : String(err),
          }, '*');
        }
        return;
      }

      // ── Regular request: use sendMessage (existing path) ──

      try {
        chrome.runtime.sendMessage(
          { type, ...payload },
          (response) => {
            const runtimeError = chrome.runtime.lastError
            const normalizedResponse = runtimeError
              ? { ok: false, ...normalizeRelayError(runtimeError.message || runtimeError) }
              : (response || { ok: false, errorCode: 'NO_BACKGROUND_RESPONSE', error: 'No response from background' })

            // Send response back to page (MAIN world)
            window.postMessage({
              __agentWebBridge: true,
              __agentWebResponse: true,
              id,
              response: normalizedResponse,
            }, '*');
          },
        );
      } catch (err) {
        const normalized = normalizeRelayError(err)
        window.postMessage({
          __agentWebBridge: true,
          __agentWebResponse: true,
          id,
          response: { ok: false, ...normalized },
        }, '*');
      }
    });
  },
});
