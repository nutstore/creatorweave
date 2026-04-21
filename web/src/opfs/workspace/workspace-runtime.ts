/**
 * Workspace Runtime
 *
 * Encapsulates a single workspace's OPFS operations.
 * Coordinates pending queue for file operations.
 * Undo/redo is handled by SQLite fs_snapshot_files table.
 */

import type {
  FileContent,
  FileMetadata,
  PendingChange,
  SyncResult,
  FileScanItem,
  FileChange,
  ChangeDetectionResult,
  ErrorDetail,
  SystemLog,
  ConflictInfo,
} from '../types/opfs-types'
import { ErrorCode } from '../types/opfs-types'
import { getFileContentType } from '../utils/opfs-utils'
import { WorkspacePendingManager } from './workspace-pending'
import {
  buildConflictMarkerContent,
  hasConflictMarkers,
} from './conflict-markers'
import { scanFilesInWorker } from '@/workers/diff-worker-manager'
import { getRuntimeDirectoryHandle } from '@/native-fs'
import { getFSOverlayRepository } from '@/sqlite/repositories/fs-overlay.repository'

const WORKSPACE_METADATA_FILE = 'workspace.json'
const FILES_DIR = 'files'
const BASELINE_DIR = '.baseline'

/**
 * Workspace metadata for persistence.
 */
interface WorkspaceMetadataPersist {
  workspaceId: string
  createdAt: number
  lastAccessedAt: number
  rootDirectory: string
}

/**
 * Workspace Runtime
 *
 * Responsibilities:
 * - Encapsulate single workspace's OPFS operations
 * - Coordinate pending queue for file operations
 * - All file content is stored directly in files/ directory
 * - Undo/redo handled by SQLite fs_snapshot_files
 */
export class WorkspaceRuntime {
  readonly workspaceId: string
  readonly workspaceDir: FileSystemDirectoryHandle
  readonly rootDirectory: string

  private readonly pendingManager: WorkspacePendingManager

  /** In-memory index of files stored in files/ directory */
  private filesIndex: Set<string> = new Set()

  private initialized = false
  private metadata: WorkspaceMetadataPersist

  constructor(workspaceId: string, workspaceDir: FileSystemDirectoryHandle, rootDirectory: string) {
    this.workspaceId = workspaceId
    this.workspaceDir = workspaceDir
    this.rootDirectory = rootDirectory

    // Initialize pending manager (files/ is the source of truth)
    this.pendingManager = new WorkspacePendingManager(workspaceId, workspaceDir)

    // Initial metadata
    this.metadata = {
      workspaceId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      rootDirectory,
    }
  }

  /**
   * Initialize workspace runtime
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Load or create metadata
    await this.loadMetadata()

    // Initialize pending manager
    await this.pendingManager.initialize()

    // Build files index from existing files/ directory
    await this.buildFilesIndex()

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()

    this.initialized = true
  }

  /**
   * Load workspace metadata from OPFS
   */
  private async loadMetadata(): Promise<void> {
    const toMetadata = (data: unknown): WorkspaceMetadataPersist => {
      const obj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
      const persistedWorkspaceId =
        typeof obj.workspaceId === 'string'
          ? obj.workspaceId
          : this.workspaceId
      const createdAt = typeof obj.createdAt === 'number' ? obj.createdAt : Date.now()
      const lastAccessedAt = typeof obj.lastAccessedAt === 'number' ? obj.lastAccessedAt : createdAt
      const rootDirectory =
        typeof obj.rootDirectory === 'string' && obj.rootDirectory.length > 0
          ? obj.rootDirectory
          : this.rootDirectory

      return {
        workspaceId: persistedWorkspaceId,
        createdAt,
        lastAccessedAt,
        rootDirectory,
      }
    }

    try {
      const metadataFile = await this.workspaceDir.getFileHandle(WORKSPACE_METADATA_FILE)
      const file = await metadataFile.getFile()
      const text = await file.text()
      this.metadata = toMetadata(JSON.parse(text))
    } catch {
      // Metadata doesn't exist yet, will be created on first save.
      this.metadata = {
        workspaceId: this.workspaceId,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        rootDirectory: this.rootDirectory,
      }
    }
  }

  /**
   * Save workspace metadata to OPFS
   */
  private async saveMetadata(): Promise<void> {
    const metadataFile = await this.workspaceDir.getFileHandle(WORKSPACE_METADATA_FILE, {
      create: true,
    })
    const writable = await metadataFile.createWritable()
    const dataToPersist: WorkspaceMetadataPersist = {
      workspaceId: this.workspaceId,
      createdAt: this.metadata.createdAt,
      lastAccessedAt: this.metadata.lastAccessedAt,
      rootDirectory: this.metadata.rootDirectory,
    }
    await writable.write(JSON.stringify(dataToPersist, null, 2))
    await writable.close()
  }

  // ============ Files Directory Operations (replaces cache) ============

  /**
   * Build in-memory index of files in files/ directory
   */
  private async buildFilesIndex(): Promise<void> {
    this.filesIndex.clear()
    try {
      const filesDir = await this.getFilesDir()
      await this.scanDirRecursive(filesDir, '', this.filesIndex)
    } catch {
      // files/ directory doesn't exist yet
    }
  }

  /**
   * Recursively scan directory and add paths to index
   */
  private async scanDirRecursive(
    dir: FileSystemDirectoryHandle,
    prefix: string,
    index: Set<string>
  ): Promise<void> {
    for await (const [name, handle] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name
      if (handle.kind === 'file') {
        index.add(path)
      } else {
        await this.scanDirRecursive(handle as FileSystemDirectoryHandle, path, index)
      }
    }
  }

  /**
   * Read file content from files/ directory
   * @returns Content, mtime, size, contentType or null if not found
   */
  private async readFromFilesDir(
    path: string
  ): Promise<{ content: FileContent; mtime: number; size: number; contentType: 'text' | 'binary' } | null> {
    try {
      const filesDir = await this.getFilesDir()
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) return null

      let current = filesDir
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
      }

