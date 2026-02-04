/**
 * Migration Script: IndexedDB → SQLite
 *
 * This script migrates existing IndexedDB data to the new SQLite storage.
 * Run this once during the upgrade process.
 */

import { initSQLiteDB, getSQLiteDB } from './sqlite-database'
import { getConversationRepository } from './repositories/conversation.repository'
import { getSkillRepository } from './repositories/skill.repository'
import { getPluginRepository } from './repositories/plugin.repository'
import { getSessionRepository } from './repositories/session.repository'
import { getApiKeyRepository } from './repositories/api-key.repository'
import type { StoredSkill } from '@/skills/skill-types'

//=============================================================================
// Migration Progress
//=============================================================================

export interface MigrationProgress {
  step: string
  total: number
  current: number
  details: string
}

export type MigrationProgressCallback = (progress: MigrationProgress) => void

/**
 * Get the current migration status for display
 */
export async function getMigrationStatus(): Promise<{
  status: string
  started_at: number | null
  completed_at: number | null
  last_error: string | null
  progress: {
    conversations: number
    skills: number
    plugins: number
    api_keys: number
    sessions: number
  }
} | null> {
  const state = await getMigrationState()
  if (!state) return null

  return {
    status: state.status,
    started_at: state.started_at,
    completed_at: state.completed_at,
    last_error: state.last_error,
    progress: {
      conversations: state.conversations_migrated,
      skills: state.skills_migrated,
      plugins: state.plugins_migrated,
      api_keys: state.api_keys_migrated,
      sessions: state.sessions_migrated,
    },
  }
}

//=============================================================================
// IndexedDB Helpers
//=============================================================================

/**
 * Check if an IndexedDB database exists
 */
async function dbExists(name: string): Promise<boolean> {
  try {
    const databases = await indexedDB.databases()
    return databases.some((db) => db.name === name)
  } catch {
    // Fallback: try to open and check if it's a new database
    return new Promise((resolve) => {
      const request = indexedDB.open(name)
      request.onupgradeneeded = () => {
        // Database doesn't exist (would be created)
        request.transaction?.abort()
        resolve(false)
      }
      request.onsuccess = () => {
        // Database exists
        request.result.close()
        resolve(true)
      }
      request.onerror = () => resolve(false)
    })
  }
}

/**
 * Open IndexedDB by name (only if it exists)
 */
async function openDB(name: string, version: number): Promise<IDBDatabase | null> {
  const exists = await dbExists(name)
  if (!exists) {
    return null
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * Get all records from an IndexedDB store
 * Returns empty array if store doesn't exist (graceful degradation for fresh installs)
 */
async function getAllFromStore(db: IDBDatabase | null, storeName: string): Promise<unknown[]> {
  if (!db) {
    return []
  }
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    } catch (error) {
      // Store doesn't exist - return empty array
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        resolve([])
      } else {
        reject(error)
      }
    }
  })
}

//=============================================================================
// Migration Functions
//=============================================================================

/**
 * Migrate conversations from IndexedDB to SQLite
 */
