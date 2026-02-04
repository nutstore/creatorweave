/**
 * SQLite Database Manager
 *
 * Unified storage using official SQLite WASM (@sqlite.org/sqlite-wasm) for:
 * - Conversations (chat history)
 * - Skills (skill definitions)
 * - Plugins (WASM plugin metadata)
 * - API Keys (encrypted)
 * - Sessions (OPFS workspace metadata)
 *
 * Uses native OPFS VFS for automatic persistence - no manual serialization needed.
 * Runs in a Worker thread because OPFS VFS requires Atomics.wait().
 *
 * @see https://sqlite.org/wasm/doc/trunk/index.md
 * @see https://sqlite.org/wasm/doc/trunk/persistence.md
 * @see https://github.com/sqlite/sqlite-wasm
 */

import schemaSQL from './sqlite-schema.sql?raw'
import type { WorkerRequest, WorkerResponse } from './sqlite-worker'

//=============================================================================
// Types
//=============================================================================

export interface ConversationRow {
  id: string
  title: string
  messages_json: string
  created_at: number
  updated_at: number
}

export interface SkillRow {
  id: string
  name: string
  version: string
  description: string | null
  author: string | null
  category: string
  tags: string // JSON array
  source: string
  triggers: string // JSON array
  instruction: string | null
  examples: string | null // JSON array
  templates: string | null // JSON array
  raw_content: string | null
  enabled: number // BOOLEAN (0 or 1)
  created_at: number
  updated_at: number
}

export interface PluginRow {
  id: string
  name: string
  version: string
  api_version: string
  description: string | null
  author: string | null
  capabilities_json: string // JSON object
  resource_limits_json: string // JSON object
  state: string
  wasm_bytes: Uint8Array | null
  loaded_at: number
  created_at: number
}

export interface ApiKeyRow {
  provider: string
  key_name: string
  iv: Uint8Array // BLOB stored as Uint8Array
  ciphertext: Uint8Array // BLOB stored as Uint8Array
  created_at: number
  updated_at: number
}

export interface SessionRow {
  id: string
  root_directory: string
  name: string
  status: 'active' | 'archived'
  cache_size: number
  pending_count: number
  undo_count: number
  modified_files: number
  created_at: number
  last_accessed_at: number
}

export interface FileMetadataRow {
  id: string
  session_id: string
  path: string
  mtime: number
  size: number
  content_type: 'text' | 'binary'
  hash: string | null
  created_at: number
  updated_at: number
}

export interface PendingChangeRow {
  id: string
  session_id: string
  path: string
  type: 'create' | 'modify' | 'delete'
  fs_mtime: number
  agent_message_id: string | null
  timestamp: number
}

export interface UndoRecordRow {
  id: string
  session_id: string
  path: string
  type: 'create' | 'modify' | 'delete'
  old_content_path: string | null
  new_content_path: string | null
  timestamp: number
  undone: number // BOOLEAN
}

//=============================================================================
// SQLite Worker Client
//=============================================================================

