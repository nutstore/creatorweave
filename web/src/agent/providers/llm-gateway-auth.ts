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

function loadStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredTokens
  } catch {
    return null
  }
}

function saveStoredTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens))
}

function clearStoredTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
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
 * Get a valid access token, refreshing if needed.
 * Returns null if no tokens are stored or refresh fails.
 */
export async function getValidAccessToken(
  baseURL: string,
  clientId: string
): Promise<string | null> {
  const stored = loadStoredTokens()
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
    } catch {
      // Refresh failed, clear tokens
      clearStoredTokens()
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
