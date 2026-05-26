// ============================================================
// Background Service Worker
// ============================================================

import { discoverWebMCPToolsInCurrentWindow } from './webmcp/discovery'
import { invokeWebMCPTool } from './webmcp/invoke'
import { listVoices as edgeTTSListVoices } from '../utils/tts'

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
// Codex auth + proxy (minimal version)
// ============================================================

const DEVICEAUTH_USERCODE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode';
const DEVICEAUTH_TOKEN_URL = 'https://auth.openai.com/api/accounts/deviceauth/token';
const OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const DEVICE_VERIFY_URL = 'https://auth.openai.com/codex/device';
const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback';
const CODEX_PENDING_AUTH_KEY = 'codex_pending_auth';
const CODEX_AUTH_POLL_ALARM = 'codex_auth_poll_alarm';
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

const CODEX_DEFAULT_MODELS = [
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', contextWindow: 200000, capabilities: ['code', 'reasoning'] },
  { id: 'gpt-5.4', name: 'GPT-5.4', contextWindow: 200000, capabilities: ['code', 'reasoning'] },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', contextWindow: 128000, capabilities: ['code', 'reasoning'] },
  { id: 'gpt-5.5', name: 'GPT-5.5', contextWindow: 200000, capabilities: ['code', 'reasoning'] },
];


async function saveCodexTokens(tokens: any) {
  await chrome.storage.local.set({ codex_tokens: tokens, codex_token_saved_at: Date.now() });
}

async function getCodexTokens() {
  const { codex_tokens } = await chrome.storage.local.get('codex_tokens');
  return codex_tokens || null;
}

async function savePendingCodexAuth(data: any) {
  await chrome.storage.local.set({ [CODEX_PENDING_AUTH_KEY]: data });
}

async function getPendingCodexAuth() {
  const got = await chrome.storage.local.get(CODEX_PENDING_AUTH_KEY);
  return got?.[CODEX_PENDING_AUTH_KEY] || null;
}

async function clearPendingCodexAuth() {
  await chrome.storage.local.remove(CODEX_PENDING_AUTH_KEY);
  await chrome.alarms.clear(CODEX_AUTH_POLL_ALARM);
}

