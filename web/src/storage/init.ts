/**
 * Application Storage Initialization
 *
 * Handles SQLite initialization and data migration on app startup.
 *
 * Usage:
 * ```ts
 * import { initStorage } from '@/storage/init'
 *
 * await initStorage({ onProgress: (p) => console.log(p) })
 * ```
 */

import { initSQLiteDB, needsMigration, runMigration, type MigrationProgress } from '@/sqlite'

//=============================================================================
// Types
//=============================================================================

export type StorageMode = 'sqlite-opfs' | 'sqlite-memory' | 'indexeddb-fallback'

export interface InitStorageOptions {
  /**
   * Progress callback for migration
   */
  onProgress?: (progress: MigrationProgress) => void

  /**
   * Force migration even if not needed
   */
  forceMigration?: boolean

  /**
   * Allow fallback to IndexedDB if SQLite fails
   * @default true
   */
  allowFallback?: boolean
}

export interface InitStorageResult {
  success: boolean
  migrated: boolean
  mode: StorageMode
  migrationResult?: {
    conversations: number
    skills: number
    plugins: number
    apiKeys: number
    sessions: number
  }
  error?: string
}

//=============================================================================
// OPFS Detection
//=============================================================================

/**
 * Check if OPFS (Origin Private File System) is available
 *
 * Note: This is a basic check. The actual OPFS VFS availability
 * is determined by the SQLite worker during initialization.
 */
export function isOPFSAvailable(): boolean {
  return 'opfs' in navigator && 'getDirectory' in (navigator as any).opfs
}

/**
 * Check if SharedArrayBuffer is available (required for SQLite WASM OPFS VFS)
 * This requires COOP/COEP headers which must be set on the server
 *
 * Note: Even if this returns false in the main thread, the worker
 * may still have access if the server headers are properly configured.
 */
export function isSharedArrayBufferAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}

/**
 * Check if SQLite WASM can run with OPFS VFS
 *
 * This is a preliminary check. The actual availability is confirmed
 * during worker initialization.
 */
export function canUseOPFSVFS(): boolean {
  // Be optimistic - let the worker determine actual OPFS availability
  // The main thread check may not be accurate due to security contexts
  return true
}

//=============================================================================
// Storage Mode State
//=============================================================================

let currentStorageMode: StorageMode = 'sqlite-opfs'
let storageInitPromise: Promise<InitStorageResult> | null = null

/**
 * Get the current storage mode
 */
export function getStorageMode(): StorageMode {
  return currentStorageMode
}

//=============================================================================
// Initialization
//=============================================================================

/**
 * Initialize application storage
 *
 * 1. Checks if OPFS VFS is available
 * 2. Initializes SQLite database with OPFS VFS or falls back to in-memory
 * 3. Runs migration if needed (IndexedDB → SQLite)
 *
 * Note: With @sqlite.org/sqlite-wasm OpfsDb, all changes are
 * automatically persisted to OPFS - no manual save needed.
 */
