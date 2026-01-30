/**
 * Encrypted API Key storage using Web Crypto API + IndexedDB.
 * Keys are encrypted with a device-derived key before storage.
 */

const DB_NAME = 'bfosa-security'
const DB_VERSION = 1
const STORE_NAME = 'api-keys'
const ENCRYPTION_KEY_NAME = 'bfosa-device-key'

/** Open IndexedDB */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Get or create a device-specific encryption key */
async function getEncryptionKey(): Promise<CryptoKey> {
  // Try to load existing key from IndexedDB
  const db = await openDB()
  const stored = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(ENCRYPTION_KEY_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  if (stored) {
    return crypto.subtle.importKey('raw', stored, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ])
  }

  // Generate new key
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])

  // Export and store the raw key
  const rawKey = await crypto.subtle.exportKey('raw', key)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(rawKey, ENCRYPTION_KEY_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })

  // Re-import as non-extractable
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Encrypt a string value */
async function encrypt(plaintext: string): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return { iv, ciphertext }
}

/** Decrypt a stored value */
async function decrypt(iv: number[], ciphertext: ArrayBuffer): Promise<string> {
  const key = await getEncryptionKey()
  const ivBuffer = new Uint8Array(iv).buffer
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    key,
    ciphertext
  )
  return new TextDecoder().decode(decrypted)
}

/** Save an API key (encrypted) */
export async function saveApiKey(provider: string, apiKey: string): Promise<void> {
  const { iv, ciphertext } = await encrypt(apiKey)
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put({ iv: Array.from(iv), ciphertext }, `apikey-${provider}`)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Load an API key (decrypted) */
export async function loadApiKey(provider: string): Promise<string | null> {
  const db = await openDB()
  const stored = await new Promise<{ iv: number[]; ciphertext: ArrayBuffer } | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(`apikey-${provider}`)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }
  )

  if (!stored) return null

  try {
    return await decrypt(stored.iv, stored.ciphertext)
  } catch {
    console.warn(`[api-key-store] Failed to decrypt key for ${provider}`)
    return null
  }
}

/** Delete an API key */
export async function deleteApiKey(provider: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(`apikey-${provider}`)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Check if an API key exists for a provider */
export async function hasApiKey(provider: string): Promise<boolean> {
  const db = await openDB()
  const stored = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(`apikey-${provider}`)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return stored !== undefined
}
