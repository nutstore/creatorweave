/**
 * Encrypted API Key storage using Web Crypto API + SQLite.
 * Keys are encrypted with a device-derived key before storage.
 *
 * SQLite version - using unified SQLite storage.
 */

import { getApiKeyRepository, initSQLiteDB } from '@/sqlite'

let initPromise: Promise<void> | null = null

/** Initialize SQLite for API keys (with promise caching to prevent race conditions) */
async function ensureInitialized(): Promise<void> {
  if (initPromise) {
    return initPromise
  }
  initPromise = (async () => {
    try {
      await initSQLiteDB()
    } catch (error) {
      // Clear promise on error to allow retry
      initPromise = null
      throw error
    }
  })()
  return initPromise
}

/** Save an API key (encrypted) */
export async function saveApiKey(provider: string, apiKey: string): Promise<void> {
  await ensureInitialized()
  const repo = getApiKeyRepository()
  await repo.save(provider, apiKey)
}

/** Load an API key (decrypted) */
export async function loadApiKey(provider: string): Promise<string | null> {
  await ensureInitialized()
  const repo = getApiKeyRepository()
  return await repo.load(provider)
}

/** Delete an API key */
export async function deleteApiKey(provider: string): Promise<void> {
  await ensureInitialized()
  const repo = getApiKeyRepository()
  await repo.delete(provider)
}

/** Check if an API key exists for a provider */
export async function hasApiKey(provider: string): Promise<boolean> {
  await ensureInitialized()
  const repo = getApiKeyRepository()
  return await repo.has(provider)
}

/** Get all providers with stored keys */
export async function getAllApiKeyProviders(): Promise<string[]> {
  await ensureInitialized()
  const repo = getApiKeyRepository()
  return await repo.getAllProviders()
}
