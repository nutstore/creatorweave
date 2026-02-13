/**
 * OPFS (Origin Private File System) Module
 *
 * Multi-session workspace architecture for browser file system operations.
 *
 * This module provides:
 * - Type definitions for OPFS operations
 * - Utility functions for path handling, hashing, and storage management
 * - Session management for isolated file operations per conversation
 *
 * Architecture:
 * - SessionManager: Top-level manager for multiple session workspaces
 * - SessionWorkspace: Encapsulates single session's OPFS operations
 * - SessionCacheManager: Per-session file caching with mtime-based change detection
 * - SessionPendingManager: Per-session pending sync queue management
 * - SessionUndoStorage: Per-session undo history stored in OPFS
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
  SessionCacheManager,
  SessionPendingManager,
  SessionUndoStorage,
  getSessionManager,
  resetSessionManager,
} from './session'
