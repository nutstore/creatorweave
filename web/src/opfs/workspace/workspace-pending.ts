/**
 * Workspace Pending Manager
 *
 * Per-workspace pending sync queue management.
 * Pure SQLite-backed pending operations (no OPFS file storage).
 */

import type { FileContent, PendingChange, SyncResult } from '../types/opfs-types'
import { getFileContentType } from '../utils/opfs-utils'
import { hasConflictMarkers } from './conflict-markers'
import {
  getFSOverlayRepository,
  type PendingOverlayOp,
} from '@/sqlite/repositories/fs-overlay.repository'

const FILES_DIR = 'files'

type CachedContent = FileContent

interface CacheManager {
  readCached?: (path: string) => Promise<CachedContent | null>
  read: (
    path: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ) => Promise<{ content?: CachedContent | null } | null | undefined>
}

interface SyncConflictCheck {
  isConflict: boolean
  reason?: string
  currentFsMtime: number
}

/**
 * Workspace Pending Manager
 *
 * Responsibilities:
 * - Manage pending sync queue for a workspace
 * - Merge multiple modifications to same file
 * - Sync to real filesystem
 * - Persist queue to SQLite
 */
export class WorkspacePendingManager {
  private readonly workspaceId: string
  private readonly workspaceDir: FileSystemDirectoryHandle
  private pendingChanges: Map<string, PendingChange> = new Map()
  private pendingIdToPath: Map<string, string> = new Map()
  private initialized = false

  constructor(workspaceId: string, workspaceDir: FileSystemDirectoryHandle) {
    this.workspaceId = workspaceId
    this.workspaceDir = workspaceDir
  }

  /**
   * Initialize pending manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    await this.loadPending()
    this.initialized = true
  }

  /**
   * Load pending queue from SQLite (pure SQLite, no OPFS file fallback)
   */
  private async loadPending(): Promise<void> {
    const repo = getFSOverlayRepository()
    const sqlitePending = await repo.listPendingOps(this.workspaceId)
    this.setPendingFromRepo(sqlitePending)
  }

  /**
   * Force reload pending data from database
   */
  async reload(): Promise<void> {
    await this.loadPending()
  }

  /**
   * Add pending record for file modification
   * @param path File path
   */
  async add(path: string, fsMtime?: number): Promise<void> {
    if (!this.initialized) await this.initialize()

    const repo = getFSOverlayRepository()
    const existing = this.pendingChanges.get(path)
    const nextType = existing?.type === 'create' ? 'create' : 'modify'
    const op = await repo.upsertPendingOp(this.workspaceId, path, nextType, fsMtime)
    this.setPendingChange(op)
  }

  /**
   * Mark file for deletion
   * @param path File path
   */
  async markForDeletion(path: string, fsMtime?: number): Promise<void> {
    if (!this.initialized) await this.initialize()

    const repo = getFSOverlayRepository()
    const existing = this.pendingChanges.get(path)

    // create -> delete cancels out in pending view.
    if (existing?.type === 'create') {
      await repo.discardPendingPath(this.workspaceId, path)
      this.removePendingPath(path)
      return
    }

    const op = await repo.upsertPendingOp(this.workspaceId, path, 'delete', fsMtime)
    this.setPendingChange(op)
  }

  /**
   * Mark file as newly created
   * @param path File path
   */
  async markAsCreated(path: string, fsMtime?: number): Promise<void> {
    if (!this.initialized) await this.initialize()

    const repo = getFSOverlayRepository()
    const op = await repo.upsertPendingOp(this.workspaceId, path, 'create', fsMtime)
    this.setPendingChange(op)
  }