function decodeJwtPayload(token: string): any {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function codexHeaders(accessToken: string, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${accessToken}`,
    'User-Agent': 'codex_cli_rs/0.0.0 (CreatorWeave Extension)',
    originator: 'codex_cli_rs',
    ...extraHeaders,
  };

  const payload = decodeJwtPayload(accessToken);
  const accountId = payload?.['https://api.openai.com/auth']?.chatgpt_account_id;
  if (accountId) headers['ChatGPT-Account-ID'] = accountId;

  return headers;
}

async function parseJsonSafe(resp: Response) {
  const text = await resp.text();
  try {
    return { text, json: text ? JSON.parse(text) : null };
  } catch {
    return { text, json: null };
  }
}

async function refreshCodexAccessToken(tokens: any) {
  if (!tokens?.refresh_token) {
    throw new Error('Missing refresh_token');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: String(tokens.refresh_token),
    client_id: CODEX_CLIENT_ID,
  });

  const resp = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const parsed = await parseJsonSafe(resp);
  if (!resp.ok || !parsed?.json?.access_token) {
    throw new Error(`Refresh failed (${resp.status}): ${JSON.stringify(parsed.json || parsed.text)}`);
  }

  const merged = {
    ...tokens,
    ...parsed.json,
    refresh_token: parsed.json.refresh_token || tokens.refresh_token,
  };
  await saveCodexTokens(merged);
  return merged;
}

async function pollCodexAuthOnce(deviceAuthId: string, userCode: string) {
  const resp = await fetch(DEVICEAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: CODEX_CLIENT_ID,
      device_auth_id: deviceAuthId,
      user_code: userCode,
    }),
  });
  const { text, json } = await parseJsonSafe(resp);

  if (!resp.ok) {
    const code = json?.error || json?.error_code || 'unknown';
    if (code === 'authorization_pending' || code === 'slow_down') {
      return { ok: true, done: false, pending: true, code };
    }
    return { ok: false, status: resp.status, error: json || text };
  }

  if (!json?.authorization_code || !json?.code_verifier) {
    return { ok: false, error: 'Missing authorization_code/code_verifier in deviceauth response' };
  }

  const oauthBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code: json.authorization_code,
    code_verifier: json.code_verifier,
    client_id: CODEX_CLIENT_ID,
    redirect_uri: CODEX_REDIRECT_URI,
  });

  const oauthResp = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: oauthBody,
  });
  const oauthParsed = await parseJsonSafe(oauthResp);
  if (!oauthResp.ok) {
    return { ok: false, status: oauthResp.status, error: oauthParsed.json || oauthParsed.text };
  }

  await saveCodexTokens(oauthParsed.json);
  await clearPendingCodexAuth();
  return { ok: true, done: true };
}

// ============================================================
// Message listener
// ============================================================

export default defineBackground(() => {
  // ── Edge TTS: Register declarativeNetRequest rules to spoof Edge UA ──
  const EDGE_TTS_WS_RULE_ID = 100;
  const EDGE_TTS_FETCH_RULE_ID = 101;

  let _dnrRulesReady = false;

  async function registerTTSDNRRules() {
    const edgeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
    const secChUa = '" Not;A Brand";v="99", "Microsoft Edge";v="143", "Chromium";v="143"';
    const muid = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

    const rules: chrome.declarativeNetRequest.Rule[] = [
      {
        id: EDGE_TTS_WS_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: [
            { header: 'User-Agent', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: edgeUA },
            { header: 'Cookie', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: `muid=${muid}` },
            { header: 'Sec-CH-UA', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: secChUa },
            { header: 'Sec-CH-UA-Mobile', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: '?0' },
            { header: 'Origin', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold' },
            { header: 'Pragma', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'no-cache' },
            { header: 'Cache-Control', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: 'no-cache' },
          ],
        },
        condition: {
          urlFilter: '||speech.platform.bing.com/consumer/speech/synthesize/readaloud',
          resourceTypes: ['websocket' as chrome.declarativeNetRequest.ResourceType],
        },
      },
      {
        id: EDGE_TTS_FETCH_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: [
            { header: 'User-Agent', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: edgeUA },
            { header: 'Sec-CH-UA', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: secChUa },
            { header: 'Sec-CH-UA-Mobile', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: '?0' },
          ],
        },
        condition: {
          urlFilter: '||speech.platform.bing.com/consumer/speech/synthesize/readaloud',
          resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        },
      },
    ];

    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [EDGE_TTS_WS_RULE_ID, EDGE_TTS_FETCH_RULE_ID],
        addRules: rules,
      });
      _dnrRulesReady = true;
      console.log('[Edge TTS] DNR rules registered');
    } catch (err) {
      console.error('[Edge TTS] DNR rule registration failed:', err);
    }
  }

  // Fire-and-forget registration, but the promise resolves quickly
  const _dnrReady = registerTTSDNRRules();

  // ── DNR Debug: log when rules match ──
  if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
      console.log('[DNR Debug] Rule matched:', JSON.stringify({
        ruleId: info.rule.ruleId,
        rulesetId: info.rule.rulesetId,
        request: {
          url: info.request.url,
          type: info.request.type,
          method: info.request.method,
          tabId: info.request.tabId,
          initiator: info.request.initiator,
        },
      }));
    });
    console.log('[Edge TTS] DNR debug listener registered');
  }

  // ── DNR Self-check: verify rules are actually registered ──
  setTimeout(async () => {
    try {
      const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
      console.log(`[Edge TTS] DNR self-check: ${sessionRules.length} session rules active`);
      for (const rule of sessionRules) {
        const condition = rule.condition as any;
        console.log(`[Edge TTS]   Rule ${rule.id}: urlFilter="${condition?.urlFilter}" resourceTypes=${JSON.stringify(condition?.resourceTypes)}`);
      }
    } catch (err) {
      console.error('[Edge TTS] DNR self-check failed:', err);
    }
  }, 1000);

  // ── Offscreen Document for TTS WebSocket ──
  // DNR doesn't intercept WS headers from service workers (Chromium bug #1285664).
  // We use an offscreen document (renderer process) where DNR works properly.
  const OFFSCREEN_DOC_URL = chrome.runtime.getURL('offscreen-tts.html');

  async function ensureOffscreenDocument(): Promise<void> {
    try {
      // Check if offscreen document already exists
      const existingClients = await chrome.offscreen?.hasDocument?.();
      if (existingClients) {
        // Verify it's responsive
        try {
          await chrome.runtime.sendMessage({ type: 'tts_offscreen_ping' });
          return; // exists and responsive
        } catch {
          // Not responsive, will create new one below
        }
      }
    } catch {
      // hasDocument might not exist in all Chrome versions
    }

    // Close any existing document first
    try { await chrome.offscreen.closeDocument(); } catch {}

    // Create new offscreen document
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOC_URL,
      reasons: ['AUDIO_PLAYBACK' as any], // Closest available reason
      justification: 'Edge TTS WebSocket connection requires renderer process for DNR header modification',
    });
    console.log('[Edge TTS] Offscreen document created');

    // Wait a moment for the document to initialize
    await new Promise(r => setTimeout(r, 200));

    // Verify it's ready
    try {
      const pong = await chrome.runtime.sendMessage({ type: 'tts_offscreen_ping' });
      if (pong?.pong) {
        console.log('[Edge TTS] Offscreen document is ready');
      }
    } catch (err) {
      console.error('[Edge TTS] Offscreen document not responding:', err);
    }
  }

  ensureOffscreenDocument();

  // ── Proactive token refresh: check on startup and every 5 minutes ──
  const CODEX_TOKEN_REFRESH_ALARM = 'codex_token_refresh_alarm';

  async function proactiveRefreshIfNeeded() {
    try {
      const tokens = await getCodexTokens();
      if (!tokens?.access_token) return;

      const payload = decodeJwtPayload(tokens.access_token);
      if (!payload?.exp) return; // can't determine expiry, skip

      const expiresAt = payload.exp * 1000; // JWT exp is in seconds
      const now = Date.now();

      if (now >= expiresAt - TOKEN_REFRESH_MARGIN_MS) {
        // Token is expired or about to expire — try refresh
        if (tokens.refresh_token) {
          try {
            await refreshCodexAccessToken(tokens);
          } catch (err) {
            console.warn('[Codex] Proactive refresh failed:', err instanceof Error ? err.message : err);
            // Clear tokens if refresh fails and token is already expired
            if (now >= expiresAt) {
              await saveCodexTokens({ ...tokens, access_token: null });
            }
          }
        }
      }
    } catch {
      // Silently ignore
    }
  }

  // Check on service worker startup
  proactiveRefreshIfNeeded();

  // Schedule periodic checks (every 5 minutes)
  chrome.alarms.create(CODEX_TOKEN_REFRESH_ALARM, { periodInMinutes: 5 });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === CODEX_TOKEN_REFRESH_ALARM) {
      await proactiveRefreshIfNeeded();
      return;
    }

    if (alarm.name !== CODEX_AUTH_POLL_ALARM) return;
    try {
      const pending = await getPendingCodexAuth();
      if (!pending) {
        await chrome.alarms.clear(CODEX_AUTH_POLL_ALARM);
        return;
      }
      if (!pending.expires_at || pending.expires_at <= Date.now()) {
        await clearPendingCodexAuth();
        return;
      }
      await pollCodexAuthOnce(pending.device_auth_id, pending.user_code);
    } catch {
      // keep alarm for next retry
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        if (message.type === 'web_search') {
          sendResponse(await handleSearch(message));
          return;
        }

        if (message.type === 'web_fetch') {
          sendResponse(await handleFetch(message));
          return;
        }

        if (message.type === 'web_fetch_render') {
          sendResponse(await handleFetchRender(message));
          return;
        }

        if (message.type === 'edge_tts_status') {
          // Check if TTS is available by trying to list voices
          // Also include DNR rule status for debugging
          try {
            // Ensure DNR rules are registered before checking
            await _dnrReady;
            const [voices, sessionRules] = await Promise.all([
              edgeTTSListVoices(),
              chrome.declarativeNetRequest.getSessionRules(),
            ]);
            const dnrRules = sessionRules.filter((r: any) => r.id >= 100 && r.id <= 199);
            sendResponse({
              ok: true,
              available: true,
              voicesCount: voices.length,
              dnr: {
                totalRules: sessionRules.length,
                ttsRules: dnrRules.length,
                rules: dnrRules.map((r: any) => ({
                  id: r.id,
                  urlFilter: (r.condition as any)?.urlFilter,
                  resourceTypes: (r.condition as any)?.resourceTypes,
                })),
              },
            });
          } catch (err: any) {
            // Also report DNR status on failure
            let dnrInfo: any = null;
            try {
              const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
              const dnrRules = sessionRules.filter((r: any) => r.id >= 100 && r.id <= 199);
              dnrInfo = {
                totalRules: sessionRules.length,
                ttsRules: dnrRules.length,
                rules: dnrRules.map((r: any) => ({
                  id: r.id,
                  urlFilter: (r.condition as any)?.urlFilter,
                  resourceTypes: (r.condition as any)?.resourceTypes,
                })),
              };
            } catch {}
            sendResponse({
              ok: true,
              available: false,
              error: err?.message || String(err),
              dnr: dnrInfo,
            });
          }
          return;
        }

        if (message.type === 'edge_tts_list_voices') {
          try {
            const voices = await edgeTTSListVoices();
            sendResponse({ ok: true, voices });
          } catch (err: any) {
            sendResponse({ ok: false, error: err?.message || String(err) });
          }
          return;
        }

        if (message.type === 'edge_tts_synthesize') {
          try {
            // Ensure DNR rules are registered and offscreen document is ready
            await _dnrReady;
            await ensureOffscreenDocument();

            // Delegate to offscreen document (renderer process)
            // DNR can modify WS headers from renderer, but NOT from service worker
            const result = await chrome.runtime.sendMessage({
              type: 'tts_offscreen_synthesize',
              text: message.text,
              voice: message.voice,
              rate: message.rate,
              pitch: message.pitch,
              volume: message.volume,
              outputFormat: message.outputFormat,
            });

            if (result?.ok && result?.audioBase64) {
              sendResponse({
                ok: true,
                audioBase64: result.audioBase64,
                audioFormat: message.outputFormat || 'audio-24khz-48kbitrate-mono-mp3',
                wordBoundaries: result.wordBoundaries || [],
              });
            } else {
              sendResponse({ ok: false, error: result?.error || 'Synthesis failed in offscreen document' });
            }
          } catch (err: any) {
            sendResponse({ ok: false, error: `TTS error: ${err?.message || String(err)}` });
          }
          return;
        }

        if (message.type === 'webmcp_discover_tools') {
          sendResponse(await discoverWebMCPToolsInCurrentWindow());
          return;
        }

        if (message.type === 'webmcp_invoke_tool') {
          sendResponse(await invokeWebMCPTool(message));
          return;
        }

        if (message.type === 'codex_auth_start') {
          const resp = await fetch(DEVICEAUTH_USERCODE_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ client_id: CODEX_CLIENT_ID }),
          });
          const { text, json } = await parseJsonSafe(resp);
          if (!resp.ok) {
            sendResponse({ ok: false, status: resp.status, error: json || text });
            return;
          }

          const data = {
            ...json,
            verification_uri: DEVICE_VERIFY_URL,
            verification_uri_complete: DEVICE_VERIFY_URL,
          };

          await savePendingCodexAuth({
            user_code: data.user_code,
            device_auth_id: data.device_auth_id,
            verification_uri: data.verification_uri,
            verification_uri_complete: data.verification_uri_complete,
            expires_at: Date.now() + (data.expires_in || 900) * 1000,
            interval: data.interval || 5,
          });

          await chrome.alarms.create(CODEX_AUTH_POLL_ALARM, { periodInMinutes: 1 });

          sendResponse({ ok: true, data });
          return;
        }

        if (message.type === 'codex_auth_poll') {
          let deviceAuthId = message.deviceAuthId;
          let userCode = message.userCode;

          if (!deviceAuthId || !userCode) {
            const pending = await getPendingCodexAuth();
            deviceAuthId = pending?.device_auth_id;
            userCode = pending?.user_code;
          }

          if (!deviceAuthId || !userCode) {
            sendResponse({ ok: false, error: 'Missing device auth context, please start login again' });
            return;
          }

          const result = await pollCodexAuthOnce(deviceAuthId, userCode);
          sendResponse(result);
          return;
        }

        if (message.type === 'codex_get_status') {
          const tokens = await getCodexTokens();
          const pending = await getPendingCodexAuth();
          let authState: string = 'idle';
          let authorized = false;

          if (tokens?.access_token) {
            // Check if access token is actually still valid (JWT exp)
            const payload = decodeJwtPayload(tokens.access_token);
            const expiresAt = payload?.exp ? payload.exp * 1000 : 0;
            const now = Date.now();

            if (expiresAt && now >= expiresAt - TOKEN_REFRESH_MARGIN_MS) {
              // Token expired or about to expire — try proactive refresh
              if (tokens.refresh_token) {
                try {
                  await refreshCodexAccessToken(tokens);
                  authState = 'authorized';
                  authorized = true;
                } catch {
                  // Refresh failed — token is expired
                  authState = 'expired';
                }
              } else {
                authState = 'expired';
              }
            } else {
              // Token still valid
              authState = 'authorized';
              authorized = true;
            }
          } else if (pending && pending.expires_at && pending.expires_at > Date.now()) {
            authState = 'pending';
          } else if (tokens && !tokens.access_token) {
            authState = 'expired';
          }

          sendResponse({
            ok: true,
            data: {
              authorized,
              authState,
              models: CODEX_DEFAULT_MODELS,
              updatedAt: tokens ? await chrome.storage.local.get('codex_token_saved_at').then(r => r.codex_token_saved_at || null) : null,
            },
          });
          return;
        }

        if (message.type === 'codex_get_usage') {
          const { codex_usage } = await chrome.storage.local.get('codex_usage');
          sendResponse({ ok: true, data: codex_usage || null });
          return;
        }

        if (message.type === 'codex_proxy_fetch') {
          let tokens = await getCodexTokens();
          if (!tokens?.access_token) {
            sendResponse({ ok: false, errorCode: 'NOT_AUTHORIZED', status: 0, message: 'Not authorized. Please complete device code login first.' });
            return;
          }

          const requestUrl = message.url || CODEX_RESPONSES_URL;
          const requestInit: RequestInit = {
            method: message.method || 'POST',
            body: message.body ? JSON.stringify(message.body) : undefined,
          };

          let resp = await fetch(requestUrl, {
            ...requestInit,
            headers: codexHeaders(tokens.access_token, message.headers || {}),
          });

          if (resp.status === 401 && tokens?.refresh_token) {
            try {
              tokens = await refreshCodexAccessToken(tokens);
              resp = await fetch(requestUrl, {
                ...requestInit,
                headers: codexHeaders(tokens.access_token, message.headers || {}),
              });
            } catch (refreshErr) {
              sendResponse({ ok: false, errorCode: 'REAUTH_REQUIRED', status: 401, message: 'Token refresh failed. Please re-authorize in the extension popup.' });
              return;
            }
          }

          const text = await resp.text();
          sendResponse({ ok: resp.ok, status: resp.status, text });
          return;
        }

        sendResponse({ ok: false, error: `Unknown message type: ${String(message?.type || '')}` });
      } catch (err: any) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();

    return true;
  });

  // ── Port-based streaming for codex_proxy_fetch_stream ──
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'codex_stream') return;

    port.onMessage.addListener((message) => {
      if (message.type !== 'codex_proxy_fetch_stream') return;

      (async () => {
        // Per-request timeout: 5 minutes for streaming (long-running requests)
        const STREAM_TIMEOUT_MS = 5 * 60 * 1000;
        let timeoutId = setTimeout(() => {
          port.postMessage({ type: 'error', errorCode: 'NETWORK_ERROR', message: 'Stream request timed out (5 min)' });
          try { port.disconnect(); } catch {}
        }, STREAM_TIMEOUT_MS);

        try {
          let tokens = await getCodexTokens();
          if (!tokens?.access_token) {
            clearTimeout(timeoutId);
            port.postMessage({ type: 'error', errorCode: 'NOT_AUTHORIZED', message: 'Not authorized. Please complete device code login first.' });
            port.disconnect();
            return;
          }

          const requestUrl = message.url || CODEX_RESPONSES_URL;
          const body = { ...(message.body || {}), stream: true };

          let resp = await fetch(requestUrl, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: codexHeaders(tokens.access_token, message.headers || {}),
          });

          // Auto-refresh on 401
          if (resp.status === 401 && tokens?.refresh_token) {
            try {
              tokens = await refreshCodexAccessToken(tokens);
              resp = await fetch(requestUrl, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: codexHeaders(tokens.access_token, message.headers || {}),
              });
            } catch (refreshErr) {
              clearTimeout(timeoutId);
              port.postMessage({ type: 'error', errorCode: 'REAUTH_REQUIRED', status: 401, message: 'Token refresh failed. Please re-authorize in the extension popup.' });
              port.disconnect();
              return;
            }
          }

          if (!resp.ok) {
            clearTimeout(timeoutId);
            const errText = await resp.text();
            let errorCode = 'UPSTREAM_ERROR';
            if (resp.status === 400) errorCode = 'UPSTREAM_BAD_REQUEST';
            else if (resp.status === 429) errorCode = 'UPSTREAM_RATE_LIMITED';
            else if (resp.status >= 500) errorCode = 'UPSTREAM_SERVER_ERROR';
            port.postMessage({ type: 'error', errorCode, status: resp.status, message: errText });
            port.disconnect();
            return;
          }

          // Extract rate-limit headers before streaming body
          const rateLimitHeaders: Record<string, string> = {};
          const X_CODEX_PREFIXES = ['x-codex-primary', 'x-codex-secondary', 'x-codex-credits', 'x-codex-active-limit', 'x-codex-plan-type', 'x-codex-code-review', 'x-codex-review', 'x-code-review'];
          resp.headers.forEach((value, key) => {
            const lower = key.toLowerCase();
            if (X_CODEX_PREFIXES.some(p => lower.startsWith(p))) {
              rateLimitHeaders[lower] = value;
            }
          });
          if (Object.keys(rateLimitHeaders).length > 0) {
            // Save to storage for popup to read
            chrome.storage.local.set({
              codex_usage: {
                headers: rateLimitHeaders,
                updatedAt: Date.now(),
              },
            });
          }

          // Stream SSE chunks through the port
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            port.postMessage({ type: 'chunk', data: chunk });
          }

          // Flush remaining bytes
          const remaining = decoder.decode();
          if (remaining) {
            port.postMessage({ type: 'chunk', data: remaining });
          }

          port.postMessage({ type: 'done' });
          clearTimeout(timeoutId);
          port.disconnect();
        } catch (err: any) {
          clearTimeout(timeoutId);
          port.postMessage({ type: 'error', errorCode: 'NETWORK_ERROR', message: String(err?.message || err) });
          port.disconnect();
        }
      })();
    });
  });
});
