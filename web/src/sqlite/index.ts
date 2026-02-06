/**
 * SQLite Storage Module
 *
 * Unified SQLite WASM-based storage for:
 * - Conversations (chat history)
 * - Skills (skill definitions)
 * - Plugins (WASM plugin metadata)
 * - API Keys (encrypted)
 * - Workspaces (OPFS workspace metadata)
 *
 * FileSystemDirectoryHandle still uses IndexedDB (requires structured clone).
 *
 * @module sqlite
 */

// Core database manager
export { SQLiteDatabaseManager, getSQLiteDB, initSQLiteDB, resetSQLiteDB } from './sqlite-database'
export type {
  ConversationRow,
  SkillRow,
  PluginRow,
  ApiKeyRow,
  WorkspaceRow,
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

export { WorkspaceRepository, getWorkspaceRepository } from './repositories/workspace.repository'
export type {
  Workspace,
  FileMetadata,
  PendingChange,
  UndoRecord,
  WorkspaceStats,
} from './repositories/workspace.repository'

export { ApiKeyRepository, getApiKeyRepository } from './repositories/api-key.repository'

export { PluginRepository, getPluginRepository } from './repositories/plugin.repository'
export type { StoredPlugin } from './repositories/plugin.repository'

export { MCPRepository, getMCPRepository } from './repositories/mcp.repository'
export type { StoredMCPServer } from './repositories/mcp.repository'