  async detectConflicts(
    directoryHandle: FileSystemDirectoryHandle,
    onlyPaths?: string[]
  ): Promise<SyncResult['conflicts']> {
    const conflicts: SyncResult['conflicts'] = []
    const normalizeComparePath = (p: string): string => {
      let normalized = p.replace(/\\/g, '/')
      if (normalized.startsWith('/mnt/')) {
        normalized = normalized.slice(5)
      } else if (normalized.startsWith('/')) {
        normalized = normalized.slice(1)
      }
      return normalized
    }
    const allowedPaths = onlyPaths ? new Set(onlyPaths.map((p) => normalizeComparePath(p))) : null

    for (const change of this.getSyncCandidates()) {
      const changePathNormalized = normalizeComparePath(change.path)
      if (allowedPaths && !allowedPaths.has(changePathNormalized)) {
        continue
      }
      if (change.type !== 'delete') {
        const hasMarkers = await this.hasUnresolvedConflictMarkers(change.path)
        if (hasMarkers) {
          const currentFsMtime = await this.safeReadNativeMtime(directoryHandle, change.path)
          conflicts.push({
            path: change.path,
            workspaceId: this.workspaceId,
            otherWorkspaces: [],
            opfsMtime: change.fsMtime || change.timestamp,
            currentFsMtime: currentFsMtime ?? 0,
          })
          continue
        }
      }

      const check = await this.checkNativeConflict(directoryHandle, change)
      if (!check.isConflict) continue

      conflicts.push({
        path: change.path,
        workspaceId: this.workspaceId,
        otherWorkspaces: [],
        opfsMtime: change.fsMtime || change.timestamp,
        currentFsMtime: check.currentFsMtime,
      })
    }

    return conflicts
  }

