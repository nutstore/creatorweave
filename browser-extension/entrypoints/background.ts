// ============================================================
// Background Service Worker
// ============================================================

import { discoverWebMCPToolsInCurrentWindow } from './webmcp/discovery'
import { invokeWebMCPTool } from './webmcp/invoke'
import { streamPluginDownload } from './webmcp/plugin-download-transfer'
import type { WebMCPPluginDownloadPlan } from './webmcp/types'
import {
  isSidePanelBindingId,
  isTrustedCreatorWeaveSenderUrl,
} from '../lib/page-action-authorization'
import { SidePanelBindingStore, type SidePanelBinding } from '../lib/side-panel-binding-store'

// Config
const CONFIG = {
  TIMEOUT_MS: 15000,              // Request timeout in ms
  MAX_BODY_SIZE: 2 * 1024 * 1024, // Max response body size (2MB)
  SEARCH_MAX_RESULTS: 20,         // Max search results
  RENDER_TIMEOUT_MS: 30000,       // Hidden tab render timeout
  RENDER_SETTLE_MS: 2000,         // Wait after 'complete' for JS to settle
};

const completedPluginDownloads = new Map<string, { completedAt: number; savedPath?: string }>()

const SIDE_PANEL_BINDINGS_STORAGE_KEY = 'cw_side_panel_bindings_v1'
const sidePanelBindings = new SidePanelBindingStore({
  async get() {
    const stored = await chrome.storage.local.get(SIDE_PANEL_BINDINGS_STORAGE_KEY)
    return (stored[SIDE_PANEL_BINDINGS_STORAGE_KEY] ?? {}) as Record<string, SidePanelBinding>
  },
  async set(bindings) {
    await chrome.storage.local.set({ [SIDE_PANEL_BINDINGS_STORAGE_KEY]: bindings })
  },
})

function rememberSidePanelBinding(bindingId: string, tabId: number): void {
  void sidePanelBindings.remember(bindingId, tabId).catch(() => {})
}

async function resolveBoundSidePanelTab(senderUrl: string | undefined, bindingId: unknown): Promise<number | null> {
  if (!isTrustedCreatorWeaveSenderUrl(senderUrl) || !isSidePanelBindingId(bindingId)) return null
  const binding = await sidePanelBindings.resolve(bindingId).catch(() => null)
  if (!binding || !Number.isSafeInteger(binding.tabId)) return null

  try {
    await chrome.tabs.get(binding.tabId)
    return binding.tabId
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
// web_search: Multi-provider search (DuckDuckGo / Baidu)
// ============================================================

/**
 * Region detection cache. Module-level only — MV3 service workers are
 * killed after ~30s idle, so this cache is per-session. That's fine:
 * re-detection runs once per SW lifecycle (a few searches in a row
 * share the cache; the next day starts fresh).
 */
let _cachedProvider = null; // null = not detected yet
let _cachedProviderAt = 0;
const PROVIDER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

/**
 * Detect the best search provider for the current user.
 * Strategy: timezone hint → connectivity test → cache result.
 */
async function detectProvider() {
  // Return cache if still valid
  if (_cachedProvider && (Date.now() - _cachedProviderAt) < PROVIDER_CACHE_TTL) {
    return _cachedProvider;
  }

  // Step 1: timezone hint
  let hint = 'duckduckgo';
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz === 'Asia/Shanghai' || tz === 'Asia/Urumqi' ||
        tz === 'Asia/Hong_Kong' || tz === 'Asia/Taipei' ||
        tz === 'Asia/Macau') {
      hint = 'baidu';
    }
  } catch {}

  // Step 2: connectivity test (3s timeout)
  // If DDG is reachable, always prefer it (works for both CN-vpn and overseas)
  const ddgReachable = await isDuckDuckGoReachable();

  let provider;
  if (ddgReachable) {
    provider = 'duckduckgo';
  } else {
    provider = 'baidu';
  }

  _cachedProvider = provider;
  _cachedProviderAt = Date.now();
  return provider;
}

