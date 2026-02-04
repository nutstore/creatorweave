/**
 * SQLite Worker - Runs SQLite in a worker thread for OPFS VFS support
 *
 * OPFS VFS requires Atomics.wait() which is only available in workers.
 * This worker wraps the SQLite database operations.
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

const DB_NAME = '/bfosa-unified.sqlite'

// Worker message types
export type WorkerRequest =
  | { type: 'init'; schemaSQL: string; id?: string }
  | { type: 'queryAll'; sql: string; params: unknown[]; id: string }
  | { type: 'queryFirst'; sql: string; params: unknown[]; id: string }
  | { type: 'execute'; sql: string; params: unknown[]; id: string }
  | { type: 'beginTransaction'; id: string }
  | { type: 'commit'; id: string }
  | { type: 'rollback'; id: string }
  | { type: 'close'; id: string }
  | { type: 'getMode'; id: string }
  | { type: 'recover'; schemaSQL: string; id: string }

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

let sqlite3: any = null
let db: any = null
let dbMode: 'opfs' | 'memory' = 'memory'
let savedSchemaSQL: string = '' // Store schema for recovery

// Handle messages from main thread
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type } = e.data
  const id = 'id' in e.data ? (e.data.id as string) : `msg-${Date.now()}`

  try {
    switch (type) {
      case 'init':
        savedSchemaSQL = e.data.schemaSQL
        await handleInit(e.data.schemaSQL)
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
 * Recovery strategy (in order of preference):
 * 1. Try to reconnect to existing database (handles stale file handles)
 * 2. Only if reconnection fails, delete and recreate
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

  // Step 1: Try to reconnect to existing database first
  // This handles GetSyncHandleError from stale file handles without data loss
  if (sqlite3 && sqlite3.opfs) {
    try {
      console.log('[SQLite Worker] Attempting to reconnect to existing database...')
      db = new sqlite3.oo1.OpfsDb(DB_NAME)
      dbMode = 'opfs'
      console.log('[SQLite Worker] Successfully reconnected to existing database - no data loss')
      return
    } catch (reconnectError) {
      const errorMsg =
        reconnectError instanceof Error ? reconnectError.message : String(reconnectError)
      console.warn('[SQLite Worker] Reconnection failed:', errorMsg)
      // Only proceed to deletion if reconnection truly fails
    }
  }

  // Step 2: Only delete if reconnection failed
  // This indicates actual database corruption, not just a stale handle
  console.warn('[SQLite Worker] Database appears corrupted, will delete and recreate')

  try {
    if (sqlite3 && sqlite3.opfs && sqlite3.opfs.deleteDatabase) {
      await sqlite3.opfs.deleteDatabase(DB_NAME)
      console.log('[SQLite Worker] Old database deleted')
    }
  } catch (e) {
    console.warn('[SQLite Worker] Could not delete old database:', e)
  }

  // Step 3: Recreate database from scratch
  await handleInit(savedSchemaSQL)
  console.log('[SQLite Worker] Database recovered (recreated)')
}

async function handleInit(schemaSQL: string) {
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

  // Check if OPFS is available
  if (sqlite3 && 'opfs' in sqlite3 && sqlite3.opfs) {
    db = new sqlite3.oo1.OpfsDb(DB_NAME)
    dbMode = 'opfs'
  } else {
    console.warn('[SQLite Worker] OPFS not available, falling back to in-memory database')
    console.warn('[SQLite Worker] Possible causes:')
    console.warn('[SQLite Worker]  - COOP/COEP headers not set correctly')
    console.warn(
      '[SQLite Worker]  - SharedArrayBuffer not available (requires cross-origin isolation)'
    )
    console.warn('[SQLite Worker]  - Browser does not support OPFS VFS')
    db = new sqlite3!.oo1.DB(':memory:', 'ct')
    dbMode = 'memory'
  }

  // Initialize schema
  db.exec(schemaSQL)
}

function handleQueryAll(sql: string, params: unknown[]): unknown[] {
  if (!db) {
    throw new Error('Database not initialized')
  }

  // Check if database connection is still valid
  // This helps catch stale file handles before they cause errors
  try {
    // Simple check: try to get the filename
    const filename = db.filename
    if (!filename) {
      throw new Error('Database connection invalid: no filename')
    }
  } catch (e) {
    console.error('[SQLite Worker] Database connection check failed:', e)

    // Try to reconnect before failing
    if (sqlite3 && sqlite3.opfs && savedSchemaSQL) {
      try {
        console.log('[SQLite Worker] Attempting automatic reconnection...')
        db = new sqlite3.oo1.OpfsDb(DB_NAME)
        dbMode = 'opfs'
        console.log('[SQLite Worker] Automatic reconnection successful')
      } catch (reconnectError) {
        console.error('[SQLite Worker] Automatic reconnection failed:', reconnectError)
        throw new Error(
          'Database connection is no longer valid and reconnection failed. Please reload the page.'
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
  // This helps catch stale file handles before they cause errors
  try {
    const filename = db.filename
    if (!filename) {
      throw new Error('Database connection invalid: no filename')
    }
  } catch (e) {
    console.error('[SQLite Worker] Database connection check failed:', e)

    // Try to reconnect before failing
    if (sqlite3 && sqlite3.opfs && savedSchemaSQL) {
      try {
        console.log('[SQLite Worker] Attempting automatic reconnection...')
        db = new sqlite3.oo1.OpfsDb(DB_NAME)
        dbMode = 'opfs'
        console.log('[SQLite Worker] Automatic reconnection successful')
      } catch (reconnectError) {
        console.error('[SQLite Worker] Automatic reconnection failed:', reconnectError)
        throw new Error(
          'Database connection is no longer valid and reconnection failed. Please reload the page.'
        )
      }
    } else {
      throw new Error('Database connection is no longer valid. Please reload the page.')
    }
  }

  db.exec({ sql, bind: params })
}

export {}
