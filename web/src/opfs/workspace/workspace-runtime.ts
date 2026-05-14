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
  ReadPolicy,
} from '../types/opfs-types'
import { ErrorCode } from '../types/opfs-types'
import { getFileContentType, shouldSkipScanEntry } from '../utils/opfs-utils'
import { WorkspacePendingManager } from './workspace-pending'
import {
  buildConflictMarkerContent,
  hasConflictMarkers,
} from './conflict-markers'
import { scanFilesInWorker } from '@/workers/diff-worker-manager'
import { getRuntimeDirectoryHandle, getRuntimeHandlesForProject } from '@/native-fs'
import { getFSOverlayRepository } from '@/sqlite/repositories/fs-overlay.repository'

const WORKSPACE_METADATA_FILE = 'workspace.json'
const FILES_DIR = 'files'
const BASELINE_DIR = '.baseline'
const ASSETS_DIR = 'assets'

/**
 * Result of resolving a workspace-relative path to a specific root.
 *
 * Multi-root workspace paths follow the pattern: `{rootName}/{relativePath}`
 * If no root prefix matches a known root, the first root is used.
 */
interface ResolvedRoot {
  /** Root name (matches project_roots.name) */
  rootName: string
  /** Path relative to the root (after stripping the root prefix) */
  relativePath: string
  /** Whether this root is read-only */
  readOnly: boolean
}

/**
 * Compare two Uint8Arrays for equality using 4-byte (Uint32) chunks.
 * Falls back to byte-by-byte for the tail (< 4 bytes remainder).
 * ~4x faster than byte-by-byte loop on V8 for large arrays.
 */
function compareUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
  const len = a.byteLength
  if (b.byteLength !== len) return false

  // Align to 4-byte boundaries via Uint32Array DataView
  const u32Len = len >>> 2 // floor(len / 4)
  if (u32Len > 0) {
    const a32 = new Uint32Array(a.buffer, a.byteOffset, u32Len)
    const b32 = new Uint32Array(b.buffer, b.byteOffset, u32Len)
    for (let i = 0; i < u32Len; i++) {
      if (a32[i] !== b32[i]) return false
    }
  }

  // Compare remaining bytes (0-3)
  const tail = u32Len << 2
  for (let i = tail; i < len; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

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

  /**
   * Cached projectId for this workspace, resolved from DB.
   * Avoids repeated DB queries and prevents falling through to
   * the global activeProject pointer (which may point to a different project
   * when the user switches browser tabs mid-conversation).
   */
  private _cachedProjectId: string | null | undefined = undefined

  /**
   * Multi-root mapping for this workspace's project.
   * Populated lazily on first access via resolvePath().
   * Key = rootName, value = { readOnly, isDefault }.
   * When null, no project_roots entries exist yet.
   */
  private _rootMap: Map<string, { readOnly: boolean; isDefault: boolean }> | null = null
  private _rootMapProjectId: string | null = null

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
    const newIndex = new Set<string>()
    try {
      const filesDir = await this.getFilesDir()
      await this.scanDirRecursive(filesDir, '', newIndex)
    } catch {
      // files/ directory doesn't exist yet
    }
    this.filesIndex = newIndex
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
      if (shouldSkipScanEntry(name)) continue
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

  /**
   * Compare two FileContent values for byte-level equality.
   *
   * Optimization layers:
   * 1. String fast-path: skip comparison when string lengths differ.
   * 2. Same-reference shortcut: identical objects are always equal.
   * 3. Byte-level: convert both sides to Uint8Array, compare length
   *    then use TypedArray friendly comparison.
   */
  private async areFileContentsEqual(left: FileContent, right: FileContent): Promise<boolean> {
    // Same reference — always equal (covers both being the same string/object)
    if (left === right) return true

    // String fast-path: different JS string length → different byte content
    if (typeof left === 'string' && typeof right === 'string') {
      if (left.length !== right.length) return false
      // Same length strings — still need full comparison (different chars,
      // same length is possible). Fall through to byte comparison below.
    }

    const leftBytes = await this.contentToBytes(left)
    const rightBytes = await this.contentToBytes(right)
    if (leftBytes.byteLength !== rightBytes.byteLength) return false

    // Use DataView for efficient multi-byte comparison instead of
    // byte-by-byte loop. Process 4 bytes at a time via Uint32Array view.
    return compareUint8Arrays(leftBytes, rightBytes)
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
  private async captureModifyBaseline(path: string, content: FileContent, forceOverwrite = false): Promise<void> {
    const hasPendingPath = this.pendingManager.hasPendingPath(path)
    const existingBaseline = await this.readFromBaselineDir(path)
    if (!forceOverwrite && hasPendingPath && existingBaseline) {
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
   * Rebuild the in-memory files index from the files/ directory.
   * Called after external tools (e.g. sync) write files directly to OPFS
   * without going through the runtime's writeFile path.
   *
   * Note: This performs a full rescan of the files/ directory. The index is
   * rebuilt atomically (new Set swap) so there is no empty-window during the scan.
   */
  async rebuildFilesIndex(): Promise<void> {
    if (!this.initialized) await this.initialize()
    await this.buildFilesIndex()
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
   * @param options Read policy options
   * @returns File content and metadata
   */
  async readFile(
    path: string,
    directoryHandle?: FileSystemDirectoryHandle | null,
    options: { policy?: ReadPolicy; projectId?: string | null } = {}
  ): Promise<{ content: FileContent; metadata: FileMetadata; source: 'native' | 'opfs' }> {
    if (!this.initialized) await this.initialize()
    const normalizedPath = this.normalizeWorkspacePath(path)
    const readPolicy = options.policy ?? 'auto'
    const preferOpfs = readPolicy === 'prefer_opfs'
    const preferNative = readPolicy === 'prefer_native'
    const projectId = options.projectId

    // Multi-root: resolve the correct native handle for this path
    // If directoryHandle is provided, use it (explicit override).
    // Otherwise, resolve the per-root handle based on path prefix.
    let nativeHandle: FileSystemDirectoryHandle | null
    let nativePath = normalizedPath
    if (directoryHandle) {
      nativeHandle = directoryHandle
    } else {
      nativeHandle = await this.getNativeDirectoryHandleForPath(normalizedPath, projectId)
      // Resolve the path relative to the root (strip root prefix for native FS access)
      const resolved = await this.resolvePath(normalizedPath, projectId)
      nativePath = resolved.relativePath || normalizedPath
    }

    if (nativeHandle && preferNative) {
      try {
        const native = await this.readFromNativeFS(nativePath, nativeHandle)
        return { ...native, source: 'native' }
      } catch {
        // Fallback to OPFS branch below.
      }
    }

    // If path has pending changes, check for conflicts first.
    // If disk mtime differs from OPFS baseline, disk is newer - read disk.
    // This handles the conflict scenario where disk has been updated but OPFS hasn't.
    const isPendingPath = this.pendingManager.hasPendingPath(normalizedPath)
    if (nativeHandle && isPendingPath) {
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
          source: 'opfs',
          metadata: {
            path: normalizedPath,
            mtime: fromFilesDir.mtime,
            size: fromFilesDir.size,
            contentType: fromFilesDir.contentType,
          },
        }
      }

      if (!preferOpfs) {
        // Check if disk has been modified since OPFS recorded baseline
        try {
          const diskMeta = await this.getFileMetadata(nativeHandle, nativePath)
          const pendingChanges = await this.pendingManager.getAll()
          const pending = pendingChanges.find(
            (p) => this.normalizeWorkspacePath(p.path) === normalizedPath
          )
          if (pending && pending.fsMtime && diskMeta.mtime > pending.fsMtime) {
            const diskContent = await this.readFromNativeFS(nativePath, nativeHandle)
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
                  source: 'native',
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
                source: 'native',
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
      }

      // Pending path defaults to OPFS draft content.
      if (fromFilesDir) {
        return {
          content: fromFilesDir.content,
          source: 'opfs',
          metadata: {
            path: normalizedPath,
            mtime: fromFilesDir.mtime,
            size: fromFilesDir.size,
            contentType: fromFilesDir.contentType,
          },
        }
      }
    }

    if (nativeHandle && !isPendingPath && !preferOpfs) {
      // For non-pending files, always prefer native disk view so external
      // filesystem changes are visible to tools immediately.
      try {
        const native = await this.readFromNativeFS(nativePath, nativeHandle)
        return { ...native, source: 'native' }
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
        source: 'opfs',
        metadata: {
          path: normalizedPath,
          mtime: fromFilesDir.mtime,
          size: fromFilesDir.size,
          contentType: fromFilesDir.contentType,
        },
      }
    }

    // prefer_opfs can still fall back to native when OPFS body is missing.
    if (nativeHandle) {
      try {
        const native = await this.readFromNativeFS(nativePath, nativeHandle)
        return { ...native, source: 'native' }
      } catch {
        // Fall through to not-found error below.
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
    directoryHandle?: FileSystemDirectoryHandle | null,
    projectId?: string | null
  ): Promise<void> {
    if (!this.initialized) await this.initialize()
    const normalizedPath = this.normalizeWorkspacePath(path)

    // Multi-root: resolve the correct native handle for this path
    let nativeHandle: FileSystemDirectoryHandle | null
    let nativePath = normalizedPath
    if (directoryHandle) {
      nativeHandle = directoryHandle
    } else {
      nativeHandle = await this.getNativeDirectoryHandleForPath(normalizedPath, projectId)
      const resolved = await this.resolvePath(normalizedPath, projectId)
      nativePath = resolved.relativePath || normalizedPath
    }

    // Get baseline mtime for conflict detection
    // Also track if this is a new file (not in files/ index and not in native FS)
    let baselineFsMtime = 0
    let isNewFile = false
    let baselineContent: FileContent | null = null
    try {
      if (nativeHandle) {
        // Always use native mtime as conflict baseline when directory handle is available.
        // OPFS cache mtime can diverge from native disk mtime after prior approvals/syncs.
        const fromNative = await this.readFromNativeFS(nativePath, nativeHandle)
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

    // Detect if the OLD content in files/ has conflict markers (from a prior
    // detectSyncConflicts materialization). If so, this edit is resolving a
    // conflict — update the baseline mtime and content to match the current DISK version.
    let resolvingConflict = false
    if (
      !isNewFile &&
      baselineContent !== null &&
      nativeHandle &&
      typeof content === 'string' &&
      baselineFsMtime > 0
    ) {
      try {
        const oldFilesContent = await this.readFromFilesDir(normalizedPath)
        if (
          oldFilesContent &&
          oldFilesContent.contentType === 'text' &&
          typeof oldFilesContent.content === 'string' &&
          hasConflictMarkers(oldFilesContent.content)
        ) {
          resolvingConflict = true
        }
      } catch {
        // Best effort detection
      }
    }

    // Ghost change dedup: if the content to be written is identical to the
    // baseline (disk/native version, or current OPFS files/ content in pure
    // OPFS mode), there is no real change. Skip all write operations and
    // clean up any prior ghost pending entry + stale baseline snapshot.
    // Check BEFORE write to avoid redundant I/O and spurious notifications.
    if (!isNewFile && baselineContent !== null) {
      const contentsMatch = await this.areFileContentsEqual(baselineContent, content)
      if (contentsMatch) {
        if (this.pendingManager.hasPendingPath(normalizedPath)) {
          await this.pendingManager.removeByPath(normalizedPath)
          await this.deleteFromBaselineDirIfExists(normalizedPath)
        }
        // If files/ contains conflict markers from a prior materialization,
        // replace them with the clean baseline content so other tabs/readers
        // no longer see stale conflict markers.
        if (resolvingConflict) {
          await this.writeToFilesDir(normalizedPath, content)
        }
        console.log(`[WorkspaceRuntime] Skipping no-op write (content matches baseline): ${normalizedPath}`)
        this.metadata.lastAccessedAt = Date.now()
        await this.saveMetadata()
        return
      }
    }

    if (!isNewFile && baselineContent !== null) {
      await this.captureModifyBaseline(normalizedPath, baselineContent, resolvingConflict)
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
      await this.pendingManager.add(normalizedPath, baselineFsMtime, {
        forceUpdateMtime: resolvingConflict,
      })
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
  async deleteFile(path: string, directoryHandle?: FileSystemDirectoryHandle | null, projectId?: string | null): Promise<void> {
    if (!this.initialized) await this.initialize()

    const normalizedPath = this.normalizeWorkspacePath(path)

    // Multi-root: resolve the correct native handle for this path
    let nativeHandle: FileSystemDirectoryHandle | null
    let nativePath = normalizedPath
    if (directoryHandle) {
      nativeHandle = directoryHandle
    } else {
      nativeHandle = await this.getNativeDirectoryHandleForPath(normalizedPath, projectId)
      const resolved = await this.resolvePath(normalizedPath, projectId)
      nativePath = resolved.relativePath || normalizedPath
    }

    const pendingEntry = this.pendingManager
      .getAll()
      .find((change) => this.normalizeWorkspacePath(change.path) === normalizedPath)

    // Get baseline mtime for conflict detection
    let baselineFsMtime = 0
    let baselineContent: FileContent | null = null
    try {
      if (nativeHandle) {
        const oldData = await this.readFromNativeFS(nativePath, nativeHandle)
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

    // Multi-root: if no explicit handle provided, we'll resolve per-path
    const explicitHandle = directoryHandle ?? null

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
        // Resolve the correct native handle for this path
        let nativeDir: FileSystemDirectoryHandle | null
        let nativePath = path

        if (explicitHandle) {
          nativeDir = explicitHandle
        } else {
          nativeDir = await this.getNativeDirectoryHandleForPath(path)
          const resolved = await this.resolvePath(path)
          nativePath = resolved.relativePath || path
        }

        if (!nativeDir) {
          skipped++
          continue
        }

        const native = await this.readFromNativeFS(nativePath, nativeDir)
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
   * @param directoryHandle Fallback handle when no root handles available
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

    const allHandles = await this.getAllNativeDirectoryHandles()

    // No handles → fallback to passed directoryHandle
    if (allHandles.size === 0) {
      return this.syncToDiskSingleRoot(directoryHandle, onlyPaths, forceOverwrite)
    }

    return this.syncToDiskMultiRoot(allHandles, onlyPaths, forceOverwrite)
  }

  /**
   * Sync pending changes for a single directory handle.
   * Used internally by syncToDiskMultiRoot per-root, and as fallback when no root handles exist.
   */
  private async syncToDiskSingleRoot(
    directoryHandle: FileSystemDirectoryHandle,
    onlyPaths?: string[],
    forceOverwrite?: boolean,
    pathTransform?: (path: string) => string
  ): Promise<SyncResult> {
    const cacheInterface = {
      readCached: async (path: string) => {
        const result = await this.readFromFilesDir(path)
        return result?.content ?? null
      },
      read: async (path: string, dirHandle?: FileSystemDirectoryHandle | null) => {
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

    const result = await this.pendingManager.sync(directoryHandle, cacheInterface, onlyPaths, forceOverwrite, pathTransform)
    await this.cleanupStaleBaselines()
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
    return result
  }

  /**
   * Multi-root sync: routes each path to its corresponding root handle.
   */
  private async syncToDiskMultiRoot(
    rootHandles: Map<string, FileSystemDirectoryHandle>,
    onlyPaths?: string[],
    forceOverwrite?: boolean
  ): Promise<SyncResult> {
    const aggregated: SyncResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      conflicts: [],
    }

    // Group onlyPaths by root
    const pathsByRoot = new Map<string, string[]>()
    const pathsToSync = onlyPaths ?? (await this.getPendingPaths())

    for (const rawPath of pathsToSync) {
      const resolved = await this.resolvePath(rawPath)
      const rootPaths = pathsByRoot.get(resolved.rootName) ?? []
      rootPaths.push(rawPath)
      pathsByRoot.set(resolved.rootName, rootPaths)
    }

    // Sync each root's paths with the corresponding handle
    for (const [rootName, rootPaths] of pathsByRoot) {
      const handle = rootHandles.get(rootName)
      if (!handle) {
        aggregated.skipped += rootPaths.length
        continue
      }

      // Build pathTransform to strip root prefix for native FS operations
      const stripPrefix = (rootName + '/').toLowerCase()
      const pathTransform = (path: string) => {
        const lower = path.toLowerCase()
        if (lower.startsWith(stripPrefix)) return path.slice(stripPrefix.length)
        return path
      }

      const result = await this.syncToDiskSingleRoot(handle, rootPaths, forceOverwrite, pathTransform)
      aggregated.success += result.success
      aggregated.failed += result.failed
      aggregated.skipped += result.skipped
      aggregated.conflicts.push(...result.conflicts)
    }

    await this.cleanupStaleBaselines()
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
    return aggregated
  }

  /**
   * Get all pending paths from the pending manager.
   */
  private async getPendingPaths(): Promise<string[]> {
    if (!this.initialized) await this.initialize()
    const all = this.pendingManager.getAll()
    return all.map((change) => change.path)
  }

  async detectSyncConflicts(
    directoryHandle: FileSystemDirectoryHandle,
    onlyPaths?: string[]
  ): Promise<SyncResult['conflicts']> {
    if (!this.initialized) await this.initialize()

    const allHandles = await this.getAllNativeDirectoryHandles()

    // No handles → fallback to passed directoryHandle
    if (allHandles.size === 0) {
      const conflicts = await this.pendingManager.detectConflicts(directoryHandle, onlyPaths)
      await this.materializeTextConflictMarkers(directoryHandle, conflicts)
      return conflicts
    }

    // Group paths by root and detect conflicts per root
    const allConflicts: SyncResult['conflicts'] = []
    const pathsToCheck = onlyPaths ?? (await this.getPendingPaths())

    const pathsByRoot = new Map<string, string[]>()
    for (const rawPath of pathsToCheck) {
      const resolved = await this.resolvePath(rawPath)
      const rootPaths = pathsByRoot.get(resolved.rootName) ?? []
      rootPaths.push(rawPath)
      pathsByRoot.set(resolved.rootName, rootPaths)
    }

    for (const [rootName, rootPaths] of pathsByRoot) {
      const handle = allHandles.get(rootName) ?? directoryHandle
      // Build pathTransform to strip root prefix for native FS operations
      const stripPrefix = (rootName + '/').toLowerCase()
      const pathTransform = (path: string) => {
        const lower = path.toLowerCase()
        if (lower.startsWith(stripPrefix)) return path.slice(stripPrefix.length)
        return path
      }
      const conflicts = await this.pendingManager.detectConflicts(handle, rootPaths, pathTransform)
      allConflicts.push(...conflicts)
    }

    await this.materializeTextConflictMarkers(directoryHandle, allConflicts)
    return allConflicts
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

        // Resolve to correct root handle and strip prefix for native FS read
        const resolved = await this.resolvePath(path)
        const nativeHandle = await this.getNativeDirectoryHandleForPath(path) ?? directoryHandle
        const nativePath = resolved.relativePath || path

        const fromNative = await this.readFromNativeFS(nativePath, nativeHandle)
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
   * Discard multiple pending paths at once without syncing to native filesystem.
   * This is more efficient than calling discardPendingPath in a loop because
   * it only saves metadata once at the end.
   * @returns Object with success/failed counts and failed paths
   */
  async discardPendingPaths(paths: string[]): Promise<{ successCount: number; failedCount: number; failedPaths: string[] }> {
    if (!this.initialized) await this.initialize()
    const pending = this.pendingManager.getAll()
    const pathSet = new Set(paths.map((p) => this.normalizeWorkspacePath(p)))
    let successCount = 0
    const failedPaths: string[] = []

    for (const change of pending) {
      const normalizedPath = this.normalizeWorkspacePath(change.path)
      if (!pathSet.has(normalizedPath)) continue

      try {
        if (change.type === 'create') {
          await this.deleteFromFilesDirIfExists(normalizedPath)
          await this.deleteFromBaselineDirIfExists(normalizedPath)
        } else if (change.type === 'modify' || change.type === 'delete') {
          let restored = await this.restorePendingModifyFromNative(normalizedPath)
          if (!restored) {
            restored = await this.restorePendingModifyFromBaseline(normalizedPath)
          }
          if (!restored) {
            failedPaths.push(change.path)
            continue
          }
          await this.deleteFromBaselineDirIfExists(normalizedPath)
        }
        await this.pendingManager.removeByPath(change.path)
        successCount++
      } catch {
        failedPaths.push(change.path)
      }
    }

    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()

    return { successCount, failedCount: failedPaths.length, failedPaths }
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
    // Multi-root: resolve the correct handle for this path
    const nativeDir = await this.getNativeDirectoryHandleForPath(path)
    if (!nativeDir) return false
    try {
      const resolved = await this.resolvePath(path)
      const nativePath = resolved.relativePath || path
      const native = await this.readFromNativeFS(nativePath, nativeDir)
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

  async createDraftSnapshot(
    summary?: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ snapshotId: string; opCount: number } | null> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    const result = await repo.commitLatestDraftSnapshot(this.workspaceId, summary)
    if (!result) return null

    // Save before/after content for each op so rollback can restore files
    const snapshotOps = await repo.listSnapshotOps(this.workspaceId, result.snapshotId)
    for (const op of snapshotOps) {
      let beforeContent: string | ArrayBuffer | null = null
      let afterContent: string | ArrayBuffer | null = null

      try {
        if (op.type === 'create') {
          const fileResult = await this.readFile(op.path)
          afterContent = await this.normalizeContentForSnapshot(fileResult.content)
        } else if (op.type === 'modify') {
          try {
            beforeContent = await this.readNativeFileContentForPath(op.path, directoryHandle)
          } catch {
            // Native file may not exist — keep before as null
          }
          const fileResult = await this.readFile(op.path)
          afterContent = await this.normalizeContentForSnapshot(fileResult.content)
        } else if (op.type === 'delete') {
          try {
            beforeContent = await this.readNativeFileContentForPath(op.path, directoryHandle)
          } catch {
            // Native file may not exist — keep before as null
          }
        }
      } catch {
        // Keep missing side as null
      }

      await repo.upsertSnapshotFileContent({
        snapshotId: result.snapshotId,
        workspaceId: this.workspaceId,
        path: op.path,
        opType: op.type,
        beforeContent,
        afterContent,
      })
    }

    return result
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
      const allHandles = await this.getAllNativeDirectoryHandles()
      if (allHandles.size > 0) {
        // Multi-root: check conflicts per root with path stripping
        const pathsByRoot = new Map<string, { paths: string[]; transform: (p: string) => string }>()
        for (const rawPath of paths) {
          const resolved = await this.resolvePath(rawPath)
          let entry = pathsByRoot.get(resolved.rootName)
          if (!entry) {
            const stripPrefix = (resolved.rootName + '/').toLowerCase()
            entry = { paths: [], transform: (p: string) => {
              const lower = p.toLowerCase()
              return lower.startsWith(stripPrefix) ? p.slice(stripPrefix.length) : p
            }}
            pathsByRoot.set(resolved.rootName, entry)
          }
          entry.paths.push(rawPath)
        }
        for (const [rootName, { paths: rootPaths, transform }] of pathsByRoot) {
          const handle = allHandles.get(rootName) ?? directoryHandle
          const rootConflicts = await this.pendingManager.detectConflicts(handle, rootPaths, transform)
          conflicts.push(...rootConflicts)
        }
      } else {
        conflicts = await this.pendingManager.detectConflicts(directoryHandle, paths)
      }
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
          try {
            beforeContent = await this.readNativeFileContentForPath(op.path, directoryHandle)
          } catch {
            // Native file may not exist
          }
          const result = await this.readFile(op.path)
          afterContent = await this.normalizeContentForSnapshot(result.content)
        } else if (op.type === 'delete') {
          try {
            beforeContent = await this.readNativeFileContentForPath(op.path, directoryHandle)
          } catch {
            // Native file may not exist
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

  /**
   * Read native file content for a workspace path, resolving the correct
   * root handle and stripping the root prefix in multi-root setups.
   * Falls back to the provided directoryHandle with the raw path if multi-root
   * resolution fails.
   */
  private async readNativeFileContentForPath(
    path: string,
    fallbackHandle?: FileSystemDirectoryHandle | null
  ): Promise<string | ArrayBuffer | null> {
    try {
      const allHandles = await this.getAllNativeDirectoryHandles()
      if (allHandles.size > 0) {
        const resolved = await this.resolvePath(path)
        const rootHandle = allHandles.get(resolved.rootName)
        if (rootHandle && resolved.relativePath) {
          return await this.readNativeFileContent(rootHandle, resolved.relativePath)
        }
        if (rootHandle && !resolved.relativePath) {
          // Path matched a root name exactly (e.g. "creatorweave") — no file to read
          return null
        }
      }
    } catch {
      // Multi-root resolution failed — fall through to single-root path
    }

    // Single-root fallback: use provided handle with raw path
    if (fallbackHandle) {
      return await this.readNativeFileContent(fallbackHandle, path)
    }
    return null
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
   * Get the assets/ directory handle (user uploads & agent-generated files)
   * This is the mount point for /mnt_assets in Pyodide Python execution
   */
  async getAssetsDir(): Promise<FileSystemDirectoryHandle> {
    return await this.workspaceDir.getDirectoryHandle(ASSETS_DIR, { create: true })
  }

  /**
   * Get the .baseline/ directory handle for OPFS-only modify rollbacks.
   */
  private async getBaselineDir(): Promise<FileSystemDirectoryHandle> {
    return await this.workspaceDir.getDirectoryHandle(BASELINE_DIR, { create: true })
  }

  /**
   * Get native directory handle for file preparation
   * @returns First root's Native FS directory handle, or null if not set
   */
  async getNativeDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.metadata.rootDirectory) return null

    try {
      const projectId = await this.resolveProjectId()
      if (projectId) {
        const rootMap = await this.ensureRootMap(projectId)
        if (rootMap && rootMap.size > 0) {
          const firstRootName = rootMap.keys().next().value!
          return getRuntimeDirectoryHandle(projectId, firstRootName)
        }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Get native directory handle for a specific path, resolving multi-root routing.
   *
   * Resolution logic:
   * 1. If path starts with a known rootName prefix → use that root's handle
   * 2. Otherwise → use the first root's handle
   */
  async getNativeDirectoryHandleForPath(path: string, projectId?: string | null): Promise<FileSystemDirectoryHandle | null> {
    try {
      let resolvedProjectId = projectId
      if (!resolvedProjectId) {
        resolvedProjectId = await this.resolveProjectId()
      }
      if (!resolvedProjectId) return null

      const resolved = await this.resolvePath(path, resolvedProjectId)
      return getRuntimeDirectoryHandle(resolvedProjectId, resolved.rootName) ?? null
    } catch {
      return null
    }
  }

  /**
   * Get all native directory handles for the project (multi-root).
   * Returns a Map of rootName → handle for all roots with active handles.
   */
  async getAllNativeDirectoryHandles(projectId?: string | null): Promise<Map<string, FileSystemDirectoryHandle>> {
    try {
      let resolvedProjectId = projectId
      if (!resolvedProjectId) {
        resolvedProjectId = await this.resolveProjectId()
      }
      if (!resolvedProjectId) return new Map()

      return getRuntimeHandlesForProject(resolvedProjectId)
    } catch {
      return new Map()
    }
  }

  // ===========================================================================
  // Multi-root path resolution
  // ===========================================================================

  /**
   * Resolve the projectId for this workspace from the DB.
   * Cached after first lookup to avoid repeated queries.
   *
   * IMPORTANT: This should be used instead of findActiveProject() in all
   * methods that need a projectId, because the global activeProject pointer
   * may point to a different project if the user switches browser tabs
   * while an agent conversation is still running.
   */
  private async resolveProjectId(): Promise<string | null> {
    if (this._cachedProjectId !== undefined) return this._cachedProjectId
    try {
      const { getWorkspaceRepository } = await import(
        '@/sqlite/repositories/workspace.repository'
      )
      const workspace = await getWorkspaceRepository().findWorkspaceById(this.workspaceId)
      this._cachedProjectId = workspace?.projectId ?? null
    } catch {
      this._cachedProjectId = null
    }
    return this._cachedProjectId
  }

  /**
   * Ensure the root map is loaded from SQLite for the given project.
   * Cached in memory; re-loaded only when projectId changes.
   */
  private async ensureRootMap(
    projectId: string
  ): Promise<Map<string, { readOnly: boolean; isDefault: boolean }> | null> {
    if (this._rootMap && this._rootMapProjectId === projectId) {
      return this._rootMap
    }

    try {
      const { getProjectRootRepository } = await import(
        '@/sqlite/repositories/project-root.repository'
      )
      const repo = getProjectRootRepository()
      const roots = await repo.findByProject(projectId)

      if (roots.length === 0) {
        this._rootMap = null
        this._rootMapProjectId = projectId
        return null
      }

      this._rootMap = new Map()
      this._rootMapProjectId = projectId

      for (const root of roots) {
        this._rootMap.set(root.name, {
          readOnly: root.readOnly,
          isDefault: root.isDefault,
        })
      }

      // Sort: is_default root first for deterministic routing order
      const defaultRoot = roots.find((r) => r.isDefault)
      if (defaultRoot && this._rootMap.has(defaultRoot.name)) {
        const entry = this._rootMap.get(defaultRoot.name)!
        this._rootMap.delete(defaultRoot.name)
        const sorted = new Map<string, { readOnly: boolean; isDefault: boolean }>()
        sorted.set(defaultRoot.name, entry)
        for (const [k, v] of this._rootMap) {
          sorted.set(k, v)
        }
        this._rootMap = sorted
      }

      return this._rootMap
    } catch {
      return null
    }
  }

  /**
   * Resolve a workspace-relative path to its root and root-relative sub-path.
   *
   * Path patterns:
   * - `"my-app/src/App.tsx"` → `{ rootName: "my-app", relativePath: "src/App.tsx" }`
   * - `"src/App.tsx"`        → `{ rootName: <defaultRoot>, relativePath: "src/App.tsx" }`
   *
   * If the first path segment matches a known root name, it's treated as a root prefix.
   * Otherwise, the path is assigned to the default root.
   */
  async resolvePath(
    path: string,
    projectId?: string | null
  ): Promise<ResolvedRoot> {
    // Normalize path
    let normalized = path.replace(/\\/g, '/')
    if (normalized.startsWith('/mnt/')) {
      normalized = normalized.slice('/mnt/'.length)
    } else if (normalized.startsWith('/')) {
      normalized = normalized.slice(1)
    }

    // Try to get projectId if not provided
    if (!projectId) {
      projectId = (await this.resolveProjectId()) ?? undefined
    }

    // No project → fallback
    if (!projectId) {
      return { rootName: '_default', relativePath: normalized, readOnly: false }
    }

    const rootMap = await this.ensureRootMap(projectId)

    // No root map → fallback
    if (!rootMap || rootMap.size === 0) {
      return { rootName: projectId, relativePath: normalized, readOnly: false }
    }

    // Check if first segment matches a known root
    const segments = normalized.split('/')
    const firstSegment = segments[0]

    if (firstSegment && rootMap.has(firstSegment)) {
      const rootInfo = rootMap.get(firstSegment)!
      return {
        rootName: firstSegment,
        relativePath: segments.slice(1).join('/'),
        readOnly: rootInfo.readOnly,
      }
    }

    // No root prefix match → route to first root
    const firstEntry = rootMap.entries().next().value!
    if (rootMap.size > 1) {
      console.warn(
        `[resolvePath] Path "${normalized}" has no root prefix. ` +
        `Defaulting to "${firstEntry[0]}". Consider using "${firstEntry[0]}/${normalized}" for clarity.`
      )
    }
    return { rootName: firstEntry[0], relativePath: normalized, readOnly: firstEntry[1].readOnly }
  }

  /**
   * Check if a root is read-only (for write guards).
   */
  async isReadOnlyRoot(rootName: string): Promise<boolean> {
    if (!this._rootMap) return false
    return this._rootMap.get(rootName)?.readOnly ?? false
  }

  /**
   * Invalidate cached root map (call when roots change).
   */
  invalidateRootCache(): void {
    this._rootMap = null
    this._rootMapProjectId = null
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

    const opfsFilesDir = await this.getFilesDir()

    // Multi-root: resolve each file's path to the correct native handle
    const allHandles = await this.getAllNativeDirectoryHandles()

    for (const filePath of files) {
      try {
        // Validate and normalize path
        const normalizedPath = this.validatePath(filePath)

        // Resolve the native handle for this file's path
        let nativeDir: FileSystemDirectoryHandle
        let nativePath = normalizedPath

        if (allHandles.size > 1) {
          // Multi-root: find the right handle
          const resolved = await this.resolvePath(normalizedPath)
          const handle = allHandles.get(resolved.rootName)
          if (!handle) {
            throw new Error(`未找到项目文件夹 "${resolved.rootName}" 的目录句柄`)
          }
          nativeDir = handle
          nativePath = resolved.relativePath || normalizedPath
        } else {
          // No path prefix match: use the first root handle
          nativeDir = allHandles.values().next().value
            ?? (await this.getNativeDirectoryHandle())!
          if (!nativeDir) {
            throw new Error('未设置 Native FS 目录句柄，请先选择项目目录')
          }
        }

        // Get file from Native FS
        const fileHandle = await this.getFileHandle(nativeDir, nativePath)
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
      let effectiveType: FileChange['type'] = change.type

      if (directoryHandle) {
        try {
          const normalizedPath = this.normalizeWorkspacePath(change.path)
          const fileHandle = await this.getFileHandle(directoryHandle, normalizedPath)
          const file = await fileHandle.getFile()
          nativeFsMtime = file.lastModified

          // Diff snapshots are OPFS-only. If native file already exists, this should
          // be treated as a modify, not a newly created file.
          if (change.type === 'add') {
            effectiveType = 'modify'
          }

          if (effectiveType === 'modify') {
            // Compare OPFS content with native content as raw bytes.
            // Always use ArrayBuffer to avoid encoding round-trip issues
            // (e.g. GBK/Latin1 text decoded via file.text() would not
            // survive a TextEncoder re-encode).
            const nativeContent = await file.arrayBuffer()

            const opfsContent = await this.readFromFilesDir(normalizedPath)
            if (opfsContent && await this.areFileContentsEqual(nativeContent, opfsContent.content)) {
              console.log(`[WorkspaceRuntime] Skipping no-op mtime change: ${normalizedPath}`)
              continue
            }

            // Content differs — capture baseline for conflict resolution fallback
            await this.captureModifyBaseline(normalizedPath, nativeContent)
          }
        } catch {
          // File may not exist on native FS (genuinely new file) — use OPFS mtime
          nativeFsMtime = change.mtime
        }
      } else {
        nativeFsMtime = change.mtime
      }

      if (effectiveType === 'add') {
        await this.pendingManager.markAsCreated(change.path, nativeFsMtime)
      } else if (effectiveType === 'modify') {
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

    const allHandles = await this.getAllNativeDirectoryHandles()

    // No handles → fallback to passed directoryHandle
    if (allHandles.size === 0) {
      return this.syncToNativeSingleRoot(directoryHandle, changes)
    }

    // Group changes by root and sync each group
    let synced = 0
    let failed = 0

    const changesByRoot = new Map<string, FileChange[]>()
    for (const change of changes) {
      const resolved = await this.resolvePath(change.path)
      const rootChanges = changesByRoot.get(resolved.rootName) ?? []
      rootChanges.push(change)
      changesByRoot.set(resolved.rootName, rootChanges)
    }

    for (const [rootName, rootChanges] of changesByRoot) {
      const handle = allHandles.get(rootName)
      if (!handle) {
        failed += rootChanges.length
        continue
      }
      const result = await this.syncToNativeSingleRoot(handle, rootChanges)
      synced += result.synced
      failed += result.failed
    }

    this.scanFilesCache = undefined
    return { synced, failed }
  }

  /**
   * syncToNative for a single directory handle.
   * Used internally by syncToNative per-root, and as fallback.
   */
  private async syncToNativeSingleRoot(
    directoryHandle: FileSystemDirectoryHandle,
    changes: FileChange[]
  ): Promise<{ synced: number; failed: number }> {
    let synced = 0
    let failed = 0
    const filesDir = await this.getFilesDir()

    for (const change of changes) {
      try {
        // For multi-root, strip root prefix when writing to native
        const resolved = await this.resolvePath(change.path)
        const nativePath = resolved.relativePath || change.path

        if (change.type === 'delete') {
          await this.deleteFromNative(directoryHandle, nativePath)
        } else {
          await this.copyToNative(directoryHandle, filesDir, change.path)
        }
        synced++
      } catch (err) {
        console.error(`Failed to sync ${change.path}:`, err)
        failed++
      }
    }

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
