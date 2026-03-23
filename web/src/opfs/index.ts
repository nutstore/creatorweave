/**
 * OPFS (Origin Private File System) Module
 *
 * Multi-session workspace architecture for browser file system operations.
 *
 * This module provides:
 * - Type definitions for OPFS operations
 * - Utility functions for path handling, hashing, and storage management
 * - Session management for isolated file operations per conversation
 * - Project management with multi-agent support
 *
 * Architecture:
 * - ProjectManager: Top-level manager for projects, each with its own agents
 * - AgentManager: Manages agents within a project
 * - SessionManager: Top-level manager for multiple session workspaces
 * - SessionWorkspace: Encapsulates single session's OPFS operations
 * - SessionPendingManager: Per-session pending sync queue management
 * - (Undo history is stored in SQLite, not OPFS)
 */

// Types
export type {
  FileContent,
  FileMetadata,
  FileStatus,
  PendingChange,
  UndoRecord,
  SyncResult,
  ConflictInfo,
  StorageEstimate,
  StorageStatus,
  SessionIndex,
  SessionMetadata,
} from './types/opfs-types'
export { STORAGE_THRESHOLDS } from './types/opfs-types'

// Utils
export {
  encodePath,
  decodePath,
  calculateHash,
  getFileContentType,
  isImageFile,
  isPdfFile,
  getStorageEstimate,
  requestPersistentStorage,
  getStorageStatus,
  hasEnoughSpace,
  estimateWriteSize,
  getDirectorySize,
  formatBytes,
  formatRelativeTime,
  isContentEqual,
  getFileMetadata,
  deepClone,
  generateId,
  safeJsonParse,
  delay,
  processBatch,
  getFileExtension,
  getFileName,
  normalizePath,
  joinPath,
  getDirectoryPath,
} from './utils/opfs-utils'

// File reader for diff operations
export {
  readFileFromOPFS,
  readFileFromNativeFS,
  readFileFromOPFSWithMeta,
  fileExistsInOPFS,
  fileExistsInNativeFS,
  readBinaryFileFromOPFS,
  readBinaryFileFromNativeFS,
} from './utils/file-reader'

// Session
export {
  SessionManager,
  SessionWorkspace,
  SessionPendingManager,
  getSessionManager,
  resetSessionManager,
} from './session'

// Project
export { ProjectManager, type ProjectInfo } from './project'

// Agent
export {
  AgentManager,
  type AgentMeta,
  type AgentInfo,
  getDefaultAgentTemplate,
  DEFAULT_AGENT_TEMPLATE,
  type AgentTemplate,
} from './agent'