async function migrateConversations(onProgress?: MigrationProgressCallback): Promise<number> {
  onProgress?.({ step: 'conversations', total: 1, current: 0, details: 'Opening IndexedDB...' })

  const db = await openDB('bfosa-conversations', 1)
  const records = (await getAllFromStore(db, 'conversations')) as Array<{
    id: string
    title: string
    messages: unknown[]
    createdAt: number
    updatedAt: number
  }>

  // No existing data to migrate
  if (!db || records.length === 0) {
    console.log('[Migration] No conversations to migrate')
    return 0
  }

  onProgress?.({
    step: 'conversations',
    total: records.length,
    current: 0,
    details: 'Migrating...',
  })

  const repo = getConversationRepository()
  let count = 0

  for (const record of records) {
    await repo.save({
      id: record.id,
      title: record.title,
      messages: record.messages,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
    count++
    onProgress?.({
      step: 'conversations',
      total: records.length,
      current: count,
      details: `Migrated ${count}/${records.length}`,
    })
  }

  db.close()
  return count
}

/**
 * Migrate skills from IndexedDB to SQLite
 */
async function migrateSkills(onProgress?: MigrationProgressCallback): Promise<number> {
  onProgress?.({ step: 'skills', total: 1, current: 0, details: 'Opening IndexedDB...' })

  const db = await openDB('bfosa-skills', 1)
  const records = (await getAllFromStore(db, 'skills')) as Array<{
    id: string
    name: string
    version: string
    description: string
    author: string
    category: string
    tags: string[]
    source: string
    triggers: string[]
    instruction: string
    examples: unknown[]
    templates: unknown[]
    rawContent: string
    enabled: boolean
    createdAt: number
    updatedAt: number
  }>

  // No existing data to migrate
  if (!db || records.length === 0) {
    console.log('[Migration] No skills to migrate')
    return 0
  }

  onProgress?.({ step: 'skills', total: records.length, current: 0, details: 'Migrating...' })

  const repo = getSkillRepository()
  let count = 0

  for (const record of records) {
    await repo.save({
      id: record.id,
      name: record.name,
      version: record.version,
      description: record.description,
      author: record.author,
      category: record.category as any,
      tags: record.tags,
      source: record.source as any,
      triggers: { keywords: record.triggers || [] },
      instruction: record.instruction,
      examples: record.examples ? JSON.stringify(record.examples) : undefined,
      templates: record.templates ? JSON.stringify(record.templates) : undefined,
      rawContent: record.rawContent,
      enabled: record.enabled,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    } as StoredSkill)
    count++
    onProgress?.({
      step: 'skills',
      total: records.length,
      current: count,
      details: `Migrated ${count}/${records.length}`,
    })
  }

  db.close()
  return count
}

/**
 * Migrate plugins from IndexedDB to SQLite
 */
async function migratePlugins(onProgress?: MigrationProgressCallback): Promise<number> {
  onProgress?.({ step: 'plugins', total: 1, current: 0, details: 'Opening IndexedDB...' })

  const db = await openDB('bfosa-plugins', 1)
  const records = (await getAllFromStore(db, 'plugins')) as Array<{
    id: string
    metadata: {
      id: string
      name: string
      version: string
      api_version: string
      description: string
      author: string
      capabilities: unknown
      resource_limits: unknown
    }
    state: string
    loadedAt: number
  }>

  // No existing data to migrate
  if (!db || records.length === 0) {
    console.log('[Migration] No plugins to migrate')
    return 0
  }

  onProgress?.({ step: 'plugins', total: records.length, current: 0, details: 'Migrating...' })

  const repo = getPluginRepository()
  let count = 0

  for (const record of records) {
    await repo.save({
      id: record.metadata.id,
      name: record.metadata.name,
      version: record.metadata.version,
      apiVersion: record.metadata.api_version,
      description: record.metadata.description,
      author: record.metadata.author,
      capabilities: record.metadata.capabilities as any,
      resourceLimits: record.metadata.resource_limits as any,
      state: record.state as 'Loaded' | 'Unloaded' | 'Error',
      loadedAt: record.loadedAt,
      createdAt: record.loadedAt,
    })
    count++
    onProgress?.({
      step: 'plugins',
      total: records.length,
      current: count,
      details: `Migrated ${count}/${records.length}`,
    })
  }

  db.close()
  return count
}

/**
 * Migrate API keys from IndexedDB to SQLite
 *
 * Process:
 * 1. Read old encryption key from IndexedDB
 * 2. Decrypt API keys using old key
 * 3. Re-encrypt using new system and save to SQLite
 */
async function migrateApiKeys(onProgress?: MigrationProgressCallback): Promise<number> {
  onProgress?.({ step: 'api-keys', total: 1, current: 0, details: 'Opening IndexedDB...' })

  const db = await openDB('bfosa-security', 1)
  const allRecords = (await getAllFromStore(db, 'api-keys')) as Array<unknown>

  // No existing data to migrate
  if (!db || allRecords.length === 0) {
    console.log('[Migration] No API keys to migrate')
    return 0
  }

  onProgress?.({ step: 'api-keys', total: 1, current: 0, details: 'Reading encryption key...' })

  // The old system stored the key under the key name 'bfosa-device-key'
  // We need to get it from IndexedDB
  let oldEncryptionKey: CryptoKey | null = null
  try {
    const oldKeyData = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
      const tx = db.transaction('api-keys', 'readonly')
      const store = tx.objectStore('api-keys')
      const req = store.get('bfosa-device-key')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    if (oldKeyData) {
      oldEncryptionKey = await crypto.subtle.importKey(
        'raw',
        oldKeyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      )
    }
  } catch (error) {
    console.warn('[Migration] Could not load old encryption key:', error)
  }

  if (!oldEncryptionKey) {
    console.warn('[Migration] Old encryption key not found, skipping API key migration')
    db.close()
    return 0
  }

  onProgress?.({ step: 'api-keys', total: 1, current: 0, details: 'Migrating API keys...' })

  // Filter to get only API key records (they have 'provider' property)
  const apiKeyRecords = allRecords.filter(
    (r: any) => r && typeof r === 'object' && r.provider && r.iv && r.ciphertext
  ) as Array<{
    provider: string
    iv: number[]
    ciphertext: ArrayBuffer
  }>

  const repo = getApiKeyRepository()
  let count = 0
  let failed = 0

  for (const record of apiKeyRecords) {
    try {
      // Decrypt using old key
      const ivBuffer = new Uint8Array(record.iv).buffer
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
        oldEncryptionKey,
        record.ciphertext
      )
      const apiKey = new TextDecoder().decode(decrypted)

      // Re-encrypt using new system and save to SQLite
      await repo.save(record.provider, apiKey)

      count++
      onProgress?.({
        step: 'api-keys',
        total: apiKeyRecords.length,
        current: count,
        details: `Migrated ${count}/${apiKeyRecords.length}`,
      })
    } catch (error) {
      failed++
      console.warn(`[Migration] Failed to migrate API key for ${record.provider}:`, error)
    }
  }

  db.close()

  if (failed > 0) {
    console.warn(`[Migration] ${failed} API keys failed to migrate`)
  }

  return count
}

/**
 * Migrate OPFS session metadata to SQLite
 */
async function migrateSessions(onProgress?: MigrationProgressCallback): Promise<number> {
  onProgress?.({ step: 'sessions', total: 1, current: 0, details: 'Reading OPFS sessions...' })

  try {
    const opfsRoot = await navigator.storage.getDirectory()
    const sessionsDir = await opfsRoot.getDirectoryHandle('sessions')

    // Read sessions.json index file
    const indexFile = await sessionsDir.getFileHandle('sessions.json')
    const indexContent = await (await indexFile.getFile()).text()
    const sessions = JSON.parse(indexContent) as Array<{
      sessionId: string
      rootDirectory: string
      name: string
      createdAt: number
      lastAccessedAt: number
      cacheSize: number
      pendingCount: number
      undoCount: number
      modifiedFiles: number
      status: 'active' | 'archived'
    }>

    onProgress?.({ step: 'sessions', total: sessions.length, current: 0, details: 'Migrating...' })

    const repo = getSessionRepository()
    let count = 0

    for (const session of sessions) {
      await repo.createSession({
        id: session.sessionId,
        rootDirectory: session.rootDirectory,
        name: session.name,
        status: session.status,
        cacheSize: session.cacheSize,
        pendingCount: session.pendingCount,
        undoCount: session.undoCount,
        modifiedFiles: session.modifiedFiles,
      })
      count++
      onProgress?.({
        step: 'sessions',
        total: sessions.length,
        current: count,
        details: `Migrated ${count}/${sessions.length}`,
      })
    }

    return count
  } catch (error) {
    console.warn('[Migration] No existing sessions found:', error)
    return 0
  }
}

//=============================================================================
// Migration State Management
//=============================================================================

interface MigrationState {
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back'
  started_at: number | null
  completed_at: number | null
  last_error: string | null
  conversations_migrated: number
  skills_migrated: number
  plugins_migrated: number
  api_keys_migrated: number
  sessions_migrated: number
}

/**
 * Get the current migration state from SQLite
 */
async function getMigrationState(): Promise<MigrationState | null> {
  try {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{
      status: string
      started_at: number | null
      completed_at: number | null
      last_error: string | null
      conversations_migrated: number
      skills_migrated: number
      plugins_migrated: number
      api_keys_migrated: number
      sessions_migrated: number
    }>('SELECT * FROM idb_migration_state WHERE singleton_id = 0')

    if (!row) return null

    return {
      status: row.status as MigrationState['status'],
      started_at: row.started_at,
      completed_at: row.completed_at,
      last_error: row.last_error,
      conversations_migrated: row.conversations_migrated,
      skills_migrated: row.skills_migrated,
      plugins_migrated: row.plugins_migrated,
      api_keys_migrated: row.api_keys_migrated,
      sessions_migrated: row.sessions_migrated,
    }
  } catch {
    return null
  }
}

/**
 * Update the migration state
 */
async function updateMigrationState(updates: Partial<MigrationState>): Promise<void> {
  const db = getSQLiteDB()

  const fields: string[] = []
  const values: unknown[] = []

  if (updates.status !== undefined) {
    fields.push('status = ?')
    values.push(updates.status)
  }
  if (updates.started_at !== undefined) {
    fields.push('started_at = ?')
    values.push(updates.started_at)
  }
  if (updates.completed_at !== undefined) {
    fields.push('completed_at = ?')
    values.push(updates.completed_at)
  }
  if (updates.last_error !== undefined) {
    fields.push('last_error = ?')
    values.push(updates.last_error)
  }
  if (updates.conversations_migrated !== undefined) {
    fields.push('conversations_migrated = ?')
    values.push(updates.conversations_migrated)
  }
  if (updates.skills_migrated !== undefined) {
    fields.push('skills_migrated = ?')
    values.push(updates.skills_migrated)
  }
  if (updates.plugins_migrated !== undefined) {
    fields.push('plugins_migrated = ?')
    values.push(updates.plugins_migrated)
  }
  if (updates.api_keys_migrated !== undefined) {
    fields.push('api_keys_migrated = ?')
    values.push(updates.api_keys_migrated)
  }
  if (updates.sessions_migrated !== undefined) {
    fields.push('sessions_migrated = ?')
    values.push(updates.sessions_migrated)
  }

  if (fields.length > 0) {
    await db.execute(
      `UPDATE idb_migration_state SET ${fields.join(', ')} WHERE singleton_id = 0`,
      values
    )
  }
}

/**
 * Rollback migration by clearing all migrated data
 */
async function rollbackMigration(_state: MigrationState): Promise<void> {
  console.warn('[Migration] Rolling back migration due to failure...')

  const db = getSQLiteDB()

  // Clear all data that might have been partially migrated
  await db.execute('DELETE FROM conversations')
  await db.execute('DELETE FROM skills')
  await db.execute('DELETE FROM plugins')
  await db.execute('DELETE FROM api_keys')
  await db.execute('DELETE FROM sessions')

  // Reset migration state
  await updateMigrationState({
    status: 'rolled_back',
    completed_at: Date.now(),
  })

  console.log('[Migration] Rollback complete')
}

/**
 * Check if there's a failed migration that needs rollback
 */
async function hasFailedMigration(): Promise<boolean> {
  const state = await getMigrationState()
  return state?.status === 'failed' || state?.status === 'in_progress'
}

/**
 * Check if migration was previously completed
 */
async function isMigrationCompleted(): Promise<boolean> {
  const state = await getMigrationState()
  return state?.status === 'completed'
}

//=============================================================================
// Main Migration Function
//=============================================================================

export interface MigrationResult {
  conversations: number
  skills: number
  plugins: number
  apiKeys: number
  sessions: number
  success: boolean
  rolled_back?: boolean
  error?: string
}

/**
 * Run full migration from IndexedDB to SQLite
 * with transaction support and automatic rollback on failure
 */
export async function runMigration(
  onProgress?: MigrationProgressCallback
): Promise<MigrationResult> {
  const result: MigrationResult = {
    conversations: 0,
    skills: 0,
    plugins: 0,
    apiKeys: 0,
    sessions: 0,
    success: false,
  }

  try {
    // Check if there's a failed migration from a previous attempt
    if (await hasFailedMigration()) {
      const state = await getMigrationState()
      console.warn('[Migration] Previous migration failed, rolling back first...')
      await rollbackMigration(state!)
      onProgress?.({
        step: 'rollback',
        total: 1,
        current: 1,
        details: 'Rolled back previous failed migration',
      })
    }

    // Check if migration was already completed
    if (await isMigrationCompleted()) {
      console.log('[Migration] Already completed, skipping')
      const state = await getMigrationState()
      return {
        ...result,
        conversations: state!.conversations_migrated,
        skills: state!.skills_migrated,
        plugins: state!.plugins_migrated,
        apiKeys: state!.api_keys_migrated,
        sessions: state!.sessions_migrated,
        success: true,
      }
    }

    // Initialize SQLite
    onProgress?.({ step: 'init', total: 1, current: 0, details: 'Initializing SQLite...' })
    await initSQLiteDB()

    // Mark migration as in progress
    await updateMigrationState({
      status: 'in_progress',
      started_at: Date.now(),
    })

    // Run each migration step
    result.conversations = await migrateConversations(onProgress)
    await updateMigrationState({ conversations_migrated: result.conversations })

    result.skills = await migrateSkills(onProgress)
    await updateMigrationState({ skills_migrated: result.skills })

    result.plugins = await migratePlugins(onProgress)
    await updateMigrationState({ plugins_migrated: result.plugins })

    result.apiKeys = await migrateApiKeys(onProgress)
    await updateMigrationState({ api_keys_migrated: result.apiKeys })

    result.sessions = await migrateSessions(onProgress)
    await updateMigrationState({ sessions_migrated: result.sessions })

    // Mark migration as completed
    await updateMigrationState({
      status: 'completed',
      completed_at: Date.now(),
    })

    result.success = true

    onProgress?.({ step: 'complete', total: 1, current: 1, details: 'Migration complete!' })

    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[Migration] Failed:', error)

    // Mark migration as failed
    await updateMigrationState({
      status: 'failed',
      last_error: errorMsg,
    })

    // Rollback the partial migration
    try {
      const currentState = await getMigrationState()
      if (currentState) {
        await rollbackMigration(currentState)
      }
    } catch (rollbackError) {
      console.error('[Migration] Rollback failed:', rollbackError)
    }

    return {
      conversations: 0,
      skills: 0,
      plugins: 0,
      apiKeys: 0,
      sessions: 0,
      success: false,
      rolled_back: true,
      error: errorMsg,
    }
  }
}

/**
 * Check if migration is needed
 *
 * Migration is needed if:
 * 1. IndexedDB has data AND SQLite doesn't have migrated data
 * 2. A previous migration was not completed (failed, in_progress, or rolled_back)
 */
export async function needsMigration(): Promise<boolean> {
  try {
    // First check if there's a migration state
    const db = getSQLiteDB()
    const migrationState = await db.queryFirst<{
      status: string
      conversations_migrated: number
    }>('SELECT status, conversations_migrated FROM idb_migration_state WHERE singleton_id = 0')

    // If we have a migration state that's not 'completed', migration is needed
    if (migrationState) {
      if (migrationState.status === 'completed') {
        return false // Already completed
      }
      // Failed, in_progress, rolled_back, or pending -> need to migrate
      console.log('[Migration] Previous migration state:', migrationState.status, '- retry needed')
      return true
    }

    // No migration state found - check old way
    // Check if any IndexedDB databases exist
    const hasConversations = await indexedDB
      .databases()
      .then((dbs) => dbs.some((db) => db.name === 'bfosa-conversations'))
    const hasSkills = await indexedDB
      .databases()
      .then((dbs) => dbs.some((db) => db.name === 'bfosa-skills'))
    const hasPlugins = await indexedDB
      .databases()
      .then((dbs) => dbs.some((db) => db.name === 'bfosa-plugins'))
    const hasSecurity = await indexedDB
      .databases()
      .then((dbs) => dbs.some((db) => db.name === 'bfosa-security'))

    // Check if SQLite has any data
    const sqliteHasData =
      (await db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM conversations'))
        ?.count || 0 > 0

    // Migration needed if IndexedDB has data but SQLite doesn't
    return (hasConversations || hasSkills || hasPlugins || hasSecurity) && !sqliteHasData
  } catch {
    return false
  }
}
