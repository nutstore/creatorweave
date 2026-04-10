/**
 * Prefetch Cache - Background file preloading with OPFS integration.
 *
 * Goals:
 * - Load predicted files before user requests them
 * - Maintain <100ms access time for cached files
 * - Smart queue management with priority scoring
 *
 * Architecture:
 * 1. PrefetchQueue - Prioritized file prefetch queue
 * 2. PrefetchWorker - Background loading worker
 * 3. PrefetchCache - Cached file metadata tracker
 */

import type { FileSystemDirectoryHandle } from '@/opfs/types/file-system-types'
import { getWorkspaceManager } from '@/opfs/workspace'
import type { FilePrediction } from './file-predictor'

//=============================================================================
// Types
//=============================================================================

/** Prefetch priority levels */
export type PrefetchPriority = 'high' | 'medium' | 'low'

/** Prefetch task */
export interface PrefetchTask {
  /** File path to prefetch */
  path: string
  /** Priority level */
  priority: PrefetchPriority
  /** Confidence score from prediction */
  confidence: number
  /** Timestamp when task was created */
  createdAt: number
  /** Task ID */
  id: string
  /** Current status */
  status: 'pending' | 'loading' | 'cached' | 'failed'
  /** Error message if failed */
  error?: string
  /** File size in bytes */
  size?: number
}

/** Prefetch statistics */
export interface PrefetchStats {
  /** Total prefetched files */
  totalPrefetched: number
  /** Cache hit rate */
  cacheHitRate: number
  /** Total bytes cached */
  totalBytesCached: number
  /** Average load time (ms) */
  averageLoadTime: number
  /** Currently pending tasks */
  pendingTasks: number
  /** Failed tasks */
  failedTasks: number
}

//=============================================================================
// Prefetch Queue
//=============================================================================

/**
 * Prioritized prefetch queue
 * Orders tasks by confidence and age
 */
class PrefetchQueue {
  private tasks: Map<string, PrefetchTask> = new Map()
  private readonly maxQueueSize = 50

  /**
   * Add task to queue
   */
  add(path: string, confidence: number): PrefetchTask {
    // Check if already exists
    const existing = this.tasks.get(path)
    if (existing) {
      // Update confidence if higher
      if (confidence > existing.confidence) {
        existing.confidence = confidence
        existing.priority = this.getPriority(confidence)
      }
      return existing
    }

    // Create new task
    const task: PrefetchTask = {
      id: this.generateId(),
      path,
      priority: this.getPriority(confidence),
      confidence,
      createdAt: Date.now(),
      status: 'pending',
    }

    // Check queue size limit
    if (this.tasks.size >= this.maxQueueSize) {
      this.evictLowestPriority()
    }

    this.tasks.set(path, task)
    return task
  }

  /**
   * Get next task to process
   */
  next(): PrefetchTask | null {
    // Get all pending tasks sorted by priority and confidence
    const pending = Array.from(this.tasks.values())
      .filter((t) => t.status === 'pending')
      .sort((a, b) => {
        // First by priority
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
        if (priorityDiff !== 0) return priorityDiff

        // Then by confidence
        const confidenceDiff = b.confidence - a.confidence
        if (confidenceDiff !== 0) return confidenceDiff

        // Finally by age (older first)
        return a.createdAt - b.createdAt
      })

    return pending[0] || null
  }

  /**
   * Update task status
   */
  updateStatus(path: string, status: PrefetchTask['status'], error?: string, size?: number): void {
    const task = this.tasks.get(path)
    if (task) {
      task.status = status
      if (error) task.error = error
      if (size !== undefined) task.size = size
    }
  }

  /**
   * Get task by path
   */
  get(path: string): PrefetchTask | undefined {
    return this.tasks.get(path)
  }

