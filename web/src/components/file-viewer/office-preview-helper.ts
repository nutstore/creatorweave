/**
 * Shared helper for Office file preview.
 *
 * Uploads a blob to eo2suite, creates a JWT token, fetches the editor URL,
 * and opens it in a new browser tab (avoids COEP iframe issues).
 */

// ── eo2suite API endpoints ──────────────────────────────────────────────────

const EO2_UPLOAD_URL = 'https://web.eo2suite.cn/api/file/upload'
const EO2_CREATE_TOKEN_URL = 'https://web.eo2suite.cn/api/trpc/editor.createToken?batch=1'

// ── API helpers ─────────────────────────────────────────────────────────────

async function uploadFile(blob: Blob, fileName: string): Promise<string> {
  const url = `${EO2_UPLOAD_URL}?name=${encodeURIComponent(fileName)}`
  const res = await fetch(url, {
    method: 'PUT',
    body: blob,
  })
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  return data.key as string
}

async function createToken(key: string): Promise<{ token: string; api: string }> {
  const res = await fetch(EO2_CREATE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ '0': { key } }),
  })
  if (!res.ok) {
    throw new Error(`Create token failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const result = data?.[0]?.result?.data
  if (!result?.token || !result?.api) {
    throw new Error('Invalid token response')
  }
  return result as { token: string; api: string }
}

async function getEditorUrl(token: string, api: string): Promise<string> {
  const res = await fetch(api, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Open document failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  if (!data?.url) {
    throw new Error('No editor URL in response')
  }
  return data.url as string
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Upload an Office file blob and open the editor in a new tab.
 * Call this from any component that needs Office preview.
 */
export async function openOfficePreview(blob: Blob, fileName: string): Promise<void> {
  const key = await uploadFile(blob, fileName)
  const { token, api } = await createToken(key)
  const url = await getEditorUrl(token, api)
  window.open(url, '_blank', 'noopener')
}
