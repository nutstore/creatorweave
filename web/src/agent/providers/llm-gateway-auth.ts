/**
 * LLM Gateway Device Code Flow Authentication
 *
 * Implements the device code flow for llm_gateway_service,
 * enabling browser-based OAuth login for CLI/desktop environments.
 *
 * @see https://gitea.jianguoyun.net.cn/huangqingming/llm_gateway_service
 */

// ── Types ──

export interface GatewayEndpoints {
  /** Gateway base URL, e.g. "https://ai.jianguoyun.com" */
  baseURL: string
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  /** Recommended polling interval in seconds */
  interval: number
  /** Device session TTL in seconds */
  expires_in: number
}

export interface TokenResponse {
  access_token: string
  token_type: 'Bearer'
  /** Access token TTL in seconds */
  expires_in: number
  refresh_token: string
  /** Refresh token TTL in seconds */
  refresh_expires_in: number
}

export interface GatewayError {
  code: string
  message: string
  retriable: boolean
}

// ── Token Persistence ──

const TOKEN_STORAGE_KEY = 'llm-gateway-tokens'

/**
 * SQLite-backed storage key for the refresh_token.
 *
 * access_token lives in the api-key-store under __llm_gateway_token__
 * (see llm-gateway-provider.ts). The refresh_token is persisted here so it
 * survives localStorage clearing — localStorage is volatile (browsers may
 * evict it, users may clear it, private mode discards it), while the
 * api-key-store is backed by SQLite in OPFS which is far more durable.
 *
 * We store a JSON blob containing refresh_token + expiry metadata so that on
 * restore we can reconstruct the full StoredTokens object.
 */
const REFRESH_TOKEN_DB_KEY = '__llm_gateway_refresh_token__'

export interface StoredTokens {
  access_token: string
  refresh_token: string
  /** Timestamp (ms) when the access_token expires */
  access_expires_at: number
  /** Timestamp (ms) when the refresh_token expires */
  refresh_expires_at: number
  /** The client_id used to obtain these tokens */
  client_id: string
  /** The gateway base URL */
  base_url: string
}

/**
 * Load tokens. Tries localStorage first (fast synchronous cache), then falls
 * back to SQLite api-key-store to recover the refresh_token when localStorage
 * has been cleared.
 *
 * This function is async because the SQLite fallback requires async I/O.
 * Callers that previously used the sync version must be updated to await.
 */
function loadStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredTokens
  } catch {
    return null
  }
}

/**
 * Async variant: tries localStorage first, then recovers from SQLite.
 * Used by the token-refresh path where we need maximum durability.
 */
async function loadStoredTokensWithFallback(): Promise<StoredTokens | null> {
  // Fast path: localStorage hit
  const cached = loadStoredTokens()
  if (cached) return cached

  // Slow path: recover from SQLite api-key-store
  try {
    const { loadApiKey } = await import('@/security/api-key-store')
    const raw = await loadApiKey(REFRESH_TOKEN_DB_KEY)
    if (!raw) return null
    const recovered = JSON.parse(raw) as Partial<StoredTokens>
    if (!recovered.refresh_token || !recovered.refresh_expires_at) return null
    // Reconstruct — access_token may be stale but that's fine, the caller
    // (forceRefresh) will use refresh_token to get a fresh access_token anyway.
    const restored: StoredTokens = {
      access_token: recovered.access_token || '',
      refresh_token: recovered.refresh_token,
      access_expires_at: recovered.access_expires_at || 0,
      refresh_expires_at: recovered.refresh_expires_at,
      client_id: recovered.client_id || '',
      base_url: recovered.base_url || '',
    }
    // Write back to localStorage so subsequent reads take the fast path
    // (no async SQLite hit on every call).
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(restored))
    } catch {
      // localStorage may be full / disabled — restored object is still
      // returned in-memory, the caller will use it directly.
    }
    return restored
  } catch {
    return null
  }
}

function saveStoredTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens))
  // Also persist refresh_token to SQLite for durability across localStorage clears.
  // Fire-and-forget — localStorage is the primary sync store; SQLite is the backup.
  void persistRefreshTokenToSQLite(tokens).catch((e) => {
    console.warn('[llm-gateway] persist refresh_token to SQLite failed:', e)
  })
}

