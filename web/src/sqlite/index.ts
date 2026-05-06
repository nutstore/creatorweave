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
export {
  SQLiteDatabaseManager,
  getSQLiteDB,
  initSQLiteDB,
  resetSQLiteDB,
  clearAllSQLiteTables,
  clearLegacySahPoolFromOPFSRoot,
} from './sqlite-database'
export type {
  ConversationRow,
  SkillRow,
  PluginRow,
  ApiKeyRow,
  WorkspaceRow,
  FileMetadataRow,
  PendingChangeRow,
} from './sqlite-database'

// Utility functions
export { parseJSON, toJSON, boolToInt, intToBool, generateId } from './sqlite-database'

// Repositories
export {
  ConversationRepository,
  getConversationRepository,
} from './repositories/conversation.repository'
export type { StoredConversation } from './repositories/conversation.repository'
export { MessageRepository, getMessageRepository } from './repositories/message.repository'

export { SkillRepository, getSkillRepository } from './repositories/skill.repository'
export type { StoredSkill, SkillMetadata } from '@/skills/skill-types'

export { WorkspaceRepository, getWorkspaceRepository } from './repositories/workspace.repository'
export type {
  Workspace,
  FileMetadata,
  PendingChange,
  WorkspaceStats,
} from './repositories/workspace.repository'

export { ProjectRepository, getProjectRepository } from './repositories/project.repository'
export type { Project } from './repositories/project.repository'

export { ProjectRootRepository, getProjectRootRepository } from './repositories/project-root.repository'
export type { ProjectRoot } from './repositories/project-root.repository'

export { ApiKeyRepository, getApiKeyRepository } from './repositories/api-key.repository'

export { PluginRepository, getPluginRepository } from './repositories/plugin.repository'
export type { StoredPlugin } from './repositories/plugin.repository'

export { MCPRepository, getMCPRepository } from './repositories/mcp.repository'
export type { StoredMCPServer } from './repositories/mcp.repository'

export { SubagentRepository, getSubagentRepository } from './repositories/subagent.repository'
export type { StoredSubagentTask } from './repositories/subagent.repository'
