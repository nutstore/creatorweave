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
        await handleInit(e.data.schemaSQL)
        postMessage({ type: 'init', id, success: true, mode: dbMode })
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

async function handleInit(schemaSQL: string) {
  // Diagnostic logging for OPFS/SharedArrayBuffer availability
  console.log('[SQLite Worker] Environment diagnostics:')
  console.log('[SQLite Worker]  - typeof SharedArrayBuffer:', typeof SharedArrayBuffer)
  console.log(
    '[SQLite Worker]  - SharedArrayBuffer available:',
    typeof SharedArrayBuffer !== 'undefined'
  )
  console.log('[SQLite Worker]  - crossOriginIsolated:', self.crossOriginIsolated)

  // Initialize SQLite WASM module
  // @ts-ignore - sqlite3InitModule types are incomplete
  sqlite3 = await sqlite3InitModule({
    print: (msg: string) => console.log('[SQLite Worker]', msg),
    printErr: (msg: string) => console.error('[SQLite Worker]', msg),
  })

  console.log('[SQLite Worker] SQLite module initialized')
  console.log('[SQLite Worker]  - sqlite3.version:', sqlite3?.version)
  console.log('[SQLite Worker]  - sqlite3.opfs exists:', 'opfs' in (sqlite3 || {}))
  console.log('[SQLite Worker]  - sqlite3.opfs value:', sqlite3?.opfs)

  // Check if OPFS is available
  if (sqlite3 && 'opfs' in sqlite3 && sqlite3.opfs) {
    console.log('[SQLite Worker] OPFS is available, creating OpfsDb...')
    db = new sqlite3.oo1.OpfsDb(DB_NAME)
    dbMode = 'opfs'
    console.log('[SQLite Worker] OpfsDb created at:', db?.filename)
  } else {
    console.warn('[SQLite Worker] OPFS is not available, falling back to in-memory database')
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
  console.log('[SQLite Worker] Schema initialized')
}

function handleQueryAll(sql: string, params: unknown[]): unknown[] {
  if (!db) throw new Error('Database not initialized')

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
  if (!db) throw new Error('Database not initialized')
  db.exec({ sql, bind: params })
}

export {}
