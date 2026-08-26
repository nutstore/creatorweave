/**
 * FileModificationTracker - tracks file modification status from OPFS
 *
 * This service provides a unified API for querying file modification status
 * by combining data from:
 * - OPFSStore: pending changes (create/modify/delete operations)
 * - SessionStore: current session context
 *
 * Usage:
 * ```ts
 * import { getModificationTracker } from '@/services/file-modification-tracker'
 *
 * const tracker = await getModificationTracker()
 * const status = tracker.getFileStatus('/path/to/file.ts')
 * // => { isModified: true, pendingType: 'modify', hasPending: true }
 * ```
 */

import type { PendingChange } from '@/opfs/types/opfs-types'

/**
 * File modification status
 */
export interface FileStatus {
  /** Whether the file has any pending changes */
  isModified: boolean
  /** Type of pending change */
  pendingType: 'create' | 'modify' | 'delete' | null
  /** Whether there's a pending change for this file */
  hasPending: boolean
  /** Timestamp of the pending change */
  timestamp?: number
}

/**
 * Modification tracker class
 */
class ModificationTrackerClass {
  private pendingChanges: PendingChange[] = []
  private listeners: Set<() => void> = new Set()

  /**
   * Update pending changes (called by OPFS store)
   */
  updatePendingChanges(changes: PendingChange[]) {
    this.pendingChanges = changes
    this.notifyListeners()
  }

  /**
   * Get current pending changes
   */
  getPendingChanges(): PendingChange[] {
    return this.pendingChanges
  }

  /**
   * Get file status by path
   */
  getFileStatus(path: string): FileStatus {
    const pending = this.pendingChanges.find((p) => p.path === path)

    if (!pending) {
      return {
        isModified: false,
        pendingType: null,
        hasPending: false,
      }
    }

    return {
      isModified: true,
      pendingType: pending.type,
      hasPending: true,
      timestamp: pending.timestamp,
    }
  }

  /**
   * Check if a file has pending changes
   */
  isModified(path: string): boolean {
    return this.pendingChanges.some((p) => p.path === path)
  }

  /**
   * Get pending change for a file
   */
  getPendingChange(path: string): PendingChange | undefined {
    return this.pendingChanges.find((p) => p.path === path)
  }

  /**
   * Get all modified files
   */
  getModifiedFiles(): Map<string, PendingChange> {
    const map = new Map<string, PendingChange>()
    for (const change of this.pendingChanges) {
      map.set(change.path, change)
    }
    return map
  }

  /**
   * Get pending changes by type
   */
  getByType(type: 'create' | 'modify' | 'delete'): PendingChange[] {
    return this.pendingChanges.filter((p) => p.type === type)
  }

  /**
   * Subscribe to changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Notify all listeners
   */
  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[FileModificationTracker] Listener error:', error)
      }
    }
  }

  /**
   * Clear all tracked changes
   */
  clear() {
    this.pendingChanges = []
    this.notifyListeners()
  }
}

// Singleton instance
let trackerInstance: ModificationTrackerClass | null = null

/**
 * Get the modification tracker singleton
 */
export async function getModificationTracker(): Promise<ModificationTrackerClass> {
  if (!trackerInstance) {
    trackerInstance = new ModificationTrackerClass()

    // Initialize with current pending changes from OPFS store
    try {
      const { useOPFSStore } = await import('@/store/opfs.store')
      const { getPendingChanges } = useOPFSStore.getState()

      // Initial sync
      trackerInstance.updatePendingChanges(getPendingChanges())

      // Subscribe to store changes
      useOPFSStore.subscribe(() => {
        const pendingChanges = useOPFSStore.getState().getPendingChanges()
        trackerInstance?.updatePendingChanges(pendingChanges)
      })
    } catch (error) {
      console.error('[FileModificationTracker] Failed to initialize:', error)
    }
  }

  return trackerInstance
}

/**
 * React hook for file modification status
 */
export async function useFileStatus(path: string): Promise<FileStatus> {
  const tracker = await getModificationTracker()
  return tracker.getFileStatus(path)
}

/**
 * React hook for all pending changes
 */
export async function usePendingChanges(): Promise<PendingChange[]> {
  const tracker = await getModificationTracker()
  return tracker.getPendingChanges()
}