  /**
   * Get all pending records awaiting review
   * @returns Changes with review_status = 'pending' or NULL (not yet reviewed)
   *         Excludes changes with review_status = 'approved'
   */
  getAll(): PendingChange[] {
    // Return cloned objects so external state layers (e.g. Zustand + Immer)
    // cannot freeze/mutate our internal map records by shared reference.
    return Array.from(this.pendingChanges.values())
      .filter((change) => !change.reviewStatus || change.reviewStatus === 'pending')
      .map((change) => ({ ...change }))
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get changes that are eligible for sync execution.
   * Includes both pending and approved records; rejected records are excluded.
   */
  private getSyncCandidates(): PendingChange[] {
    return Array.from(this.pendingChanges.values())
      .filter((change) => change.reviewStatus !== 'rejected')
      .map((change) => ({ ...change }))
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get pending count
   */
  get count(): number {
    let total = 0
    for (const change of this.pendingChanges.values()) {
      if (!change.reviewStatus || change.reviewStatus === 'pending') {
        total++
      }
    }
    return total
  }

  /**
   * Check whether a path currently has pending overlay operations.
   */
  hasPendingPath(path: string): boolean {
    if (this.pendingChanges.has(path)) return true
    const normalized = this.normalizeComparePath(path)
    for (const pendingPath of this.pendingChanges.keys()) {
      if (this.normalizeComparePath(pendingPath) === normalized) {
        return true
      }
    }
    return false
  }

  /**
   * Clear pending queue
   */
  async clear(): Promise<void> {
    const repo = getFSOverlayRepository()
    for (const pending of this.pendingChanges.values()) {
      await repo.discardPendingPath(this.workspaceId, pending.path)
    }
    this.pendingChanges.clear()
    this.pendingIdToPath.clear()
  }

  /**
   * Remove specific pending record
   * @param id Record ID
   */
  async remove(id: string): Promise<void> {
    const targetPath = this.pendingIdToPath.get(id)
    if (!targetPath) return
    const repo = getFSOverlayRepository()
    await repo.discardPendingPath(this.workspaceId, targetPath)
    this.removePendingPath(targetPath)
  }

  /**
   * Remove pending record by path
   * @param path File path
   */
  async removeByPath(path: string): Promise<void> {
    const existing = this.pendingChanges.get(path)
    if (!existing) return
    const repo = getFSOverlayRepository()
    await repo.discardPendingPath(this.workspaceId, path)
    this.removePendingPath(path)
  }

  /**
   * Sync to real filesystem
   * @param directoryHandle Real filesystem directory handle
   * @param cacheManager Cache manager (for reading OPFS content)
   * @param onlyPaths Optional list of paths to sync (if not provided, sync all)
   * @param forceOverwrite If true, skip conflict check and overwrite disk files
   */
  async sync(
    directoryHandle: FileSystemDirectoryHandle,
    cacheManager: CacheManager,
    onlyPaths?: string[],
    forceOverwrite?: boolean
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      conflicts: [],
    }

    const repo = getFSOverlayRepository()
    const batchId = await repo.createSyncBatch(this.workspaceId, this.pendingChanges.size)
    const normalizeComparePath = (p: string): string => {
      let normalized = p.replace(/\\/g, '/')
      if (normalized.startsWith('/mnt/')) {
        normalized = normalized.slice(5)
      } else if (normalized.startsWith('/')) {
        normalized = normalized.slice(1)
      }
      return normalized
    }
    const allowedPaths = onlyPaths ? new Set(onlyPaths.map((p) => normalizeComparePath(p))) : null

    for (const change of this.getSyncCandidates()) {
      if (allowedPaths && !allowedPaths.has(normalizeComparePath(change.path))) {
        result.skipped++
        await repo.recordSyncItem(batchId, change.id, change.path, 'skipped')
        continue
      }

      try {
        if (change.type !== 'delete') {
          const hasMarkers = await this.hasUnresolvedConflictMarkers(change.path, cacheManager)
          if (hasMarkers) {
            result.failed++
            const currentFsMtime = await this.safeReadNativeMtime(directoryHandle, change.path)
            const message = `检测到未解决冲突标记：${change.path}，请先处理 <<<<<<< / ======= / >>>>>>> 标记后再审批。`
            await repo.keepOpPending(change.id, message)
            await repo.recordSyncItem(batchId, change.id, change.path, 'failed', message)
            result.conflicts.push({
              path: change.path,
              workspaceId: this.workspaceId,
              otherWorkspaces: [],
              opfsMtime: change.fsMtime || change.timestamp,
              currentFsMtime: currentFsMtime ?? 0,
            })
            continue
          }
        }

        // Skip conflict check if forceOverwrite is true
        const conflictCheck = forceOverwrite
          ? { isConflict: false, currentFsMtime: 0 }
          : await this.checkNativeConflict(directoryHandle, change)
        if (conflictCheck.isConflict) {
          result.failed++
          const message =
            conflictCheck.reason ||
            `检测到冲突：${change.path} 在草稿创建后已被磁盘更新，请先处理冲突后再审批。`
          await repo.keepOpPending(change.id, message)
          await repo.recordSyncItem(batchId, change.id, change.path, 'failed', message)
          result.conflicts.push({
            path: change.path,
            workspaceId: this.workspaceId,
            otherWorkspaces: [],
            opfsMtime: change.fsMtime || change.timestamp,
            currentFsMtime: conflictCheck.currentFsMtime,
          })
          continue
        }

        if (change.type === 'delete') {
          await this.deleteFile(directoryHandle, change.path)
          result.success++
          await repo.markOpSynced(change.id)
          await repo.recordSyncItem(batchId, change.id, change.path, 'success')
          this.removePendingPath(change.path)
        } else {
          // Read from OPFS cache and write to filesystem
          const content = await this.readCacheContent(change.path, cacheManager)
          if (content) {
            await this.writeFile(directoryHandle, change.path, content)
            result.success++
            await repo.markOpSynced(change.id)
            await repo.recordSyncItem(batchId, change.id, change.path, 'success')
            this.removePendingPath(change.path)
          } else {
            result.failed++
            await repo.keepOpPending(change.id, 'No cached content found')
            await repo.recordSyncItem(batchId, change.id, change.path, 'failed', 'No cached content')
          }
        }
      } catch (err: unknown) {
        if (this.getErrorName(err) === 'NotFoundError') {
          if (change.type === 'delete') {
            // Idempotent delete: target already gone, treat as success.
            result.success++
            await repo.markOpSynced(change.id)
            await repo.recordSyncItem(batchId, change.id, change.path, 'success')
            this.removePendingPath(change.path)
            continue
          }
          if (change.type === 'create') {
            // New file, this is expected
            result.success++
            await repo.markOpSynced(change.id)
            await repo.recordSyncItem(batchId, change.id, change.path, 'success')
            this.removePendingPath(change.path)
          } else {
            result.failed++
            const notFoundMessage = this.getErrorMessage(err, 'NotFoundError')
            await repo.keepOpPending(change.id, notFoundMessage)
            await repo.recordSyncItem(
              batchId,
              change.id,
              change.path,
              'failed',
              notFoundMessage
            )
          }
        } else {
          result.failed++
          const msg = `Sync failed for ${change.path}: ${this.getErrorMessage(err)}`
          await repo.keepOpPending(change.id, msg)
          await repo.recordSyncItem(batchId, change.id, change.path, 'failed', msg)
        }
      }
    }

    await repo.finalizeSyncBatch(
      batchId,
      result.failed === 0 ? 'success' : result.success > 0 ? 'partial' : 'failed',
      result.success,
      result.failed,
      result.skipped
    )
    return result
  }

  /**
   * Delete file from filesystem
   */
  private async deleteFile(
    directoryHandle: FileSystemDirectoryHandle,
    path: string
  ): Promise<void> {
    const parts = path.split('/')
    let current = directoryHandle

    // Navigate to parent directory
    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue
      current = await current.getDirectoryHandle(parts[i])
    }

    // Remove file
    const fileName = parts[parts.length - 1]
    await current.removeEntry(fileName)
  }