export async function initStorage(options: InitStorageOptions = {}): Promise<InitStorageResult> {
  // StrictMode guard: return existing promise if already initializing
  if (storageInitPromise) {
    return storageInitPromise
  }

  const { onProgress, forceMigration = false, allowFallback = true } = options

  onProgress?.({ step: 'init', total: 1, current: 0, details: 'Initializing SQLite...' })

  // Default to OPFS mode - worker will confirm or fallback
  currentStorageMode = 'sqlite-opfs'

  storageInitPromise = (async () => {
    try {
      // Initialize SQLite (worker will determine actual OPFS availability)
      await initSQLiteDB()

      // Update mode based on actual worker state
      // The worker will use OpfsDb if available, or in-memory DB as fallback
      onProgress?.({
        step: 'init',
        total: 1,
        current: 1,
        details: `SQLite initialized (${currentStorageMode})`,
      })

      // Check if migration is needed
      const needsMigrate = forceMigration || (await needsMigration())

      if (!needsMigrate) {
        onProgress?.({
          step: 'complete',
          total: 1,
          current: 1,
          details: 'Storage ready (no migration needed)',
        })
        // storageInitialized = true
        return { success: true, migrated: false, mode: currentStorageMode }
      }

      // Run migration
      onProgress?.({
        step: 'migration',
        total: 1,
        current: 0,
        details: 'Starting migration from IndexedDB...',
      })

      const migrationResult = await runMigration(onProgress)

      if (!migrationResult.success) {
        onProgress?.({
          step: 'error',
          total: 1,
          current: 0,
          details: 'Migration failed: ' + migrationResult.error,
        })
        storageInitPromise = null // Allow retry on migration failure
        return {
          success: false,
          migrated: false,
          mode: currentStorageMode,
          error: migrationResult.error,
        }
      }

      onProgress?.({
        step: 'complete',
        total: 1,
        current: 1,
        details: `Migration complete: ${migrationResult.conversations} conversations, ${migrationResult.skills} skills, ${migrationResult.plugins} plugins`,
      })

      // storageInitialized = true
      return {
        success: true,
        migrated: true,
        mode: currentStorageMode,
        migrationResult: {
          conversations: migrationResult.conversations,
          skills: migrationResult.skills,
          plugins: migrationResult.plugins,
          apiKeys: migrationResult.apiKeys,
          sessions: migrationResult.sessions,
        },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      // If SQLite initialization fails and fallback is allowed, we can still continue
      // The app will use IndexedDB for existing data
      if (allowFallback) {
        console.warn('[Storage] SQLite initialization failed, allowing app to continue:', errorMsg)
        currentStorageMode = 'indexeddb-fallback'

        onProgress?.({
          step: 'warning',
          total: 1,
          current: 1,
          details: 'SQLite unavailable, using existing IndexedDB storage',
        })

        // Return success=true so the app can continue
        // The old IndexedDB code paths will still work
        // storageInitialized = true
        return {
          success: true,
          migrated: false,
          mode: currentStorageMode,
        }
      }

      onProgress?.({
        step: 'error',
        total: 1,
        current: 0,
        details: 'Initialization failed: ' + errorMsg,
      })
      storageInitPromise = null // Allow retry on failure
      return {
        success: false,
        migrated: false,
        mode: currentStorageMode,
        error: errorMsg,
      }
    }
  })()

  return storageInitPromise
}

/**
 * Set up auto-save on page unload
 *
 * Note: With @sqlite.org/sqlite-wasm OpfsDb, all writes are automatically
 * persisted to OPFS. This function is kept for compatibility but does minimal work.
 */
export function setupAutoSave(): void {
  // OpfsDb with OPFS VFS handles persistence automatically
  // No manual save needed - writes are synced to OPFS immediately
  console.log('[Storage] Auto-save not needed - OpfsDb handles persistence automatically')
}

/**
 * Check storage status
 */
export interface StorageStatus {
  initialized: boolean
  needsMigration: boolean
  conversationCount: number
  skillCount: number
  pluginCount: number
}

export async function getStorageStatus(): Promise<StorageStatus> {
  try {
    const { getSQLiteDB } = await import('@/sqlite')
    const db = getSQLiteDB()

    const conversationCount =
      (await db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM conversations'))
        ?.count || 0

    const skillCount =
      (await db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM skills'))?.count || 0

    const pluginCount =
      (await db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM plugins'))?.count || 0

    const needsMigrate = await needsMigration()

    return {
      initialized: true,
      needsMigration: needsMigrate,
      conversationCount,
      skillCount,
      pluginCount,
    }
  } catch {
    return {
      initialized: false,
      needsMigration: true,
      conversationCount: 0,
      skillCount: 0,
      pluginCount: 0,
    }
  }
}

/**
 * Clear all storage (for testing/reset)
 */
export async function clearAllStorage(): Promise<void> {
  try {
    const { getSQLiteDB } = await import('@/sqlite')
    const db = getSQLiteDB()

    await db.execute('DELETE FROM conversations')
    await db.execute('DELETE FROM skills')
    await db.execute('DELETE FROM plugins')
    await db.execute('DELETE FROM api_keys')
    await db.execute('DELETE FROM sessions')
    await db.execute('DELETE FROM file_metadata')
    await db.execute('DELETE FROM pending_changes')
    await db.execute('DELETE FROM undo_records')
    await db.execute('DELETE FROM active_session')

    console.log('[Storage] All data cleared')
  } catch (error) {
    console.error('[Storage] Failed to clear storage:', error)
    throw error
  }
}

/**
 * Export storage to JSON (for backup)
 */
export async function exportStorage(): Promise<{
  conversations: unknown[]
  skills: unknown[]
  plugins: unknown[]
  sessions: unknown[]
}> {
  const { getSQLiteDB } = await import('@/sqlite')
  const db = getSQLiteDB()

  const [conversations, skills, plugins, sessions] = await Promise.all([
    db.queryAll('SELECT * FROM conversations'),
    db.queryAll('SELECT * FROM skills'),
    db.queryAll('SELECT * FROM plugins'),
    db.queryAll('SELECT * FROM sessions'),
  ])

  return {
    conversations,
    skills,
    plugins,
    sessions,
  }
}

/**
 * Import storage from JSON (for restore)
 */
export async function importStorage(data: {
  conversations?: unknown[]
  skills?: unknown[]
  plugins?: unknown[]
  sessions?: unknown[]
}): Promise<void> {
  const { getSQLiteDB } = await import('@/sqlite')
  const db = getSQLiteDB()

  // Import in transaction
  await db.beginTransaction()

  try {
    if (data.conversations) {
      for (const row of data.conversations) {
        await db.execute(
          'INSERT OR REPLACE INTO conversations (id, title, messages_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)',
          [
            (row as any).id,
            (row as any).title,
            (row as any).messages_json,
            (row as any).created_at,
            (row as any).updated_at,
          ]
        )
      }
    }

    if (data.skills) {
      for (const row of data.skills) {
        const skill = row as any
        await db.execute(
          `INSERT OR REPLACE INTO skills
           (id, name, version, description, author, category, tags, source, triggers,
            instruction, examples, templates, raw_content, enabled, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`,
          [
            skill.id,
            skill.name,
            skill.version,
            skill.description,
            skill.author,
            skill.category,
            skill.tags,
            skill.source,
            skill.triggers,
            skill.instruction,
            skill.examples,
            skill.templates,
            skill.raw_content,
            skill.enabled,
            skill.created_at,
            skill.updated_at,
          ]
        )
      }
    }

    if (data.plugins) {
      for (const row of data.plugins) {
        const plugin = row as any
        await db.execute(
          `INSERT OR REPLACE INTO plugins
           (id, name, version, api_version, description, author, capabilities_json,
            resource_limits_json, state, wasm_bytes, loaded_at, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
          [
            plugin.id,
            plugin.name,
            plugin.version,
            plugin.api_version,
            plugin.description,
            plugin.author,
            plugin.capabilities_json,
            plugin.resource_limits_json,
            plugin.state,
            plugin.wasm_bytes,
            plugin.loaded_at,
            plugin.created_at,
          ]
        )
      }
    }

    if (data.sessions) {
      for (const row of data.sessions) {
        const session = row as any
        await db.execute(
          `INSERT OR REPLACE INTO sessions
           (id, root_directory, name, status, cache_size, pending_count, undo_count,
            modified_files, created_at, last_accessed_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
          [
            session.id,
            session.root_directory,
            session.name,
            session.status,
            session.cache_size,
            session.pending_count,
            session.undo_count,
            session.modified_files,
            session.created_at,
            session.last_accessed_at,
          ]
        )
      }
    }

    await db.commit()
    console.log('[Storage] Import complete')
  } catch (error) {
    db.rollback()
    console.error('[Storage] Import failed:', error)
    throw error
  }
}