/**
 * Persist refresh_token + metadata to SQLite api-key-store.
 * This survives localStorage clearing (browser eviction, user clear, private mode).
 */
async function persistRefreshTokenToSQLite(tokens: StoredTokens): Promise<void> {
  const { saveApiKey } = await import('@/security/api-key-store')
  // Store a compact JSON blob with refresh_token + expiry info
  const blob = JSON.stringify({
    refresh_token: tokens.refresh_token,
    refresh_expires_at: tokens.refresh_expires_at,
    access_token: tokens.access_token,
    access_expires_at: tokens.access_expires_at,
    client_id: tokens.client_id,
    base_url: tokens.base_url,
  })
  await saveApiKey(REFRESH_TOKEN_DB_KEY, blob)
}

/**
 * Check if an error indicates the refresh_token is definitively invalid
 * (revoked, expired, etc.) — as opposed to a transient network error.
 */
function isTokenInvalidError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const err = e as Error & { code?: string; status?: number }
  // OAuth2 standard: invalid_grant means refresh_token is revoked or expired
  if (err.code === 'invalid_grant') return true
  // HTTP 400/401 from the refresh endpoint means the token is bad
  // (network errors throw TypeError, not our Error-with-status objects)
  if (typeof err.status === 'number' && (err.status === 400 || err.status === 401)) return true
  return false
}

function clearStoredTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  // Also clear the SQLite backup
  void (async () => {
    try {
      const { deleteApiKey } = await import('@/security/api-key-store')
      await deleteApiKey(REFRESH_TOKEN_DB_KEY)
    } catch {
      // ignore
    }
  })()
}

// ── API Calls ──

async function gatewayFetch<T>(
  baseURL: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${baseURL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (res.ok) {
    return res.json() as Promise<T>
  }

  // Try to parse error body
  let errorBody: GatewayError | null = null
  try {
    errorBody = await res.json()
  } catch {
    // ignore
  }

  const err = new Error(
    errorBody?.message || `LLM Gateway error: ${res.status} ${res.statusText}`
  ) as Error & { code?: string; status?: number; retriable?: boolean }
  err.code = errorBody?.code || 'unknown'
  err.status = res.status
  err.retriable = errorBody?.retriable ?? false
  throw err
}

// ── Device Code Flow ──

/**
 * Step 1: Create a device authorization session
 */
export async function createDeviceSession(
  baseURL: string,
  clientId: string
): Promise<DeviceCodeResponse> {
  return gatewayFetch<DeviceCodeResponse>(baseURL, '/v1/auth/device/code', {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId }),
  })
}

/**
 * Step 2: Open browser for user authorization
 */
