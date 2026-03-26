/**
 * OPFS (Origin Private File System) Type Definitions
 *
 * Core types for multi-workspace OPFS architecture.
 */

/**
 * File content type - supports both text and binary
 */
export type FileContent = string | ArrayBuffer | Blob

/**
 * File metadata
 */
export interface FileMetadata {
  /** File path */
  path: string
  /** File modification time (for change detection) */
  mtime: number
  /** File size in bytes */
  size: number
  /** Content type */
  contentType: 'text' | 'binary'
  /** Optional: content hash (for quick comparison) */
  hash?: string
}

/**
 * Workspace metadata
 */
export interface WorkspaceMetadata {
  /** Workspace ID */
  id: string
  /** Workspace name */
  name: string
  /** Creation time */
  createdAt: number
  /** Last active time */
  lastActiveAt: number
  /** Cache size in bytes */
  cacheSize: number
  /** Pending sync count */
  pendingCount: number
  /** Number of files modified by this workspace */
  modifiedFiles: number
  /** Workspace status */
  status: 'active' | 'archived'
}

/**
 * Workspace index structure.
 */
export interface WorkspaceIndex {
  /** Metadata for all workspaces */
  workspaces: WorkspaceMetadata[]
  /** Currently active workspace ID */
  activeWorkspaceId: string
  /** Last modified time */
  lastModified: number
}

/**
 * File modification status
 */
export type FileStatus =
  /** Not modified */
  | 'unmodified'
  /** Modified by current workspace */
  | 'modified-by-current'
  /** Modified by another workspace */
  | 'modified-by-other'
  /** Modified by multiple workspaces */
  | 'modified-by-multiple'

/**
 * Pending sync record - stores metadata only, not content
 * Content is read directly from OPFS and real filesystem when comparing
 */
export interface PendingChange {
  /** Unique ID */
  id: string
  /** File path */
  path: string
  /** Operation type */
  type: 'create' | 'modify' | 'delete'
  /** Real file modification time (for conflict detection) */
  fsMtime: number
  /** Operation timestamp */
  timestamp: number
  /** Associated Agent message ID */
  agentMessageId?: string
  /** Optional snapshot id that this change belongs to */
  snapshotId?: string
  /** Optional snapshot status */
  snapshotStatus?: 'draft' | 'committed' | 'approved' | 'rolled_back'
  /** Optional snapshot summary */
  snapshotSummary?: string
  /** Optional review status for change-review workflow */
  reviewStatus?: 'pending' | 'approved' | 'rejected'
}

/**
 * Undo record - content is stored in OPFS
 */
export interface UndoRecord {
  /** Unique ID */
  id: string
  /** File path */
  path: string
  /** Operation type */
  type: 'create' | 'modify' | 'delete'
  /** Path to old content in OPFS (not in memory) */
  oldContentPath?: string
  /** Path to new content in OPFS */
  newContentPath?: string
  /** Operation timestamp */
  timestamp: number
  /** Whether the record has been undone */
  undone: boolean
}

/**
 * Sync result
 */
export interface SyncResult {
  /** Number of successful syncs */
  success: number
  /** Number of failed syncs */
  failed: number
  /** Number of skipped syncs (conflicts, etc.) */
  skipped: number
  /** Conflict list */
  conflicts: ConflictInfo[]
}

/**
 * Conflict information
 */
export interface ConflictInfo {
  /** File path */
  path: string
  /** Current workspace id */
  workspaceId: string
  /** Other workspaces that modified this file */
  otherWorkspaces: string[]
  /** OPFS version timestamp */
  opfsMtime: number
  /** Current filesystem file timestamp */
  currentFsMtime: number
}

/**
 * Storage status
 */
export type StorageStatus = 'normal' | 'warning' | 'urgent' | 'critical' | 'full'

/**
 * Storage threshold configuration
 */
export const STORAGE_THRESHOLDS = {
  /** 70% - Show notification */
  WARNING: 0.7,
  /** 80% - Block large files */
  URGENT: 0.8,
  /** 95% - Block most operations */
  CRITICAL: 0.95,
  /** 100% - Must clean up */
  FULL: 1.0,
} as const

/**
 * Storage estimate
 */
export interface StorageEstimate {
  /** Total quota in bytes */
  quota: number
  /** Usage in bytes */
  usage: number
  /** Storage details by type (only in some browsers) */
  usageDetails?: {
    [key: string]: number
  }
}

/**
 * OPFS detailed usage breakdown
 */
export interface DetailedUsage {
  /** Project file cache size */
  projectFiles: number
  /** Undo history size */
  undoHistory: number
  /** Other cache size */
  cache: number
  /** Temporary file size */
  temp: number
  /** Total */
  total: number
}

