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
export const BASE_SCHEMA_VERSION = 3

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
    name: 'add_context_usage_to_conversations',
    up: `
      ALTER TABLE conversations ADD COLUMN context_usage_json TEXT;
      PRAGMA user_version = 4;
    `,
  },
  {
    version: 5,
    name: 'add_fs_overlay_ledger_tables',
    up: `
      CREATE TABLE IF NOT EXISTS fs_changesets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'tool',
        status TEXT NOT NULL DEFAULT 'draft',
        summary TEXT,
        created_at INTEGER NOT NULL,
        committed_at INTEGER,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_fs_changesets_workspace_status
        ON fs_changesets(workspace_id, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS fs_ops (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        changeset_id TEXT,
        path TEXT NOT NULL,
        op_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        fs_mtime INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (changeset_id) REFERENCES fs_changesets(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_fs_ops_workspace_status
        ON fs_ops(workspace_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_fs_ops_workspace_path_status
        ON fs_ops(workspace_id, path, status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS fs_sync_batches (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        total_ops INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_fs_sync_batches_workspace_started
        ON fs_sync_batches(workspace_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS fs_sync_items (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        op_id TEXT,
        path TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        synced_at INTEGER NOT NULL,
        FOREIGN KEY (batch_id) REFERENCES fs_sync_batches(id) ON DELETE CASCADE,
        FOREIGN KEY (op_id) REFERENCES fs_ops(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_fs_sync_items_batch
        ON fs_sync_items(batch_id, synced_at DESC);

      PRAGMA user_version = 5;
    `,
  },
  {
    version: 6,
    name: 'add_review_status_to_fs_ops',
    up: `
      ALTER TABLE fs_ops ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE fs_ops ADD COLUMN approved_at INTEGER;

      CREATE INDEX IF NOT EXISTS idx_fs_ops_workspace_review_status
        ON fs_ops(workspace_id, review_status, updated_at DESC);

      PRAGMA user_version = 6;
    `,
  },
  {
    version: 7,
    name: 'add_snapshot_files_for_rollback',
    up: `
      CREATE TABLE IF NOT EXISTS fs_snapshot_files (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        path TEXT NOT NULL,
        op_type TEXT NOT NULL,
        content_kind TEXT NOT NULL,
        content_text TEXT,
        content_blob BLOB,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (snapshot_id) REFERENCES fs_changesets(id) ON DELETE CASCADE,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        UNIQUE(snapshot_id, path)
      );

      CREATE INDEX IF NOT EXISTS idx_fs_snapshot_files_snapshot
        ON fs_snapshot_files(snapshot_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_fs_snapshot_files_workspace_path
        ON fs_snapshot_files(workspace_id, path, created_at DESC);

      PRAGMA user_version = 7;
    `,
  },
  {
    version: 8,
    name: 'add_before_after_content_to_snapshot_files',
    up: `
      ALTER TABLE fs_snapshot_files ADD COLUMN before_content_kind TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE fs_snapshot_files ADD COLUMN before_content_text TEXT;
      ALTER TABLE fs_snapshot_files ADD COLUMN before_content_blob BLOB;
      ALTER TABLE fs_snapshot_files ADD COLUMN after_content_kind TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE fs_snapshot_files ADD COLUMN after_content_text TEXT;
      ALTER TABLE fs_snapshot_files ADD COLUMN after_content_blob BLOB;

      UPDATE fs_snapshot_files
      SET
        before_content_kind = CASE WHEN op_type = 'delete' THEN content_kind ELSE 'none' END,
        before_content_text = CASE WHEN op_type = 'delete' THEN content_text ELSE NULL END,
        before_content_blob = CASE WHEN op_type = 'delete' THEN content_blob ELSE NULL END,
        after_content_kind = CASE WHEN op_type IN ('create', 'modify') THEN content_kind ELSE 'none' END,
        after_content_text = CASE WHEN op_type IN ('create', 'modify') THEN content_text ELSE NULL END,
        after_content_blob = CASE WHEN op_type IN ('create', 'modify') THEN content_blob ELSE NULL END;

      PRAGMA user_version = 8;
    `,
  },
  {
    version: 9,
    name: 'add_current_snapshot_pointer_to_workspaces',
    up: `
      ALTER TABLE workspaces ADD COLUMN current_snapshot_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_workspaces_current_snapshot
        ON workspaces(current_snapshot_id);

      PRAGMA user_version = 9;
    `,
  },
  {
    version: 10,
    name: 'add_synced_at_to_fs_changesets',
    up: `
      ALTER TABLE fs_changesets ADD COLUMN synced_at INTEGER;

      CREATE INDEX IF NOT EXISTS idx_fs_changesets_synced
        ON fs_changesets(workspace_id, status, synced_at);

      PRAGMA user_version = 10;
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