  /**
   * Get all tasks
   */
  getAll(): PrefetchTask[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Remove task
   */
  remove(path: string): boolean {
    return this.tasks.delete(path)
  }

  /**
   * Clear all tasks
   */
  clear(): void {
    this.tasks.clear()
  }

  /**
   * Evict lowest priority task
   */
  private evictLowestPriority(): void {
    let lowest: PrefetchTask | null = null

    for (const task of this.tasks.values()) {
      if (task.status === 'pending') {
        if (!lowest || task.confidence < lowest.confidence) {
          lowest = task
        }
      }
    }

    if (lowest) {
      this.tasks.delete(lowest.path)
    }
  }

  /**
   * Get priority from confidence score
   */
  private getPriority(confidence: number): PrefetchPriority {
    if (confidence >= 0.7) return 'high'
    if (confidence >= 0.4) return 'medium'
    return 'low'
  }

  /**
   * Generate unique task ID
   */
  private generateId(): string {
    return `pf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }
}

//=============================================================================
// Prefetch Cache
//=============================================================================

/**
 * Prefetch cache manager
 * Coordinates background loading with OPFS cache
 */
export class PrefetchCache {
  private queue: PrefetchQueue
  private directoryHandle?: FileSystemDirectoryHandle | null
  private sessionId?: string
  private isProcessing: boolean = false
  private processingTimer: number | null = null

  // Statistics tracking
  private stats = {
    totalPrefetched: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalLoadTime: 0,
    loadCount: 0,
    failedTasks: 0,
  }

  // Cached file sizes (for total size tracking)
  private cachedSizes: Map<string, number> = new Map()
  private textEncoder = new TextEncoder()

  constructor() {
    this.queue = new PrefetchQueue()
  }

  /**
   * Initialize with session context
   */
  async initialize(
    directoryHandle?: FileSystemDirectoryHandle | null,
    sessionId?: string
  ): Promise<void> {
    this.directoryHandle = directoryHandle
    this.sessionId = sessionId
  }

  /**
   * Add predictions to prefetch queue
   */
  async prefetch(predictions: FilePrediction[]): Promise<void> {
    if (!this.directoryHandle) return

    // Add all predictions to queue
    for (const prediction of predictions) {
      // Skip low-confidence predictions if queue is full
      if (prediction.confidence < 0.3 && this.queue.getAll().length > 30) {
        continue
      }

      this.queue.add(prediction.path, prediction.confidence)
    }

    // Start processing if not already running
    this.startProcessing()
  }

  /**
   * Check if file is cached
   */
  isCached(path: string): boolean {
    const task = this.queue.get(path)
    return task?.status === 'cached'
  }

  /**
   * Get prefetch status for a file
   */
  getStatus(path: string): PrefetchTask | undefined {
    return this.queue.get(path)
  }

  /**
   * Get all pending tasks
   */
  getPendingTasks(): PrefetchTask[] {
    return this.queue.getAll().filter((t) => t.status === 'pending')
  }

  /**
   * Get all cached tasks
   */
  getCachedTasks(): PrefetchTask[] {
    return this.queue.getAll().filter((t) => t.status === 'cached')
  }

  /**
   * Get statistics
   */
  getStats(): PrefetchStats {
    const totalBytesCached = Array.from(this.cachedSizes.values()).reduce((a, b) => a + b, 0)
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses
    const cacheHitRate = totalRequests > 0 ? this.stats.cacheHits / totalRequests : 0

    return {
      totalPrefetched: this.stats.totalPrefetched,
      cacheHitRate,
      totalBytesCached,
      averageLoadTime:
        this.stats.loadCount > 0 ? this.stats.totalLoadTime / this.stats.loadCount : 0,
      pendingTasks: this.getPendingTasks().length,
      failedTasks: this.stats.failedTasks,
    }
  }

  /**
   * Clear all prefetch data
   */
  clear(): void {
    this.queue.clear()
    this.cachedSizes.clear()
    this.stats = {
      totalPrefetched: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalLoadTime: 0,
      loadCount: 0,
      failedTasks: 0,
    }
  }

  /**
   * Record cache hit/miss
   */
  recordAccess(_path: string, hit: boolean): void {
    // Path parameter reserved for future analytics
    if (hit) {
      this.stats.cacheHits++
    } else {
      this.stats.cacheMisses++
    }
  }

  /**
   * Start background processing
   */
  private startProcessing(): void {
    if (this.isProcessing) return

    this.isProcessing = true
    this.processNext()
  }

  /**
   * Stop background processing
   */
  private stopProcessing(): void {
    this.isProcessing = false
    if (this.processingTimer !== null) {
      clearTimeout(this.processingTimer)
      this.processingTimer = null
    }
  }

  /**
   * Process next task in queue
   */
  private processNext(): void {
    if (!this.isProcessing) return

    const task = this.queue.next()
    if (!task) {
      // No more tasks, stop processing
      this.stopProcessing()
      return
    }

    // Process task in background
    this.processTask(task).then(() => {
      // Schedule next task with delay to avoid blocking
      this.processingTimer = window.setTimeout(() => {
        this.processNext()
      }, 10) // 10ms delay between tasks
    })
  }

  /**
   * Process a single prefetch task
   */
  private async processTask(task: PrefetchTask): Promise<void> {
    const startTime = performance.now()
    this.queue.updateStatus(task.path, 'loading')

    try {
      const fromSessionCache = await this.readFromSessionCache(task.path)
      const fromNative = fromSessionCache ? null : await this.readFromNativeDirectory(task.path)
      const result = fromSessionCache ?? fromNative
      if (!result) {
        throw new Error(`File not found: ${task.path}`)
      }

      // Update task status
      const loadTime = performance.now() - startTime
      this.queue.updateStatus(task.path, 'cached', undefined, result.metadata.size)

      // Update statistics
      this.stats.totalPrefetched++
      this.stats.totalLoadTime += loadTime
      this.stats.loadCount++
      this.cachedSizes.set(task.path, result.metadata.size)

      // Log slow loads
      if (loadTime > 100) {
        console.warn(`[PrefetchCache] Slow load for ${task.path}: ${loadTime.toFixed(1)}ms`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.queue.updateStatus(task.path, 'failed', errorMsg)
      this.stats.failedTasks++
      console.warn(`[PrefetchCache] Failed to prefetch ${task.path}:`, errorMsg)
    }
  }

  private async readFromSessionCache(
    path: string
  ): Promise<{ metadata: { size: number } } | null> {
    if (!this.sessionId) return null
    try {
      const manager = await getWorkspaceManager()
      const workspace = await manager.getWorkspace(this.sessionId)
      if (!workspace) return null

      for (const candidate of this.getPathCandidates(path)) {
        const cached = await workspace.readCachedFile(candidate)
        if (cached === null) continue
        return {
          metadata: { size: this.getContentSize(cached) },
        }
      }
      return null
    } catch (error) {
      console.warn(`[PrefetchCache] Session cache read failed for ${path}:`, error)
      return null
    }
  }

  private async readFromNativeDirectory(
    path: string
  ): Promise<{ metadata: { size: number } } | null> {
    if (!this.directoryHandle) return null
    const normalizedPath = this.normalizePath(path)
    const parts = normalizedPath.split('/').filter(Boolean)
    if (parts.length === 0) return null

    let current: FileSystemDirectoryHandle = this.directoryHandle
    for (let i = 0; i < parts.length - 1; i++) {
      try {
        current = await current.getDirectoryHandle(parts[i])
      } catch {
        return null
      }
    }

    try {
      const fileHandle = await current.getFileHandle(parts[parts.length - 1])
      const file = await fileHandle.getFile()
      return {
        metadata: { size: file.size },
      }
    } catch {
      return null
    }
  }

  private normalizePath(path: string): string {
    if (path.startsWith('/mnt/')) return path.slice(5)
    if (path.startsWith('/mnt')) return path.slice(4)
    return path
  }

  private getPathCandidates(path: string): string[] {
    const normalized = this.normalizePath(path)
    const clean = normalized.replace(/^\/+/, '')
    const withSlash = clean ? `/${clean}` : '/'
    const candidates = [path, normalized, clean, withSlash]
    return Array.from(new Set(candidates.filter(Boolean)))
  }

  private getContentSize(content: unknown): number {
    if (typeof content === 'string') return this.textEncoder.encode(content).byteLength
    if (content instanceof Blob) return content.size
    if (content instanceof ArrayBuffer) return content.byteLength
    if (ArrayBuffer.isView(content)) return content.byteLength
    return 0
  }
}

//=============================================================================
// Singleton
//=============================================================================

let instance: PrefetchCache | null = null

export function getPrefetchCache(): PrefetchCache {
  if (!instance) {
    instance = new PrefetchCache()
  }
  return instance
}

//=============================================================================
// Integration Helper
//=============================================================================

/**
 * Initialize and prefetch files in one call
 */
export async function prefetchFiles(
  predictions: FilePrediction[],
  directoryHandle?: FileSystemDirectoryHandle | null,
  sessionId?: string
): Promise<void> {
  const cache = getPrefetchCache()
  await cache.initialize(directoryHandle, sessionId)
  await cache.prefetch(predictions)
}
