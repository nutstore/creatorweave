/**
 * API Key Repository
 *
 * SQLite-based storage for encrypted API keys
 * Uses Web Crypto API for AES-GCM encryption
 */

import { getSQLiteDB } from '../sqlite-database'

export interface EncryptedApiKey {
  provider: string
  keyName: string
  iv: Uint8Array
  ciphertext: Uint8Array
  createdAt: number
  updatedAt: number
}

//=============================================================================
// Encryption Utilities (using Web Crypto API)
//=============================================================================

const ENCRYPTION_KEY_NAME = 'bfosa-device-key'
const KEY_ALGORITHM = 'AES-GCM'

/**
 * Get or create device-specific encryption key
 * Key metadata stored in SQLite, actual key in IndexedDB (for non-exportability)
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  // First, check if we have key metadata in SQLite
  const db = getSQLiteDB()
  const metadataRow = await db.queryFirst<{
    key_name: string
    key_algorithm: string
    key_length: number
  }>('SELECT * FROM encryption_metadata WHERE key_name = ?', [ENCRYPTION_KEY_NAME])

  if (!metadataRow) {
    // Create new encryption key
    const key = await crypto.subtle.generateKey(
      { name: KEY_ALGORITHM, length: 256 },
      true, // extractable for export/import
      ['encrypt', 'decrypt']
    )

    // Export and store raw key in IndexedDB (for persistence)
    const rawKey = await crypto.subtle.exportKey('raw', key)
    await storeRawKey(rawKey)

    // Store metadata in SQLite
    await db.execute(
      'INSERT INTO encryption_metadata (key_name, key_algorithm, key_length, created_at) VALUES (?, ?, ?, ?)',
      [ENCRYPTION_KEY_NAME, KEY_ALGORITHM, 256, Date.now()]
    )

    // Re-import as non-extractable
    return crypto.subtle.importKey('raw', rawKey, { name: KEY_ALGORITHM }, false, [
      'encrypt',
      'decrypt',
    ])
  }

  // Load raw key from IndexedDB and re-import
  const rawKey = await loadRawKey()
  if (!rawKey) {
    throw new Error('Encryption key metadata exists but key not found in IndexedDB')
  }

  return crypto.subtle.importKey('raw', rawKey, { name: KEY_ALGORITHM }, false, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * IndexedDB storage for raw encryption key (separate from SQLite)
 * This is needed because CryptoKey cannot be stored directly
 */
const KEY_DB_NAME = 'bfosa-encryption-keys'
const KEY_STORE_NAME = 'keys'

async function openKeyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function storeRawKey(rawKey: ArrayBuffer): Promise<void> {
  const db = await openKeyDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_NAME, 'readwrite')
    const store = tx.objectStore(KEY_STORE_NAME)
    store.put(rawKey, ENCRYPTION_KEY_NAME)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadRawKey(): Promise<ArrayBuffer | null> {
  const db = await openKeyDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_NAME, 'readonly')
    const store = tx.objectStore(KEY_STORE_NAME)
    const req = store.get(ENCRYPTION_KEY_NAME)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Encrypt a string value
 */
async function encrypt(plaintext: string): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: KEY_ALGORITHM, iv }, key, encoded)
  return { iv, ciphertext }
}

/**
 * Decrypt a stored value
 */
async function decrypt(
  iv: Uint8Array | number[],
  ciphertext: Uint8Array | ArrayBuffer | SharedArrayBuffer
): Promise<string> {
  const key = await getEncryptionKey()

  // Ensure iv is a proper Uint8Array with ArrayBuffer backing
  let ivArray: Uint8Array
  if (iv instanceof Uint8Array) {
    // Copy to ensure ArrayBuffer backing
    const arrayBuffer = new ArrayBuffer(iv.byteLength)
    new Uint8Array(arrayBuffer).set(iv)
    ivArray = new Uint8Array(arrayBuffer)
  } else {
    ivArray = new Uint8Array(iv)
  }

  // Ensure we have a proper ArrayBuffer (not SharedArrayBuffer)
  let buffer: ArrayBuffer
  if (ciphertext instanceof ArrayBuffer) {
    buffer = ciphertext
  } else if (ciphertext instanceof SharedArrayBuffer) {
    // Handle SharedArrayBuffer - copy to new ArrayBuffer
    const uint8Array = new Uint8Array(ciphertext)
    const arrayBuffer = new ArrayBuffer(uint8Array.byteLength)
    new Uint8Array(arrayBuffer).set(uint8Array)
    buffer = arrayBuffer
  } else {
    // Handle Uint8Array
    const uint8Array = ciphertext as Uint8Array
    const arrayBuffer = new ArrayBuffer(uint8Array.byteLength)
    new Uint8Array(arrayBuffer).set(uint8Array)
    buffer = arrayBuffer
  }

  // Cast to BufferSource to satisfy TypeScript - we've already ensured proper ArrayBuffer
  const decrypted = await crypto.subtle.decrypt(
    { name: KEY_ALGORITHM, iv: ivArray as BufferSource },
    key,
    buffer as BufferSource
  )
  return new TextDecoder().decode(decrypted)
}

//=============================================================================
// API Key Repository
//=============================================================================

export class ApiKeyRepository {
  /**
   * Save an API key (encrypted)
   */
  async save(provider: string, apiKey: string): Promise<void> {
    const { iv, ciphertext } = await encrypt(apiKey)
    const db = getSQLiteDB()
    const now = Date.now()

    // Convert to Uint8Array for SQLite BLOB storage
    // SQLite WASM bind() supports: number, string, null, Uint8Array
    // Note: ArrayBuffer and number[] are NOT supported for BLOB columns
    const ivUint8Array = iv instanceof Uint8Array ? iv : new Uint8Array(iv)
    const cipherUint8Array = new Uint8Array(ciphertext)

    await db.execute(
      `INSERT INTO api_keys (provider, key_name, iv, ciphertext, created_at, updated_at)
       VALUES (?, '', ?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         iv = excluded.iv,
         ciphertext = excluded.ciphertext,
         updated_at = excluded.updated_at`,
      [provider, ivUint8Array, cipherUint8Array, now, now]
    )
  }

  /**
   * Load an API key (decrypted)
   */
  async load(provider: string): Promise<string | null> {
    const db = getSQLiteDB()
    // SQLite returns Uint8Array for BLOB columns
    const row = await db.queryFirst<{ iv: Uint8Array; ciphertext: Uint8Array }>(
      'SELECT iv, ciphertext FROM api_keys WHERE provider = ?',
      [provider]
    )

    if (!row) return null

    try {
      return await decrypt(row.iv, row.ciphertext)
    } catch (error) {
      console.warn(`[ApiKeyRepo] Failed to decrypt key for ${provider}:`, error)
      return null
    }
  }

  /**
   * Delete an API key
   */
  async delete(provider: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM api_keys WHERE provider = ?', [provider])
  }

  /**
   * Check if an API key exists
   */
  async has(provider: string): Promise<boolean> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ provider: string }>(
      'SELECT provider FROM api_keys WHERE provider = ?',
      [provider]
    )
    return !!row
  }

  /**
   * Get all providers with stored keys
   */
  async getAllProviders(): Promise<string[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<{ provider: string }>(
      'SELECT provider FROM api_keys ORDER BY provider'
    )
    return rows.map((r) => r.provider)
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let apiKeyRepoInstance: ApiKeyRepository | null = null

export function getApiKeyRepository(): ApiKeyRepository {
  if (!apiKeyRepoInstance) {
    apiKeyRepoInstance = new ApiKeyRepository()
  }
  return apiKeyRepoInstance
}
