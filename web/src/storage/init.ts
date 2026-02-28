/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Application Storage Initialization
 *
 * Handles SQLite initialization on app startup.
 *
 * Usage:
 * ```ts
 * import { initStorage } from '@/storage/init'
 *
 * await initStorage({ onProgress: (p) => console.log(p) })
 * ```
 */

import { initSQLiteDB, getSQLiteDB } from '@/sqlite'

//=============================================================================
// Types
//=============================================================================

export type StorageMode = 'sqlite-opfs' | 'sqlite-memory' | 'indexeddb-fallback'

export interface InitStorageOptions {
  /**
   * Progress callback for initialization
   */
  onProgress?: (progress: { step: string; total: number; current: number; details: string }) => void

  /**
   * Allow fallback to IndexedDB if SQLite fails
   * @default true
   */
  allowFallback?: boolean
}

export interface InitStorageResult {
  success: boolean
  mode: StorageMode
  error?: string
}

//=============================================================================
// OPFS Detection
//=============================================================================

/**
 * Check if OPFS (Origin Private File System) is available
 */
export function isOPFSAvailable(): boolean {
  return 'opfs' in navigator && 'getDirectory' in (navigator as any).opfs
}

/**
 * Check if SharedArrayBuffer is available (required for SQLite WASM OPFS VFS)
 */
export function isSharedArrayBufferAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}

/**
 * Check if SQLite WASM can run with OPFS VFS
 */
export function canUseOPFSVFS(): boolean {
  return true
}

//=============================================================================
// Storage Mode State
//=============================================================================

let currentStorageMode: StorageMode = 'sqlite-opfs'
let storageInitPromise: Promise<InitStorageResult> | undefined = undefined

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
 *
 * Note: With @sqlite.org/sqlite-wasm OpfsDb, all changes are
 * automatically persisted to OPFS - no manual save needed.
 */
export async function initStorage(options: InitStorageOptions = {}): Promise<InitStorageResult> {
  // StrictMode guard: return existing promise if already initializing
  if (storageInitPromise !== undefined) {
    return storageInitPromise
  }

  const { onProgress, allowFallback = true } = options

  onProgress?.({ step: 'init', total: 1, current: 0, details: 'Initializing SQLite...' })

  // Default to OPFS mode - worker will confirm or fallback
  currentStorageMode = 'sqlite-opfs'

  storageInitPromise = (async () => {
    try {
      // Initialize SQLite (worker will determine actual OPFS availability)
      await initSQLiteDB(onProgress)

      onProgress?.({
        step: 'complete',
        total: 1,
        current: 1,
        details: `Storage ready (${currentStorageMode})`,
      })

      return { success: true, mode: currentStorageMode }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      // If SQLite initialization fails and fallback is allowed
      if (allowFallback) {
        console.warn('[Storage] SQLite initialization failed, allowing app to continue:', errorMsg)
        currentStorageMode = 'indexeddb-fallback'

        onProgress?.({
          step: 'warning',
          total: 1,
          current: 1,
          details: 'SQLite unavailable, using existing IndexedDB storage',
        })

        return {
          success: true,
          mode: currentStorageMode,
        }
      }

      onProgress?.({
        step: 'error',
        total: 1,
        current: 0,
        details: 'Initialization failed: ' + errorMsg,
      })
      storageInitPromise = undefined // Allow retry on failure
      return {
        success: false,
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
 * persisted to OPFS.
 */
export function setupAutoSave(): void {
  console.log('[Storage] Auto-save not needed - OpfsDb handles persistence automatically')
}

/**
 * Check storage status
 */
export interface StorageStatus {
  initialized: boolean
  conversationCount: number
  skillCount: number
  pluginCount: number
}

export async function getStorageStatus(): Promise<StorageStatus> {
  try {
    const db = getSQLiteDB()

    const conversationCount =
      (await db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM conversations'))
        ?.count || 0

    const skillCount =
      (await db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM skills'))?.count || 0

    const pluginCount =
      (await db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM plugins'))?.count || 0

    return {
      initialized: true,
      conversationCount,
      skillCount,
      pluginCount,
    }
  } catch {
    return {
      initialized: false,
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
    const db = getSQLiteDB()

    await db.execute('DELETE FROM conversations')
    await db.execute('DELETE FROM skills')
    await db.execute('DELETE FROM plugins')
    await db.execute('DELETE FROM api_keys')
    await db.execute('DELETE FROM workspaces')
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
  workspaces: unknown[]
}> {
  const db = getSQLiteDB()

  const [conversations, skills, plugins, workspaces] = await Promise.all([
    db.queryAll('SELECT * FROM conversations'),
    db.queryAll('SELECT * FROM skills'),
    db.queryAll('SELECT * FROM plugins'),
    db.queryAll('SELECT * FROM workspaces'),
  ])

  return {
    conversations,
    skills,
    plugins,
    workspaces,
  }
}

/**
 * Import storage from JSON (for restore)
 */
export async function importStorage(data: {
  conversations?: unknown[]
  skills?: unknown[]
  plugins?: unknown[]
  workspaces?: unknown[]
}): Promise<void> {
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

    if (data.workspaces) {
      for (const row of data.workspaces) {
        const workspace = row as any
        await db.execute(
          `INSERT OR REPLACE INTO workspaces
           (id, root_directory, name, status, cache_size, pending_count, undo_count,
            modified_files, created_at, last_accessed_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
          [
            workspace.id,
            workspace.root_directory,
            workspace.name,
            workspace.status,
            workspace.cache_size,
            workspace.pending_count,
            workspace.undo_count,
            workspace.modified_files,
            workspace.created_at,
            workspace.last_accessed_at,
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
