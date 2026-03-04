/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Session Workspace
 *
 * Encapsulates a single session's OPFS operations.
 * Coordinates cache, pending queue, and undo storage for file operations.
 */

import type {
  FileContent,
  FileMetadata,
  PendingChange,
  UndoRecord,
  SyncResult,
  FileScanItem,
  FileChange,
  ChangeDetectionResult,
  ErrorDetail,
  SystemLog,
} from '../types/opfs-types'
import { ErrorCode } from '../types/opfs-types'
import { SessionCacheManager } from './session-cache'
import { SessionPendingManager } from './session-pending'
import { SessionUndoStorage } from './session-undo'
import { scanFilesInWorker } from '@/workers/diff-worker-manager'

const SESSION_METADATA_FILE = 'session.json'
const FILES_DIR = 'files'

/**
 * Session metadata for persistence
 */
interface SessionMetadataPersist {
  sessionId: string
  createdAt: number
  lastAccessedAt: number
  rootDirectory: string
}

/**
 * Session Workspace
 *
 * Responsibilities:
 * - Encapsulate single session's OPFS operations
 * - Coordinate cache, pending queue, and undo storage
 * - Provide interfaces: readFile, writeFile, deleteFile, getPendingChanges, syncToDisk, clear
 */
export class SessionWorkspace {
  readonly sessionId: string
  readonly sessionDir: FileSystemDirectoryHandle
  readonly rootDirectory: string

  private readonly cacheManager: SessionCacheManager
  private readonly pendingManager: SessionPendingManager
  private readonly undoStorage: SessionUndoStorage

  private initialized = false
  private metadata: SessionMetadataPersist

  constructor(sessionId: string, sessionDir: FileSystemDirectoryHandle, rootDirectory: string) {
    this.sessionId = sessionId
    this.sessionDir = sessionDir
    this.rootDirectory = rootDirectory

    // Initialize managers
    this.cacheManager = new SessionCacheManager(sessionDir)
    this.pendingManager = new SessionPendingManager(sessionDir)
    this.undoStorage = new SessionUndoStorage(sessionDir)

    // Initial metadata
    this.metadata = {
      sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      rootDirectory,
    }
  }

  /**
   * Initialize session workspace
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Load or create metadata
    await this.loadMetadata()

    // Initialize all managers
    await Promise.all([
      this.cacheManager.initialize(),
      this.pendingManager.initialize(),
      this.undoStorage.initialize(),
    ])

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()

    this.initialized = true
  }

  /**
   * Load session metadata from OPFS
   */
  private async loadMetadata(): Promise<void> {
    try {
      const metadataFile = await this.sessionDir.getFileHandle(SESSION_METADATA_FILE)
      const file = await metadataFile.getFile()
      const text = await file.text()
      const data = JSON.parse(text) as SessionMetadataPersist

      this.metadata = data
    } catch {
      // Metadata doesn't exist yet, will be created on first save
      this.metadata = {
        sessionId: this.sessionId,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        rootDirectory: this.rootDirectory,
      }
    }
  }

  /**
   * Save session metadata to OPFS
   */
  private async saveMetadata(): Promise<void> {
    const metadataFile = await this.sessionDir.getFileHandle(SESSION_METADATA_FILE, {
      create: true,
    })
    const writable = await metadataFile.createWritable()

    await writable.write(JSON.stringify(this.metadata, null, 2))
    await writable.close()
  }

