/**
 * SQLite Worker - Runs SQLite in a worker thread using opfs-sahpool VFS
 *
 * opfs-sahpool advantages over opfs VFS:
 * - Memory-mapped storage for faster reads/writes (2-5x faster)
 * - Better recovery from stale handles after tab sleep
 * - No file-level xLock issues
 * - Multiple reader support
 *
 * Requires Atomics.wait() which is only available in workers.
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { initializeSchema } from './migrations/index'

const DB_NAME = '/bfosa-unified.sqlite'
const SAHPOOL_NAME = 'bfosa-pool'

// Pool configuration: 1GB max, 4KB pages (same as SQLite default)
const POOL_CONFIG = {
  name: SAHPOOL_NAME,
  szPage: 4096,
  mxPages: 256 * 1024, // 1GB pool size
}

// Worker message types
export type WorkerRequest =
  | { type: 'init'; schemaSQL?: string; id?: string; reportProgress?: boolean }
  | { type: 'queryAll'; sql: string; params: unknown[]; id: string }
  | { type: 'queryFirst'; sql: string; params: unknown[]; id: string }
  | { type: 'execute'; sql: string; params: unknown[]; id: string }
  | { type: 'beginTransaction'; id: string }
  | { type: 'commit'; id: string }
  | { type: 'rollback'; id: string }
  | { type: 'close'; id: string }
  | { type: 'getMode'; id: string }
  | { type: 'recover'; id: string }

// Worker response types (used for type safety in message handling)
export type WorkerResponse =
  | { type: 'init'; id: string; success: boolean; mode: 'opfs' | 'memory'; error?: string }
  | { type: 'queryAll'; id: string; rows: unknown[]; error?: string }
  | { type: 'queryFirst'; id: string; row: unknown | null; error?: string }
  | { type: 'execute'; id: string; error?: string }
  | { type: 'beginTransaction'; id: string; error?: string }
  | { type: 'commit'; id: string; error?: string }
  | { type: 'rollback'; id: string; error?: string }
  | { type: 'close'; id: string; error?: string }
  | { type: 'getMode'; id: string; mode: 'opfs' | 'memory'; error?: string }
  | { type: 'recover'; id: string; success: boolean; error?: string }
  | { type: 'migrationProgress'; step: string; details: string; current: number; total: number }

let sqlite3: any = null
let db: any = null
let dbMode: 'opfs' | 'memory' = 'memory'

// Handle messages from main thread
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type } = e.data
  const id = 'id' in e.data ? (e.data.id as string) : `msg-${Date.now()}`

  try {
    switch (type) {
      case 'init':
        // schemaSQL parameter is ignored - we use the migration system instead
        await handleInit(e.data.reportProgress, id)
        postMessage({ type: 'init', id, success: true, mode: dbMode })
        break

      case 'recover':
        await handleRecover()
        postMessage({ type: 'recover', id, success: true })
        break

      case 'queryAll': {
        const rows = handleQueryAll(e.data.sql, e.data.params)
        postMessage({ type: 'queryAll', id, rows } as const)
        break
      }

      case 'queryFirst': {
        const row = handleQueryFirst(e.data.sql, e.data.params)
        postMessage({ type: 'queryFirst', id, row } as const)
        break
      }

      case 'execute':
        handleExecute(e.data.sql, e.data.params)
        postMessage({ type: 'execute', id } as const)
        break

      case 'beginTransaction':
        handleExecute('BEGIN TRANSACTION', [])
        postMessage({ type: 'beginTransaction', id } as const)
        break

      case 'commit':
        handleExecute('COMMIT', [])
        postMessage({ type: 'commit', id } as const)
        break

      case 'rollback':
        handleExecute('ROLLBACK', [])
        postMessage({ type: 'rollback', id } as const)
        break

      case 'close':
        if (db) {
          db.close()
          db = null
        }
        postMessage({ type: 'close', id } as const)
        break

      case 'getMode':
        postMessage({ type: 'getMode', id, mode: dbMode })
        break
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    postMessage({ type, id, error: errorMsg } as any)
  }
}

/**
 * Recover from database errors by attempting reconnection first
 * This is called when SQLITE_CANTOPEN or GetSyncHandleError errors occur
 *
 * IMPORTANT: This will NEVER delete an existing database to prevent data loss.
 * Recovery strategy with opfs-sahpool:
 * 1. Try to reopen database (sahpool can recover from stale handles)
 * 2. If that fails, throw error asking user to refresh (data is safe in OPFS)
 */
