// ============================================================
// Content Script (ISOLATED world) — Message Relay
// Listens for window.postMessage from the MAIN-world script,
// forwards to background via chrome.runtime.sendMessage,
// then sends the response back via window.postMessage.
//
// Also handles port-based streaming for bridge-backed streaming requests
// such as codex streaming, page-outside MCP streaming, and plugin download
// transfers. content.ts opens a chrome.runtime.Port, background streams
// chunks through it, and content.ts relays each chunk via window.postMessage
// to the MAIN-world script.
// ============================================================

// Build-time Codex OAuth feature flag (see wxt.config.ts).
declare const __CW_CODEX_OAUTH__: boolean;

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

    // Streaming ports are keyed by the page request id so page-side timeout,
    // iterator return(), or ReadableStream cancellation can abort upstream.
    const streamingPorts = new Map<string, chrome.runtime.Port>()

    window.addEventListener('message', (event) => {
      // Only accept messages from same window, with our bridge marker
      if (event.source !== window || event.data?.__agentWebBridge !== true) return;

      const { id, type, payload } = event.data;
      if (!id) return;

      if (event.data.__agentWebStreamCancel === true) {
        const streamPort = streamingPorts.get(id)
        if (streamPort) {
          streamingPorts.delete(id)
          try { streamPort.postMessage({ type: 'cancel' }) } catch {}
          try { streamPort.disconnect() } catch {}
        }
        return
      }

      if (!type) return;

      // ── Streaming request: use port-based messaging ──
      if (
        (__CW_CODEX_OAUTH__ && type === 'codex_proxy_fetch_stream') ||
        type === 'webmcp_plugin_download_stream' ||
        type === 'mcp_proxy_fetch_stream'
      ) {
        try {
          const port = chrome.runtime.connect({ name: 'agent_bridge_stream' });
          streamingPorts.set(id, port)

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
            streamingPorts.delete(id)
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

      /**
       * Send a single request/response round trip to the background.
       */
      const sendMessageOnce = (onDone: (response: any) => void) => {
        chrome.runtime.sendMessage(
          { type, ...payload },
          (response) => {
            const runtimeError = chrome.runtime.lastError
            const normalizedResponse = runtimeError
              ? { ok: false, ...normalizeRelayError(runtimeError.message || runtimeError) }
              : (response || { ok: false, errorCode: 'NO_BACKGROUND_RESPONSE', error: 'No response from background' })
            onDone(normalizedResponse)
          },
        );
      };

      // A reply may be lost after a native-host request has already reached
      // the host. Retrying a write, delete, exec, or folder-picker request
      // would duplicate a side effect, so only retry operations that are
      // explicitly read-only and idempotent.
      const isSafeNativeHostRetry = type === 'native_host_call' && new Set([
        'ping', 'list_scopes', 'stat_file', 'list_dir', 'read_file',
        'read_file_at', 'check_policy', 'get_execpolicy', 'exec_logs',
        'exec_status', 'exec_list',
      ]).has(typeof payload.action === 'string' ? payload.action : '')

      // A missing response with no runtime error usually means the MV3
      // service worker was mid-cold-start or died between receiving the
      // message and responding. A single retry is safe only for the
      // read-only native-host operations listed above.
      let didRetry = false;

      try {
        sendMessageOnce((response) => {
          if (
            response &&
            response.ok === false &&
            response.errorCode === 'NO_BACKGROUND_RESPONSE' &&
            isSafeNativeHostRetry &&
            !didRetry
          ) {
            didRetry = true;
            setTimeout(() => {
              try {
                sendMessageOnce((retryResponse) => {
                  window.postMessage({
                    __agentWebBridge: true,
                    __agentWebResponse: true,
                    id,
                    response: retryResponse,
                  }, '*');
                });
              } catch (err) {
                const normalized = normalizeRelayError(err)
                window.postMessage({
                  __agentWebBridge: true,
                  __agentWebResponse: true,
                  id,
                  response: { ok: false, ...normalized },
                }, '*');
              }
            }, 250);
            return;
          }

          // Send response back to page (MAIN world)
          window.postMessage({
            __agentWebBridge: true,
            __agentWebResponse: true,
            id,
            response,
          }, '*');
        });
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

    // ── Background → Page relay: schedule triggers ──
    // The background script sends cw_schedule_run when a chrome.alarms fires.
    // We forward it to the page via window.postMessage so the injected script
    // can call triggerSchedule().
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'cw_schedule_run') {
        window.postMessage({
          __agentWebScheduleTrigger: true,
          scheduleId: message.scheduleId,
        }, '*');
        sendResponse({ ok: true });
        return false; // synchronous response
      }
      return false; // not our message
    });
  },
});
