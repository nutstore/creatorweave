// ============================================================
// Content Script (ISOLATED world) — Message Relay
// Listens for window.postMessage from the MAIN-world script,
// forwards to background via chrome.runtime.sendMessage,
// then sends the response back via window.postMessage.
// ============================================================

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    window.addEventListener('message', (event) => {
      // Only accept messages from same window, with our bridge marker
      if (event.source !== window || event.data?.__agentWebBridge !== true) return;

      const { id, type, payload } = event.data;
      if (!id || !type) return;

      // Forward to background service worker
      try {
        chrome.runtime.sendMessage(
          { type, ...payload },
          (response) => {
            // Send response back to page (MAIN world)
            window.postMessage({
              __agentWebBridge: true,
              __agentWebResponse: true,
              id,
              response: response || { ok: false, error: 'No response from background' },
            }, '*');
          },
        );
      } catch (err) {
        window.postMessage({
          __agentWebBridge: true,
          __agentWebResponse: true,
          id,
          response: { ok: false, error: err instanceof Error ? err.message : String(err) },
        }, '*');
      }
    });
  },
});