async function handleRecover() {
  console.warn('[SQLite Worker] Attempting database recovery...')

  // Close existing database if open
  if (db) {
    try {
      db.close()
    } catch (e) {
      console.warn('[SQLite Worker] Error closing database during recovery:', e)
    }
    db = null
  }

  // Step 1: Try to reconnect to existing database
  // opfs-sahpool can often recover from stale handles without needing refresh
  if (sqlite3 && sqlite3.opfs && sqlite3.opfs.OpfsSaPool) {
    try {
      console.log('[SQLite Worker] Attempting to reconnect to opfs-sahpool database...')
      // Reopen using the pool VFS
      db = new sqlite3.oo1.DB(DB_NAME, 'ct', { vfs: SAHPOOL_NAME })
      dbMode = 'opfs'
      console.log('[SQLite Worker] Successfully reconnected - no data loss')

      // Verify connection works
      db.exec({ sql: 'SELECT 1', returnValue: 'resultRows' })

      // Run migrations after reconnection to ensure schema is up-to-date
      try {
        await initializeSchema(db)
        console.log('[SQLite Worker] Schema migrations completed after reconnection')
      } catch (schemaError) {
        console.warn('[SQLite Worker] Schema migration warning after reconnection:', schemaError)
        // Continue - reconnection succeeded, migrations are idempotent
      }

      return
    } catch (reconnectError) {
      const errorMsg =
        reconnectError instanceof Error ? reconnectError.message : String(reconnectError)
      console.warn('[SQLite Worker] Reconnection failed:', errorMsg)

      // Check error type to determine safe action
      const isCorrupted = errorMsg.includes('malformed') || errorMsg.includes('corruption')
      const isNotFound =
        errorMsg.includes('unable to open') ||
        errorMsg.includes('CANTOPEN') ||
        errorMsg.includes('no such file')

      if (isCorrupted) {
        // Database exists but is corrupted - DON'T auto-delete
        console.error(
          '[SQLite Worker] Database exists but appears corrupted. Auto-recovery disabled to prevent data loss.'
        )
        throw new Error(
          'Database corrupted. Please reset manually using window.__resetSQLiteDB() if needed.'
        )
      }

      if (isNotFound) {
        // Database appears inaccessible after reconnection failure
        // This is likely an OPFS issue that requires page refresh
        // DON'T auto-create a new database as this will cause data loss!
        console.error('[SQLite Worker] Database inaccessible after reconnection failure.')
        console.error('[SQLite Worker] Your data is SAFE in OPFS, but we cannot access it.')
        console.error('[SQLite Worker] User needs to refresh the page to restore connection.')
        throw new Error(
          'DATABASE_INACCESSIBLE: Please refresh the page to restore database access. ' +
            'Your conversation data is safe, but we cannot access it due to a browser OPFS issue. ' +
            'Refreshing the page will restore the database connection.'
        )
      }

      // Unknown error - don't risk auto-creating database
      console.error('[SQLite Worker] Unknown database error:', errorMsg)
      throw reconnectError
    }
  }

  // Step 2: Fallback to in-memory (should rarely reach here with opfs-sahpool)
  // @ts-ignore - sqlite3InitModule types are incomplete
  sqlite3 = await sqlite3InitModule({
    print: (msg: string) => console.log('[SQLite Worker]', msg),
    printErr: (msg: string) => console.error('[SQLite Worker]', msg),
  })

  db = new sqlite3!.oo1.DB(':memory:', 'ct')
  dbMode = 'memory'
  await initializeSchema(db)
  console.warn('[SQLite Worker] Using in-memory database as fallback')
}

