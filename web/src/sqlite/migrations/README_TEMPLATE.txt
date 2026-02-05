/**
 * Example Migration Files
 *
 * This directory contains SQL migration scripts for evolving the database schema.
 *
 * Naming convention: {version}_{name}.sql
 * - version: Incremental integer starting from 2 (v1 is the base schema)
 * - name: Snake_case description of the change
 *
 * Each migration must:
 * 1. Be idempotent (safe to run multiple times)
 *    - Use "IF NOT EXISTS" for CREATE statements
 *    - Use "OR IGNORE" for INSERT statements
 * 2. Include "PRAGMA user_version = X;" at the end
 * 3. Be atomic (can be rolled back on error)
 *
 * Example migration:
 *
 * -- migrations/002_add_message_tags.sql
 * ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT '[]';
 * PRAGMA user_version = 2;
 *
 * To add a new migration:
 * 1. Create a new file in this directory with the next version number
 * 2. Add your SQL changes (ALTER TABLE, CREATE INDEX, etc.)
 * 3. Set PRAGMA user_version to the new version
 * 4. Import and add to the migrations array in index.ts
 */

/**
 * Migration Template
 *
 * Copy this template and rename it: 003_{your_feature_name}.sql
 *
 * -- migrations/003_your_feature_name.sql
 * -- Description: Add a brief description of what this migration does
 *
 * -- Example: Add a new column
 * ALTER TABLE target_table ADD COLUMN IF NOT EXISTS new_column TEXT DEFAULT '';
 *
 * -- Example: Create a new index
 * CREATE INDEX IF NOT EXISTS idx_target_table_new_column ON target_table(new_column);
 *
 * -- Update version number
 * PRAGMA user_version = 3;
 */

/**
 * To add your migration to the system:
 *
 * 1. Create your migration file (e.g., 003_add_feature.sql)
 * 2. In migrations/index.ts, import and add to the migrations array:
 *
 *    import sql_003 from './003_add_feature.sql?raw'
 *
 *    export const migrations: Migration[] = [
 *      { version: 3, name: 'add_feature', up: sql_003 },
 *    ]
 */
