/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Session Undo Storage
 *
 * Per-session undo history with content stored in OPFS (not in memory).
 * Supports unlimited undo size limited only by OPFS quota.
 */

import type { FileContent, UndoRecord } from '../types/opfs-types'
import { generateId } from '../utils/opfs-utils'

const UNDO_INDEX_FILE = 'undo.json'
const UNDO_DIR = 'undo'
const MAX_UNDO_COUNT = 100

/**
 * Session Undo Storage
 *
 * Responsibilities:
 * - Store undo history in OPFS (not memory)
 * - Record modifications, deletions with content paths
 * - Execute undo operations
 * - Prune old records (max 100)
 */
export class SessionUndoStorage {
  private readonly sessionDir: FileSystemDirectoryHandle
  private undoDir?: FileSystemDirectoryHandle
  private records: Map<string, UndoRecord> = new Map()
  private initialized = false

  constructor(sessionDir: FileSystemDirectoryHandle) {
    this.sessionDir = sessionDir
  }

  /**
   * Initialize undo storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Get or create undo directory
    this.undoDir = await this.sessionDir.getDirectoryHandle(UNDO_DIR, { create: true })

    // Load undo index
    await this.loadIndex()

    this.initialized = true
  }

  /**
   * Load undo index from OPFS
   */
  private async loadIndex(): Promise<void> {
    try {
      const indexFile = await this.undoDir!.getFileHandle(UNDO_INDEX_FILE)
      const file = await indexFile.getFile()
      const text = await file.text()
      const data: UndoRecord[] = JSON.parse(text)

      this.records = new Map(data.map((r) => [r.id, r]))
    } catch {
      // Index file doesn't exist yet
      this.records = new Map()
    }
  }

  /**
   * Save undo index to OPFS
   */
  private async saveIndex(): Promise<void> {
    if (!this.undoDir) return

    const indexFile = await this.undoDir.getFileHandle(UNDO_INDEX_FILE, { create: true })
    const writable = await indexFile.createWritable()

    const data = Array.from(this.records.values()).sort((a, b) => b.timestamp - a.timestamp) // Newest first

    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
  }

  /**
   * Record file modification
   * @param path File path
   * @param newContent New content
   * @param oldContent Old content (optional)
   */
  async recordModification(
    path: string,
    newContent: FileContent,
    oldContent?: FileContent
  ): Promise<void> {
    if (!this.initialized) await this.initialize()

    const now = Date.now()
    const id = generateId('undo')

    // Save old content to OPFS if provided
    let oldContentPath: string | undefined
    if (oldContent !== undefined) {
      oldContentPath = await this.saveContent(id, 'old', oldContent)
    }

    // Save new content to OPFS
    const newContentPath = await this.saveContent(id, 'new', newContent)

    // Create undo record
    const record: UndoRecord = {
      id,
      path,
      type: oldContent === undefined ? 'create' : 'modify',
      oldContentPath,
      newContentPath,
      timestamp: now,
      undone: false,
    }

    this.records.set(id, record)

    // Prune old records
    await this.pruneOldRecords()

    await this.saveIndex()
  }

  /**
   * Record file deletion
   * @param path File path
   * @param oldContent Content being deleted (optional)
   */
  async recordDeletion(path: string, oldContent?: FileContent): Promise<void> {
    if (!this.initialized) await this.initialize()

    const now = Date.now()
    const id = generateId('undo')

    // Save old content to OPFS if provided
    let oldContentPath: string | undefined
    if (oldContent !== undefined) {
      oldContentPath = await this.saveContent(id, 'old', oldContent)
    }

    const record: UndoRecord = {
      id,
      path,
      type: 'delete',
      oldContentPath,
      timestamp: now,
      undone: false,
    }

    this.records.set(id, record)
    await this.pruneOldRecords()
    await this.saveIndex()
  }

  /**
   * Save content to OPFS
   */
  private async saveContent(
    undoId: string,
    type: 'old' | 'new',
    content: FileContent
  ): Promise<string> {
    if (!this.undoDir) throw new Error('Undo directory not initialized')

    const recordDir = await this.undoDir.getDirectoryHandle(undoId, { create: true })
    const file = await recordDir.getFileHandle(type, { create: true })
    const writable = await file.createWritable()

    if (typeof content === 'string') {
      await writable.write(content)
    } else if (content instanceof Blob) {
      await writable.write(content)
    } else {
      await writable.write(content)
    }

    await writable.close()

    // Return path for reference
    return `${UNDO_DIR}/${undoId}/${type}`
  }