  /**
   * Read file from session (cache first)
   * @param path File path
   * @param directoryHandle Real filesystem directory handle
   * @returns File content and metadata
   */
  async readFile(
    path: string,
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<{ content: FileContent; metadata: FileMetadata }> {
    if (!this.initialized) await this.initialize()

    return await this.cacheManager.read(path, directoryHandle)
  }

  /**
   * Write file to session (cache + pending + undo)
   * @param path File path
   * @param content File content
   * @param directoryHandle Real filesystem directory handle (for old content)
   */
  async writeFile(
    path: string,
    content: FileContent,
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<void> {
    if (!this.initialized) await this.initialize()

    // Get old content for undo
    let oldContent: FileContent | undefined
    try {
      const oldData = await this.cacheManager.read(path, directoryHandle)
      oldContent = oldData.content
    } catch {
      // File doesn't exist, oldContent stays undefined
    }

    // Record to undo history
    await this.undoStorage.recordModification(path, content, oldContent)

    // Write to cache
    await this.cacheManager.write(path, content)

    // Mark as pending
    await this.pendingManager.add(path)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Delete file from session
   * @param path File path
   * @param directoryHandle Real filesystem directory handle (for old content)
   */
  async deleteFile(path: string, directoryHandle: FileSystemDirectoryHandle): Promise<void> {
    if (!this.initialized) await this.initialize()

    // Get old content for undo
    let oldContent: FileContent | undefined
    try {
      const oldData = await this.cacheManager.read(path, directoryHandle)
      oldContent = oldData.content
    } catch {
      // File doesn't exist in cache
    }

    // Record to undo history
    await this.undoStorage.recordDeletion(path, oldContent)

    // Delete from cache
    await this.cacheManager.delete(path)

    // Mark as pending for deletion
    await this.pendingManager.markForDeletion(path)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Get pending changes
   */
  getPendingChanges(): PendingChange[] {
    return this.pendingManager.getAll()
  }

  /**
   * Get pending count
   */
  get pendingCount(): number {
    return this.pendingManager.count
  }

  /**
   * Get undo records
   */
  getUndoRecords(): UndoRecord[] {
    return this.undoStorage.getAll()
  }

  /**
   * Get undo count
   */
  get undoCount(): number {
    return this.undoStorage.count
  }

  /**
   * Undo a specific operation
   * @param recordId Undo record ID
   */
  async undo(recordId: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    await this.undoStorage.undo(recordId, this.cacheManager)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Redo a specific operation
   * @param recordId Undo record ID
   */
  async redo(recordId: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    await this.undoStorage.redo(recordId, this.cacheManager)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Sync pending changes to real filesystem
   * @param directoryHandle Real filesystem directory handle
   * @returns Sync result
   */
  async syncToDisk(directoryHandle: FileSystemDirectoryHandle): Promise<SyncResult> {
    if (!this.initialized) await this.initialize()

    const result = await this.pendingManager.sync(directoryHandle, this.cacheManager)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()

    return result
  }

  /**
   * Clear all session data (cache, pending, undo)
   */
  async clear(): Promise<void> {
    await Promise.all([
      this.cacheManager.clear(),
      this.pendingManager.clear(),
      this.undoStorage.clear(),
    ])

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    cache: { size: number; fileCount: number }
    pending: number
    undo: number
    metadata: SessionMetadataPersist
  }> {
    const cacheStats = await this.cacheManager.getStats()

    return {
      cache: cacheStats,
      pending: this.pendingCount,
      undo: this.undoCount,
      metadata: { ...this.metadata },
    }
  }

  /**
   * Get cached file paths
   */
  getCachedPaths(): string[] {
    return this.cacheManager.getCachedPaths()
  }

  /**
   * Check if file is in cache
   * @param path File path
   */
  hasCachedFile(path: string): boolean {
    return this.cacheManager.has(path)
  }

  /**
   * Prune undo records older than specified days
   * @param days Age in days
   */
  async pruneUndoOlderThan(days: number): Promise<number> {
    if (!this.initialized) await this.initialize()

    const pruned = await this.undoStorage.pruneOlderThan(days)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()

    return pruned
  }

  /**
   * Get session metadata
   */
  getMetadata(): SessionMetadataPersist {
    return { ...this.metadata }
  }

  /**
   * Update root directory
   * @param rootDirectory New root directory
   */
  async updateRootDirectory(rootDirectory: string): Promise<void> {
    this.metadata.rootDirectory = rootDirectory
    await this.saveMetadata()
  }

  // ============ Dual Storage: Change Detection ============

  /**
   * Get the files/ directory handle (Agent workspace)
   * This is the mount point for Pyodide Python execution
   */
  async getFilesDir(): Promise<FileSystemDirectoryHandle> {
    return await this.sessionDir.getDirectoryHandle(FILES_DIR, { create: true })
  }

  /**
   * Get native directory handle for file preparation
   * @returns Native FS directory handle or null if not set
   */
  async getNativeDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.metadata.rootDirectory) return null

    try {
      // Try to get existing handle from session storage
      const handle = (globalThis as any).sessionWorkspace?.nativeHandles?.get(this.sessionId)
      if (handle) return handle

      // Need to request fresh handle from user
      return null
    } catch {
      return null
    }
  }

  /**
   * Validate file path format
   * Rules:
   * - Must start with /mnt/
   * - Use / separator (no backslashes)
   * - No .. or . path components
   * @param path File path to validate
   * @returns Validated normalized path or throws error
   */
  private validatePath(path: string): string {
    // Check for empty path
    if (!path || path.trim().length === 0) {
      throw new Error('文件路径不能为空')
    }

    // Normalize path separators
    let normalized = path.replace(/\\/g, '/')

    // Check for .. or . components
    const parts = normalized.split('/')
    if (parts.some((p) => p === '..' || p === '.')) {
      throw new Error('文件路径不能包含 .. 或 .')
    }

    // Remove leading /mnt/ if present for internal use
    if (normalized.startsWith('/mnt/')) {
      normalized = normalized.substring(5) // Remove /mnt/
    } else if (normalized.startsWith('/mnt')) {
      normalized = normalized.substring(5) // Remove /mnt
    } else if (!normalized.startsWith('/')) {
      throw new Error('文件路径必须以 /mnt/ 开头')
    }

    return normalized
  }

  /**
   * Prepare files: Copy from Native FS to OPFS files/
   * @param files File path list (relative to workspace root)
   * @param onProgress Optional progress callback for large files
   * @throws Error if file doesn't exist or path is invalid
   */
  async prepareFiles(
    files: string[],
    onProgress?: (file: string, progress: number) => void
  ): Promise<void> {
    if (!this.initialized) await this.initialize()

    const nativeDir = await this.getNativeDirectoryHandle()
    if (!nativeDir) {
      throw new Error('未设置 Native FS 目录句柄，请先选择项目目录')
    }

    const opfsFilesDir = await this.getFilesDir()

    for (const filePath of files) {
      try {
        // Validate and normalize path
        const normalizedPath = this.validatePath(filePath)

        // Get file from Native FS
        const fileHandle = await this.getFileHandle(nativeDir, normalizedPath)
        const file = await fileHandle.getFile()
        const size = file.size

        // Check if large file (>50MB)
        const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024
        if (size > LARGE_FILE_THRESHOLD && onProgress) {
          await this.copyFileWithProgress(
            fileHandle,
            opfsFilesDir,
            normalizedPath,
            (progress) => onProgress(filePath, progress)
          )
        } else {
          // Direct copy for small files
          const content = await file.arrayBuffer()
          await this.writeFileToOPFS(opfsFilesDir, normalizedPath, content)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`准备文件 ${filePath} 失败: ${message}`)
      }
    }
  }

  /**
   * Copy file with progress tracking
   */
  private async copyFileWithProgress(
    fileHandle: FileSystemFileHandle,
    targetDir: FileSystemDirectoryHandle,
    path: string,
    onProgress: (progress: number) => void
  ): Promise<void> {
    const file = await fileHandle.getFile()
    const size = file.size
    const chunkSize = 1024 * 1024 // 1MB chunks
    let offset = 0

    // Create target file
    const parts = path.split('/')
    const fileName = parts[parts.length - 1]
    let currentDir = targetDir

    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue
      try {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true })
      } catch {
        throw new Error(`创建目录 ${parts[i]} 失败`)
      }
    }

    const targetFile = await currentDir.getFileHandle(fileName, { create: true })
    const writable = await targetFile.createWritable()

    // Read and write in chunks
    while (offset < size) {
      const chunk = file.slice(offset, offset + chunkSize)
      const buffer = await chunk.arrayBuffer()
      await writable.write({ type: 'write', data: buffer, position: offset })

      offset += buffer.byteLength
      onProgress(Math.round((offset / size) * 100))
    }

    await writable.close()
  }

  /**
   * Write file to OPFS
   */
  private async writeFileToOPFS(
    targetDir: FileSystemDirectoryHandle,
    path: string,
    content: ArrayBuffer
  ): Promise<void> {
    const parts = path.split('/')
    const fileName = parts[parts.length - 1]
    let currentDir = targetDir

    // Create directories if needed
    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue
      try {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true })
      } catch {
        throw new Error(`创建目录 ${parts[i]} 失败`)
      }
    }

    // Write file
    const targetFile = await currentDir.getFileHandle(fileName, { create: true })
    const writable = await targetFile.createWritable()
    await writable.write(content)
    await writable.close()
  }

  /**
   * Scan files/ directory for change detection
   * @returns Map of file path -> FileScanItem
   */
  async scanFiles(): Promise<Map<string, FileScanItem>> {
    const filesDir = await this.getFilesDir()
    const result = new Map<string, FileScanItem>()

    async function scanDir(
      dir: FileSystemDirectoryHandle,
      prefix: string = ''
    ): Promise<void> {
      for await (const entry of dir.values()) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name

        if (entry.kind === 'file') {
          try {
            const file = await entry.getFile()
            result.set(path, {
              path,
              mtime: file.lastModified,
              size: file.size,
            })
          } catch {
            // File access error, skip
          }
        } else if (entry.kind === 'directory') {
          // Cast to directory handle and recursively scan
          await scanDir(entry as FileSystemDirectoryHandle, path)
        }
      }
    }

    await scanDir(filesDir)
    return result
  }

  /**
   * Detect changes between two file snapshots
   * @param before Snapshot before Python execution
   * @returns Change detection result
   */
  detectChanges(before: Map<string, FileScanItem>): ChangeDetectionResult {
    const changes: FileChange[] = []
    let added = 0
    let modified = 0
    let deleted = 0

    const beforePaths = new Set(before.keys())
    const afterMap = this.scanFilesCache ?? new Map()

    // Check for added and modified files (in after but not in before, or different mtime)
    for (const [path, item] of afterMap.entries()) {
      const beforeItem = before.get(path)

      if (!beforeItem) {
        // New file
        changes.push({ type: 'add', path, size: item.size, mtime: item.mtime })
        added++
      } else if (beforeItem.mtime !== item.mtime) {
        // Modified file
        changes.push({ type: 'modify', path, size: item.size, mtime: item.mtime })
        modified++
      }
    }

    // Check for deleted files (in before but not in after)
    for (const path of beforePaths) {
      if (!afterMap.has(path)) {
        changes.push({ type: 'delete', path })
        deleted++
      }
    }

    return { changes, added, modified, deleted }
  }

  /**
   * Cache for scanFiles result (for performance)
   */
  private scanFilesCache?: Map<string, FileScanItem>

  /**
   * Scan files with caching
   * @returns File scan snapshot
   */
  async scanFilesWithCache(): Promise<Map<string, FileScanItem>> {
    const result = await this.scanFiles()
    this.scanFilesCache = result
    return result
  }

  /**
   * Refresh pending changes - independent of Python tool execution
   *
   * This method scans OPFS files/ directory and compares with pending.json
   * to detect any changes made outside of Python tool workflow.
   * Updates pending.json with new changes found.
   *
   * Use cases:
   * - User opens "Pending Sync" panel to see latest changes
   * - Files uploaded/created through non-python tools
   * - Manual file operations in OPFS
   *
   * @returns Change detection result
   */
  async refreshPendingChanges(): Promise<ChangeDetectionResult> {
    const normalizeComparePath = (p: string): string => {
      // Worker scan keys are relative paths without leading slash.
      // Pending records may include a leading "/" in some flows.
      return p.startsWith('/') ? p.slice(1) : p
    }

    // 1. Get current pending changes (from previous operations)
    const existingPending = await this.pendingManager.getAll()
    const existingPaths = new Map(existingPending.map((p) => [normalizeComparePath(p.path), p]))

    // 2. Scan current OPFS state using Worker (bypass cache)
    const filesDir = await this.getFilesDir()
    const currentFiles = await scanFilesInWorker(filesDir)

    // 3. Reconcile pending queue against current OPFS state
    const detectedChanges: FileChange[] = []
    let detectedAdded = 0
    let detectedModified = 0
    let detectedDeleted = 0

    // Check for new or modified files (in OPFS but not in pending, or different mtime)
    for (const [path, item] of currentFiles.entries()) {
      const pendingItem = existingPaths.get(path)

      if (!pendingItem) {
        // New file in OPFS (not in pending.json) - add as created
        await this.pendingManager.markAsCreated(path)
        detectedChanges.push({ type: 'add', path, size: item.size, mtime: item.mtime })
        detectedAdded++
      } else if (pendingItem.type !== 'delete' && pendingItem.fsMtime !== item.mtime) {
        // File was modified after being added to pending - update mtime
        // Note: fsMtime will be set during sync, just update timestamp here
        await this.pendingManager.add(path) // This updates timestamp
        detectedChanges.push({ type: 'modify', path, size: item.size, mtime: item.mtime })
        detectedModified++
      }
      // If pending item is 'delete', file was restored - remove from pending
      else if (pendingItem.type === 'delete') {
        // File restored, remove delete record
        const deleteRecordId = existingPending.find(
          (p) => normalizeComparePath(p.path) === path && p.type === 'delete'
        )?.id
        if (deleteRecordId) {
          await this.pendingManager.remove(deleteRecordId)
        }
        // Now add as created/modified
        await this.pendingManager.markAsCreated(path)
        detectedChanges.push({ type: 'add', path, size: item.size, mtime: item.mtime })
        detectedAdded++
      }
    }

    // Check for deleted files (in pending but not in current OPFS scan)
    for (const pending of existingPending) {
      if (pending.type !== 'delete' && !currentFiles.has(normalizeComparePath(pending.path))) {
        // File was deleted, add delete record
        await this.pendingManager.markForDeletion(pending.path)
        detectedChanges.push({ type: 'delete', path: pending.path })
        detectedDeleted++
      }
    }

    // Update cache with fresh scan
    this.scanFilesCache = currentFiles

    // IMPORTANT: UI pending panels expect the full pending snapshot, not just newly detected deltas.
    const latestPending = await this.pendingManager.getAll()
    const changes: FileChange[] = latestPending.map((pending) => {
      if (pending.type === 'delete') {
        return { type: 'delete', path: pending.path }
      }
      const file = currentFiles.get(normalizeComparePath(pending.path))
      return {
        type: pending.type === 'create' ? 'add' : 'modify',
        path: pending.path,
        size: file?.size,
        mtime: file?.mtime,
      }
    })

    const added = changes.filter((c) => c.type === 'add').length
    const modified = changes.filter((c) => c.type === 'modify').length
    const deleted = changes.filter((c) => c.type === 'delete').length

    console.log('[SessionWorkspace] Pending changes refreshed (via worker):', {
      changes: changes.length,
      added,
      modified,
      deleted,
      detectedChanges: detectedChanges.length,
      detectedAdded,
      detectedModified,
      detectedDeleted,
    })

    return { changes, added, modified, deleted }
  }

  /**
   * Sync selected changes to Native FS
   * @param directoryHandle Native FS directory handle
   * @param changes Changes to sync
   * @returns Sync result
   */
  async syncToNative(
    directoryHandle: FileSystemDirectoryHandle,
    changes: FileChange[]
  ): Promise<{ synced: number; failed: number }> {
    if (!this.initialized) await this.initialize()

    let synced = 0
    let failed = 0
    const filesDir = await this.getFilesDir()

    for (const change of changes) {
      try {
        if (change.type === 'delete') {
          await this.deleteFromNative(directoryHandle, change.path)
        } else {
          await this.copyToNative(directoryHandle, filesDir, change.path)
        }
        synced++
      } catch (err) {
        console.error(`Failed to sync ${change.path}:`, err)
        failed++
      }
    }

    // Clear cache after sync
    this.scanFilesCache = undefined

    return { synced, failed }
  }

  /**
   * Copy file from OPFS to Native FS
   */
  private async copyToNative(
    nativeDir: FileSystemDirectoryHandle,
    opfsDir: FileSystemDirectoryHandle,
    path: string
  ): Promise<void> {
    const parts = path.split('/')
    const fileName = parts[parts.length - 1]

    // Navigate to parent directory in OPFS
    let opfsCurrent = opfsDir
    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue
      opfsCurrent = await opfsCurrent.getDirectoryHandle(parts[i])
    }

    // Read file from OPFS
    const opfsFile = await opfsCurrent.getFileHandle(fileName)
    const file = await opfsFile.getFile()
    const content = await file.arrayBuffer()

    // Navigate to parent directory in Native FS
    let nativeCurrent = nativeDir
    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue
      try {
        nativeCurrent = await nativeCurrent.getDirectoryHandle(parts[i], { create: true })
      } catch {
        throw new Error(`Failed to create directory: ${parts[i]}`)
      }
    }

    // Write to Native FS
    const nativeFile = await nativeCurrent.getFileHandle(fileName, { create: true })
    const writable = await nativeFile.createWritable()
    await writable.write(content)
    await writable.close()
  }

  /**
   * Delete file from Native FS
   */
  private async deleteFromNative(
    nativeDir: FileSystemDirectoryHandle,
    path: string
  ): Promise<void> {
    const parts = path.split('/')
    const fileName = parts[parts.length - 1]

    // Navigate to parent directory
    let current = nativeDir
    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue
      current = await current.getDirectoryHandle(parts[i])
    }

    // Delete file
    await current.removeEntry(fileName)
  }

  //=============================================================================
  // Helper Methods
  //=============================================================================

  /**
   * Get file handle from Native FS by path
   * @param nativeDir Root directory handle
   * @param path Relative path from root
   * @returns File handle
   */
  private async getFileHandle(
    nativeDir: FileSystemDirectoryHandle,
    path: string
  ): Promise<FileSystemFileHandle> {
    const parts = path.split('/')
    let current = nativeDir

    // Navigate to parent directory
    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue
      current = await current.getDirectoryHandle(parts[i])
    }

    // Get file handle
    const fileName = parts[parts.length - 1]
    return await current.getFileHandle(fileName)
  }

  //=============================================================================
  // Error Handling
  //=============================================================================

  /**
   * System log storage for debugging
   * In production, this would be sent to a logging service
   */
  private systemLogs: SystemLog[] = []

  /**
   * Add system log entry
   */
  private logError(level: SystemLog['level'], code: ErrorCode, message: string, context?: Record<string, unknown>, stack?: string): void {
    const logEntry: SystemLog = {
      timestamp: Date.now(),
      level,
      code,
      message,
      context,
      stack,
    }
    this.systemLogs.push(logEntry)

    // Keep only last 100 logs to prevent memory overflow
    if (this.systemLogs.length > 100) {
      this.systemLogs = this.systemLogs.slice(-100)
    }

    // In development, log to console
    if (import.meta.env.DEV) {
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
        `[${ErrorCode[code]}]`,
        message,
        context,
        stack,
      )
    }
  }

  /**
   * Unified error handler with user-friendly messages
   *
   * @param error - The error object or error code
   * @param context - Additional context information
   * @returns ErrorDetail with user-friendly message
   */
  handleError(error: unknown | ErrorCode, context?: Record<string, unknown>): ErrorDetail {
    let code: ErrorCode
    let message: string
    let stack: string | undefined

    // If error code is passed directly
    if (typeof error === 'number') {
      code = error
      message = this.getDefaultErrorMessage(error)
      this.logError('info', code, message, context)
      return {
        code,
        message,
        context,
        recoverable: this.isRecoverable(code),
      }
    }

    // Error object or string
    if (error instanceof Error) {
      stack = error.stack
      // Map error message to error code
      code = this.mapMessageToErrorCode(error.message)
      message = this.getDefaultErrorMessage(code)
    } else if (typeof error === 'string') {
      code = this.mapMessageToErrorCode(error)
      message = this.getDefaultErrorMessage(code)
    } else {
      code = ErrorCode.FILE_READ_FAILED
      message = '未知错误'
    }

    // Log the error
    this.logError('error', code, message, context, stack)

    return {
      code,
      message,
      context,
      recoverable: this.isRecoverable(code),
      suggestion: this.getSuggestion(code),
    }
  }

  /**
   * Get default user-friendly error message by error code
   */
  private getDefaultErrorMessage(code: ErrorCode): string {
    const messages: Partial<Record<ErrorCode, string>> = {
      // File operation errors
      [ErrorCode.FILE_NOT_FOUND]: '文件不存在',
      [ErrorCode.FILE_READ_FAILED]: '文件读取失败',
      [ErrorCode.FILE_WRITE_FAILED]: '文件写入失败',
      [ErrorCode.FILE_TOO_LARGE]: '文件太大，无法处理',
      [ErrorCode.INVALID_PATH_FORMAT]: '文件路径格式无效',
      [ErrorCode.PATH_TRAVERSAL_DETECTED]: '检测到路径遍历攻击',

      // Directory operation errors
      [ErrorCode.DIRECTORY_NOT_FOUND]: '目录不存在',
      [ErrorCode.DIRECTORY_CREATE_FAILED]: '目录创建失败',

      // Sync operation errors
      [ErrorCode.SYNC_CONFLICT_DETECTED]: '同步冲突：文件已被修改',
      [ErrorCode.SYNC_OPERATION_FAILED]: '同步操作失败',
      [ErrorCode.SYNC_PARTIAL_SUCCESS]: '部分文件同步成功',

      // Permission and authorization errors
      [ErrorCode.PERMISSION_DENIED]: '权限被拒绝',
      [ErrorCode.AUTHORIZATION_REQUIRED]: '需要授权',
      [ErrorCode.HANDLE_INVALID]: '文件句柄无效',

      // System-level errors
      [ErrorCode.OPFS_NOT_AVAILABLE]: '浏览器不支持 OPFS',
      [ErrorCode.STORAGE_QUOTA_EXCEEDED]: '存储空间不足',
      [ErrorCode.BROWSER_NOT_SUPPORTED]: '浏览器不支持此功能',
    }

    return messages[code] || '未知错误'
  }

  /**
   * Map error message to error code
   */
  private mapMessageToErrorCode(message: string): ErrorCode {
    const lowerMessage = message.toLowerCase()

    // File operation errors
    if (lowerMessage.includes('not found') || lowerMessage.includes('不存在')) {
      return ErrorCode.FILE_NOT_FOUND
    }
    if (lowerMessage.includes('read failed') || lowerMessage.includes('读取失败')) {
      return ErrorCode.FILE_READ_FAILED
    }
    if (lowerMessage.includes('write failed') || lowerMessage.includes('写入失败')) {
      return ErrorCode.FILE_WRITE_FAILED
    }
    if (lowerMessage.includes('too large') || lowerMessage.includes('太大')) {
      return ErrorCode.FILE_TOO_LARGE
    }
    if (lowerMessage.includes('path') && (lowerMessage.includes('invalid') || lowerMessage.includes('格式'))) {
      return ErrorCode.INVALID_PATH_FORMAT
    }
    if (lowerMessage.includes('..') || lowerMessage.includes('path traversal')) {
      return ErrorCode.PATH_TRAVERSAL_DETECTED
    }

    // Directory operation errors
    if (lowerMessage.includes('directory') && lowerMessage.includes('not found')) {
      return ErrorCode.DIRECTORY_NOT_FOUND
    }
    if (lowerMessage.includes('create') && lowerMessage.includes('directory')) {
      return ErrorCode.DIRECTORY_CREATE_FAILED
    }

    // Permission errors
    if (lowerMessage.includes('permission') || lowerMessage.includes('权限')) {
      return ErrorCode.PERMISSION_DENIED
    }
    if (lowerMessage.includes('authorization') || lowerMessage.includes('授权')) {
      return ErrorCode.AUTHORIZATION_REQUIRED
    }
    if (lowerMessage.includes('handle') && lowerMessage.includes('invalid')) {
      return ErrorCode.HANDLE_INVALID
    }

    // System errors
    if (lowerMessage.includes('opfs') || lowerMessage.includes('storage')) {
      return ErrorCode.OPFS_NOT_AVAILABLE
    }
    if (lowerMessage.includes('quota') || lowerMessage.includes('空间')) {
      return ErrorCode.STORAGE_QUOTA_EXCEEDED
    }
    if (lowerMessage.includes('browser') || lowerMessage.includes('浏览器')) {
      return ErrorCode.BROWSER_NOT_SUPPORTED
    }

    // Default
    return ErrorCode.FILE_READ_FAILED
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverable(code: ErrorCode): boolean {
    const recoverableErrors = new Set<ErrorCode>([
      ErrorCode.FILE_NOT_FOUND,
      ErrorCode.FILE_READ_FAILED,
      ErrorCode.DIRECTORY_NOT_FOUND,
      ErrorCode.PERMISSION_DENIED,
      ErrorCode.AUTHORIZATION_REQUIRED,
      ErrorCode.HANDLE_INVALID,
      ErrorCode.SYNC_PARTIAL_SUCCESS,
    ])

    return recoverableErrors.has(code)
  }

  /**
   * Get suggestion for error recovery
   */
  private getSuggestion(code: ErrorCode): string | undefined {
    const suggestions: Partial<Record<ErrorCode, string>> = {
      [ErrorCode.FILE_NOT_FOUND]: '请检查文件路径是否正确',
      [ErrorCode.FILE_READ_FAILED]: '请检查文件权限或重试',
      [ErrorCode.PERMISSION_DENIED]: '请检查文件权限设置',
      [ErrorCode.AUTHORIZATION_REQUIRED]: '请先选择项目目录',
      [ErrorCode.INVALID_PATH_FORMAT]: '路径必须以 /mnt/ 开头',
      [ErrorCode.STORAGE_QUOTA_EXCEEDED]: '请清理缓存或删除不需要的文件',
      [ErrorCode.PATH_TRAVERSAL_DETECTED]: '文件路径不能包含 .. 或 .',
    }

    return suggestions[code]
  }

  /**
   * Get system logs (for debugging)
   */
  getSystemLogs(): SystemLog[] {
    return [...this.systemLogs]
  }

  /**
   * Clear system logs
   */
  clearSystemLogs(): void {
    this.systemLogs = []
  }
}
