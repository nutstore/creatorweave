/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Session Pending Manager
 *
 * Per-session pending sync queue management.
 * Merges multiple modifications to the same file and handles sync to filesystem.
 */

import type { PendingChange, SyncResult } from '../types/opfs-types'
import { getFSOverlayRepository } from '@/sqlite/repositories/fs-overlay.repository'

const PENDING_FILE = 'pending.json'
const FILES_DIR = 'files'

/**
 * Session Pending Manager
 *
 * Responsibilities:
 * - Manage pending sync queue for a session
 * - Merge multiple modifications to same file
 * - Sync to real filesystem
 * - Persist queue to OPFS
 */
export class SessionPendingManager {
  private readonly workspaceId: string
  private readonly sessionDir: FileSystemDirectoryHandle
  private pendingChanges: Map<string, PendingChange> = new Map()
  private initialized = false

  constructor(workspaceId: string, sessionDir: FileSystemDirectoryHandle) {
    this.workspaceId = workspaceId
    this.sessionDir = sessionDir
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
   * Load pending queue from OPFS
   */
  private async loadPending(): Promise<void> {
    const repo = getFSOverlayRepository()
    const sqlitePending = await repo.listPendingOps(this.workspaceId)
    if (sqlitePending.length > 0) {
      this.pendingChanges = new Map(sqlitePending.map((c) => [c.path, c]))
      return
    }

    // One-time compatibility import from legacy OPFS pending.json.
    try {
      const pendingFile = await this.sessionDir.getFileHandle(PENDING_FILE)
      const file = await pendingFile.getFile()
      const text = await file.text()
      const legacyPending = JSON.parse(text) as PendingChange[]

      for (const pending of legacyPending) {
        await repo.upsertPendingOp(this.workspaceId, pending.path, pending.type)
      }
    } catch {
      // No legacy pending file, ignore.
    }

    const imported = await repo.listPendingOps(this.workspaceId)
    this.pendingChanges = new Map(imported.map((c) => [c.path, c]))
  }

  /**
   * Add pending record for file modification
   * @param path File path
   */
  async add(path: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    const repo = getFSOverlayRepository()
    const existing = this.pendingChanges.get(path)
    const nextType = existing?.type === 'create' ? 'create' : 'modify'
    const op = await repo.upsertPendingOp(this.workspaceId, path, nextType)
    this.pendingChanges.set(path, {
      id: op.id,
      path: op.path,
      type: op.type,
      fsMtime: op.fsMtime,
      timestamp: op.timestamp,
      checkpointId: op.checkpointId,
      checkpointStatus: op.checkpointStatus,
      checkpointSummary: op.checkpointSummary,
    })
  }

  /**
   * Mark file for deletion
   * @param path File path
   */
  async markForDeletion(path: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    const repo = getFSOverlayRepository()
    const existing = this.pendingChanges.get(path)

    // create -> delete cancels out in pending view.
    if (existing?.type === 'create') {
      await repo.discardPendingPath(this.workspaceId, path)
      this.pendingChanges.delete(path)
      return
    }

    const op = await repo.upsertPendingOp(this.workspaceId, path, 'delete')
    this.pendingChanges.set(path, {
      id: op.id,
      path: op.path,
      type: op.type,
      fsMtime: op.fsMtime,
      timestamp: op.timestamp,
      checkpointId: op.checkpointId,
      checkpointStatus: op.checkpointStatus,
      checkpointSummary: op.checkpointSummary,
    })
  }

  /**
   * Mark file as newly created
   * @param path File path
   */
  async markAsCreated(path: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    const repo = getFSOverlayRepository()
    const op = await repo.upsertPendingOp(this.workspaceId, path, 'create')
    this.pendingChanges.set(path, {
      id: op.id,
      path: op.path,
      type: op.type,
      fsMtime: op.fsMtime,
      timestamp: op.timestamp,
      checkpointId: op.checkpointId,
      checkpointStatus: op.checkpointStatus,
      checkpointSummary: op.checkpointSummary,
    })
  }

  /**
   * Get all pending records
   */
  getAll(): PendingChange[] {
    // Return cloned objects so external state layers (e.g. Zustand + Immer)
    // cannot freeze/mutate our internal map records by shared reference.
    return Array.from(this.pendingChanges.values())
      .map((change) => ({ ...change }))
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get pending count
   */
  get count(): number {
    return this.pendingChanges.size
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
  }

  /**
   * Remove specific pending record
   * @param id Record ID
   */
  async remove(id: string): Promise<void> {
    const target = Array.from(this.pendingChanges.values()).find((c) => c.id === id)
    if (!target) return
    const repo = getFSOverlayRepository()
    await repo.discardPendingPath(this.workspaceId, target.path)
    this.pendingChanges.delete(target.path)
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
    this.pendingChanges.delete(path)
  }

  /**
   * Sync to real filesystem
   * @param directoryHandle Real filesystem directory handle
   * @param cacheManager Cache manager (for reading OPFS content)
   */
  async sync(
    directoryHandle: FileSystemDirectoryHandle,
    cacheManager: any,
    onlyPaths?: string[]
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

    for (const change of this.getAll()) {
      if (allowedPaths && !allowedPaths.has(normalizeComparePath(change.path))) {
        result.skipped++
        await repo.recordSyncItem(batchId, change.id, change.path, 'skipped')
        continue
      }

      try {
        if (change.type === 'delete') {
          await this.deleteFile(directoryHandle, change.path)
          result.success++
          await repo.markOpSynced(change.id)
          await repo.recordSyncItem(batchId, change.id, change.path, 'success')
          this.pendingChanges.delete(change.path)
        } else {
          // Read from OPFS cache and write to filesystem
          const content = await this.readCacheContent(change.path, cacheManager)
          if (content) {
            await this.writeFile(directoryHandle, change.path, content)
            result.success++
            await repo.markOpSynced(change.id)
            await repo.recordSyncItem(batchId, change.id, change.path, 'success')
            this.pendingChanges.delete(change.path)
          } else {
            result.failed++
            await repo.keepOpPending(change.id, 'No cached content found')
            await repo.recordSyncItem(batchId, change.id, change.path, 'failed', 'No cached content')
          }
        }
      } catch (err: any) {
        if (err.name === 'NotFoundError') {
          if (change.type === 'delete') {
            // Idempotent delete: target already gone, treat as success.
            result.success++
            await repo.markOpSynced(change.id)
            await repo.recordSyncItem(batchId, change.id, change.path, 'success')
            this.pendingChanges.delete(change.path)
            continue
          }
          if (change.type === 'create') {
            // New file, this is expected
            result.success++
            await repo.markOpSynced(change.id)
            await repo.recordSyncItem(batchId, change.id, change.path, 'success')
            this.pendingChanges.delete(change.path)
          } else {
            result.failed++
            await repo.keepOpPending(change.id, err.message || 'NotFoundError')
            await repo.recordSyncItem(
              batchId,
              change.id,
              change.path,
              'failed',
              err.message || 'NotFoundError'
            )
          }
        } else {
          result.failed++
          const msg = err?.message || String(err)
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
    content: string | ArrayBuffer
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
    cacheManager: any
  ): Promise<string | ArrayBuffer | null> {
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
      const result = await cacheManager.read(path, { getFileHandle: () => null })
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

      let current = await this.sessionDir.getDirectoryHandle(FILES_DIR, { create: true })
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

}
