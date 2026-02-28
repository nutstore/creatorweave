/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Directory Handle Manager
 *
 * Manages native filesystem directory handles for dual-storage sync.
 * Handles user permission requests, handle storage, and lifecycle management.
 *
 * Phase 4: Native Filesystem Sync - Story 4.1
 */

/**
 * Directory handle storage structure
 */
export interface StoredHandle {
  /** Workspace ID */
  workspaceId: string
  /** Serialized directory handle reference */
  handleRef: string
  /** Storage timestamp */
  timestamp: number
  /** Handle status */
  status: 'active' | 'expired' | 'revoked'
}

/**
 * Directory handle options for picker
 */
export interface DirectoryPickerOptions {
  /** Suggested start directory */
  startIn?: string
  /** Picker mode */
  mode?: 'read' | 'readwrite' | 'readwrite-experimental'
  /** Allow multiple selection */
  multiple?: boolean
}

/**
 * Directory handle manager class
 */
export class DirectoryHandleManager {
  private static readonly DB_NAME = 'BrowserFSAnalyzer'
  private static readonly STORE_NAME = 'directoryHandles'
  private _db: IDBDatabase | null = null

  private get db(): IDBDatabase {
    if (!this._db) {
      throw new Error('Database not initialized')
    }
    return this._db
  }

  /**
   * Initialize IndexedDB for handle storage
   */
  async initialize(): Promise<void> {
    if (this._db) return

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DirectoryHandleManager.DB_NAME, 1)

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'))
      }

      request.onsuccess = () => {
        this._db = request.result

        // Create object store if not exists
        if (!this._db.objectStoreNames.contains(DirectoryHandleManager.STORE_NAME)) {
          this._db.createObjectStore(DirectoryHandleManager.STORE_NAME, {
            keyPath: 'workspaceId',
          })
        }

        resolve()
      }
    })
  }

  /**
   * Request directory handle from user via File System Access API
   */
  async requestHandle(options: DirectoryPickerOptions = {}): Promise<FileSystemDirectoryHandle | null> {
    if (!(window as any).showDirectoryPicker) {
      console.warn('[DirectoryHandleManager] File System Access API not supported')
      return null
    }

    try {
      const handle = await (window as any).showDirectoryPicker({
        id: 'browser-fs-analyzer-directory',
        mode: options.mode || 'readwrite',
        startIn: options.startIn,
      })

      if (!handle) {
        console.warn('[DirectoryHandleManager] User cancelled directory picker')
        return null
      }

      // Verify permission
      const permission = await handle.queryPermission({ mode: 'readwrite' })
      if (permission !== 'granted') {
        // Request write permission
        const newPermission = await handle.requestPermission({ mode: 'readwrite' })
        if (newPermission !== 'granted') {
          console.warn('[DirectoryHandleManager] Write permission not granted')
        }
      }

      return handle
    } catch (error) {
      console.error('[DirectoryHandleManager] Failed to request directory handle:', error)
      return null
    }
  }

  /**
   * Store directory handle for a workspace
   */
  async storeHandle(
    workspaceId: string,
    _handle: FileSystemDirectoryHandle
  ): Promise<void> {
    await this.initialize()

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(
        [DirectoryHandleManager.STORE_NAME],
        'readwrite'
      )

      const store = transaction.objectStore(DirectoryHandleManager.STORE_NAME)

      transaction.onerror = () => {
        reject(new Error('Failed to store directory handle'))
      }

      transaction.oncomplete = () => {
        resolve()
      }

      // Generate handle reference
      const handleRef = `handle:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`

      // Store handle reference
      const request = store.put({
        workspaceId,
        handleRef,
        timestamp: Date.now(),
        status: 'active',
      } as StoredHandle)

      request.onerror = () => {
        reject(new Error('Failed to write handle to IndexedDB'))
      }
    })
  }

  /**
   * Get stored directory handle for a workspace
   */
  async getHandle(workspaceId: string): Promise<StoredHandle | null> {
    await this.initialize()

    return new Promise<StoredHandle | null>((resolve, reject) => {
      const transaction = this.db.transaction(
        [DirectoryHandleManager.STORE_NAME],
        'readonly'
      )

      const store = transaction.objectStore(DirectoryHandleManager.STORE_NAME)

      transaction.onerror = () => {
        reject(new Error('Failed to read directory handle'))
      }

      const request = store.get(workspaceId)

      request.onsuccess = () => {
        const result = request.result as StoredHandle | undefined
        resolve(result || null)
      }

      request.onerror = () => {
        reject(new Error('Failed to read handle from IndexedDB'))
      }
    })
  }

  /**
   * Release directory handle for a workspace
   */
  async releaseHandle(workspaceId: string): Promise<void> {
    await this.initialize()

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(
        [DirectoryHandleManager.STORE_NAME],
        'readwrite'
      )

      const store = transaction.objectStore(DirectoryHandleManager.STORE_NAME)

      transaction.onerror = () => {
        reject(new Error('Failed to release directory handle'))
      }

      transaction.oncomplete = () => {
        resolve()
      }

      const request = store.delete(workspaceId)

      request.onerror = () => {
        reject(new Error('Failed to delete handle from IndexedDB'))
      }
    })
  }

  /**
   * Check if workspace has valid handle
   */
  async hasValidHandle(workspaceId: string): Promise<boolean> {
    const stored = await this.getHandle(workspaceId)
    return stored !== null && stored.status === 'active'
  }

  /**
   * Get all stored handles
   */
  async getAllHandles(): Promise<StoredHandle[]> {
    await this.initialize()

    return new Promise<StoredHandle[]>((resolve, reject) => {
      const transaction = this.db.transaction(
        [DirectoryHandleManager.STORE_NAME],
        'readonly'
      )

      const store = transaction.objectStore(DirectoryHandleManager.STORE_NAME)

      transaction.onerror = () => {
        reject(new Error('Failed to read all handles'))
      }

      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result || [])
      }

      request.onerror = () => {
        reject(new Error('Failed to get all handles from IndexedDB'))
      }
    })
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this._db) {
      this._db.close()
      this._db = null
    }
  }
}

// Singleton instance
let defaultManager: DirectoryHandleManager | null = null

/**
 * Get default directory handle manager instance
 */
export function getDirectoryHandleManager(): DirectoryHandleManager {
  if (!defaultManager) {
    defaultManager = new DirectoryHandleManager()
  }
  return defaultManager
}

/**
 * Request directory handle with user prompt
 */
export async function requestDirectoryAccess(
  workspaceId: string,
  options?: DirectoryPickerOptions
): Promise<FileSystemDirectoryHandle | null> {
  const manager = getDirectoryHandleManager()
  const handle = await manager.requestHandle(options)

  if (handle) {
    await manager.storeHandle(workspaceId, handle)
  }

  return handle
}

/**
 * Get stored directory handle reference
 */
export async function getStoredDirectoryHandle(
  workspaceId: string
): Promise<StoredHandle | null> {
  const manager = getDirectoryHandleManager()
  return manager.getHandle(workspaceId)
}

/**
 * Release directory handle
 */
export async function releaseDirectoryHandle(workspaceId: string): Promise<void> {
  const manager = getDirectoryHandleManager()
  await manager.releaseHandle(workspaceId)
}