class SQLiteWorkerClient {
  private worker: Worker | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      request?: WorkerRequest // Store original request for retry
    }
  >()
  private requestId = 0
  private initializing = false // Guard for StrictMode double init
  private dbMode: 'opfs' | 'memory' | null = null
  private schemaSQL: string = '' // Store schema for recovery
  private recovering = false // Recovery in progress flag
  private recoveryCount = 0 // Track number of recovery attempts for diagnostics
  private lastRecoveryTime = 0 // Track when last recovery occurred
  private readonly RECOVERY_COOLDOWN = 5000 // Minimum 5 seconds between recoveries
  private readonly MAX_RECOVERIES_PER_HOUR = 5 // Prevent excessive recovery attempts

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise
    if (this.initializing) {
      // Wait for ongoing initialization
      while (this.initializing) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      return this.initPromise!
    }

    // Set guard immediately to prevent race conditions
    this.initializing = true

    this.initPromise = (async () => {
      try {
        // Wait for crossOriginIsolated to be true before creating worker
        if (!self.crossOriginIsolated) {
          const maxWait = 5000 // 5 seconds max
          const startTime = Date.now()
          while (!self.crossOriginIsolated && Date.now() - startTime < maxWait) {
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
          if (!self.crossOriginIsolated) {
            console.warn(
              '[SQLite] crossOriginIsolated is still false after waiting. OPFS VFS may not work.'
            )
          }
        }

        // Use the separate worker file instead of inline blob worker
        // Blob workers cannot resolve bare import specifiers like @sqlite.org/sqlite-wasm
        this.worker = new Worker(new URL('./sqlite-worker.ts', import.meta.url), {
          type: 'module',
        })

        // Set up message handler
        this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          const response = e.data
          const pending = this.pendingRequests.get(response.id)

          if (pending) {
            this.pendingRequests.delete(response.id)

            if (response.error) {
              // Check if this is a recoverable database error
              const isGetSyncHandleError = response.error.includes('GetSyncHandleError')
              const isCantOpen = response.error.includes('CANTOPEN')

              if (isGetSyncHandleError || isCantOpen) {
                const errorType = isGetSyncHandleError
                  ? 'GetSyncHandleError (stale handle)'
                  : 'CANTOPEN'
                console.warn(`[SQLite] Database error: ${errorType}. Attempting recovery...`)

                // Try to recover and retry the request
                // Note: handleRecovery now tries reconnection first before deleting
                this.handleRecovery()
                  .then(() => {
                    // Retry the original request after recovery
                    this.retryRequest(response.id)
                  })
                  .catch((recoveryError) => {
                    console.error('[SQLite] Recovery failed:', recoveryError)
                    pending.reject(new Error(response.error))
                  })
                return
              }
              pending.reject(new Error(response.error))
            } else {
              switch (response.type) {
                case 'init':
                  // Init response has success property and mode
                  this.dbMode = response.mode
                  pending.resolve(undefined)
                  break
                case 'queryAll':
                  pending.resolve((response as { type: 'queryAll'; rows: unknown[] }).rows)
                  break
                case 'queryFirst':
                  pending.resolve((response as { type: 'queryFirst'; row: unknown | null }).row)
                  break
                case 'execute':
                case 'beginTransaction':
                case 'commit':
                case 'rollback':
                case 'close':
                case 'recover':
                  pending.resolve(undefined)
                  break
                case 'getMode':
                  pending.resolve(response.mode)
                  break
                default:
                  // Unknown response type - resolve anyway
                  pending.resolve(undefined)
              }
            }
          }
        }

        // Enhanced error handler with more details
        this.worker.onerror = (error) => {
          const errorMessage = error.message || 'Unknown worker error'
          console.error('[SQLite] Worker error:', {
            message: errorMessage,
            filename: error.filename,
            lineno: error.lineno,
            colno: error.colno,
            error: error.error,
          })
          // Prevent the error from propagating to the global error handler
          error.preventDefault()
        }

        // Store schema for recovery
        this.schemaSQL = schemaSQL

        // Initialize the worker with extended timeout
        await this.sendRequest<unknown>({ type: 'init', schemaSQL }, 120000) // 2 minutes

        this.initialized = true
        this.initializing = false
      } catch (error) {
        console.error('[SQLite] Failed to initialize worker:', error)
        this.initPromise = null
        this.initializing = false
        throw error
      }
    })()

    return this.initPromise
  }

  private sendRequest<T>(request: WorkerRequest, timeout: number = 30000): Promise<T> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not initialized'))
    }

    const id = request.id ?? `req-${++this.requestId}`

    return new Promise<T>((resolve, reject) => {
      // Store original request for potential retry after recovery
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        request: { ...request, id },
      })
      this.worker!.postMessage({ ...request, id })

      // Use the provided timeout or default to 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`Request timeout: ${request.type}`))
        }
      }, timeout)
    })
  }

  queryAll<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.sendRequest<T[]>({ type: 'queryAll', sql, params, id: `queryAll-${Date.now()}` })
  }

  queryFirst<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    return this.sendRequest<T | null>({
      type: 'queryFirst',
      sql,
      params,
      id: `queryFirst-${Date.now()}`,
    })
  }

  execute(sql: string, params: unknown[] = []): Promise<void> {
    return this.sendRequest<void>({ type: 'execute', sql, params, id: `execute-${Date.now()}` })
  }

  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.sendRequest<void>({ type: 'beginTransaction', id: `txn-begin-${Date.now()}` })
    try {
      const result = await callback()
      await this.sendRequest<void>({ type: 'commit', id: `txn-commit-${Date.now()}` })
      return result
    } catch (error) {
      await this.sendRequest<void>({ type: 'rollback', id: `txn-rollback-${Date.now()}` })
      throw error
    }
  }

  beginTransaction(): Promise<void> {
    return this.sendRequest<void>({ type: 'beginTransaction', id: `begin-${Date.now()}` })
  }

  commit(): Promise<void> {
    return this.sendRequest<void>({ type: 'commit', id: `commit-${Date.now()}` })
  }

  rollback(): Promise<void> {
    return this.sendRequest<void>({ type: 'rollback', id: `rollback-${Date.now()}` })
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.sendRequest<void>({ type: 'close', id: `close-${Date.now()}` })
      this.worker.terminate()
      this.worker = null
      this.initialized = false
      this.initPromise = null
      this.dbMode = null
      console.log('[SQLite] Worker closed')
    }
  }

  /** Get the current database mode (opfs or memory) */
  getMode(): 'opfs' | 'memory' | null {
    return this.dbMode
  }

  /**
   * Handle database recovery when CANTOPEN errors occur
   *
   * Recovery strategy with cooldown and limits:
   * 1. Check cooldown period to prevent rapid successive recoveries
   * 2. Check recovery count to detect chronic issues
   * 3. Send recover request to worker (which tries reconnection first)
   */
  private async handleRecovery(): Promise<void> {
    if (this.recovering) {
      // Already recovering, wait for it to complete
      while (this.recovering) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return
    }

    // Check cooldown period
    const now = Date.now()
    const timeSinceLastRecovery = now - this.lastRecoveryTime
    if (timeSinceLastRecovery < this.RECOVERY_COOLDOWN) {
      const waitTime = this.RECOVERY_COOLDOWN - timeSinceLastRecovery
      console.warn(`[SQLite] Recovery cooldown active, waiting ${waitTime}ms...`)
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    // Check recovery count - prevent excessive recovery attempts
    const oneHourAgo = now - 3600000
    if (this.lastRecoveryTime > oneHourAgo && this.recoveryCount >= this.MAX_RECOVERIES_PER_HOUR) {
      console.error(
        `[SQLite] Too many recovery attempts (${this.recoveryCount} in the last hour). ` +
          'This may indicate a chronic issue. Please refresh the page or check browser console.'
      )
      throw new Error('Excessive recovery attempts detected. Please refresh the page.')
    }

    this.recovering = true
    this.recoveryCount++
    this.lastRecoveryTime = Date.now()

    console.log(`[SQLite] Starting database recovery (attempt #${this.recoveryCount})...`)

    try {
      // Send recover request to worker
      // Note: Worker now tries reconnection first before deleting database
      await this.sendRequest<void>({
        type: 'recover',
        schemaSQL: this.schemaSQL,
        id: `recover-${Date.now()}`,
      })
      console.log('[SQLite] Database recovery completed')
    } catch (error) {
      console.error('[SQLite] Database recovery failed:', error)
      throw error
    } finally {
      this.recovering = false
    }
  }

  /** Get recovery statistics for diagnostics */
  getRecoveryStats(): {
    count: number
    lastRecoveryTime: number
    lastRecoveryDate: Date | null
    cooldownRemaining: number
  } {
    const now = Date.now()
    const cooldownRemaining = Math.max(0, this.RECOVERY_COOLDOWN - (now - this.lastRecoveryTime))
    return {
      count: this.recoveryCount,
      lastRecoveryTime: this.lastRecoveryTime,
      lastRecoveryDate: this.lastRecoveryTime > 0 ? new Date(this.lastRecoveryTime) : null,
      cooldownRemaining,
    }
  }

  /**
   * Retry a request after recovery
   */
  private retryRequest(id: string): void {
    const pending = this.pendingRequests.get(id)
    if (!pending || !pending.request) return

    // Resend the original request
    this.worker!.postMessage({ ...pending.request, id })
  }
}