  /**
   * Read content from OPFS by path
   * @param contentPath Content path in OPFS
   */
  async readContent(contentPath: string): Promise<FileContent> {
    if (!this.undoDir) throw new Error('Undo directory not initialized')

    const parts = contentPath.split('/')
    const undoId = parts[2]
    const type = parts[3]

    const recordDir = await this.undoDir.getDirectoryHandle(undoId)
    const file = await recordDir.getFileHandle(type)
    const fileHandle = await file.getFile()

    // Try to read as text first, fall back to binary
    try {
      return await fileHandle.text()
    } catch {
      return await fileHandle.arrayBuffer()
    }
  }

  /**
   * Get all undo records
   */
  getAll(): UndoRecord[] {
    return Array.from(this.records.values())
      .filter((r) => !r.undone)
      .sort((a, b) => b.timestamp - a.timestamp) // Newest first
  }

  /**
   * Get undo count
   */
  get count(): number {
    return Array.from(this.records.values()).filter((r) => !r.undone).length
  }

  /**
   * Undo a specific operation
   * @param recordId Undo record ID
   * @param cacheManager Cache manager to restore content to
   */
  async undo(recordId: string, cacheManager: any): Promise<void> {
    const record = this.records.get(recordId)
    if (!record) {
      throw new Error(`Undo record not found: ${recordId}`)
    }

    if (record.undone) {
      throw new Error(`Record already undone: ${recordId}`)
    }

    // Read old content and restore to cache
    if (record.oldContentPath) {
      const oldContent = await this.readContent(record.oldContentPath)
      await cacheManager.write(record.path, oldContent)
    } else {
      // Was a new file, delete it from cache
      await cacheManager.delete(record.path)
    }

    // Mark as undone
    record.undone = true
    await this.saveIndex()
  }

  /**
   * Redo a specific operation
   * @param recordId Undo record ID
   * @param cacheManager Cache manager to restore content to
   */
  async redo(recordId: string, cacheManager: any): Promise<void> {
    const record = this.records.get(recordId)
    if (!record) {
      throw new Error(`Undo record not found: ${recordId}`)
    }

    if (!record.undone) {
      throw new Error(`Record not undone: ${recordId}`)
    }

    // Read new content and restore to cache
    if (record.newContentPath) {
      const newContent = await this.readContent(record.newContentPath)
      await cacheManager.write(record.path, newContent)
    }

    // Mark as not undone
    record.undone = false
    await this.saveIndex()
  }

  /**
   * Clear all undo history
   */
  async clear(): Promise<void> {
    // Delete all undo directories
    for (const id of this.records.keys()) {
      try {
        await this.undoDir!.removeEntry(id, { recursive: true })
      } catch (err) {
        console.warn(`Failed to delete undo record: ${id}`, err)
      }
    }

    this.records.clear()
    await this.saveIndex()
  }

  /**
   * Prune old undo records (keep max MAX_UNDO_COUNT)
   */
  private async pruneOldRecords(): Promise<void> {
    const records = Array.from(this.records.values()).sort((a, b) => b.timestamp - a.timestamp)

    if (records.length > MAX_UNDO_COUNT) {
      const toRemove = records.slice(MAX_UNDO_COUNT)

      for (const record of toRemove) {
        try {
          await this.undoDir!.removeEntry(record.id, { recursive: true })
          this.records.delete(record.id)
        } catch (err) {
          console.warn(`Failed to prune undo record: ${record.id}`, err)
        }
      }
    }
  }

  /**
   * Prune undo records older than specified days
   * @param days Age in days
   */
  async pruneOlderThan(days: number): Promise<number> {
    const now = Date.now()
    const threshold = now - days * 24 * 60 * 60 * 1000
    let pruned = 0

    for (const [id, record] of this.records.entries()) {
      if (record.timestamp < threshold && !record.undone) {
        try {
          await this.undoDir!.removeEntry(id, { recursive: true })
          this.records.delete(id)
          pruned++
        } catch (err) {
          console.warn(`Failed to prune undo record: ${id}`, err)
        }
      }
    }

    if (pruned > 0) {
      await this.saveIndex()
    }

    return pruned
  }

  /**
   * Get undo record by ID
   */
  getRecord(id: string): UndoRecord | undefined {
    return this.records.get(id)
  }

  /**
   * Get all records (including undone)
   */
  getAllRecords(): UndoRecord[] {
    return Array.from(this.records.values()).sort((a, b) => b.timestamp - a.timestamp)
  }
}
