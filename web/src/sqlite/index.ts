/**
 * SQLite Storage Module
 *
 * Unified SQLite WASM-based storage replacing IndexedDB for:
 * - Conversations (chat history)
 * - Skills (skill definitions)
 * - Plugins (WASM plugin metadata)
 * - API Keys (encrypted)
 * - Sessions (OPFS workspace metadata)
 *
 * FileSystemDirectoryHandle still uses IndexedDB (requires structured clone).
 *
 * @module sqlite
 */

// Core database manager
export { SQLiteDatabaseManager, getSQLiteDB, initSQLiteDB } from './sqlite-database'
export type {
  ConversationRow,
  SkillRow,
  PluginRow,
  ApiKeyRow,
  SessionRow,
  FileMetadataRow,
  PendingChangeRow,
  UndoRecordRow,
} from './sqlite-database'

// Utility functions
export { parseJSON, toJSON, boolToInt, intToBool, generateId } from './sqlite-database'

// Repositories
export {
  ConversationRepository,
  getConversationRepository,
} from './repositories/conversation.repository'
export type { StoredConversation } from './repositories/conversation.repository'

export { SkillRepository, getSkillRepository } from './repositories/skill.repository'
export type { StoredSkill, SkillMetadata } from '@/skills/skill-types'

export { SessionRepository, getSessionRepository } from './repositories/session.repository'
export type {
  Session,
  FileMetadata,
  PendingChange,
  UndoRecord,
  SessionStats,
} from './repositories/session.repository'

export { ApiKeyRepository, getApiKeyRepository } from './repositories/api-key.repository'

export { PluginRepository, getPluginRepository } from './repositories/plugin.repository'
export type { StoredPlugin } from './repositories/plugin.repository'

// Migration utilities
export { runMigration, needsMigration } from './migration'
export type { MigrationProgress, MigrationResult, MigrationProgressCallback } from './migration'
