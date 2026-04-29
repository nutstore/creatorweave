// ============================================================
// Background Service Worker
// ============================================================

// Config
const CONFIG = {
  TIMEOUT_MS: 15000,              // Request timeout in ms
  MAX_BODY_SIZE: 2 * 1024 * 1024, // Max response body size (2MB)
  SEARCH_MAX_RESULTS: 20,         // Max search results
  RENDER_TIMEOUT_MS: 30000,       // Hidden tab render timeout
  RENDER_SETTLE_MS: 2000,         // Wait after 'complete' for JS to settle
};

// ============================================================
// Utility functions
// ============================================================

/**
 * Fetch with timeout
 */
function fetchWithTimeout(url, options = {}) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Request timeout'));
    }, options.timeout || CONFIG.TIMEOUT_MS);

    fetch(url, { ...options, signal: controller.signal })
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

/**
 * Extract real URL from DuckDuckGo redirect link
 */
function extractRealUrl(href) {
  if (!href) return '';
  const match = href.match(/uddg=([^&]+)/);
  if (match) return decodeURIComponent(match[1]);
  return href;
}

// ============================================================
// web_search: DuckDuckGo HTML search
// ============================================================

async function handleSearch(message) {
  const { query, count = 10 } = message;
  const limit = Math.min(count, CONFIG.SEARCH_MAX_RESULTS);

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const resp = await fetchWithTimeout(url);
    const html = await resp.text();

    // Parse search results
    const results = [];

    // Split by result blocks — class may be "result" or "result results_links..."
    const blocks = html.split(/class="result\b/);

    for (let i = 1; i < blocks.length && results.length < limit; i++) {
      const block = blocks[i];

      // Extract title — class="result__a" may appear before or after href
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
        : '';

      // Extract URL — href may appear before or after class="result__a"
      const urlMatch = block.match(/class="result__a"[^>]*href="([^"]*)"/)
        || block.match(/href="([^"]*)"[^>]*class="result__a"/);
      const rawUrl = urlMatch ? extractRealUrl(urlMatch[1]) : '';

      // Extract snippet
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, '').trim()
        : '';

      if (title && rawUrl) {
        results.push({ title, url: rawUrl, snippet });
      }
    }

    return { ok: true, results };

  } catch (err) {
    return { ok: false, results: [], error: err.message };
  }
}

// ============================================================
// web_fetch: Fetch URL content (raw HTTP)
// ============================================================

async function handleFetch(message) {
  const { url, method = 'GET', headers = {}, body = null, extract = 'raw' } = message;

  // Validate URL
  try {
    new URL(url);
  } catch {
    return { ok: false, status: 0, error: 'Invalid URL' };
  }

  try {
    const resp = await fetchWithTimeout(url, { method, headers, body });
    const status = resp.status;
    const respHeaders = {};
    resp.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    let responseBody = await resp.text();
    let truncated = false;

    // Size limit
    if (responseBody.length > CONFIG.MAX_BODY_SIZE) {
      responseBody = responseBody.substring(0, CONFIG.MAX_BODY_SIZE);
      truncated = true;
    }

    // Content extraction
    if (extract === 'text') {
      responseBody = responseBody
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const result = {
      ok: resp.ok,
      status,
      headers: respHeaders,
      body: responseBody,
    };
    if (truncated) result.truncated = true;
    return result;

  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

// ============================================================
// web_fetch_render: Fetch URL via hidden tab (full JS rendering)
// Creates a hidden browser tab, waits for the page to fully
// render (including JS execution), extracts the DOM, then
// closes the tab. Returns the rendered HTML.
// ============================================================

async function handleFetchRender(message) {
  const { url } = message;

  // Validate URL
  try {
    const parsed = new URL(url);
    // Only allow http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, status: 0, error: 'Only http/https URLs are supported for render mode' };
    }
  } catch {
    return { ok: false, status: 0, error: 'Invalid URL' };
  }

  let tab = null;

  try {
    // Create a hidden (inactive) tab
    tab = await chrome.tabs.create({
      url,
      active: false,
    });

    // Wait for the tab to finish loading, with timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        // Resolve anyway — we'll try to extract what we have
        resolve();
      }, CONFIG.RENDER_TIMEOUT_MS);

      function listener(tabId, info) {
        if (tabId !== tab.id) return;
        if (info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          resolve();
        }
      }

      chrome.tabs.onUpdated.addListener(listener);
    });

    // Extra settle time for JS frameworks to finish rendering
    await new Promise(r => setTimeout(r, CONFIG.RENDER_SETTLE_MS));

    // Extract rendered HTML from the tab
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Get the full rendered DOM
        const html = document.documentElement.outerHTML;

        // Also try to get the page title and meta description
        const title = document.title || '';
        const metaDesc = document.querySelector('meta[name="description"]')?.content || '';

        return { html, title, metaDesc };
      },
    });

    // Close the tab
    await chrome.tabs.remove(tab.id);
    tab = null;

    const data = result?.result;
    if (!data || !data.html) {
      return { ok: false, status: 0, error: 'Failed to extract rendered DOM' };
    }

    let responseBody = data.html;
    let truncated = false;

    // Size limit
    if (responseBody.length > CONFIG.MAX_BODY_SIZE) {
      responseBody = responseBody.substring(0, CONFIG.MAX_BODY_SIZE);
      truncated = true;
    }

    const response = {
      ok: true,
      status: 200,
      headers: {
        'content-type': 'text/html',
        'x-render-mode': 'tab',
        ...(data.title ? { 'x-page-title': data.title } : {}),
        ...(data.metaDesc ? { 'x-meta-description': data.metaDesc } : {}),
      },
      body: responseBody,
      rendered: true,
    };
    if (truncated) response.truncated = true;
    return response;

  } catch (err) {
    // Clean up tab on error
    if (tab) {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
    return { ok: false, status: 0, error: `Render failed: ${err.message}` };
  }
}

// ============================================================
// Message listener
// ============================================================

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'web_search') {
      handleSearch(message).then(sendResponse);
      return true; // Keep channel open for async response
    }

    if (message.type === 'web_fetch') {
      handleFetch(message).then(sendResponse);
      return true;
    }

    if (message.type === 'web_fetch_render') {
      handleFetchRender(message).then(sendResponse);
      return true;
    }
  });
});