/** Quick connectivity test for DuckDuckGo */
async function isDuckDuckGoReachable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch('https://html.duckduckgo.com/html/?q=test', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

/** Search via DuckDuckGo HTML */
async function searchDuckDuckGo(query, limit) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const resp = await fetchWithTimeout(url);
  const html = await resp.text();

  const results = [];
  const blocks = html.split(/class="result\b/);

  for (let i = 1; i < blocks.length && results.length < limit; i++) {
    const block = blocks[i];

    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
      : '';

    const urlMatch = block.match(/class="result__a"[^>]*href="([^"]*)"/)
      || block.match(/href="([^"]*)"[^>]*class="result__a"/);
    const rawUrl = urlMatch ? extractRealUrl(urlMatch[1]) : '';

    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, '').trim()
      : '';

    if (title && rawUrl) {
      results.push({ title, url: rawUrl, snippet });
    }
  }
  return results;
}

/** Fetch Baidu search results HTML (raw, unparsed) */
async function fetchBaiduHtml(query, limit) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${Math.min(limit * 2, 20)}`;
  const resp = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  const html = await resp.text();
  return html;
}

/**
 * Search one provider without substituting another provider. Explicit callers
 * rely on this strict behavior to preserve source provenance.
 */
async function searchSingleProvider(query, limit, provider) {
  try {
    if (provider === 'baidu') {
      const html = await fetchBaiduHtml(query, limit);
      // format: 'html' tells injected.content to DOMParser this payload.
      return { ok: true, html, provider: 'baidu', format: 'html', limit };
    }

    const results = await searchDuckDuckGo(query, limit);
    return { ok: true, results, provider: 'duckduckgo' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      results: [],
      provider,
      suggestedProvider: provider === 'baidu' ? 'duckduckgo' : 'baidu',
      reason,
      error: `${provider} is unavailable. Try ${provider === 'baidu' ? 'duckduckgo' : 'baidu'}.`,
    };
  }
}

/**
 * Automatic selection may use the alternate provider. Baidu's result count is
 * only available in the injected MAIN-world parser, so an HTML response carries
 * enough metadata for that layer to perform the final retry when needed.
 */
async function searchAuto(query, limit, primary) {
  const first = await searchSingleProvider(query, limit, primary);
  const attempts = [];

  if (first.ok && primary === 'baidu') {
    return {
      ...first,
      requestedProvider: primary,
      fallback: false,
      attempts: [{ provider: 'baidu', ok: true }],
      auto: true,
    };
  }

  if (first.ok && first.results.length > 0) {
    return {
      ...first,
      requestedProvider: primary,
      fallback: false,
      attempts: [{ provider: 'duckduckgo', ok: true, resultCount: first.results.length }],
      auto: true,
    };
  }

  attempts.push({
    provider: primary,
    ok: false,
    reason: first.ok ? '0 results' : first.reason || 'unavailable',
  });
  const alternate = primary === 'baidu' ? 'duckduckgo' : 'baidu';
  const second = await searchSingleProvider(query, limit, alternate);

  if (!second.ok) {
    attempts.push({ provider: alternate, ok: false, reason: second.reason || 'unavailable' });
    return {
      ok: false,
      results: [],
      error: 'All search providers exhausted',
      requestedProvider: primary,
      attempts,
    };
  }

  if (alternate === 'duckduckgo' && second.results.length === 0) {
    attempts.push({ provider: alternate, ok: false, reason: '0 results' });
    return {
      ok: false,
      results: [],
      error: 'All search providers returned no results',
      requestedProvider: primary,
      attempts,
    };
  }

  attempts.push({ provider: alternate, ok: true, ...(alternate === 'duckduckgo' ? { resultCount: second.results.length } : {}) });
  return {
    ...second,
    requestedProvider: primary,
    fallback: true,
    attempts,
    auto: true,
  };
}

async function handleSearch(message) {
  const { query, count = 10 } = message;
  const limit = Math.min(count, CONFIG.SEARCH_MAX_RESULTS);
  const isAuto = !message.provider || message.provider === 'auto';

  if (!isAuto) {
    const response = await searchSingleProvider(query, limit, message.provider);
    return {
      ...response,
      requestedProvider: message.provider,
      fallback: false,
      auto: false,
    };
  }

  return searchAuto(query, limit, await detectProvider());
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
const CODEX_BACKEND_API_URL = 'https://chatgpt.com/backend-api';
const CODEX_RESET_CREDITS_URL = `${CODEX_BACKEND_API_URL}/wham/rate-limit-reset-credits`;
const CODEX_RESET_CONSUME_URL = `${CODEX_RESET_CREDITS_URL}/consume`;
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback';
const CODEX_PENDING_AUTH_KEY = 'codex_pending_auth';
const CODEX_AUTH_POLL_ALARM = 'codex_auth_poll_alarm';
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

const CODEX_DEFAULT_MODELS = [
  { id: 'gpt-5.4', name: 'GPT-5.4', contextWindow: 1000000, capabilities: ['code', 'reasoning', 'vision'] },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', contextWindow: 400000, capabilities: ['code', 'reasoning', 'vision'] },
  { id: 'gpt-5.5', name: 'GPT-5.5', contextWindow: 1000000, capabilities: ['code', 'reasoning', 'vision'] },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', contextWindow: 258000, capabilities: ['code', 'reasoning', 'vision'] },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', contextWindow: 258000, capabilities: ['code', 'reasoning', 'vision'] },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', contextWindow: 258000, capabilities: ['code', 'reasoning', 'vision'] },
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

type CodexResetCreditsResponse = {
  credits?: Array<{
    id?: string;
    status?: string;
    reset_type?: string;
    granted_at?: string;
    expires_at?: string;
    title?: string;
  }>;
  available_count?: number;
};

async function codexBackendJsonRequest<T>(
  url: string,
  tokens: any,
  init: RequestInit = {},
): Promise<T> {
  const request = (accessToken: string) => fetch(url, {
    ...init,
    headers: {
      ...codexHeaders(accessToken, {
        accept: 'application/json',
        ...(init.headers as Record<string, string> || {}),
      }),
    },
  });

  let response = await request(tokens.access_token);
  if (response.status === 401 && tokens.refresh_token) {
    tokens = await refreshCodexAccessToken(tokens);
    response = await request(tokens.access_token);
  }

  const { text, json } = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(`Codex request failed (${response.status}): ${JSON.stringify(json || text)}`);
  }
  return (json ?? {}) as T;
}

async function getCodexResetCredits(tokens: any): Promise<CodexResetCreditsResponse> {
  return codexBackendJsonRequest<CodexResetCreditsResponse>(CODEX_RESET_CREDITS_URL, tokens);
}

async function consumeCodexResetCredit(tokens: any, creditId: string) {
  const redeemRequestId = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return codexBackendJsonRequest<{ code?: string; windows_reset?: number; credit?: unknown }>(
    CODEX_RESET_CONSUME_URL,
    tokens,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credit_id: creditId, redeem_request_id: redeemRequestId }),
    },
  );
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

    // Schedule alarm — forward trigger to the active CreatorWeave tab
    if (alarm.name.startsWith('sched_')) {
      const scheduleId = alarm.name.slice(6) // strip 'sched_' prefix
      await forwardScheduleTrigger(scheduleId)
      return
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

  // ── Schedule Alarm Handler ──────────────────────────────────────────────
  // When a schedule alarm fires, we forward the trigger to the active CreatorWeave tab.
  // The extension cannot access OPFS directly, so it delegates to the page.

  // Track the active CreatorWeave tab ID (updated on tab activation)
  let _creatorWeaveTabId: number | null = null

  // Per-tab side panel state is tracked via chrome.sidePanel.getOptions()
  // (the single source of truth) instead of a local Set — see toggle handler
  // below for the rationale (no onClosed event exists for chrome.sidePanel).

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId)
      if (tab?.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        _creatorWeaveTabId = tab.id
      }
    } catch {
      // ignore
    }
  })

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
      _creatorWeaveTabId = tabId
    }
  })

  // Track which tabs have the side panel open. Used by the toggle
  // handler to decide open vs close — MUST be synchronous (async
  // getOptions would break the user gesture call stack for open()).
  // Cleaned up on tab close. Best-effort: Chrome has no onClosed event
  // for the X button, so a manual close via X may leave a stale entry
  // (harmless — next click closes, then the one after opens).
  const _sidePanelTabs = new Set<number>()

  chrome.tabs.onRemoved.addListener((tabId) => {
    _sidePanelTabs.delete(tabId)
  })

  /**
   * Forward a schedule trigger to the CreatorWeave page.
   * Returns true if forwarded successfully, false if no active tab.
   */
  async function forwardScheduleTrigger(scheduleId: string): Promise<boolean> {
    if (!_creatorWeaveTabId) {
      // Try to find a CreatorWeave tab
      try {
        const tabs = await chrome.tabs.query({ url: ['*://*/*'] })
        const cwTab = tabs.find(t => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))
        if (cwTab?.id) {
          _creatorWeaveTabId = cwTab.id
        } else {
          return false
        }
      } catch {
        return false
      }
    }

    try {
      await chrome.tabs.sendMessage(_creatorWeaveTabId, {
        type: 'cw_schedule_run',
        scheduleId,
      })
      return true
    } catch {
      // Tab may be closed or not responding
      _creatorWeaveTabId = null
      return false
    }
  }

  /**
   * Show a desktop notification for schedule events.
   */
  async function showScheduleNotification(options: {
    title: string
    body: string
    scheduleId?: string
  }): Promise<void> {
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icon.png',
        title: options.title,
        message: options.body,
        priority: 1,
      })
    } catch {
      // notifications may not be available
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // ── Side Panel: toggle open/close on user click ──
    // Per Chrome's official sample, chrome.sidePanel.open() can be called
    // from background's onMessage when triggered by a content script click.
    // Must use tabId (not windowId) for the gesture to work.
    //
    // Triggered by side-panel-button.content.ts (which runs on <all_urls>)
    // when the user clicks the "唤起怡氧知知" floating button on any page.
    // Toggles: if the side panel is currently open for this tab, close it
    // (via setOptions { enabled: false }); otherwise open it.
    //
    // URL params carry only the initial routing metadata. The web app stores
    // that transient state in sessionStorage and removes it from the URL.
    // The extension owns target selection through an opaque binding. The web
    // app stores that binding in sessionStorage after cleaning the URL.
    // Page context (URL/title/selected text/business fields) is fetched
    // live per LLM call via the pull-based bridge — see
    // `requestBoundPageContext` handler below.
    if (message.type === 'cw_side_panel_toggle') {
      const tabId = _sender?.tab?.id
      if (typeof tabId !== 'number') return false

      // ── Toggle close ──
      // Check _sidePanelTabs synchronously to preserve the user gesture
      // call stack. This is a best-effort local Set — it can desync if
      // the user closes the panel via Chrome's built-in X (there's no
      // onClosed event). But trading occasional desync for reliable
      // open() is the right call: a failed close is a no-op, while a
      // failed open loses the side panel entirely.
      if (_sidePanelTabs.has(tabId)) {
        chrome.sidePanel.setOptions({ tabId, enabled: false })
        _sidePanelTabs.delete(tabId)
        // eslint-disable-next-line no-console
        console.log('[CreatorWeave][bg] side panel closed (toggle)', { tabId })
        return false
      }

      // ── Toggle open ──
      const pageUrl = typeof message.url === 'string' ? message.url : ''
      const bindingId = crypto.randomUUID()
      rememberSidePanelBinding(bindingId, tabId)

      const params = new URLSearchParams()
      params.set('source', 'side_panel')
      params.set('binding', bindingId)
      if (pageUrl) {
        try {
          params.set('origin', new URL(pageUrl).origin)
        } catch {}
      }

      const isDev = import.meta.env.MODE === 'development'
      const cwBase = isDev ? 'http://localhost:5173' : 'https://creatorweave.eo2suite.cn'
      const cwUrl = `${cwBase}/#/?${params.toString()}`
      // eslint-disable-next-line no-console
      console.log('[CreatorWeave][bg] opening side panel', {
        tabId,
        pageUrl,
        cwUrl,
      })

      // setOptions must run BEFORE open; do NOT await (preserves user gesture).
      // Pattern from Chrome's official sample + the user-gesture thread:
      // https://groups.google.com/a/chromium.org/g/chromium-extensions/c/S2bR12jOCKA
      chrome.sidePanel.setOptions({
        tabId,
        path: cwUrl,
        enabled: true,
      })

      chrome.sidePanel.open({ tabId }).then(() => {
        _sidePanelTabs.add(tabId)
      }).catch((err: any) => {
        console.warn(
          '[CreatorWeave] Side panel open failed, falling back to new tab:',
          err,
        )
        chrome.tabs.create({ url: `${cwBase}/#/` }).catch(() => {})
      })
      return false
    }

    (async () => {
      try {
        if (message.type === 'extension_get_version') {
          try {
            const manifest = chrome.runtime.getManifest()
            sendResponse({ ok: true, version: manifest.version })
          } catch (err: any) {
            sendResponse({ ok: false, error: err?.message || String(err) })
          }
          return
        }

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

        // ── Workspace Assistant: pull page context from upstream tab ──
        //
        // CreatorWeave side panel sends {type:'requestBoundPageContext'}.
        // We execute in the upstream tab's MAIN world and combine two sources:
        //   - __cwUpstreamPage.{getUrl,getTitle,getSelectedText}   ← OUR content script
        //     (upstream-page.content.ts), present on ALL URLs (matches
        //     <all_urls>). Reads generic page metadata directly. Fresh at
        //     every call (no URL-params snapshot). This is what we own.
        //   - __sidePanelContextProvider.getContext()   ← OPTIONAL upstream
        //     provider (per docs/developer/guides/side-panel-context-provider.md).
        //     Yields business-specific fields (page_type, public_id, etc.).
        //     We don't parse its shape.
        //
        // Return shape: { url, title, selectedText, providerContext } | null
        // The split makes responsibility clear: url/title/selectedText are
        // "what we recorded", providerContext is "what the upstream site told us".
        if (message.type === 'requestBoundPageContext') {
          const targetTabId = await resolveBoundSidePanelTab(_sender?.url, message.binding)
          if (targetTabId === null) {
            sendResponse(null)
            return
          }
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: targetTabId },
              world: 'MAIN',
              func: async () => {
                const w = window as unknown as {
                  __cwUpstreamPage?: {
                    getUrl?: () => unknown
                    getTitle?: () => unknown
                    getSelectedText?: () => unknown
                  }
                  __sidePanelContextProvider?: {
                    getContext?: () => unknown
                  }
                }

                // Our content script: URL / title / selected text.
                // Fall back to window.location / document / window.getSelection
                // if our content script didn't run (defensive against
                // races or future extensions).
                let url: string | null = null
                let title: string | null = null
                let selectedText: string | null = null
                const upstream = w.__cwUpstreamPage
                if (upstream) {
                  try {
                    const u = upstream.getUrl?.()
                    if (typeof u === 'string' && u) url = u
                  } catch {}
                  try {
                    const t = upstream.getTitle?.()
                    if (typeof t === 'string' && t) title = t
                  } catch {}
                  try {
                    const s = upstream.getSelectedText?.()
                    if (typeof s === 'string') selectedText = s
                  } catch {}
                }
                if (!url) url = window.location.href
                if (!title) title = document.title
                if (selectedText == null) {
                  try {
                    const sel = window.getSelection?.()
                    selectedText = sel ? sel.toString().trim() : ''
                  } catch {
                    selectedText = ''
                  }
                }

                // Upstream provider: business-specific context (optional).
                // Await the result so executeScript returns a resolved
                // plain value — NOT a Promise (executeScript uses
                // structured clone, which cannot serialize Promise).
                let providerContext: unknown = null
                const provider = w.__sidePanelContextProvider
                if (provider && typeof provider.getContext === 'function') {
                  try {
                    const ctx = provider.getContext()
                    providerContext = ctx && typeof (ctx as Promise<unknown>).then === 'function'
                      ? await (ctx as Promise<unknown>).catch(() => null)
                      : ctx ?? null
                  } catch {
                    providerContext = null
                  }
                }

                return { url, title, selectedText, providerContext }
              },
            })
            const result = Array.isArray(results) ? results[0]?.result : null
            sendResponse(result ?? null)
          } catch (err: any) {
            console.warn('[Background] requestBoundPageContext failed:', err?.message || err)
            sendResponse(null)
          }
          return
        }

        // ── Page Action Runner ─────────────────────────────────────────
        // CreatorWeave side panel sends
        //   { type: 'runBoundPageAction', action }
        // where `action` is a page-interaction primitive (snapshot /
        // click / fill / type / scroll / find_elements / text_content /
        // evaluate) defined in page-action-runner.content.ts.
        //
        // We execute in the upstream tab's MAIN world, where
        // `window.__cwPageAction.run(action)` is injected by our
        // page-action-runner content script.
        //
        // The extension boundary restricts this bridge to CreatorWeave's
        // trusted side-panel origin and extension-owned binding, preventing
        // untrusted webpages from invoking MAIN-world page actions. The agent
        // layer remains responsible for UI confirmation of write actions.
        if (message.type === 'runBoundPageAction') {
          const targetTabId = await resolveBoundSidePanelTab(_sender?.url, message.binding)
          if (targetTabId === null) {
            sendResponse({
              ok: false,
              errorCode: 'UNAUTHORIZED_TARGET',
              error: 'Page actions require a valid side-panel binding.',
            })
            return
          }

          const sidePanelOptions = await chrome.sidePanel.getOptions({ tabId: targetTabId })
          if (!sidePanelOptions.enabled) {
            sendResponse({
              ok: false,
              errorCode: 'UNAUTHORIZED_TARGET',
              error: 'Page actions require an open side panel for the target tab.',
            })
            return
          }

          const action = message.action
          if (!action || typeof action !== 'object') {
            sendResponse({ ok: false, errorCode: 'INVALID_REQUEST', error: 'runBoundPageAction requires { action: object }' })
            return
          }
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: targetTabId },
              world: 'MAIN',
              func: async (a: unknown) => {
                const w = window as unknown as {
                  __cwPageAction?: { ready: boolean; run: (a: unknown) => Promise<unknown> }
                }
                const runner = w.__cwPageAction
                if (!runner?.ready || typeof runner.run !== 'function') {
                  return {
                    ok: false,
                    errorCode: 'RUNNER_NOT_READY',
                    error: 'Page action runner not injected in this tab. The page-action-runner content script may not have loaded (extension reload, restricted URL, or injection race).',
                  }
                }
                try {
                  return await runner.run(a)
                } catch (err: any) {
                  return {
                    ok: false,
                    errorCode: 'RUNNER_ERROR',
                    error: err?.message || String(err),
                  }
                }
              },
              args: [action],
            })
            const result = Array.isArray(results) ? results[0]?.result : null
            sendResponse(result ?? { ok: false, errorCode: 'NO_RESULT', error: 'executeScript returned no result' })
          } catch (err: any) {
            // Common causes: tab gone, restricted URL (chrome://, web store),
            // host permission missing. Surface as structured error.
            sendResponse({
              ok: false,
              errorCode: 'EXECUTE_SCRIPT_FAILED',
              error: err?.message || String(err),
            })
          }
          return
        }

        // ── Capture Visible Tab ───────────────────────────────────────
        // Captures the visible area of the upstream tab as a PNG/JPEG data URL.
        // Uses chrome.tabs.captureVisibleTab (no debugger permission needed,
        // no yellow debug bar). Only captures the current viewport — for
        // full-page capture, the agent should scroll + capture multiple times.
        if (message.type === 'captureBoundTab') {
          const targetTabId = await resolveBoundSidePanelTab(_sender?.url, message.binding)
          if (targetTabId === null) {
            sendResponse({ ok: false, errorCode: 'UNAUTHORIZED_TARGET', error: 'Missing or invalid side-panel binding.' })
            return
          }
          const sidePanelOptions = await chrome.sidePanel.getOptions({ tabId: targetTabId })
          if (!sidePanelOptions.enabled) {
            sendResponse({
              ok: false,
              errorCode: 'UNAUTHORIZED_TARGET',
              error: 'Screenshots require an open side panel for the target tab.',
            })
            return
          }

          const format = message.format === 'jpeg' ? 'jpeg' : 'png'
          const quality = typeof message.quality === 'number' ? Math.max(0, Math.min(100, message.quality)) : undefined
          try {
            // Find the window that owns the target tab
            const tab = await chrome.tabs.get(targetTabId)
            if (!tab.active) {
              sendResponse({ ok: false, errorCode: 'TARGET_NOT_VISIBLE', error: 'The side-panel tab is not the visible tab in its window.' })
              return
            }
            const windowId = tab.windowId
            const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
              format,
              ...(quality !== undefined ? { quality } : {}),
            })
            sendResponse({ ok: true, dataUrl, format })
          } catch (err: any) {
            sendResponse({
              ok: false,
              errorCode: 'CAPTURE_FAILED',
              error: err?.message || String(err),
            })
          }
          return
        }

        if (message.type === 'mcp_proxy_fetch') {
          const { url, method = 'POST', headers = {}, body = null, timeoutMs } = message;
          try {
            const resp = await fetchWithTimeout(url, {
              method,
              headers,
              body,
              timeout: typeof timeoutMs === 'number' ? timeoutMs : CONFIG.TIMEOUT_MS,
            });
            const text = await resp.text();
            const responseHeaders = {};
            resp.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });
            sendResponse({ ok: resp.ok, status: resp.status, statusText: resp.statusText, headers: responseHeaders, text });
          } catch (err: any) {
            sendResponse({ ok: false, status: 0, error: err?.message || String(err) });
          }
          return;
        }

        if (message.type === 'webmcp_discover_tools') {
          const senderWindowId = _sender?.tab?.windowId;
          sendResponse(await discoverWebMCPToolsInCurrentWindow(senderWindowId));
          return;
        }

        if (message.type === 'webmcp_invoke_tool') {
          sendResponse(await invokeWebMCPTool(message));
          return;
        }

        if (message.type === 'webmcp_plugin_download_finalize') {
          const transferId = typeof message.transferId === 'string' ? message.transferId : ''
          const savedPath = typeof message.savedPath === 'string' ? message.savedPath : ''
          if (!transferId) {
            sendResponse({ ok: false, error: 'Missing transferId for plugin download finalize' });
            return;
          }

          const existing = completedPluginDownloads.get(transferId)
          completedPluginDownloads.set(transferId, {
            completedAt: existing?.completedAt || Date.now(),
            savedPath: savedPath || existing?.savedPath,
          })

          await sleep(3000)
          sendResponse({ ok: true, transferId, savedPath: savedPath || existing?.savedPath })
          completedPluginDownloads.delete(transferId)
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
          } else if (pending) {
            // Remove expired/orphaned device-code state so the popup cannot
            // keep polling an old login attempt forever.
            await clearPendingCodexAuth();
            if (tokens && !tokens.access_token) authState = 'expired';
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

        if (message.type === 'codex_get_reset_credits') {
          const tokens = await getCodexTokens();
          if (!tokens?.access_token) {
            sendResponse({ ok: false, errorCode: 'NOT_AUTHORIZED', status: 0, message: 'Not authorized. Please complete device code login first.' });
            return;
          }
          try {
            const data = await getCodexResetCredits(tokens);
            sendResponse({ ok: true, data });
          } catch (err: any) {
            sendResponse({ ok: false, errorCode: 'RESET_CREDITS_UNAVAILABLE', status: 502, message: String(err?.message || err) });
          }
          return;
        }

        if (message.type === 'codex_consume_reset_credit') {
          const tokens = await getCodexTokens();
          const creditId = typeof message.creditId === 'string' ? message.creditId : '';
          if (!tokens?.access_token) {
            sendResponse({ ok: false, errorCode: 'NOT_AUTHORIZED', status: 0, message: 'Not authorized. Please complete device code login first.' });
            return;
          }
          if (!creditId) {
            sendResponse({ ok: false, errorCode: 'MISSING_CREDIT_ID', status: 400, message: 'Missing reset credit id.' });
            return;
          }
          try {
            const data = await consumeCodexResetCredit(tokens, creditId);
            sendResponse({ ok: true, data });
          } catch (err: any) {
            sendResponse({ ok: false, errorCode: 'RESET_CREDIT_CONSUME_FAILED', status: 502, message: String(err?.message || err) });
          }
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

        // ── Schedule triggers ─────────────────────────────────────────────

        // NOTE: cw_side_panel_toggle is handled synchronously above
        // (before the async block) to preserve user gesture context for
        // chrome.sidePanel.open().

        if (message.type === 'cw_schedule_register_alarm') {
          // CreatorWeave page asks us to set an alarm for a schedule
          const { scheduleId, nextRunTime } = message as { scheduleId: string; nextRunTime: number }
          if (!scheduleId || typeof nextRunTime !== 'number') {
            sendResponse({ ok: false, error: 'Missing scheduleId or nextRunTime' })
            return
          }
          try {
            const alarmName = `sched_${scheduleId}`
            const delaySeconds = Math.max(1, Math.round((nextRunTime - Date.now()) / 1000))
            await chrome.alarms.create(alarmName, { delayInMinutes: delaySeconds / 60 })
            sendResponse({ ok: true, alarmName })
          } catch (err: any) {
            sendResponse({ ok: false, error: err?.message || String(err) })
          }
          return
        }

        if (message.type === 'cw_schedule_clear_alarm') {
          // CreatorWeave page asks us to clear an alarm for a schedule
          const { scheduleId } = message as { scheduleId: string }
          if (!scheduleId) {
            sendResponse({ ok: false, error: 'Missing scheduleId' })
            return
          }
          try {
            await chrome.alarms.delete(`sched_${scheduleId}`)
            sendResponse({ ok: true })
          } catch (err: any) {
            sendResponse({ ok: false, error: err?.message || String(err) })
          }
          return
        }

        if (message.type === 'cw_schedule_show_notification') {
          // CreatorWeave page asks us to show a desktop notification
          const { title, body } = message as { title: string; body: string }
          await showScheduleNotification({ title, body })
          sendResponse({ ok: true })
          return
        }

        if (message.type === 'cw_schedule_disable_notification') {
          // CreatorWeave notifies us that a schedule was disabled (e.g., bound conversation deleted)
          const { scheduleId, reason } = message as { scheduleId: string; reason?: string }
          if (scheduleId) {
            try {
              await chrome.alarms.delete(`sched_${scheduleId}`)
            } catch { /* ignore */ }
          }
          await showScheduleNotification({
            title: '定时任务已暂停',
            body: reason ? `原因：${reason}` : '定时任务已被禁用',
          })
          sendResponse({ ok: true })
          return
        }

        sendResponse({ ok: false, error: `Unknown message type: ${String(message?.type || '')}` });
      } catch (err: any) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();

    return true;
  });

  // ── Port-based streaming bridge for Codex, page-outside MCP, and plugin download flows ──
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'agent_bridge_stream') return;

    port.onMessage.addListener((message) => {
      if (message.type === 'webmcp_plugin_download_stream') {
        (async () => {
          const plan = message.plan as WebMCPPluginDownloadPlan | undefined
          if (!plan?.transferId || !plan.downloadUrl || !plan.savePath || !plan.fileName) {
            port.postMessage({
              type: 'error',
              errorCode: 'INVALID_PLUGIN_DOWNLOAD_PLAN',
              message: 'Missing transferId/downloadUrl/savePath/fileName for plugin download stream',
            })
            port.disconnect()
            return
          }

          let streamEndedWithError = false
          const safePost = (payload: Record<string, unknown>) => {
            try {
              port.postMessage(payload)
              return true
            } catch {
              return false
            }
          }
          await streamPluginDownload(plan, (frame) => {
            if (frame.type === 'end') {
              completedPluginDownloads.set(plan.transferId, { completedAt: Date.now() })
            }
            const sent = safePost({ type: 'chunk', data: frame })
            if (!sent) return
            if (frame.type === 'error') {
              streamEndedWithError = true
              safePost({ type: 'done' })
              try { port.disconnect() } catch {}
            }
          })

          if (!streamEndedWithError) {
            safePost({ type: 'done' })
            try { port.disconnect() } catch {}
          }
        })()
        return
      }

      if (message.type === 'mcp_proxy_fetch_stream') {
        (async () => {
          const { url, method = 'POST', headers = {}, body = null, timeoutMs } = message;
          const streamTimeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 2 * 60 * 1000;
          let timeoutId = setTimeout(() => {
            port.postMessage({ type: 'error', errorCode: 'NETWORK_ERROR', message: `MCP stream request timed out (${Math.round(streamTimeoutMs / 1000)}s)` });
            try { port.disconnect(); } catch {}
          }, streamTimeoutMs);

          try {
            const resp = await fetchWithTimeout(url, {
              method,
              headers,
              body,
              timeout: streamTimeoutMs,
            });

            const responseHeaders = {};
            resp.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });

            port.postMessage({
              type: 'chunk',
              data: {
                type: 'response_start',
                status: resp.status,
                statusText: resp.statusText,
                headers: responseHeaders,
              },
            });

            if (!resp.ok) {
              clearTimeout(timeoutId);
              const errText = await resp.text();
              port.postMessage({ type: 'error', errorCode: 'UPSTREAM_ERROR', status: resp.status, message: errText || resp.statusText });
              port.disconnect();
              return;
            }

            const reader = resp.body?.getReader();
            if (!reader) {
              clearTimeout(timeoutId);
              port.postMessage({ type: 'error', errorCode: 'NO_RESPONSE_BODY', message: 'No response body for MCP stream' });
              port.disconnect();
              return;
            }

            const decoder = new TextDecoder();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              port.postMessage({ type: 'chunk', data: { type: 'chunk', data: chunk } });
            }

            const remaining = decoder.decode();
            if (remaining) {
              port.postMessage({ type: 'chunk', data: { type: 'chunk', data: remaining } });
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
        return;
      }

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
