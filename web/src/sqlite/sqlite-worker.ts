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

// SQL Logging - controlled via window.__enableSQLiteSQLLogging()
let enableSQLLogging = false

// Diagnostic tracking
let initCount = 0
let poolInitCount = 0

// Track if we've seen data before (to detect data loss)
let hasSeenData = false

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
  | { type: 'setSQLLogging'; enabled: boolean; id?: string }

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
  | { type: 'setSQLLogging'; id: string; enabled: boolean; error?: string }
  | { type: 'migrationProgress'; step: string; details: string; current: number; total: number }

let sqlite3: any = null
let db: any = null
let dbMode: 'opfs' | 'memory' = 'memory'
let poolUtil: any = null // Store poolUtil for opfs-sahpool VFS

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

      case 'setSQLLogging':
        enableSQLLogging = e.data.enabled
        console.log(`[SQLite Worker] SQL logging ${enableSQLLogging ? 'ENABLED' : 'DISABLED'}`)
        postMessage({ type: 'setSQLLogging', id, enabled: enableSQLLogging })
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
  const recoverId = `recover-${Date.now()}`
  console.log(`[SQLite Worker] ${recoverId}: Starting database recovery...`)

  // Close existing database if open
  if (db) {
    try {
      db.close()
      console.log(`[SQLite Worker] ${recoverId}: Closed existing database`)
    } catch (e) {
      // Ignore close errors during recovery
    }
    db = null
  }

  // Step 1: Try to reconnect to existing database
  // opfs-sahpool can often recover from stale handles without needing refresh
  if (poolUtil || typeof sqlite3.installOpfsSAHPoolVfs === 'function') {
    try {
      // Use the stored poolUtil if available, otherwise reinitialize
      if (!poolUtil) {
        console.warn(`[SQLite Worker] ${recoverId}: poolUtil was null, reinitializing...`)
        poolInitCount++
        poolUtil = await sqlite3.installOpfsSAHPoolVfs(POOL_CONFIG)
        console.log(
          `[SQLite Worker] ${recoverId}: Created NEW pool during recovery (count: ${poolInitCount})`
        )
      } else {
        console.log(`[SQLite Worker] ${recoverId}: Reusing existing poolUtil`)
      }
      // Use OpfsSAHPoolDb to reopen the database
      db = new poolUtil.OpfsSAHPoolDb(DB_NAME, 'ct')
      dbMode = 'opfs'

      // Verify connection works
      db.exec({ sql: 'SELECT 1', returnValue: 'resultRows' })
      console.log(`[SQLite Worker] ${recoverId}: Successfully reopened existing database`)

      // Run migrations after reconnection to ensure schema is up-to-date
      try {
        await initializeSchema(db)
      } catch (schemaError) {
        console.warn('[SQLite Worker] Schema migration warning:', schemaError)
        // Continue - reconnection succeeded, migrations are idempotent
      }

      console.log(`[SQLite Worker] ${recoverId}: Recovery SUCCESS`)
      return
    } catch (reconnectError) {
      const errorMsg =
        reconnectError instanceof Error ? reconnectError.message : String(reconnectError)

      console.error(`[SQLite Worker] ${recoverId}: Reconnection FAILED:`, errorMsg)

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
  initCount++
  const initId = `init-${initCount}-${Date.now()}`
  console.log(`[SQLite Worker] ${initId}: Starting initialization...`)

  // Wait for crossOriginIsolated to be true before initializing SQLite
  if (!self.crossOriginIsolated) {
    const maxWait = 5000 // 5 seconds max
    const startTime = Date.now()
    while (!self.crossOriginIsolated && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  // Initialize SQLite WASM module
  // @ts-ignore - sqlite3InitModule types are incomplete
  sqlite3 = await sqlite3InitModule({
    print: (msg: string) => console.log('[SQLite Worker]', msg),
    printErr: (msg: string) => console.error('[SQLite Worker]', msg),
  })

  // Try to use opfs-sahpool VFS for better performance and reliability
  // @ts-ignore - installOpfsSAHPoolVfs types are incomplete
  if (typeof sqlite3.installOpfsSAHPoolVfs === 'function') {
    try {
      const isNewPool = !poolUtil
      if (isNewPool) {
        poolInitCount++
        console.log(
          `[SQLite Worker] ${initId}: Creating NEW opfs-sahpool (count: ${poolInitCount})`
        )
      } else {
        console.log(`[SQLite Worker] ${initId}: Reusing existing opfs-sahpool`)
      }
      poolUtil = await sqlite3.installOpfsSAHPoolVfs(POOL_CONFIG)

      // Use the OpfsSAHPoolDb constructor from poolUtil
      // 'ct' flag = create-if-not-exists, truncate-if-does (opens existing or creates new)
      // @ts-ignore - OpfsSAHPoolDb types are incomplete
      db = new poolUtil.OpfsSAHPoolDb(DB_NAME, 'ct')
      dbMode = 'opfs'

      // Check if database was newly created or opened existing
      let tableCount = 0
      try {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM sqlite_master')
        if (stmt.step()) {
          const result = stmt.get({}) as { count: number }
          tableCount = result.count
          console.log(
            `[SQLite Worker] ${initId}: Database OPENED (existing) - tables: ${tableCount}`
          )
        }
        stmt.finalize()
      } catch (e) {
        // If query fails, database might be newly created with no schema yet
        console.log(`[SQLite Worker] ${initId}: Database likely NEW (schema not yet initialized)`)
      }

      // Additional check: verify actual data exists in key tables
      if (tableCount > 0) {
        try {
          const stmt = db.prepare(
            'SELECT (SELECT COUNT(*) FROM conversations) + (SELECT COUNT(*) FROM workspaces) as total_rows'
          )
          if (stmt.step()) {
            const result = stmt.get({}) as { total_rows: number }
            const totalRows = result.total_rows

            if (totalRows > 0) {
              hasSeenData = true
              console.log(
                `[SQLite Worker] ${initId}: Data check - ${totalRows} rows found (conversations + workspaces)`
              )
            } else {
              console.warn(
                `[SQLite Worker] ${initId}: ⚠️ Database exists but is EMPTY! Schema present but no data.`
              )

              // If we've seen data before but now it's gone, that's data loss!
              if (hasSeenData) {
                console.error(
                  `[SQLite Worker] ${initId}: 🚨 DATA LOSS DETECTED! Previous session had data, but database is now empty.`
                )
                console.error(
                  `[SQLite Worker] ${initId}: This may indicate opfs-sahpool handle staleness or OPFS data cleanup by browser.`
                )
                console.error(
                  `[SQLite Worker] ${initId}: Consider checking browser storage settings or using a more persistent storage method.`
                )
              }
            }
          }
          stmt.finalize()
        } catch (e) {
          console.log(
            `[SQLite Worker] ${initId}: Could not check data existence (tables may not exist yet)`
          )
        }
      }
    } catch (error) {
      console.warn(
        `[SQLite Worker] ${initId}: opfs-sahpool failed, falling back to regular OPFS:`,
        error
      )
      // Fallback to regular opfs VFS
      db = new sqlite3!.oo1.OpfsDb(DB_NAME)
      dbMode = 'opfs'
      poolUtil = null
    }
  } else if (sqlite3 && 'opfs' in sqlite3 && sqlite3.opfs) {
    // opfs-sahpool not available, use regular opfs VFS
    console.log(`[SQLite Worker] ${initId}: Using regular OPFS VFS`)
    db = new sqlite3.oo1.OpfsDb(DB_NAME)
    dbMode = 'opfs'
  } else {
    console.warn('[SQLite Worker] OPFS not available, falling back to in-memory database')
    db = new sqlite3!.oo1.DB(':memory:', 'ct')
    dbMode = 'memory'
  }

  // Initialize schema using the migration system
  try {
    await initializeSchema(db, reportProgress ? createProgressReporter() : undefined)
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

  // SQL logging (dev only)
  if (enableSQLLogging) {
    const sqlPreview = sql.slice(0, 100)
    const paramsStr = params.length > 0 ? JSON.stringify(params).slice(0, 50) : ''
    console.log(`[SQLite SQL] QUERY ${sqlPreview}${sql.length > 100 ? '...' : ''}`, paramsStr || '')
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
    // Try to reconnect using opfs-sahpool
    if (poolUtil) {
      try {
        db = new poolUtil.OpfsSAHPoolDb(DB_NAME, 'ct')
        dbMode = 'opfs'
      } catch (reconnectError) {
        console.error('[SQLite Worker] Reconnection failed:', reconnectError)
        throw new Error('DATABASE_INACCESSIBLE: Database connection lost. Please refresh the page.')
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

  // SQL logging (dev only)
  if (enableSQLLogging) {
    const sqlPreview = sql.slice(0, 100)
    const paramsStr = params.length > 0 ? JSON.stringify(params).slice(0, 50) : ''
    console.log(`[SQLite SQL] EXEC ${sqlPreview}${sql.length > 100 ? '...' : ''}`, paramsStr || '')
  }

  // Check if database connection is still valid before executing
  // With opfs-sahpool, stale handles are less common but we still check
  try {
    const filename = db.filename
    if (!filename) {
      throw new Error('Database connection invalid: no filename')
    }
  } catch (e) {
    // Try to reconnect using opfs-sahpool
    if (poolUtil) {
      try {
        db = new poolUtil.OpfsSAHPoolDb(DB_NAME, 'ct')
        dbMode = 'opfs'
      } catch (reconnectError) {
        console.error('[SQLite Worker] Reconnection failed:', reconnectError)
        throw new Error('DATABASE_INACCESSIBLE: Database connection lost. Please refresh the page.')
      }
    } else {
      throw new Error('Database connection is no longer valid. Please reload the page.')
    }
  }

  db.exec({ sql, bind: params })
}

export {}
