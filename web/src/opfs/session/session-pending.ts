/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Session Pending Manager
 *
 * Per-session pending sync queue management.
 * Merges multiple modifications to the same file and handles sync to filesystem.
 */

import type { PendingChange, SyncResult } from '../types/opfs-types'
import { generateId } from '../utils/opfs-utils'

const PENDING_FILE = 'pending.json'

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
  private readonly sessionDir: FileSystemDirectoryHandle
  private pendingChanges: Map<string, PendingChange> = new Map()
  private initialized = false

  constructor(sessionDir: FileSystemDirectoryHandle) {
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
    try {
      const pendingFile = await this.sessionDir.getFileHandle(PENDING_FILE)
      const file = await pendingFile.getFile()
      const text = await file.text()
      const data: PendingChange[] = JSON.parse(text)

      this.pendingChanges = new Map(data.map((c) => [c.id, c]))
    } catch {
      // File doesn't exist yet
      this.pendingChanges = new Map()
    }
  }

  /**
   * Save pending queue to OPFS
   */
  private async savePending(): Promise<void> {
    const pendingFile = await this.sessionDir.getFileHandle(PENDING_FILE, { create: true })
    const writable = await pendingFile.createWritable()

    const data = Array.from(this.pendingChanges.values())
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
  }

  /**
   * Add pending record for file modification
   * @param path File path
   */
  async add(path: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    const existingEntry = this.findPendingEntryByPath(path)
    const now = Date.now()

    if (existingEntry) {
      const [id, existing] = existingEntry
      // Replace with a new object (avoid mutating potentially frozen records).
      this.pendingChanges.set(id, {
        ...existing,
        timestamp: now,
      })
    } else {
      // Create new record
      this.pendingChanges.set(generateId('pending'), {
        id: generateId('pending'),
        path,
        type: 'modify',
        fsMtime: 0, // Will be detected during sync
        timestamp: now,
      })
    }

    await this.savePending()
  }

  /**
   * Mark file for deletion
   * @param path File path
   */
  async markForDeletion(path: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    const existingEntry = this.findPendingEntryByPath(path)
    const now = Date.now()

    if (existingEntry) {
      const [id, existing] = existingEntry
      // Replace with a new object (avoid mutating potentially frozen records).
      this.pendingChanges.set(id, {
        ...existing,
        type: 'delete',
        timestamp: now,
      })
    } else {
      // Create delete record
      this.pendingChanges.set(generateId('pending'), {
        id: generateId('pending'),
        path,
        type: 'delete',
        fsMtime: 0,
        timestamp: now,
      })
    }

    await this.savePending()
  }

  /**
   * Mark file as newly created
   * @param path File path
   */
  async markAsCreated(path: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    // Only add if not already pending
    if (!this.findPendingByPath(path)) {
      const now = Date.now()
      this.pendingChanges.set(generateId('pending'), {
        id: generateId('pending'),
        path,
        type: 'create',
        fsMtime: 0,
        timestamp: now,
      })

      await this.savePending()
    }
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
   * Clear pending queue
   */
  async clear(): Promise<void> {
    this.pendingChanges.clear()
    await this.savePending()
  }

  /**
   * Remove specific pending record
   * @param id Record ID
   */
  async remove(id: string): Promise<void> {
    this.pendingChanges.delete(id)
    await this.savePending()
  }

  /**
   * Sync to real filesystem
   * @param directoryHandle Real filesystem directory handle
   * @param cacheManager Cache manager (for reading OPFS content)
   */
  async sync(directoryHandle: FileSystemDirectoryHandle, cacheManager: any): Promise<SyncResult> {
    const result: SyncResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      conflicts: [],
    }

    const toRemove: string[] = []

    for (const change of this.getAll()) {
      try {
        if (change.type === 'delete') {
          await this.deleteFile(directoryHandle, change.path)
          result.success++
          toRemove.push(change.id)
        } else {
          // Read from OPFS cache and write to filesystem
          const content = await this.readCacheContent(change.path, cacheManager)
          if (content) {
            await this.writeFile(directoryHandle, change.path, content)
            result.success++
            toRemove.push(change.id)
          } else {
            result.failed++
          }
        }
      } catch (err: any) {
        if (err.name === 'NotFoundError') {
          if (change.type === 'create') {
            // New file, this is expected
            result.success++
            toRemove.push(change.id)
          } else {
            result.failed++
          }
        } else {
          result.failed++
        }
      }
    }

    // Remove synced records
    for (const id of toRemove) {
      this.pendingChanges.delete(id)
    }

    await this.savePending()
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
      // Read from cache manager
      const result = await cacheManager.read(path, { getFileHandle: () => null })
      return result.content
    } catch {
      console.warn(`Failed to read cache for ${path}`)
      return null
    }
  }

  /**
   * Find pending record by path
   */
  private findPendingByPath(path: string): PendingChange | undefined {
    for (const change of this.pendingChanges.values()) {
      if (change.path === path) {
        return change
      }
    }
    return undefined
  }

  /**
   * Find pending record entry [id, change] by path
   */
  private findPendingEntryByPath(path: string): [string, PendingChange] | undefined {
    for (const entry of this.pendingChanges.entries()) {
      if (entry[1].path === path) {
        return entry
      }
    }
    return undefined
  }
}
