/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SQLite Migration System
 *
 * Manages incremental database schema migrations using version tracking.
 *
 * Migration file format:
 * - Named with version prefix: 002_add_feature.sql
 * - Each migration must be idempotent (safe to run multiple times)
 * - After execution, PRAGMA user_version is updated
 *
 * Version is defined in sqlite-schema.sql via PRAGMA user_version.
 * Incremental migrations start from the next schema version.
 */

import schemaSQL from '../sqlite-schema.sql?raw'

// Progress callback type
export type MigrationProgressCallback = (progress: {
  step: string
  details: string
  current: number
  total: number
}) => void

export interface Migration {
  version: number
  name: string
  up: string
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Treat known idempotent DDL conflicts as recoverable.
 * Example: column already exists because a previous run partially applied DDL
 * before user_version was updated.
 */
function canRecoverMigrationError(migration: Migration, error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase()
  if (msg.includes('duplicate column name')) return true
  // Keep this scoped to schema-upgrade style migrations only.
  return migration.up.toLowerCase().includes('add column') && msg.includes('already exists')
}


// Base schema version
export const BASE_SCHEMA_VERSION = 7

// ============================================================================
// Migration Registry
// ============================================================================
// Add new migrations here. Each migration should:
// 1. Be idempotent (use IF NOT EXISTS, OR IGNORE, etc.)
// 2. Include PRAGMA user_version = X at the end
// 3. Be atomic (can be rolled back on error)
// ============================================================================

export const migrations: Migration[] = [
  {
    version: 4,
    name: 'add_custom_workflows_table',
    up: `
      CREATE TABLE IF NOT EXISTS custom_workflows (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          domain TEXT NOT NULL DEFAULT 'custom',
          entry_node_id TEXT,
          nodes_json TEXT NOT NULL DEFAULT '[]',
          edges_json TEXT NOT NULL DEFAULT '[]',
          source TEXT NOT NULL DEFAULT 'user-created',
          version INTEGER NOT NULL DEFAULT 1,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_custom_workflows_domain ON custom_workflows(domain);
      CREATE INDEX IF NOT EXISTS idx_custom_workflows_source ON custom_workflows(source);
      CREATE INDEX IF NOT EXISTS idx_custom_workflows_enabled ON custom_workflows(enabled);
      CREATE INDEX IF NOT EXISTS idx_custom_workflows_updated_at ON custom_workflows(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_custom_workflows_name_lower ON custom_workflows(lower(name));

      PRAGMA user_version = 4;
    `,
  },
  {
    version: 5,
    name: 'extract_messages_to_independent_table',
    up: `
      CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content_json TEXT NOT NULL DEFAULT 'null',
          meta_json TEXT,
          timestamp INTEGER NOT NULL,
          seq INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages(conversation_id, seq);
      CREATE INDEX IF NOT EXISTS idx_messages_conv_ts ON messages(conversation_id, timestamp);

      PRAGMA user_version = 5;
    `,
  },
  {
    version: 6,
    name: 'add_project_roots_table',
    up: `
      CREATE TABLE IF NOT EXISTS project_roots (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          read_only INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
          UNIQUE(project_id, name),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_project_roots_project_id ON project_roots(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_roots_project_default ON project_roots(project_id, is_default);

      PRAGMA user_version = 6;
    `,
  },
  {
    version: 7,
    name: 'add_project_active_workspace_table',
    up: `
      CREATE TABLE IF NOT EXISTS project_active_workspace (
          project_id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          last_modified INTEGER NOT NULL DEFAULT (strftime('%s', 's') * 1000),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
      );

      PRAGMA user_version = 7;
    `,
  },
]

// ============================================================================
// Migration Executor
// ============================================================================

/**
 * Get current database version from PRAGMA user_version
 */
export async function getCurrentVersion(db: any): Promise<number> {
  try {
    const result = db.exec('PRAGMA user_version')
    // sqlite-wasm result shape may vary by build:
    // - [{ columns, values }]
    // - [[version]]
    const versionFromValues = result?.[0]?.values?.[0]?.[0]
    if (typeof versionFromValues === 'number') return versionFromValues

    const versionFromArray = result?.[0]?.[0]
    if (typeof versionFromArray === 'number') return versionFromArray

    // Fallback: use prepared statement API.
    const stmt = db.prepare('PRAGMA user_version')
    try {
      if (stmt.step()) {
        const row = stmt.get({}) as { user_version?: number }
        if (typeof row?.user_version === 'number') return row.user_version
      }
    } finally {
      stmt.finalize()
    }

    return 0
  } catch {
    return 0
  }
}

/**
 * Execute pending migrations with progress reporting
 * Returns the number of migrations executed
 */
export async function runPendingMigrations(
  db: any,
  onProgress?: MigrationProgressCallback
): Promise<{ executed: number; finalVersion: number }> {
  const currentVersion = await getCurrentVersion(db)

  // Filter migrations that need to run
  const pendingMigrations = migrations.filter((m) => m.version > currentVersion)

  if (pendingMigrations.length === 0) {
    return { executed: 0, finalVersion: currentVersion }
  }

  console.log(
    `[SQLite Migration] Current version: ${currentVersion}, Pending migrations: ${pendingMigrations.length}`
  )

  // Report initial progress
  onProgress?.({
    step: 'migration',
    details: `Database upgrade (${currentVersion} → ${pendingMigrations[pendingMigrations.length - 1].version})`,
    current: 0,
    total: pendingMigrations.length,
  })

  let executed = 0
  for (const migration of pendingMigrations) {
    try {
      console.log(`[SQLite Migration] Running v${migration.version}: ${migration.name}`)

      // Report progress for each migration
      onProgress?.({
        step: 'migration',
        details: `Running migration v${migration.version}: ${migration.name}`,
        current: executed + 1,
        total: pendingMigrations.length,
      })

      await db.exec(migration.up)
      executed++

      // Verify version was updated
      const newVersion = await getCurrentVersion(db)
      if (newVersion !== migration.version) {
        throw new Error(
          `Migration v${migration.version} did not update user_version correctly (got ${newVersion})`
        )
      }
      console.log(`[SQLite Migration] Completed v${migration.version}`)
    } catch (error) {
      if (canRecoverMigrationError(migration, error)) {
        console.warn(
          `[SQLite Migration] Recoverable migration conflict in v${migration.version}, forcing version update:`,
          error
        )
        await db.exec(`PRAGMA user_version = ${migration.version}`)
        executed++
        continue
      }
      console.error(`[SQLite Migration] Failed v${migration.version}:`, error)
      onProgress?.({
        step: 'error',
        details: `Migration failed: v${migration.version} - ${error}`,
        current: executed,
        total: pendingMigrations.length,
      })
      throw new Error(`Migration v${migration.version} failed: ${error}`)
    }
  }

  const finalVersion = await getCurrentVersion(db)

  // Report completion
  onProgress?.({
    step: 'migration',
    details: `Database upgrade complete (v${finalVersion})`,
    current: pendingMigrations.length,
    total: pendingMigrations.length,
  })

  console.log(`[SQLite Migration] All migrations complete. Final version: ${finalVersion}`)

  return { executed, finalVersion }
}

/**
 * Initialize database with base schema and run migrations
 * This is called during database initialization
 */
export async function initializeSchema(
  db: any,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  const existingVersion = await getCurrentVersion(db)

  // Report schema initialization start
  onProgress?.({
    step: 'init',
    details: 'Initializing database schema...',
    current: 0,
    total: 1,
  })

  // Execute base schema (CREATE TABLE IF NOT EXISTS)
  // This is safe to run on existing databases
  db.exec(schemaSQL)

  // schemaSQL sets PRAGMA user_version to BASE_SCHEMA_VERSION.
  // Preserve previously migrated versions to avoid re-running old migrations
  // on every app start.
  const targetVersion = Math.max(existingVersion, BASE_SCHEMA_VERSION)
  db.exec(`PRAGMA user_version = ${targetVersion}`)

  // Run any pending migrations
  await runPendingMigrations(db, onProgress)

  // Report completion
  onProgress?.({
    step: 'complete',
    details: 'Database ready',
    current: 1,
    total: 1,
  })
}
