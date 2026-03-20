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
import { getRuntimeDirectoryHandle } from '@/native-fs'
import { getFSOverlayRepository } from '@/sqlite/repositories/fs-overlay.repository'

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
    this.pendingManager = new SessionPendingManager(sessionId, sessionDir)
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
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ content: FileContent; metadata: FileMetadata }> {
    if (!this.initialized) await this.initialize()

    // If path has pending changes, always read workspace state (OPFS cache/files),
    // never fallback to native disk to avoid showing stale on-disk content.
    const isPendingPath = this.pendingManager.hasPendingPath(path)
    if (directoryHandle && !isPendingPath) {
      return await this.cacheManager.read(path, directoryHandle)
    }

    const cached = await this.cacheManager.readCached(path)
    if (cached !== null) {
      return {
        content: cached,
        metadata: this.buildVirtualMetadata(path, cached),
      }
    }

    const fromFilesDir = await this.readFromFilesDir(path)
    if (fromFilesDir) {
      await this.cacheManager.write(path, fromFilesDir.content)
      return {
        content: fromFilesDir.content,
        metadata: {
          path,
          mtime: fromFilesDir.mtime,
          size: fromFilesDir.size,
          contentType: fromFilesDir.contentType,
        },
      }
    }

    throw new Error(`File not found in OPFS workspace: ${path}`)
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
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<void> {
    if (!this.initialized) await this.initialize()

    // Get old content for undo
    let oldContent: FileContent | undefined
    let baselineFsMtime = 0
    try {
      if (directoryHandle) {
        const oldData = await this.cacheManager.read(path, directoryHandle)
        oldContent = oldData.content
        baselineFsMtime = oldData.metadata.mtime || 0
      } else {
        const cached = await this.cacheManager.readCached(path)
        if (cached !== null) oldContent = cached
      }
    } catch {
      // File doesn't exist, oldContent stays undefined
    }

    // Record to undo history
    await this.undoStorage.recordModification(path, content, oldContent)

    // Write to cache
    await this.cacheManager.write(path, content)

    // Notify other tabs about the file change
    try {
      const channel = new BroadcastChannel('opfs-file-changes')
      channel.postMessage({ type: 'opfs-file-changed', path })
      channel.close()
    } catch (e) {
      console.warn('[SessionWorkspace] Failed to broadcast file change:', e)
    }

    // Mark as pending
    await this.pendingManager.add(path, baselineFsMtime)

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Delete file from session
   * @param path File path
   * @param directoryHandle Real filesystem directory handle (for old content)
   */
  async deleteFile(path: string, directoryHandle?: FileSystemDirectoryHandle | null): Promise<void> {
    if (!this.initialized) await this.initialize()

    // Get old content for undo
    let oldContent: FileContent | undefined
    let baselineFsMtime = 0
    try {
      if (directoryHandle) {
        const oldData = await this.cacheManager.read(path, directoryHandle)
        oldContent = oldData.content
        baselineFsMtime = oldData.metadata.mtime || 0
      } else {
        const cached = await this.cacheManager.readCached(path)
        if (cached !== null) oldContent = cached
      }
    } catch {
      // File doesn't exist in cache
    }

    // Record to undo history
    await this.undoStorage.recordDeletion(path, oldContent)

    // Delete from cache
    await this.cacheManager.delete(path)

    // Mark as pending for deletion
    await this.pendingManager.markForDeletion(path, baselineFsMtime)

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

    const record = this.undoStorage.getRecord(recordId)
    if (!record) {
      throw new Error(`Undo record not found: ${recordId}`)
    }

    await this.undoStorage.undo(recordId, this.cacheManager)

    // Keep pending queue aligned with working cache state.
    if (record.type === 'create') {
      await this.pendingManager.removeByPath(record.path)
    } else if (record.type === 'modify' || record.type === 'delete') {
      await this.pendingManager.add(record.path)
    }

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

    const record = this.undoStorage.getRecord(recordId)
    if (!record) {
      throw new Error(`Undo record not found: ${recordId}`)
    }

    await this.undoStorage.redo(recordId, this.cacheManager)

    // Keep pending queue aligned with redone operation semantics.
    if (record.type === 'create') {
      await this.pendingManager.markAsCreated(record.path)
    } else if (record.type === 'modify') {
      await this.pendingManager.add(record.path)
    } else if (record.type === 'delete') {
      await this.pendingManager.markForDeletion(record.path)
    }

    // Update last accessed time
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Sync pending changes to real filesystem
   * @param directoryHandle Real filesystem directory handle
   * @returns Sync result
   */
  async syncToDisk(directoryHandle: FileSystemDirectoryHandle, onlyPaths?: string[]): Promise<SyncResult> {
    if (!this.initialized) await this.initialize()

    const result = await this.pendingManager.sync(directoryHandle, this.cacheManager, onlyPaths)

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
    return await this.pendingManager.detectConflicts(directoryHandle, onlyPaths)
  }

  /**
   * Discard all pending changes without syncing to native filesystem.
   * Keeps OPFS cache/files as-is, but clears overlay pending ledger.
   */
  async discardAllPendingChanges(): Promise<void> {
    if (!this.initialized) await this.initialize()
    await this.pendingManager.clear()
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
  }

  /**
   * Discard one pending path without syncing to native filesystem.
   */
  async discardPendingPath(path: string): Promise<void> {
    if (!this.initialized) await this.initialize()
    await this.pendingManager.removeByPath(path)
    this.metadata.lastAccessedAt = Date.now()
    await this.saveMetadata()
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
   * Read file content from working cache only (no native FS fallback).
   * Useful for previewing pending edits that are not materialized into files/ yet.
   */
  async readCachedFile(path: string): Promise<FileContent | null> {
    if (!this.initialized) await this.initialize()
    return await this.cacheManager.readCached(path)
  }

  async createDraftSnapshot(summary?: string): Promise<{ snapshotId: string; opCount: number } | null> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    return await repo.commitLatestDraftSnapshot(this.sessionId, summary)
  }

  async createApprovedSnapshotForPaths(
    paths: string[],
    summary?: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ snapshotId: string; opCount: number } | null> {
    if (!this.initialized) await this.initialize()
    if (paths.length === 0) return null
    if (directoryHandle) {
      const conflicts = await this.pendingManager.detectConflicts(directoryHandle, paths)
      if (conflicts.length > 0) {
        const sample = conflicts.slice(0, 2).map((item) => item.path).join(', ')
        throw new Error(
          `检测到 ${conflicts.length} 个文件冲突，无法审批通过：${sample}${conflicts.length > 2 ? ' ...' : ''}`
        )
      }
    }

    const repo = getFSOverlayRepository()
    const snapshot = await repo.createApprovedSnapshotForPaths(this.sessionId, paths, summary)
    if (!snapshot) return null
    await repo.setCurrentSnapshotId(this.sessionId, snapshot.snapshotId)

    const snapshotOps = await repo.listSnapshotOps(this.sessionId, snapshot.snapshotId)
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
        workspaceId: this.sessionId,
        path: op.path,
        opType: op.type,
        beforeContent,
        afterContent,
      })
    }

    return snapshot
  }

  async rollbackSnapshot(
    snapshotId: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ reverted: number; unresolved: string[] }> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    const ops = await repo.listSnapshotOps(this.sessionId, snapshotId)
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
          await this.cacheManager.delete(op.path)
          await this.deleteFromFilesDirIfExists(op.path)
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
      await repo.markSnapshotRolledBack(this.sessionId, snapshotId)
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
    const ops = await repo.listSnapshotOps(this.sessionId, snapshotId)
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
          await this.cacheManager.delete(op.path)
          await this.deleteFromFilesDirIfExists(op.path)
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
      await repo.markSnapshotActive(this.sessionId, snapshotId)
      await repo.setCurrentSnapshotId(this.sessionId, snapshotId)
    }

    return { applied, unresolved }
  }

  async rollbackLatestSnapshot(
    directoryHandle?: FileSystemDirectoryHandle | null
  ): Promise<{ snapshotId: string | null; reverted: number; unresolved: string[] }> {
    if (!this.initialized) await this.initialize()
    const repo = getFSOverlayRepository()
    const snapshots = await repo.listSnapshots(this.sessionId, 200)
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
    const snapshots = await repo.listSnapshots(this.sessionId, 500)
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
    const snapshots = await repo.listSnapshots(this.sessionId, 500)
    const targetIndex = snapshots.findIndex((item) => item.id === snapshotId)
    if (targetIndex < 0) {
      throw new Error(`快照不存在: ${snapshotId}`)
    }

    const isActive = (status: string): boolean => status === 'approved' || status === 'committed'
    const currentIndex = snapshots.findIndex((item) => isActive(item.status))
    const normalizedCurrentIndex = currentIndex >= 0 ? currentIndex : snapshots.length

    if (targetIndex === normalizedCurrentIndex) {
      await repo.setCurrentSnapshotId(this.sessionId, snapshotId)
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
    const snapshots = await repo.listSnapshots(this.sessionId, 500)
    const current = snapshots.find((item) => item.status === 'approved' || item.status === 'committed')
    await repo.setCurrentSnapshotId(this.sessionId, current?.id || null)
  }

  private buildVirtualMetadata(path: string, content: FileContent): FileMetadata {
    let size = 0
    let contentType: 'text' | 'binary' = 'binary'
    if (typeof content === 'string') {
      size = new Blob([content]).size
      contentType = 'text'
    } else if (content instanceof Blob) {
      size = content.size
      contentType = 'binary'
    } else {
      size = content.byteLength
      contentType = 'binary'
    }

    return {
      path,
      mtime: Date.now(),
      size,
      contentType,
    }
  }

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
      let contentType: 'text' | 'binary' = 'binary'
      try {
        content = await file.text()
        contentType = 'text'
      } catch {
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

  private async deleteFromFilesDirIfExists(path: string): Promise<void> {
    try {
      const filesDir = await this.getFilesDir()
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) return

      let current = filesDir
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
      }
      await current.removeEntry(parts[parts.length - 1])
    } catch {
      // Ignore if file doesn't exist in files/ snapshot.
    }
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
    const cached = await this.cacheManager.readCached(path)
    if (cached === null) return null
    if (typeof cached === 'string') return cached
    if (cached instanceof Blob) return await cached.arrayBuffer()
    return cached
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
      await this.cacheManager.write(path, contentText || '')
      const filesDir = await this.getFilesDir()
      await this.writeFileToOPFS(filesDir, path, new TextEncoder().encode(contentText || '').buffer)
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

    await this.cacheManager.write(path, binary)
    const filesDir = await this.getFilesDir()
    await this.writeFileToOPFS(filesDir, path, binary)
    return true
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
      // Handle is managed in native-fs runtime registry.
      const handle = getRuntimeDirectoryHandle(this.sessionId)
      if (handle) return handle

      // Fallback: directory access is granted at project scope in workspace.store.
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

  async registerDetectedChanges(changes: FileChange[]): Promise<void> {
    if (!this.initialized) await this.initialize()

    for (const change of changes) {
      if (change.type === 'add') {
        await this.pendingManager.markAsCreated(change.path, change.mtime)
      } else if (change.type === 'modify') {
        await this.pendingManager.add(change.path, change.mtime)
      } else if (change.type === 'delete') {
        await this.pendingManager.markForDeletion(change.path, change.mtime)
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
}