      const fileHandle = await current.getFileHandle(parts[parts.length - 1])
      const file = await fileHandle.getFile()
      let content: FileContent
      const contentType = getFileContentType(path)
      if (contentType === 'text') {
        content = await file.text()
      } else {
        content = await file.arrayBuffer()
      }
      return {
        content,
        mtime: file.lastModified,
        size: file.size,
        contentType,
      }
    } catch {
      return null
    }
  }

  /**
   * Write file content to files/ directory
   */
  private async writeToFilesDir(path: string, content: FileContent): Promise<void> {
    const filesDir = await this.getFilesDir()
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) return

    const fileName = parts[parts.length - 1]
    let currentDir = filesDir

    // Create directories if needed
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true })
    }

    // Write file
    const targetFile = await currentDir.getFileHandle(fileName, { create: true })
    const writable = await targetFile.createWritable()
    await writable.write(content)
    await writable.close()

    // Update index
    this.filesIndex.add(path)
  }

  /**
   * Delete file from files/ directory
   */
  private async deleteFromFilesDir(path: string): Promise<void> {
    try {
      const filesDir = await this.getFilesDir()
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) return

      let current = filesDir
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
      }
      await current.removeEntry(parts[parts.length - 1])

      // Update index
      this.filesIndex.delete(path)
    } catch {
      // File doesn't exist, ignore
    }
  }

  /**
   * Delete file from files/ directory if it exists (alias for deleteFromFilesDir)
   */
  private async deleteFromFilesDirIfExists(path: string): Promise<void> {
    await this.deleteFromFilesDir(path)
  }

  /**
   * Read file content from .baseline/ directory.
   */
  private async readFromBaselineDir(
    path: string
  ): Promise<{ content: FileContent; mtime: number; size: number; contentType: 'text' | 'binary' } | null> {
    try {
      const baselineDir = await this.getBaselineDir()
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) return null

      let current = baselineDir
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
      }

      const fileHandle = await current.getFileHandle(parts[parts.length - 1])
      const file = await fileHandle.getFile()
      let content: FileContent
      const contentType = getFileContentType(path)
      if (contentType === 'text') {
        content = await file.text()
      } else {
        content = await file.arrayBuffer()
      }
      return {
        content,
        mtime: file.lastModified,
        size: file.size,
        contentType,
      }
    } catch {
      return null
    }
  }

  private async contentToBytes(content: FileContent): Promise<Uint8Array> {
    if (typeof content === 'string') {
      return new TextEncoder().encode(content)
    }
    if (content instanceof Blob) {
      return new Uint8Array(await content.arrayBuffer())
    }
    return new Uint8Array(content)
  }

  private async areFileContentsEqual(left: FileContent, right: FileContent): Promise<boolean> {
    const leftBytes = await this.contentToBytes(left)
    const rightBytes = await this.contentToBytes(right)
    if (leftBytes.byteLength !== rightBytes.byteLength) return false
    for (let i = 0; i < leftBytes.byteLength; i++) {
      if (leftBytes[i] !== rightBytes[i]) return false
    }
    return true
  }

  /**
   * Write file content to .baseline/ directory.
   */
  private async writeToBaselineDir(path: string, content: FileContent): Promise<void> {
    const baselineDir = await this.getBaselineDir()
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) return

    const fileName = parts[parts.length - 1]
    let currentDir = baselineDir

    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true })
    }

    const targetFile = await currentDir.getFileHandle(fileName, { create: true })
    const writable = await targetFile.createWritable()
    await writable.write(content)
    await writable.close()
  }

  /**
   * Delete file from .baseline/ directory if it exists.
   */
  private async deleteFromBaselineDirIfExists(path: string): Promise<void> {
    try {
      const baselineDir = await this.getBaselineDir()
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) return

      let current = baselineDir
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
      }

      await current.removeEntry(parts[parts.length - 1])
    } catch {
      // Ignore if baseline entry doesn't exist.
    }
  }

  /**
   * Capture baseline content for modify operations.
   * - First modify in current pending cycle: write baseline.
   * - Subsequent modifies in same pending cycle: keep original baseline.
   */
  private async captureModifyBaseline(path: string, content: FileContent): Promise<void> {
    const hasPendingPath = this.pendingManager.hasPendingPath(path)
    const existingBaseline = await this.readFromBaselineDir(path)
    if (hasPendingPath && existingBaseline) {
      return
    }

    await this.writeToBaselineDir(path, content)
  }

  /**
   * Restore a modified file from OPFS baseline snapshot.
   */
  private async restorePendingModifyFromBaseline(path: string): Promise<boolean> {
    const baseline = await this.readFromBaselineDir(path)
    if (!baseline) return false

    await this.writeToFilesDir(path, baseline.content)
    await this.deleteFromBaselineDirIfExists(path)
    return true
  }

  /**
   * List all baseline file paths in .baseline/ directory.
   */
  private async listBaselinePaths(): Promise<string[]> {
    try {
      const baselineDir = await this.getBaselineDir()
      const paths = new Set<string>()
      await this.scanDirRecursive(baselineDir, '', paths)
      return Array.from(paths)
    } catch {
      return []
    }
  }

  /**
   * Remove stale baseline files which no longer have pending entries.
   */
  private async cleanupStaleBaselines(): Promise<void> {
    const baselinePaths = await this.listBaselinePaths()
    if (baselinePaths.length === 0) return

    for (const path of baselinePaths) {
      if (!this.pendingManager.hasPendingPath(path)) {
        await this.deleteFromBaselineDirIfExists(path)
      }
    }
  }

  /**
   * Check if file exists in files/ directory (uses in-memory index)
   */
  private hasFileInIndex(path: string): boolean {
    return this.filesIndex.has(path)
  }

  /**
   * Get all file paths from files/ directory (uses in-memory index)
   */
  private getIndexedPaths(): string[] {
    return Array.from(this.filesIndex)
  }

  /**
   * Clear all files from files/ directory
   */
  private async clearFilesDir(): Promise<void> {
    try {
      // Remove entire files/ directory and recreate
      await this.workspaceDir.removeEntry(FILES_DIR, { recursive: true })
      // Recreate empty
      await this.workspaceDir.getDirectoryHandle(FILES_DIR, { create: true })
      this.filesIndex.clear()
    } catch {
      // Directory doesn't exist, just clear index
      this.filesIndex.clear()
    }
  }

  /**
   * Clear all files from .baseline/ directory.
   */
  private async clearBaselineDir(): Promise<void> {
    try {
      await this.workspaceDir.removeEntry(BASELINE_DIR, { recursive: true })
    } catch {
      // Directory doesn't exist, ignore.
    }
  }

  /**
   * Get statistics for files/ directory
   */
  private async getFilesStats(): Promise<{ size: number; fileCount: number }> {
    let size = 0
    let fileCount = 0

    try {
      const filesDir = await this.getFilesDir()
      const stats = await this.calculateDirStats(filesDir)
      size = stats.size
      fileCount = stats.fileCount
    } catch {
      // Directory doesn't exist
    }

    return { size, fileCount }
  }

  /**
   * Calculate directory statistics recursively
   */
  private async calculateDirStats(
    dir: FileSystemDirectoryHandle
  ): Promise<{ size: number; fileCount: number }> {
    let size = 0
    let fileCount = 0

    for await (const [, handle] of dir.entries()) {
      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile()
        size += file.size
        fileCount++
      } else {
        const subStats = await this.calculateDirStats(handle as FileSystemDirectoryHandle)
        size += subStats.size
        fileCount += subStats.fileCount
      }
    }

    return { size, fileCount }
  }

  // ============ File Operations ============

  /**
   * Read file from workspace
   * @param path File path
   * @param directoryHandle Real filesystem directory handle
   * @returns File content and metadata
   */
  async readFile(
    path: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ content: FileContent; metadata: FileMetadata }> {
    if (!this.initialized) await this.initialize()
    const normalizedPath = this.normalizeWorkspacePath(path)

    // If path has pending changes, check for conflicts first.
    // If disk mtime differs from OPFS baseline, disk is newer - read disk.
    // This handles the conflict scenario where disk has been updated but OPFS hasn't.
    const isPendingPath = this.pendingManager.hasPendingPath(normalizedPath)
    if (directoryHandle && isPendingPath) {
      let fromFilesDir: {
        content: FileContent
        mtime: number
        size: number
        contentType: 'text' | 'binary'
      } | null = null
      if (this.hasFileInIndex(normalizedPath)) {
        fromFilesDir = await this.readFromFilesDir(normalizedPath)
      }

      // If conflict markers are materialized in OPFS, always return OPFS content first
      // so the agent can resolve <<<<<<< / ======= / >>>>>>> markers.
      if (
        fromFilesDir &&
        fromFilesDir.contentType === 'text' &&
        typeof fromFilesDir.content === 'string' &&
        hasConflictMarkers(fromFilesDir.content)
      ) {
        return {
          content: fromFilesDir.content,
          metadata: {
            path: normalizedPath,
            mtime: fromFilesDir.mtime,
            size: fromFilesDir.size,
            contentType: fromFilesDir.contentType,
          },
        }
      }

      // Check if disk has been modified since OPFS recorded baseline
      try {
        const diskMeta = await this.getFileMetadata(directoryHandle, normalizedPath)
        const pendingChanges = await this.pendingManager.getAll()
        const pending = pendingChanges.find(
          (p) => this.normalizeWorkspacePath(p.path) === normalizedPath
        )
        if (pending && pending.fsMtime && diskMeta.mtime > pending.fsMtime) {
          const diskContent = await this.readFromNativeFS(normalizedPath, directoryHandle)
          const baseline = await this.readFromBaselineDir(normalizedPath)
          if (baseline) {
            const diskMatchesBaseline = await this.areFileContentsEqual(baseline.content, diskContent.content)
            if (diskMatchesBaseline) {
              // Migration case: pure-OPFS pending baseline rebased to native view.
              // Keep OPFS draft as source of truth for pending edits.
            } else {
              // Disk is newer than OPFS baseline - disk has been modified externally.
              return {
                content: diskContent.content,
                metadata: {
                  path: normalizedPath,
                  mtime: diskMeta.mtime,
                  size: diskMeta.size,
                  contentType: diskMeta.contentType,
                },
              }
            }
          } else {
            // No baseline snapshot available, keep existing safety behavior and prefer disk.
            return {
              content: diskContent.content,
              metadata: {
                path: normalizedPath,
                mtime: diskMeta.mtime,
                size: diskMeta.size,
                contentType: diskMeta.contentType,
              },
            }
          }
        }
      } catch {
        // Ignore errors, fall through to OPFS read
      }

      // Pending path defaults to OPFS draft content.
      if (fromFilesDir) {
        return {
          content: fromFilesDir.content,
          metadata: {
            path: normalizedPath,
            mtime: fromFilesDir.mtime,
            size: fromFilesDir.size,
            contentType: fromFilesDir.contentType,
          },
        }
      }
    }

    if (directoryHandle && !isPendingPath) {
      // For non-pending files, always prefer native disk view so external
      // filesystem changes are visible to tools immediately.
      try {
        const native = await this.readFromNativeFS(normalizedPath, directoryHandle)

        // Best-effort cache eviction: once disk is the source of truth for a
        // non-pending path, clear stale OPFS body to reduce storage usage.
        if (this.hasFileInIndex(normalizedPath)) {
          try {
            await this.deleteFromFilesDirIfExists(normalizedPath)
          } catch {
            // Ignore cleanup failures; read should still succeed.
          }
        }

        return native
      } catch {
        // Disk read failed (e.g. file only exists in OPFS, not yet synced).
        // Fall through to OPFS read below.
      }
    }

    // Read from files/ only (no native FS available or has pending changes without conflict)
    // Always try readFromFilesDir — files may exist without being in the index
    // (e.g., written directly by Pyodide via /mnt/ mount)
    const fromFilesDir = await this.readFromFilesDir(normalizedPath)
    if (fromFilesDir) {
      return {
        content: fromFilesDir.content,
        metadata: {
          path: normalizedPath,
          mtime: fromFilesDir.mtime,
          size: fromFilesDir.size,
          contentType: fromFilesDir.contentType,
        },
      }
    }

    throw new Error(`File not found in OPFS workspace: ${normalizedPath}`)
  }

  /**
   * Get file metadata from native filesystem
   */
  private async getFileMetadata(
    directoryHandle: FileSystemDirectoryHandle,
    path: string
  ): Promise<{ mtime: number; size: number; contentType: 'text' | 'binary' }> {
    const fileHandle = await this.getFileHandle(directoryHandle, path)
    const file = await fileHandle.getFile()
    return {
      mtime: file.lastModified,
      size: file.size,
      contentType: getFileContentType(path),
    }
  }

  /**
   * Read file from native filesystem
   */
  private async readFromNativeFS(
    path: string,
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<{ content: FileContent; metadata: FileMetadata }> {
    const fileHandle = await this.getFileHandle(directoryHandle, path)
    const file = await fileHandle.getFile()
    const mtime = file.lastModified
    const size = file.size
    const contentType = getFileContentType(path)
    let content: FileContent
    if (contentType === 'text') {
      content = await file.text()
    } else {
      content = await file.arrayBuffer()
    }

    return {
      content,
      metadata: {
        path,
        mtime,
        size,
        contentType,
      },
    }
  }

  /**
   * Read file content from files/ directory only (no native FS fallback).
   * Returns null if the file is not in files/.
   */
  async readCachedFile(path: string): Promise<FileContent | null> {
    if (!this.initialized) await this.initialize()
    const normalizedPath = this.normalizeWorkspacePath(path)
    if (!this.hasFileInIndex(normalizedPath)) {
      return null
    }
    const fromFilesDir = await this.readFromFilesDir(normalizedPath)
    return fromFilesDir?.content ?? null
  }

  /**
   * Read baseline content from .baseline/ for pending modify/delete comparisons.
   */
  async readBaselineFile(path: string): Promise<FileContent | null> {
    if (!this.initialized) await this.initialize()
    const normalizedPath = this.normalizeWorkspacePath(path)
    const baseline = await this.readFromBaselineDir(normalizedPath)
    return baseline?.content ?? null
  }

  /**
   * Write file to workspace (files/ + pending)
   * @param path File path
   * @param content File content
   * @param directoryHandle Real filesystem directory handle (for mtime baseline)
   */
  async writeFile(
    path: string,
    content: FileContent,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<void> {
    if (!this.initialized) await this.initialize()
    const normalizedPath = this.normalizeWorkspacePath(path)

    // Get baseline mtime for conflict detection
    // Also track if this is a new file (not in files/ index and not in native FS)
    let baselineFsMtime = 0
    let isNewFile = false
    let baselineContent: FileContent | null = null
    try {
      if (directoryHandle) {
        // Always use native mtime as conflict baseline when directory handle is available.
        // OPFS cache mtime can diverge from native disk mtime after prior approvals/syncs.
        const fromNative = await this.readFromNativeFS(normalizedPath, directoryHandle)
        baselineFsMtime = fromNative.metadata.mtime
        baselineContent = fromNative.content
      } else {
        // No directoryHandle (pure OPFS mode): check if file exists in filesIndex
        // If not in index, this is a new file
        if (!this.hasFileInIndex(normalizedPath)) {
          isNewFile = true
        } else {
          // File exists in index, get mtime from files/
          const fromFiles = await this.readFromFilesDir(normalizedPath)
          if (fromFiles) {
            baselineFsMtime = fromFiles.mtime
            baselineContent = fromFiles.content
          }
        }
      }
    } catch (err) {
      // Only treat as new file if the error is NotFoundError
      // Other errors (permission, IO, etc.) should be propagated
      const errorName = err && typeof err === 'object' && 'name' in err ? (err as { name: string }).name : undefined
      if (errorName === 'NotFoundError') {
        isNewFile = true
        baselineFsMtime = 0
      } else {
        throw err
      }
    }

    if (!isNewFile && baselineContent !== null) {
      await this.captureModifyBaseline(normalizedPath, baselineContent)
    }

    // Write to files/ directory
    await this.writeToFilesDir(normalizedPath, content)
    this.filesIndex.add(normalizedPath)

    // Notify other tabs about the file change
    try {
      const channel = new BroadcastChannel('opfs-file-changes')
      channel.postMessage({ type: 'opfs-file-changed', path: normalizedPath })
      channel.close()
    } catch (e) {
      console.warn('[WorkspaceRuntime] Failed to broadcast file change:', e)
    }

    // Mark as pending - use markAsCreated for new files, add for modifications
    if (isNewFile) {
      await this.pendingManager.markAsCreated(normalizedPath, baselineFsMtime)
    } else {
      await this.pendingManager.add(normalizedPath, baselineFsMtime)
    }

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Delete file from workspace
   * @param path File path
   * @param directoryHandle Real filesystem directory handle (for mtime baseline)
   */
  async deleteFile(path: string, directoryHandle?: FileSystemDirectoryHandle | null): Promise<void> {
    if (!this.initialized) await this.initialize()

    const normalizedPath = this.normalizeWorkspacePath(path)
    const pendingEntry = this.pendingManager
      .getAll()
      .find((change) => this.normalizeWorkspacePath(change.path) === normalizedPath)

    // Get baseline mtime for conflict detection
    let baselineFsMtime = 0
    let baselineContent: FileContent | null = null
    try {
      if (directoryHandle) {
        const oldData = await this.readFromNativeFS(normalizedPath, directoryHandle)
        baselineFsMtime = oldData.metadata.mtime || 0
        baselineContent = oldData.content
      } else if (this.hasFileInIndex(normalizedPath)) {
        const fromFiles = await this.readFromFilesDir(normalizedPath)
        if (fromFiles) {
          baselineContent = fromFiles.content
        }
      }
    } catch {
      // File doesn't exist
    }

    // Keep rollback source for delete rejection in pure OPFS mode.
    // Skip create->delete cancel-out cycles since no committed baseline is needed.
    if (pendingEntry?.type !== 'create' && baselineContent !== null) {
      await this.captureModifyBaseline(normalizedPath, baselineContent)
    } else if (pendingEntry?.type === 'create') {
      await this.deleteFromBaselineDirIfExists(normalizedPath)
    }

    // Delete from files/ directory
    await this.deleteFromFilesDir(normalizedPath)
    this.filesIndex.delete(normalizedPath)

    // Mark as pending for deletion
    await this.pendingManager.markForDeletion(normalizedPath, baselineFsMtime)

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
   * Get file paths that are approved but not yet synced to disk
   */
  async getApprovedNotSyncedPaths(): Promise<Set<string>> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    return await repo.getApprovedNotSyncedPaths(this.workspaceId)
  }

  /**
   * Rebase pending baseline mtimes after switching from OPFS-only to native binding.
   *
   * For modify/delete ops, if native content still matches OPFS baseline snapshot,
   * update fs_mtime to current native mtime so conflict checks stop reporting
   * migration-only mtime drift as real conflicts.
   */
  async rebindPendingBaselinesToNative(
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ checked: number; rebased: number; skipped: number; conflicts: number }> {
    if (!this.initialized) await this.initialize()

    const nativeDir = directoryHandle ?? (await this.getNativeDirectoryHandle())
    if (!nativeDir) {
      return { checked: 0, rebased: 0, skipped: 0, conflicts: 0 }
    }

    const repo = getFSOverlayRepository()
    const activeOps = await repo.listActivePendingOps(this.workspaceId)

    let checked = 0
    let rebased = 0
    let skipped = 0
    let conflicts = 0

    for (const op of activeOps) {
      if (op.type === 'create') {
        skipped++
        continue
      }

      const path = this.normalizeWorkspacePath(op.path)
      const baseline = await this.readFromBaselineDir(path)
      if (!baseline) {
        skipped++
        continue
      }

      try {
        const native = await this.readFromNativeFS(path, nativeDir)
        checked++

        const equalsBaseline = await this.areFileContentsEqual(baseline.content, native.content)
        if (!equalsBaseline) {
          conflicts++
          continue
        }

        if (native.metadata.mtime > 0 && native.metadata.mtime !== op.fsMtime) {
          await repo.updatePendingFsMtime(op.id, native.metadata.mtime)
          rebased++
        } else {
          skipped++
        }
      } catch {
        skipped++
      }
    }

    if (rebased > 0) {
      await this.pendingManager.reload()
    }

    return { checked, rebased, skipped, conflicts }
  }

  /**
   * Sync pending changes to real filesystem
   * @param directoryHandle Real filesystem directory handle
   * @param onlyPaths Optional list of paths to sync (if not provided, sync all)
   * @param forceOverwrite If true, skip conflict check and overwrite disk files
   * @returns Sync result
   */
  async syncToDisk(
    directoryHandle: FileSystemDirectoryHandle,
    onlyPaths?: string[],
    forceOverwrite?: boolean
  ): Promise<SyncResult> {
    if (!this.initialized) await this.initialize()

    // Create cache interface for sync operation
    const cacheInterface = {
      readCached: async (path: string) => {
        const result = await this.readFromFilesDir(path)
        return result?.content ?? null
      },
      read: async (path: string, dirHandle?: FileSystemDirectoryHandle | null) => {
        // Try files/ first, then native FS if available
        const fromFiles = await this.readFromFilesDir(path)
        if (fromFiles) return { content: fromFiles.content }
        if (dirHandle) {
          try {
            const result = await this.readFromNativeFS(path, dirHandle)
            return { content: result.content }
          } catch {
            return null
          }
        }
        return null
      },
    }

    const result = await this.pendingManager.sync(directoryHandle, cacheInterface, onlyPaths, forceOverwrite)

    // Successful sync/discard operations remove pending entries from ledger.
    // Clean up orphaned baselines so next modify cycle snapshots from fresh state.
    await this.cleanupStaleBaselines()

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()

    return result
  }

  async detectSyncConflicts(
    directoryHandle: FileSystemDirectoryHandle,
    onlyPaths?: string[]
  ): Promise<SyncResult['conflicts']> {
    if (!this.initialized) await this.initialize()
    const conflicts = await this.pendingManager.detectConflicts(directoryHandle, onlyPaths)
    await this.materializeTextConflictMarkers(directoryHandle, conflicts)
    return conflicts
  }

  private async materializeTextConflictMarkers(
    directoryHandle: FileSystemDirectoryHandle,
    conflicts: SyncResult['conflicts']
  ): Promise<void> {
    for (const conflict of conflicts) {
      const path = this.normalizeWorkspacePath(conflict.path)
      try {
        const fromFiles = await this.readFromFilesDir(path)
        if (!fromFiles || fromFiles.contentType !== 'text' || typeof fromFiles.content !== 'string') {
          continue
        }
        if (hasConflictMarkers(fromFiles.content)) {
          continue
        }

        const fromNative = await this.readFromNativeFS(path, directoryHandle)
        if (fromNative.metadata.contentType !== 'text' || typeof fromNative.content !== 'string') {
          continue
        }

        const merged = buildConflictMarkerContent(fromFiles.content, fromNative.content)
        await this.writeToFilesDir(path, merged)
      } catch {
        // Best effort: leave conflict unresolved if marker materialization fails.
      }
    }
  }

  /**
   * Discard all pending changes without syncing to native filesystem.
   * For newly created files (type=create), also remove file bodies from OPFS files/.
   * For modified files (type=modify), restore file content from native filesystem baseline.
   */
  async discardAllPendingChanges(): Promise<void> {
    if (!this.initialized) await this.initialize()
    const pending = this.pendingManager.getAll()
    const restoreFailures: string[] = []

    for (const change of pending) {
      const normalizedPath = this.normalizeWorkspacePath(change.path)
      if (change.type === 'create') {
        await this.deleteFromFilesDirIfExists(normalizedPath)
        await this.deleteFromBaselineDirIfExists(normalizedPath)
      } else if (change.type === 'modify') {
        let restored = await this.restorePendingModifyFromNative(normalizedPath)
        if (!restored) {
          restored = await this.restorePendingModifyFromBaseline(normalizedPath)
        }
        if (!restored) {
          restoreFailures.push(change.path)
          continue
        }
        await this.deleteFromBaselineDirIfExists(normalizedPath)
      } else if (change.type === 'delete') {
        let restored = await this.restorePendingModifyFromNative(normalizedPath)
        if (!restored) {
          restored = await this.restorePendingModifyFromBaseline(normalizedPath)
        }
        if (!restored) {
          restoreFailures.push(change.path)
          continue
        }
        await this.deleteFromBaselineDirIfExists(normalizedPath)
      }
      await this.pendingManager.removeByPath(change.path)
    }

    if (restoreFailures.length > 0) {
      throw new Error(
        `无法拒绝 ${restoreFailures.length} 个变更（缺少本地文件基线）: ${restoreFailures.slice(0, 3).join(', ')}${restoreFailures.length > 3 ? ' ...' : ''}`
      )
    }

    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Discard one pending path without syncing to native filesystem.
   * If the pending op is a newly created file, remove it from OPFS files/.
   * If the pending op is a modify, restore content from native filesystem baseline.
   */
  async discardPendingPath(path: string): Promise<void> {
    if (!this.initialized) await this.initialize()
    const normalizedTargetPath = this.normalizeWorkspacePath(path)
    const existing = this.pendingManager
      .getAll()
      .find((change) => this.normalizeWorkspacePath(change.path) === normalizedTargetPath)
    if (existing?.type === 'create') {
      await this.deleteFromFilesDirIfExists(normalizedTargetPath)
      await this.deleteFromBaselineDirIfExists(normalizedTargetPath)
    } else if (existing?.type === 'modify') {
      let restored = await this.restorePendingModifyFromNative(normalizedTargetPath)
      if (!restored) {
        restored = await this.restorePendingModifyFromBaseline(normalizedTargetPath)
      }
      if (!restored) {
        throw new Error(`无法拒绝修改 "${path}"：缺少本地文件基线，请先恢复目录访问权限`)
      }
      await this.deleteFromBaselineDirIfExists(normalizedTargetPath)
    } else if (existing?.type === 'delete') {
      let restored = await this.restorePendingModifyFromNative(normalizedTargetPath)
      if (!restored) {
        restored = await this.restorePendingModifyFromBaseline(normalizedTargetPath)
      }
      if (!restored) {
        throw new Error(`无法拒绝删除 "${path}"：缺少本地文件基线，请先恢复目录访问权限`)
      }
      await this.deleteFromBaselineDirIfExists(normalizedTargetPath)
    }
    await this.pendingManager.removeByPath(existing?.path || normalizedTargetPath)
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  private normalizeWorkspacePath(path: string): string {
    let normalized = path.replace(/\\/g, '/')
    if (normalized.startsWith('/mnt/')) {
      normalized = normalized.slice('/mnt/'.length)
    } else if (normalized === '/mnt') {
      normalized = ''
    } else if (normalized.startsWith('/')) {
      normalized = normalized.slice(1)
    }
    return normalized
  }

  private async restorePendingModifyFromNative(path: string): Promise<boolean> {
    const nativeDir = await this.getNativeDirectoryHandle()
    if (!nativeDir) return false
    try {
      const native = await this.readFromNativeFS(path, nativeDir)
      await this.writeToFilesDir(path, native.content)
      return true
    } catch {
      return false
    }
  }

  /**
   * Clear all workspace data (files, pending)
   */
  async clear(): Promise<void> {
    await Promise.all([
      this.clearFilesDir(),
      this.clearBaselineDir(),
      this.pendingManager.clear(),
    ])

    // Clear in-memory index
    this.filesIndex.clear()

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Get workspace statistics
   */
  async getStats(): Promise<{
    files: { size: number; fileCount: number }
    pending: number
    metadata: WorkspaceMetadataPersist
  }> {
    const filesStats = await this.getFilesStats()

    return {
      files: filesStats,
      pending: this.pendingCount,
      metadata: { ...this.metadata },
    }
  }

  /**
   * Get cached file paths
   */
  getCachedPaths(): string[] {
    return this.getIndexedPaths()
  }

  async createDraftSnapshot(summary?: string): Promise<{ snapshotId: string; opCount: number } | null> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    return await repo.commitLatestDraftSnapshot(this.workspaceId, summary)
  }

  async createApprovedSnapshotForPaths(
    paths: string[],
    summary?: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ snapshotId: string; opCount: number; conflicts?: ConflictInfo[] } | null> {
    if (!this.initialized) await this.initialize()
    if (paths.length === 0) return null

    // Detect conflicts but don't block - let the agent handle them
    let conflicts: ConflictInfo[] = []
    if (directoryHandle) {
      conflicts = await this.pendingManager.detectConflicts(directoryHandle, paths)
    }

    const repo = getFSOverlayRepository()
    const snapshot = await repo.createApprovedSnapshotForPaths(this.workspaceId, paths, summary)
    if (!snapshot) return null
    await repo.setCurrentSnapshotId(this.workspaceId, snapshot.snapshotId)

    const snapshotOps = await repo.listSnapshotOps(this.workspaceId, snapshot.snapshotId)
    for (const op of snapshotOps) {
      let beforeContent: string | ArrayBuffer | null = null
      let afterContent: string | ArrayBuffer | null = null

      try {
        if (op.type === 'create') {
          const result = await this.readFile(op.path)
          afterContent = await this.normalizeContentForSnapshot(result.content)
        } else if (op.type === 'modify') {
          if (directoryHandle) {
            beforeContent = await this.readNativeFileContent(directoryHandle, op.path)
          }
          const result = await this.readFile(op.path)
          afterContent = await this.normalizeContentForSnapshot(result.content)
        } else if (op.type === 'delete') {
          if (directoryHandle) {
            beforeContent = await this.readNativeFileContent(directoryHandle, op.path)
          }
        }
      } catch {
        // Keep missing side as null for unresolved historical states.
      }

      await repo.upsertSnapshotFileContent({
        snapshotId: snapshot.snapshotId,
        workspaceId: this.workspaceId,
        path: op.path,
        opType: op.type,
        beforeContent,
        afterContent,
      })
    }

    return { ...snapshot, conflicts }
  }

  async rollbackSnapshot(
    snapshotId: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ reverted: number; unresolved: string[] }> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    const ops = await repo.listSnapshotOps(this.workspaceId, snapshotId)
    let reverted = 0
    const unresolved: string[] = []

    for (const op of ops) {
      try {
        const snapshotFile = await repo.getSnapshotFileContent(snapshotId, op.path)
        const requiresNativeRollback = op.status === 'synced'
        if (op.type === 'create') {
          if (requiresNativeRollback && !directoryHandle) {
            unresolved.push(op.path)
            continue
          }
          await this.deleteFromFilesDirIfExists(op.path)
          this.filesIndex.delete(op.path)
          if (directoryHandle) {
            await this.deleteFromNativeIfExists(directoryHandle, op.path)
          }
          await this.pendingManager.removeByPath(op.path)
          reverted++
          continue
        }

        const restored = await this.restoreFromSnapshotContent(
          op.path,
          snapshotFile?.beforeContentKind,
          snapshotFile?.beforeContentText,
          snapshotFile?.beforeContentBlob || null
        )
        if (!restored) {
          unresolved.push(op.path)
          continue
        }

        if (requiresNativeRollback && !directoryHandle) {
          unresolved.push(op.path)
          continue
        }

        if (directoryHandle) {
          const data = await this.readCacheContentForPath(op.path)
          if (data !== null) {
            await this.writeNativeFile(directoryHandle, op.path, data)
          } else {
            unresolved.push(op.path)
            continue
          }
        }

        await this.pendingManager.removeByPath(op.path)
        reverted++
      } catch {
        unresolved.push(op.path)
      }
    }

    if (unresolved.length === 0 && reverted > 0) {
      await repo.markSnapshotRolledBack(this.workspaceId, snapshotId)
      await this.syncCurrentSnapshotPointer()
    }

    return { reverted, unresolved }
  }

  private async applySnapshot(
    snapshotId: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ applied: number; unresolved: string[] }> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    const ops = await repo.listSnapshotOps(this.workspaceId, snapshotId)
    let applied = 0
    const unresolved: string[] = []

    for (const op of ops) {
      try {
        const snapshotFile = await repo.getSnapshotFileContent(snapshotId, op.path)
        const requiresNativeApply = op.status === 'synced'

        if (op.type === 'delete') {
          if (requiresNativeApply && !directoryHandle) {
            unresolved.push(op.path)
            continue
          }
          await this.deleteFromFilesDirIfExists(op.path)
          this.filesIndex.delete(op.path)
          if (directoryHandle) {
            await this.deleteFromNativeIfExists(directoryHandle, op.path)
          }
          await this.pendingManager.removeByPath(op.path)
          applied++
          continue
        }

        const restored = await this.restoreFromSnapshotContent(
          op.path,
          snapshotFile?.afterContentKind,
          snapshotFile?.afterContentText,
          snapshotFile?.afterContentBlob || null
        )
        if (!restored) {
          unresolved.push(op.path)
          continue
        }

        if (requiresNativeApply && !directoryHandle) {
          unresolved.push(op.path)
          continue
        }

        if (directoryHandle) {
          const data = await this.readCacheContentForPath(op.path)
          if (data !== null) {
            await this.writeNativeFile(directoryHandle, op.path, data)
          } else {
            unresolved.push(op.path)
            continue
          }
        }

        await this.pendingManager.removeByPath(op.path)
        applied++
      } catch {
        unresolved.push(op.path)
      }
    }

    if (unresolved.length === 0 && applied > 0) {
      await repo.markSnapshotActive(this.workspaceId, snapshotId)
      await repo.setCurrentSnapshotId(this.workspaceId, snapshotId)
    }

    return { applied, unresolved }
  }

  async rollbackLatestSnapshot(
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ snapshotId: string | null; reverted: number; unresolved: string[] }> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    const snapshots = await repo.listSnapshots(this.workspaceId, 200)
    const latest = snapshots.find((item) => item.status === 'approved' || item.status === 'committed')
    if (!latest) {
      return { snapshotId: null, reverted: 0, unresolved: [] }
    }

    const result = await this.rollbackSnapshot(latest.id, directoryHandle)
    return {
      snapshotId: latest.id,
      reverted: result.reverted,
      unresolved: result.unresolved,
    }
  }

  async rollbackToSnapshot(
    snapshotId: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{
    targetSnapshotId: string
    rolledBackSnapshotIds: string[]
    reverted: number
    unresolved: string[]
    failedSnapshotId?: string
  }> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    const snapshots = await repo.listSnapshots(this.workspaceId, 500)
    const targetIndex = snapshots.findIndex((item) => item.id === snapshotId)
    if (targetIndex < 0) {
      throw new Error(`快照不存在: ${snapshotId}`)
    }

    const newerSnapshotIds = snapshots
      .slice(0, targetIndex)
      .filter((item) => item.status === 'approved' || item.status === 'committed')
      .map((item) => item.id)

    const rolledBackSnapshotIds: string[] = []
    let reverted = 0
    let unresolved: string[] = []
    let failedSnapshotId: string | undefined

    for (const id of newerSnapshotIds) {
      const result = await this.rollbackSnapshot(id, directoryHandle)
      reverted += result.reverted
      if (result.unresolved.length > 0) {
        unresolved = result.unresolved
        failedSnapshotId = id
        break
      }
      rolledBackSnapshotIds.push(id)
    }

    return {
      targetSnapshotId: snapshotId,
      rolledBackSnapshotIds,
      reverted,
      unresolved,
      failedSnapshotId,
    }
  }

  async switchToSnapshot(
    snapshotId: string,
    directoryHandle?: FileSystemDirectoryHandle | null,
    onProgress?: (progress: {
      phase: 'rollback' | 'apply'
      processed: number
      total: number
      snapshotId: string
    }) => void
  ): Promise<{
    targetSnapshotId: string
    direction: 'backward' | 'forward' | 'noop'
    rolledBackSnapshotIds: string[]
    appliedSnapshotIds: string[]
    reverted: number
    applied: number
    unresolved: string[]
    failedSnapshotId?: string
    compensationAttempted?: boolean
    compensationSucceeded?: boolean
  }> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    const snapshots = await repo.listSnapshots(this.workspaceId, 500)
    const targetIndex = snapshots.findIndex((item) => item.id === snapshotId)
    if (targetIndex < 0) {
      throw new Error(`快照不存在: ${snapshotId}`)
    }

    const isActive = (status: string): boolean => status === 'approved' || status === 'committed'
    const currentIndex = snapshots.findIndex((item) => isActive(item.status))
    const normalizedCurrentIndex = currentIndex >= 0 ? currentIndex : snapshots.length

    if (targetIndex === normalizedCurrentIndex) {
      await repo.setCurrentSnapshotId(this.workspaceId, snapshotId)
      return {
        targetSnapshotId: snapshotId,
        direction: 'noop',
        rolledBackSnapshotIds: [],
        appliedSnapshotIds: [],
        reverted: 0,
        applied: 0,
        unresolved: [],
        compensationAttempted: false,
        compensationSucceeded: true,
      }
    }

    const rolledBackSnapshotIds: string[] = []
    const appliedSnapshotIds: string[] = []
    let reverted = 0
    let applied = 0
    let unresolved: string[] = []
    let failedSnapshotId: string | undefined
    let compensationAttempted = false
    let compensationSucceeded = true

    // target older than current: rollback newer snapshots down to target(exclusive).
    if (targetIndex > normalizedCurrentIndex) {
      const total = Math.max(targetIndex - normalizedCurrentIndex, 0)
      for (let i = normalizedCurrentIndex; i < targetIndex; i++) {
        const id = snapshots[i]?.id
        if (!id) continue
        onProgress?.({
          phase: 'rollback',
          processed: i - normalizedCurrentIndex + 1,
          total,
          snapshotId: id,
        })
        const result = await this.rollbackSnapshot(id, directoryHandle)
        reverted += result.reverted
        if (result.unresolved.length > 0) {
          unresolved = result.unresolved
          failedSnapshotId = id
          if (rolledBackSnapshotIds.length > 0) {
            compensationAttempted = true
            for (const rollbacked of [...rolledBackSnapshotIds].reverse()) {
              const compensation = await this.applySnapshot(rollbacked, directoryHandle)
              if (compensation.unresolved.length > 0) {
                compensationSucceeded = false
                break
              }
            }
          }
          break
        }
        rolledBackSnapshotIds.push(id)
      }

      await this.syncCurrentSnapshotPointer()

      return {
        targetSnapshotId: snapshotId,
        direction: 'backward',
        rolledBackSnapshotIds,
        appliedSnapshotIds,
        reverted,
        applied,
        unresolved,
        failedSnapshotId,
        compensationAttempted,
        compensationSucceeded,
      }
    }

    // target newer than current: re-apply snapshots from current(exclusive) to target(inclusive).
    const total = Math.max(normalizedCurrentIndex - targetIndex, 0)
    for (let i = normalizedCurrentIndex - 1; i >= targetIndex; i--) {
      const id = snapshots[i]?.id
      if (!id) continue
      onProgress?.({
        phase: 'apply',
        processed: normalizedCurrentIndex - i,
        total,
        snapshotId: id,
      })
      const result = await this.applySnapshot(id, directoryHandle)
      applied += result.applied
      if (result.unresolved.length > 0) {
        unresolved = result.unresolved
        failedSnapshotId = id
        if (appliedSnapshotIds.length > 0) {
          compensationAttempted = true
          for (const appliedId of [...appliedSnapshotIds].reverse()) {
            const compensation = await this.rollbackSnapshot(appliedId, directoryHandle)
            if (compensation.unresolved.length > 0) {
              compensationSucceeded = false
              break
            }
          }
        }
        break
      }
      appliedSnapshotIds.push(id)
    }

    await this.syncCurrentSnapshotPointer()

    return {
      targetSnapshotId: snapshotId,
      direction: 'forward',
      rolledBackSnapshotIds,
      appliedSnapshotIds,
      reverted,
      applied,
      unresolved,
      failedSnapshotId,
      compensationAttempted,
      compensationSucceeded,
    }
  }

  private async syncCurrentSnapshotPointer(): Promise<void> {
    const repo = getFSOverlayRepository()
    const snapshots = await repo.listSnapshots(this.workspaceId, 500)
    const current = snapshots.find((item) => item.status === 'approved' || item.status === 'committed')
    await repo.setCurrentSnapshotId(this.workspaceId, current?.id || null)
  }

  private async deleteFromNativeIfExists(
    directoryHandle: FileSystemDirectoryHandle,
    path: string
  ): Promise<void> {
    try {
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) return
      let current = directoryHandle
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
      }
      await current.removeEntry(parts[parts.length - 1])
    } catch {
      // Ignore if file doesn't exist.
    }
  }

  private async readNativeFileContent(
    directoryHandle: FileSystemDirectoryHandle,
    path: string
  ): Promise<string | ArrayBuffer> {
    const handle = await this.getFileHandle(directoryHandle, path)
    const file = await handle.getFile()
    try {
      return await file.text()
    } catch {
      return await file.arrayBuffer()
    }
  }

  private async writeNativeFile(
    directoryHandle: FileSystemDirectoryHandle,
    path: string,
    content: string | ArrayBuffer
  ): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) return

    const fileName = parts[parts.length - 1]
    let current = directoryHandle
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create: true })
    }

    const targetFile = await current.getFileHandle(fileName, { create: true })
    const writable = await targetFile.createWritable()
    await writable.write(content)
    await writable.close()
  }

  private async readCacheContentForPath(path: string): Promise<string | ArrayBuffer | null> {
    const cached = await this.readFromFilesDir(path)
    if (cached === null) return null
    if (typeof cached.content === 'string') return cached.content
    if (cached.content instanceof Blob) return await cached.content.arrayBuffer()
    return cached.content
  }

  private async normalizeContentForSnapshot(content: FileContent): Promise<string | ArrayBuffer> {
    if (typeof content === 'string') return content
    if (content instanceof Blob) return await content.arrayBuffer()
    return content
  }

  private async restoreFromSnapshotContent(
    path: string,
    contentKind?: 'text' | 'binary' | 'none',
    contentText?: string | null,
    contentBlob?: Uint8Array | ArrayBuffer | null
  ): Promise<boolean> {
    if (!contentKind || contentKind === 'none') return false

    if (contentKind === 'text') {
      const filesDir = await this.getFilesDir()
      await this.writeFileToOPFS(filesDir, path, new TextEncoder().encode(contentText || '').buffer)
      this.filesIndex.add(path)
      return true
    }

    const binary =
      contentBlob instanceof Uint8Array
        ? contentBlob.buffer.slice(
            contentBlob.byteOffset,
            contentBlob.byteOffset + contentBlob.byteLength
          )
        : contentBlob
    if (!(binary instanceof ArrayBuffer)) return false

    const filesDir = await this.getFilesDir()
    await this.writeFileToOPFS(filesDir, path, binary)
    this.filesIndex.add(path)
    return true
  }

  /**
   * Check if file is in cache
   * @param path File path
   */
  hasCachedFile(path: string): boolean {
    return this.hasFileInIndex(path)
  }

  /**
   * Get workspace metadata
   */
  getMetadata(): WorkspaceMetadataPersist {
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
    return await this.workspaceDir.getDirectoryHandle(FILES_DIR, { create: true })
  }

  /**
   * Get the .baseline/ directory handle for OPFS-only modify rollbacks.
   */
  private async getBaselineDir(): Promise<FileSystemDirectoryHandle> {
    return await this.workspaceDir.getDirectoryHandle(BASELINE_DIR, { create: true })
  }

  /**
   * Get native directory handle for file preparation
   * @returns Native FS directory handle or null if not set
   */
  async getNativeDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.metadata.rootDirectory) return null

    try {
      // Directory access is granted at project scope.
      // All workspaces within the same project share the same native directory handle.
      try {
        const { getProjectRepository } = await import('@/sqlite/repositories/project.repository')
        const activeProject = await getProjectRepository().findActiveProject()
        if (activeProject?.id) {
          const projectHandle = getRuntimeDirectoryHandle(activeProject.id)
          if (projectHandle) return projectHandle
        }
      } catch {
        // Ignore fallback lookup errors and continue to null return.
      }

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
    // Force reload from database to ensure we have latest state (including review_status)
    await this.pendingManager.reload()

    const normalizeComparePath = (p: string): string => {
      // Worker scan keys are relative paths without leading slash.
      // Pending/cache records can be "/foo", "foo", "/mnt/foo", or "/mnt/foo/bar".
      let normalized = p.replace(/\\/g, '/')
      if (normalized.startsWith('/mnt/')) {
        normalized = normalized.slice(5)
      } else if (normalized === '/mnt') {
        normalized = ''
      } else if (normalized.startsWith('/')) {
        normalized = normalized.slice(1)
      }
      return normalized
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

    // Check for modified/restored files that are already tracked by pending queue.
    // NOTE: Do NOT auto-create new pending records for every file found in files/.
    // files/ can contain baseline/synced snapshots; re-adding them would cause
    // "pending reappears after successful sync".
    for (const [path, item] of currentFiles.entries()) {
      const pendingItem = existingPaths.get(path)
      const pendingPath = pendingItem?.path ?? path

      if (!pendingItem) {
        // Not tracked in pending queue: skip.
        continue
      } else if (pendingItem.type !== 'delete' && pendingItem.fsMtime !== item.mtime) {
        // File was modified after being added to pending - update mtime
        // Note: fsMtime will be set during sync, just update timestamp here
        await this.pendingManager.add(pendingPath, pendingItem.fsMtime)
        detectedChanges.push({ type: 'modify', path: pendingPath, size: item.size, mtime: item.mtime })
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
        await this.pendingManager.markAsCreated(pendingPath, item.mtime)
        detectedChanges.push({ type: 'add', path: pendingPath, size: item.size, mtime: item.mtime })
        detectedAdded++
      }
    }

    // Check for deleted files (in pending but not in current OPFS scan)
    for (const pending of existingPending) {
      if (pending.type !== 'delete' && !currentFiles.has(normalizeComparePath(pending.path))) {
        // Keep cache-originated pending edits as modify/create.
        // They are valid changes even if files/ scan doesn't include them.
        const normalizedPath = normalizeComparePath(pending.path)
        const stillInCache = this.hasCachedFile(pending.path) || this.hasCachedFile(normalizedPath)
        if (stillInCache) {
          continue
        }

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
    const reviewPending = latestPending.filter(
      (pending) => !pending.reviewStatus || pending.reviewStatus === 'pending'
    )
    const changes: FileChange[] = reviewPending.map((pending) => {
      if (pending.type === 'delete') {
        return {
          type: 'delete',
          path: pending.path,
          snapshotId: pending.snapshotId,
          snapshotStatus: pending.snapshotStatus,
          snapshotSummary: pending.snapshotSummary,
          reviewStatus: pending.reviewStatus,
        }
      }
      const file = currentFiles.get(normalizeComparePath(pending.path))
      return {
        type: pending.type === 'create' ? 'add' : 'modify',
        path: pending.path,
        size: file?.size,
        mtime: file?.mtime,
        snapshotId: pending.snapshotId,
        snapshotStatus: pending.snapshotStatus,
        snapshotSummary: pending.snapshotSummary,
        reviewStatus: pending.reviewStatus,
      }
    })

    const added = changes.filter((c) => c.type === 'add').length
    const modified = changes.filter((c) => c.type === 'modify').length
    const deleted = changes.filter((c) => c.type === 'delete').length

    await this.cleanupStaleBaselines()

    console.log('[WorkspaceRuntime] Pending changes refreshed (via worker):', {
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

  async registerDetectedChanges(
    changes: FileChange[],
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<void> {
    if (!this.initialized) await this.initialize()

    for (const change of changes) {
      let nativeFsMtime: number | undefined

      // Read native FS mtime as baseline when available.
      // OPFS mtime from detectChanges is NOT the same as native FS mtime —
      // using it as baseline causes false conflict detections.
      if (directoryHandle) {
        try {
          const normalizedPath = this.normalizeWorkspacePath(change.path)
          const fileHandle = await this.getFileHandle(directoryHandle, normalizedPath)
          const file = await fileHandle.getFile()
          nativeFsMtime = file.lastModified

          // Capture baseline snapshot for content-comparison fallback
          if (change.type === 'modify') {
            const contentType = getFileContentType(normalizedPath)
            const baselineContent = contentType === 'text'
              ? await file.text()
              : await file.arrayBuffer()
            await this.captureModifyBaseline(normalizedPath, baselineContent)
          }
        } catch {
          // File may not exist on native FS (genuinely new file) — use OPFS mtime
          nativeFsMtime = change.mtime
        }
      } else {
        nativeFsMtime = change.mtime
      }

      if (change.type === 'add') {
        await this.pendingManager.markAsCreated(change.path, nativeFsMtime)
      } else if (change.type === 'modify') {
        await this.pendingManager.add(change.path, nativeFsMtime)
      } else if (change.type === 'delete') {
        await this.pendingManager.markForDeletion(change.path, nativeFsMtime)
      }
    }
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

  /**
   * Mark a snapshot as synced to disk
   */
  async markSnapshotAsSynced(snapshotId: string): Promise<void> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    await repo.markSnapshotAsSynced(snapshotId)
  }

  /**
   * Get unsynced snapshots for this workspace
   * Returns snapshots that are approved but not yet synced to disk
   */
  async getUnsyncedSnapshots(): Promise<
    Array<{
      snapshotId: string
      summary: string | null
      createdAt: number
      opCount: number
    }>
  > {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    return await repo.getUnsyncedSnapshots(this.workspaceId)
  }
}