//=============================================================================
// Singleton Database Manager
//=============================================================================

class SQLiteDatabaseManager {
  private static instance: SQLiteDatabaseManager | null = null
  private workerClient: SQLiteWorkerClient | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null
  private initializing = false // Guard for StrictMode double init

  private constructor() {}

  static getInstance(): SQLiteDatabaseManager {
    if (!SQLiteDatabaseManager.instance) {
      SQLiteDatabaseManager.instance = new SQLiteDatabaseManager()
    }
    return SQLiteDatabaseManager.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise
    if (this.initializing) {
      // Wait for ongoing initialization
      while (this.initializing) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      return this.initPromise!
    }

    this.initializing = true

    this.initPromise = (async () => {
      try {
        if (!this.workerClient) {
          this.workerClient = new SQLiteWorkerClient()
        }
        await this.workerClient.initialize()
        this.initialized = true
        this.initializing = false
      } catch (error) {
        console.error('[SQLite] Failed to initialize:', error)
        this.initPromise = null
        this.initializing = false
        throw error
      }
    })()

    return this.initPromise
  }

  /**
   * Execute a query and return all rows
   */
  async queryAll<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.workerClient) throw new Error('Database not initialized')
    return this.workerClient.queryAll<T>(sql, params)
  }

  /**
   * Execute a query and return first row
   */
  async queryFirst<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    if (!this.workerClient) throw new Error('Database not initialized')
    return this.workerClient.queryFirst<T>(sql, params)
  }

  /**
   * Execute a statement (INSERT, UPDATE, DELETE)
   */
  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.workerClient) throw new Error('Database not initialized')
    return this.workerClient.execute(sql, params)
  }

  /**
   * Execute multiple statements in a transaction
   */
  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    if (!this.workerClient) throw new Error('Database not initialized')
    return this.workerClient.transaction(callback)
  }

  /**
   * Begin transaction
   */
  async beginTransaction(): Promise<void> {
    if (!this.workerClient) throw new Error('Database not initialized')
    return this.workerClient.beginTransaction()
  }

  /**
   * Commit transaction
   */
  async commit(): Promise<void> {
    if (!this.workerClient) throw new Error('Database not initialized')
    return this.workerClient.commit()
  }

  /**
   * Rollback transaction
   */
  async rollback(): Promise<void> {
    if (!this.workerClient) throw new Error('Database not initialized')
    return this.workerClient.rollback()
  }

  /**
   * Close database
   */
  async close(): Promise<void> {
    if (this.workerClient) {
      await this.workerClient.close()
      this.workerClient = null
      this.initialized = false
      this.initPromise = null
    }
  }

  /**
   * Delete the OPFS database file and reset state
   * Call this to clear all data and start fresh
   */
  async deleteDatabase(): Promise<void> {
    await this.close()

    // Use the SQLite WASM OPFS API to delete the database
    try {
      const sqlite3 = await import('@sqlite.org/sqlite-wasm').then((m) => m.default())
      // @ts-ignore - opfs may not be in types
      if (sqlite3.opfs && sqlite3.opfs.deleteDatabase) {
        // @ts-ignore
        await sqlite3.opfs.deleteDatabase('/bfosa-unified.sqlite')
        console.log('[SQLite] Database deleted via OPFS API')
      }
    } catch (error) {
      console.warn('[SQLite] Error deleting database via OPFS API:', error)
    }

    // Also reset in-memory fallback
    this.initialized = false
    this.initPromise = null
  }

  /**
   * Get the current database mode (opfs or memory)
   */
  getMode(): 'opfs' | 'memory' | null {
    return this.workerClient?.getMode() ?? null
  }

  /**
   * Get recovery statistics for diagnostics
   * Useful for debugging database connection issues
   */
  getRecoveryStats(): {
    count: number
    lastRecoveryTime: number
    lastRecoveryDate: Date | null
    cooldownRemaining: number
  } | null {
    return this.workerClient?.getRecoveryStats() ?? null
  }
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Get the SQLite database manager instance
 */