export function openAuthorizationPage(verificationUri: string, userCode?: string): void {
  const url = userCode
    ? `${verificationUri}?user_code=${encodeURIComponent(userCode)}`
    : verificationUri
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Step 3: Poll for device token (returns null while pending)
 */
export async function pollDeviceToken(
  baseURL: string,
  deviceCode: string,
  userCode: string
): Promise<TokenResponse | null> {
  try {
    const res = await fetch(`${baseURL}/v1/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode, user_code: userCode }),
    })

    if (res.status === 200) {
      return res.json() as Promise<TokenResponse>
    }

    if (res.status === 202) {
      // authorization_pending — still waiting
      return null
    }

    const body = await res.json().catch(() => ({ code: 'unknown', message: res.statusText }))

    if (body.code === 'slow_down') {
      // Need to slow down polling
      const err = new Error('Polling too fast') as Error & { code: string; retriable: boolean }
      err.code = 'slow_down'
      err.retriable = true
      throw err
    }

    if (body.code === 'authorization_pending') {
      return null
    }

    // Terminal errors (access_denied, expired_token, invalid_grant, etc.)
    const err = new Error(
      body.message || `Device auth failed: ${res.status}`
    ) as Error & { code: string; retriable: boolean }
    err.code = body.code || 'unknown'
    err.retriable = body.retriable ?? false
    throw err
  } catch (e) {
    // Re-throw our own errors
    if (e && typeof e === 'object' && 'code' in e) throw e
    // Network errors
    const err = new Error(
      `Network error: ${(e as Error).message}`
    ) as Error & { code: string; retriable: boolean }
    err.code = 'network_error'
    err.retriable = true
    throw err
  }
}

/**
 * Step 4: Cancel a device authorization session
 */
export async function cancelDeviceSession(
  baseURL: string,
  deviceCode: string
): Promise<void> {
  await gatewayFetch(baseURL, '/v1/auth/device/cancel', {
    method: 'POST',
    body: JSON.stringify({ device_code: deviceCode }),
  })
}

// ── Token Refresh ──

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  baseURL: string,
  refreshToken: string
): Promise<TokenResponse> {
  return gatewayFetch<TokenResponse>(baseURL, '/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
}

/**
 * Update the API key store with a new access token.
 * Call after refresh to ensure the next LLM request uses the new token.
 */
export async function persistAccessTokenToKeyStore(accessToken: string): Promise<void> {
  const { saveApiKey } = await import('@/security/api-key-store')
  const { getLLMGatewayApiKeyProviderKey } = await import('@/agent/providers/llm-gateway-provider')
  await saveApiKey(getLLMGatewayApiKeyProviderKey(), accessToken)
}

// ── High-Level Auth Functions ──

export interface AuthState {
  status: 'idle' | 'requesting' | 'waiting' | 'polling' | 'success' | 'error'
  userCode?: string
  verificationUri?: string
  error?: string
}

type AuthStateListener = (state: AuthState) => void

/**
 * Perform the complete Device Code Flow:
 * 1. Create device session
 * 2. Open browser for user
 * 3. Poll until authorized
 * 4. Save tokens
 *
 * @returns The access token on success
 */
export async function performDeviceCodeFlow(
  baseURL: string,
  clientId: string,
  onStateChange?: AuthStateListener
): Promise<TokenResponse> {
  const emit = (state: AuthState) => onStateChange?.(state)

  // Step 1: Create device session
  emit({ status: 'requesting' })
  const session = await createDeviceSession(baseURL, clientId)

  emit({
    status: 'waiting',
    userCode: session.user_code,
    verificationUri: session.verification_uri,
  })

  // Step 2: Open browser
  openAuthorizationPage(session.verification_uri, session.user_code)

  // Step 3: Poll
  emit({ status: 'polling', userCode: session.user_code, verificationUri: session.verification_uri })

  const startTime = Date.now()
  const expiresMs = session.expires_in * 1000
  let interval = session.interval * 1000
  let slowDownCount = 0

  while (Date.now() - startTime < expiresMs) {
    await sleep(interval)

    try {
      const tokens = await pollDeviceToken(baseURL, session.device_code, session.user_code)
      if (tokens) {
        // Success! Save tokens
        const now = Date.now()
        saveStoredTokens({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          access_expires_at: now + tokens.expires_in * 1000,
          refresh_expires_at: now + tokens.refresh_expires_in * 1000,
          client_id: clientId,
          base_url: baseURL,
        })
        emit({ status: 'success' })
        return tokens
      }
      // Still pending, continue polling
      slowDownCount = 0
    } catch (e) {
      const err = e as Error & { code?: string; retriable?: boolean }

      if (err.code === 'slow_down') {
        // Increase interval by 5 seconds
        slowDownCount++
        interval = (session.interval + slowDownCount * 5) * 1000
        continue
      }

      if (err.retriable) {
        continue
      }

      // Terminal error
      emit({ status: 'error', error: err.message })
      throw err
    }
  }

  // Expired
  const err = new Error('Device authorization session expired') as Error & { code: string }
  err.code = 'expired_token'
  emit({ status: 'error', error: err.message })
  throw err
}

/**
 * Force-refresh the access token, bypassing the local expiry check.
 *
 * Use this when the gateway has already rejected the current access token
 * (e.g. HTTP 401 "gateway token expired"). In that situation the server is
 * the source of truth — the local `access_expires_at` timestamp may still
 * be in the future (clock skew, early revocation, etc.), so we must NOT
 * trust it and must unconditionally call `/v1/auth/refresh`.
 *
 * Returns the new access token, or null when there is no stored refresh
 * token or the refresh call fails.
 */
export async function forceRefreshAccessToken(
  baseURL: string,
  clientId: string
): Promise<string | null> {
  // Use the async fallback loader — recovers refresh_token from SQLite
  // when localStorage has been cleared (browser eviction, user clear, etc.)
  const stored = await loadStoredTokensWithFallback()
  if (!stored) {
    console.warn('[llm-gateway] forceRefresh: no stored tokens (localStorage + SQLite both empty)')
    return null
  }

  // Refresh token must still be alive
  const now = Date.now()
  if (stored.refresh_expires_at <= now) {
    console.warn('[llm-gateway] forceRefresh: refresh_token expired', {
      refresh_expires_at: new Date(stored.refresh_expires_at).toISOString(),
      now: new Date(now).toISOString(),
    })
    clearStoredTokens()
    return null
  }

  console.warn('[llm-gateway] forceRefresh: calling /v1/auth/refresh ...')

  try {
    const tokens = await refreshAccessToken(baseURL, stored.refresh_token)
    saveStoredTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_expires_at: now + tokens.expires_in * 1000,
      refresh_expires_at: now + tokens.refresh_expires_in * 1000,
      client_id: clientId,
      base_url: baseURL,
    })
    // Also persist to API key store so the next LLM request uses the new token
    await persistAccessTokenToKeyStore(tokens.access_token)
    return tokens.access_token
  } catch (e) {
    // Only clear tokens if the refresh_token is definitively invalid.
    // Network errors (TypeError), 5xx, etc. should NOT wipe tokens —
    // they are transient and the user shouldn't have to re-login.
    if (isTokenInvalidError(e)) {
      console.warn('[llm-gateway] forceRefresh: token invalid, clearing stored tokens', e)
      clearStoredTokens()
    } else {
      console.warn('[llm-gateway] forceRefresh: transient error, keeping stored tokens', e)
    }
    return null
  }
}

/**
 * Get a valid access token, refreshing if needed.
 * Returns null if no tokens are stored or refresh fails.
 */
export async function getValidAccessToken(
  baseURL: string,
  clientId: string
): Promise<string | null> {
  // Use the async fallback loader — recovers refresh_token from SQLite
  // when localStorage has been cleared
  const stored = await loadStoredTokensWithFallback()
  if (!stored) return null

  const now = Date.now()

  // If access token is still valid (with 60s buffer), return it
  if (stored.access_expires_at > now + 60_000) {
    return stored.access_token
  }

  // Try to refresh
  if (stored.refresh_expires_at > now + 60_000) {
    try {
      const tokens = await refreshAccessToken(baseURL, stored.refresh_token)
      saveStoredTokens({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_expires_at: now + tokens.expires_in * 1000,
        refresh_expires_at: now + tokens.refresh_expires_in * 1000,
        client_id: clientId,
        base_url: baseURL,
      })
      // Also persist to API key store so the next LLM request uses the new token
      await persistAccessTokenToKeyStore(tokens.access_token)
      return tokens.access_token
    } catch (e) {
      // Only clear tokens if the refresh_token is definitively invalid.
      // Transient errors (network, 5xx) should NOT wipe tokens.
      if (isTokenInvalidError(e)) {
        console.warn('[llm-gateway] getValidAccessToken: token invalid, clearing stored tokens', e)
        clearStoredTokens()
      } else {
        console.warn('[llm-gateway] getValidAccessToken: transient error, keeping stored tokens', e)
      }
      return null
    }
  }

  // Both tokens expired
  clearStoredTokens()
  return null
}

/**
 * Check if we have any stored tokens (even if expired)
 */
export function hasStoredTokens(): boolean {
  return loadStoredTokens() !== null
}

/**
 * Check if we have a currently valid access token
 */
export function hasValidAccessToken(): boolean {
  const stored = loadStoredTokens()
  if (!stored) return false
  return stored.access_expires_at > Date.now() + 60_000
}

/**
 * Logout — clear all stored tokens
 */
export function logoutGateway(): void {
  clearStoredTokens()
}

/**
 * Fetch available models from the gateway
 */
export async function fetchGatewayModels(
  baseURL: string,
  accessToken: string
): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${baseURL}/v1/models`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []

  const data = await res.json()
  if (!data?.data || !Array.isArray(data.data)) return []

  return data.data.map(
    (m: { id?: string; name?: string }) => ({
      id: m.id || '',
      name: m.name || m.id || '',
    })
  )
}

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
