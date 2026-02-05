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
 * Version 1 is the base schema defined in sqlite-schema.sql
 * Migrations start from version 2
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

// Base schema version
export const BASE_SCHEMA_VERSION = 1

// ============================================================================
// Migration Registry
// ============================================================================
// Add new migrations here. Each migration should:
// 1. Be idempotent (use IF NOT EXISTS, OR IGNORE, etc.)
// 2. Include PRAGMA user_version = X at the end
// 3. Be atomic (can be rolled back on error)
// ============================================================================

export const migrations: Migration[] = [
  // Add migrations here as the schema evolves:
  // {
  //   version: 2,
  //   name: 'add_widget_support',
  //   up: await import('./002_add_widget_support.sql?raw').then(m => m.default),
  // },
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
    // Result is an array of arrays: [[version]]
    return (result[0]?.[0] as number) || 0
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