export function getSQLiteDB(): SQLiteDatabaseManager {
  return SQLiteDatabaseManager.getInstance()
}

/**
 * Initialize SQLite database
 */
export async function initSQLiteDB(): Promise<void> {
  return getSQLiteDB().initialize()
}

/**
 * Reset SQLite database - deletes all data and recreates schema
 * Call this from browser console to fix schema errors: window.__resetSQLiteDB()
 */
export async function resetSQLiteDB(): Promise<void> {
  console.log('[SQLite] Resetting database...')
  await getSQLiteDB().deleteDatabase()
  console.log('[SQLite] Database deleted. Reloading page to recreate...')
  window.location.reload()
}

/**
 * Get SQLite recovery statistics for diagnostics
 * Call this from browser console: window.__getSQLiteRecoveryStats()
 */
export function getSQLiteRecoveryStats(): {
  count: number
  lastRecoveryTime: number
  lastRecoveryDate: Date | null
  cooldownRemaining: number
} | null {
  return getSQLiteDB().getRecoveryStats()
}

// Make functions available globally for debugging
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.__resetSQLiteDB = resetSQLiteDB
  // @ts-ignore
  window.__getSQLiteRecoveryStats = getSQLiteRecoveryStats
}

/**
 * Parse JSON column safely
 */
export function parseJSON<T = unknown>(value: string | null, defaultValue: T): T {
  if (!value) return defaultValue
  try {
    return JSON.parse(value) as T
  } catch {
    return defaultValue
  }
}

/**
 * Serialize to JSON
 */
export function toJSON(value: unknown): string {
  return JSON.stringify(value)
}

/**
 * Boolean to integer
 */
export function boolToInt(value: boolean): number {
  return value ? 1 : 0
}

/**
 * Integer to boolean
 */
export function intToBool(value: number): boolean {
  return value !== 0
}

/**
 * Generate ID
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 9)
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`
}

export { SQLiteDatabaseManager }