// ============ Dual Storage Types ============

/**
 * Change type for file modifications
 */
export type ChangeType = 'add' | 'modify' | 'delete'

/**
 * Native filesystem directory handle type
 * Browser File System Access API handle
 */
export type NativeFSDirectoryHandle = FileSystemDirectoryHandle

/**
 * Directory picker options
 */
export interface DirectoryPickerOptions {
  /** Suggested start directory path */
  startIn?: string
  /** Access mode */
  mode?: 'read' | 'readwrite' | 'readwrite-experimental'
  /** Allow multiple selection */
  multiple?: boolean
}

/**
 * Directory handle storage entry
 */
export interface StoredDirectoryHandle {
  /** Workspace ID */
  workspaceId: string
  /** Serialized handle reference */
  handleRef: string
  /** Storage timestamp */
  timestamp: number
  /** Handle status */
  status: 'active' | 'expired' | 'revoked'
}

/**
 * File scan result item for change detection
 */
export interface FileScanItem {
  /** Relative path from files/ root */
  path: string
  /** Modification time */
  mtime: number
  /** File size in bytes */
  size: number
}

/**
 * Detected file change
 */
export interface FileChange {
  /** Change type */
  type: ChangeType
  /** Relative path from files/ root */
  path: string
  /** File size (for add/modify) */
  size?: number
  /** Modification time */
  mtime?: number
  /** Optional snapshot id that this file change belongs to */
  snapshotId?: string
  /** Optional snapshot status */
  snapshotStatus?: 'draft' | 'committed' | 'approved' | 'rolled_back'
  /** Optional snapshot summary */
  snapshotSummary?: string
  /** Optional review status for change-review workflow */
  reviewStatus?: 'pending' | 'approved' | 'rejected'
}

/**
 * Change detection result
 */
export interface ChangeDetectionResult {
  /** List of changes */
  changes: FileChange[]
  /** Count of added files */
  added: number
  /** Count of modified files */
  modified: number
  /** Count of deleted files */
  deleted: number
}

/**
 * File read result with source tracking
 */
export interface FileReadResult {
  /** File content */
  content: string | Uint8Array
  /** Source of the file */
  source: 'native-fs' | 'opfs'
  /** Cache timestamp (if from OPFS) */
  cachedAt?: number
}

// ============ Error Handling Types ============

/**
 * Error codes for dual storage system
 */
export enum ErrorCode {
  // File operation errors (1xxx)
  FILE_NOT_FOUND = 1001,
  FILE_READ_FAILED = 1002,
  FILE_WRITE_FAILED = 1003,
  FILE_TOO_LARGE = 1004,
  INVALID_PATH_FORMAT = 1005,
  PATH_TRAVERSAL_DETECTED = 1006,

  // Directory operation errors (2xxx)
  DIRECTORY_NOT_FOUND = 2001,
  DIRECTORY_CREATE_FAILED = 2002,

  // Sync operation errors (3xxx)
  SYNC_CONFLICT_DETECTED = 3001,
  SYNC_OPERATION_FAILED = 3002,
  SYNC_PARTIAL_SUCCESS = 3003,

  // Permission and authorization errors (4xxx)
  PERMISSION_DENIED = 4001,
  AUTHORIZATION_REQUIRED = 4002,
  HANDLE_INVALID = 4003,

  // System-level errors (5xxx)
  OPFS_NOT_AVAILABLE = 5001,
  STORAGE_QUOTA_EXCEEDED = 5002,
  BROWSER_NOT_SUPPORTED = 5003,
}

/**
 * Error detail interface for user-facing errors
 */
export interface ErrorDetail {
  code: ErrorCode
  message: string
  context?: Record<string, unknown>  // Additional context information
  recoverable: boolean            // Whether error is recoverable
  suggestion?: string            // Suggestion for user
}

/**
 * System log entry (not shown to user directly)
 */
export interface SystemLog {
  timestamp: number
  level: 'debug' | 'info' | 'warn' | 'error'
  code: ErrorCode
  message: string
  context?: Record<string, unknown>
  stack?: string
}

/**
 * Validation result with error info
 */
export interface ValidationResult {
  valid: boolean
  error?: {
    code: ErrorCode
    message: string
  }
}

/**
 * Conflict detail for sync operations
 */
export interface ConflictDetail {
  path: string
  opfsVersion: {
    /** Current workspace id */
    workspaceId: string
    mtime: number
  }
  nativeVersion: {
    exists: boolean
    mtime?: number
  }
  resolution?: 'opfs' | 'native' | 'skip' | 'cancel'
}