async function handleInit(reportProgress = false, _id: string = 'init') {
  // Wait for crossOriginIsolated to be true before initializing SQLite
  if (!self.crossOriginIsolated) {
    const maxWait = 5000 // 5 seconds max
    const startTime = Date.now()
    while (!self.crossOriginIsolated && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    if (!self.crossOriginIsolated) {
      console.warn(
        '[SQLite Worker] crossOriginIsolated still false after waiting. OPFS VFS may not work.'
      )
    }
  }

  // Initialize SQLite WASM module
  // @ts-ignore - sqlite3InitModule types are incomplete
  sqlite3 = await sqlite3InitModule({
    print: (msg: string) => console.log('[SQLite Worker]', msg),
    printErr: (msg: string) => console.error('[SQLite Worker]', msg),
  })

  // Use opfs-sahpool VFS for better performance and reliability
  if (sqlite3 && 'opfs' in sqlite3 && sqlite3.opfs && sqlite3.opfs.OpfsSaPool) {
    try {
      console.log('[SQLite Worker] Initializing opfs-sahpool VFS...')
      // @ts-ignore - OpfsSaPool types are incomplete
      await sqlite3.opfs.OpfsSaPool.poolVfs(POOL_CONFIG)
      console.log('[SQLite Worker] opfs-sahpool VFS initialized:', SAHPOOL_NAME)

      // Open database using the pool VFS
      db = new sqlite3.oo1.DB(DB_NAME, 'ct', { vfs: SAHPOOL_NAME })
      dbMode = 'opfs'
      console.log('[SQLite Worker] Database opened with opfs-sahpool VFS')
    } catch (error) {
      console.error('[SQLite Worker] Failed to initialize opfs-sahpool:', error)
      // Fallback to in-memory
      db = new sqlite3!.oo1.DB(':memory:', 'ct')
      dbMode = 'memory'
      console.warn('[SQLite Worker] Fell back to in-memory database')
    }
  } else {
    console.warn('[SQLite Worker] OPFS not available, falling back to in-memory database')
    console.warn('[SQLite Worker] Possible causes:')
    console.warn('[SQLite Worker]  - COOP/COEP headers not set correctly')
    console.warn(
      '[SQLite Worker]  - SharedArrayBuffer not available (requires cross-origin isolation)'
    )
    console.warn('[SQLite Worker]  - Browser does not support OPFS VFS')
    console.warn('[SQLite Worker]  - OpfsSaPool not available (sqlite-wasm version too old)')
    db = new sqlite3!.oo1.DB(':memory:', 'ct')
    dbMode = 'memory'
  }

  // Initialize schema using the migration system
  console.log('[SQLite Worker] Initializing database schema...')
  try {
    await initializeSchema(db, reportProgress ? createProgressReporter() : undefined)
    console.log('[SQLite Worker] Database initialization complete')
  } catch (error) {
    console.error('[SQLite Worker] Database initialization failed:', error)
    throw error
  }
}

/**
 * Create a progress reporter function that sends messages back to main thread
 */
function createProgressReporter() {
  return (progress: { step: string; details: string; current: number; total: number }) => {
    postMessage({
      type: 'migrationProgress',
      step: progress.step,
      details: progress.details,
      current: progress.current,
      total: progress.total,
    } as WorkerResponse)
  }
}

function handleQueryAll(sql: string, params: unknown[]): unknown[] {
  if (!db) {
    throw new Error('Database not initialized')
  }

  // Check if database connection is still valid
  // With opfs-sahpool, stale handles are less common but we still check
  try {
    // Simple check: try to get the filename
    const filename = db.filename
    if (!filename) {
      throw new Error('Database connection invalid: no filename')
    }
  } catch (e) {
    console.error('[SQLite Worker] Database connection check failed:', e)

    // Try to reconnect using opfs-sahpool
    if (sqlite3 && sqlite3.opfs && sqlite3.opfs.OpfsSaPool) {
      try {
        console.log('[SQLite Worker] Attempting automatic reconnection with opfs-sahpool...')
        db = new sqlite3.oo1.DB(DB_NAME, 'ct', { vfs: SAHPOOL_NAME })
        dbMode = 'opfs'
        console.log('[SQLite Worker] Automatic reconnection successful')
      } catch (reconnectError) {
        console.error('[SQLite Worker] Automatic reconnection failed:', reconnectError)
        throw new Error(
          'DATABASE_INACCESSIBLE: Database connection is no longer valid and reconnection failed. Please refresh the page to restore access. Your data is safe.'
        )
      }
    } else {
      throw new Error('Database connection is no longer valid. Please reload the page.')
    }
  }

  const rows: unknown[] = []
  const stmt = db.prepare(sql)

  try {
    for (let i = 0; i < params.length; i++) {
      stmt.bind(i + 1, params[i])
    }

    while (stmt.step()) {
      rows.push(stmt.get({}))
    }
  } finally {
    stmt.finalize()
  }

  return rows
}

function handleQueryFirst(sql: string, params: unknown[]): unknown | null {
  const rows = handleQueryAll(sql, params)
  return rows[0] || null
}

function handleExecute(sql: string, params: unknown[]): void {
  if (!db) {
    throw new Error('Database not initialized')
  }

  // Check if database connection is still valid before executing
  // With opfs-sahpool, stale handles are less common but we still check
  try {
    const filename = db.filename
    if (!filename) {
      throw new Error('Database connection invalid: no filename')
    }
  } catch (e) {
    console.error('[SQLite Worker] Database connection check failed:', e)

    // Try to reconnect using opfs-sahpool
    if (sqlite3 && sqlite3.opfs && sqlite3.opfs.OpfsSaPool) {
      try {
        console.log('[SQLite Worker] Attempting automatic reconnection with opfs-sahpool...')
        db = new sqlite3.oo1.DB(DB_NAME, 'ct', { vfs: SAHPOOL_NAME })
        dbMode = 'opfs'
        console.log('[SQLite Worker] Automatic reconnection successful')
      } catch (reconnectError) {
        console.error('[SQLite Worker] Automatic reconnection failed:', reconnectError)
        throw new Error(
          'DATABASE_INACCESSIBLE: Database connection is no longer valid and reconnection failed. Please refresh the page to restore access. Your data is safe.'
        )
      }
    } else {
      throw new Error('Database connection is no longer valid. Please reload the page.')
    }
  }

  db.exec({ sql, bind: params })
}

export {}