  /**
   * Write file to filesystem
   */
  private async writeFile(
    directoryHandle: FileSystemDirectoryHandle,
    path: string,
    content: CachedContent
  ): Promise<void> {
    const parts = path.split('/')
    let current = directoryHandle

    // Navigate to parent directory, creating if needed
    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i]) continue
      try {
        current = await current.getDirectoryHandle(parts[i])
      } catch {
        current = await current.getDirectoryHandle(parts[i], { create: true })
      }
    }

    // Create/write file
    const fileName = parts[parts.length - 1]
    const fileHandle = await current.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()

    await writable.write(content)
    await writable.close()
  }

  /**
   * Read content from cache for syncing
   */
  private async readCacheContent(
    path: string,
    cacheManager: CacheManager
  ): Promise<CachedContent | null> {
    try {
      // Prefer cache-only read. This avoids fake native directory handles and
      // keeps sync deterministic with OPFS pending content.
      if (typeof cacheManager.readCached === 'function') {
        const cached = await cacheManager.readCached(path)
        if (cached !== null) return cached
      }

      // Fallback: read from OPFS files/ snapshot directory.
      const fromFilesDir = await this.readFromFilesDir(path)
      if (fromFilesDir !== null) {
        return fromFilesDir
      }

      // Backward compatibility fallback.
      const result = await cacheManager.read(path, null)
      return result?.content ?? null
    } catch {
      console.warn(`Failed to read cache for ${path}`)
      return null
    }
  }

  /**
   * Fallback read from OPFS files/ directory.
   */
  private async readFromFilesDir(path: string): Promise<string | ArrayBuffer | null> {
    try {
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) return null

      let current = await this.workspaceDir.getDirectoryHandle(FILES_DIR, { create: true })
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
      }

      const fileHandle = await current.getFileHandle(parts[parts.length - 1])
      const file = await fileHandle.getFile()
      return await file.arrayBuffer()
    } catch {
      return null
    }
  }

  private normalizeComparePath(p: string): string {
    let normalized = p.replace(/\\/g, '/')
    if (normalized.startsWith('/mnt/')) {
      normalized = normalized.slice(5)
    } else if (normalized.startsWith('/')) {
      normalized = normalized.slice(1)
    }
    return normalized
  }

  private setPendingFromRepo(changes: PendingOverlayOp[]): void {
    this.pendingChanges.clear()
    this.pendingIdToPath.clear()
    for (const change of changes) {
      this.setPendingChange(change)
    }
  }

  private setPendingChange(op: PendingOverlayOp): void {
    const previous = this.pendingChanges.get(op.path)
    if (previous && previous.id !== op.id) {
      this.pendingIdToPath.delete(previous.id)
    }
    this.pendingChanges.set(op.path, {
      id: op.id,
      path: op.path,
      type: op.type,
      fsMtime: op.fsMtime,
      timestamp: op.timestamp,
      snapshotId: op.snapshotId,
      snapshotStatus: op.snapshotStatus,
      snapshotSummary: op.snapshotSummary,
      reviewStatus: op.reviewStatus,
    })
    this.pendingIdToPath.set(op.id, op.path)
  }

  private removePendingPath(path: string): void {
    const existing = this.pendingChanges.get(path)
    if (!existing) return
    this.pendingChanges.delete(path)
    this.pendingIdToPath.delete(existing.id)
  }

  private getErrorName(err: unknown): string | undefined {
    if (err && typeof err === 'object' && 'name' in err && typeof err.name === 'string') {
      return err.name
    }
    return undefined
  }

  private getErrorMessage(err: unknown, fallback: string = 'Unknown error'): string {
    if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
      return err.message
    }
    return fallback
  }

  private async checkNativeConflict(
    directoryHandle: FileSystemDirectoryHandle,
    change: PendingChange
  ): Promise<SyncConflictCheck> {
    const currentFsMtime = await this.readNativeMtime(directoryHandle, change.path)
    const baselineFsMtime = change.fsMtime || 0

    if (change.type === 'create') {
      if (currentFsMtime !== null) {
        if (baselineFsMtime === 0 || currentFsMtime !== baselineFsMtime) {
          return {
            isConflict: true,
            reason: `检测到冲突：${change.path} 在草稿创建后已存在更新的磁盘版本。`,
            currentFsMtime,
          }
        }
      }
      return { isConflict: false, currentFsMtime: 0 }
    }

    if (change.type === 'modify') {
      if (baselineFsMtime > 0 && currentFsMtime !== baselineFsMtime) {
        return {
          isConflict: true,
          reason: `检测到冲突：${change.path} 在草稿创建后被磁盘修改。`,
          currentFsMtime: currentFsMtime ?? 0,
        }
      }
      return { isConflict: false, currentFsMtime: currentFsMtime ?? 0 }
    }

    if (change.type === 'delete') {
      if (
        baselineFsMtime > 0 &&
        currentFsMtime !== null &&
        currentFsMtime !== baselineFsMtime
      ) {
        return {
          isConflict: true,
          reason: `检测到冲突：${change.path} 在草稿删除前已被磁盘修改。`,
          currentFsMtime,
        }
      }
      return { isConflict: false, currentFsMtime: currentFsMtime ?? 0 }
    }

    return { isConflict: false, currentFsMtime: currentFsMtime ?? 0 }
  }

  private async readNativeMtime(
    directoryHandle: FileSystemDirectoryHandle,
    path: string
  ): Promise<number | null> {
    try {
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) return null
      let current = directoryHandle
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
      }
      const fileHandle = await current.getFileHandle(parts[parts.length - 1])
      const file = await fileHandle.getFile()
      return file.lastModified
    } catch (err: unknown) {
      if (this.getErrorName(err) === 'NotFoundError') {
        return null
      }
      throw err
    }
  }

  private async safeReadNativeMtime(
    directoryHandle: FileSystemDirectoryHandle,
    path: string
  ): Promise<number | null> {
    try {
      return await this.readNativeMtime(directoryHandle, path)
    } catch {
      return null
    }
  }

  private async hasUnresolvedConflictMarkers(
    path: string,
    cacheManager?: CacheManager
  ): Promise<boolean> {
    if (getFileContentType(path) !== 'text') {
      return false
    }

    if (cacheManager) {
      const cached = await this.readCacheContent(path, cacheManager)
      return typeof cached === 'string' && hasConflictMarkers(cached)
    }

    const fromFiles = await this.readTextFromFilesDir(path)
    return typeof fromFiles === 'string' && hasConflictMarkers(fromFiles)
  }

  private async readTextFromFilesDir(path: string): Promise<string | null> {
    try {
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) return null

      let current = await this.workspaceDir.getDirectoryHandle(FILES_DIR, { create: true })
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i])
      }

      const fileHandle = await current.getFileHandle(parts[parts.length - 1])
      const file = await fileHandle.getFile()
      return await file.text()
    } catch {
      return null
    }
  }

}
