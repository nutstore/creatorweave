/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Directory Handle Manager
 *
 * Manages native filesystem directory handles for dual-storage sync.
 * Handles user permission requests, handle storage, and lifecycle management.
 *
 * Multi-root support: handles are keyed by `${projectId}:${rootName}`.
 * Single-root callers use projectId directly (mapped to default root).
 */

/**
 * Directory handle storage structure
 */
export interface StoredHandle {
  /** Composite key: `${projectId}:${rootName}` */
  compoundKey: string
  /** Project ID */
  projectId: string
  /** Root name (handle.name or "_opfs") */
  rootName: string
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
 * Build compound key for multi-root handle storage
 */
export function buildHandleKey(projectId: string, rootName: string): string {
  return `${projectId}:${rootName}`
}

/**
 * Parse compound key back into projectId and rootName
 */
export function parseHandleKey(key: string): { projectId: string; rootName: string } {
  const idx = key.indexOf(':')
  if (idx === -1) {
    // Legacy format: just projectId
    return { projectId: key, rootName: key }
  }
  return { projectId: key.substring(0, idx), rootName: key.substring(idx + 1) }
}

/**
 * Directory handle manager class
 */
export class DirectoryHandleManager {
  private static readonly DB_NAME = 'AppDirectoryHandles'
  private static readonly STORE_NAME = 'directoryHandles'
  private static readonly DB_VERSION = 2 // v2: compoundKey-based storage
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
      const request = indexedDB.open(DirectoryHandleManager.DB_NAME, DirectoryHandleManager.DB_VERSION)

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'))
      }

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = request.result
        const oldVersion = event.oldVersion

        if (oldVersion < 2) {
          // v1 → v2 migration: old store uses keyPath 'workspaceId', new uses 'compoundKey'
          // Delete old store and recreate with new schema.
          // Stored handles are just references; real handles live in the runtime map,
          // so data loss from this migration is benign.
          if (db.objectStoreNames.contains(DirectoryHandleManager.STORE_NAME)) {
            db.deleteObjectStore(DirectoryHandleManager.STORE_NAME)
          }
        }

        // Create new v2 store
        if (!db.objectStoreNames.contains(DirectoryHandleManager.STORE_NAME)) {
          const store = db.createObjectStore(DirectoryHandleManager.STORE_NAME, {
            keyPath: 'compoundKey',
          })
          store.createIndex('projectId', 'projectId', { unique: false })
        }
      }

      request.onsuccess = () => {
        this._db = request.result

        // Verify object store exists (safety net for version upgrade edge cases)
        if (!this._db.objectStoreNames.contains(DirectoryHandleManager.STORE_NAME)) {
          console.warn('[DirectoryHandleManager] Store missing after open, will be created on next upgrade')
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
        id: 'app-directory',
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
   * Store directory handle for a project root
   */
  async storeHandle(
    projectId: string,
    rootName: string,
    _handle: FileSystemDirectoryHandle
  ): Promise<void> {
    await this.initialize()

    const compoundKey = buildHandleKey(projectId, rootName)

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
        compoundKey,
        projectId,
        rootName,
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
   * Get stored handle info for a project root
   */
  async getHandle(projectId: string, rootName: string): Promise<StoredHandle | null> {
    await this.initialize()

    const compoundKey = buildHandleKey(projectId, rootName)

    return new Promise<StoredHandle | null>((resolve, reject) => {
      const transaction = this.db.transaction(
        [DirectoryHandleManager.STORE_NAME],
        'readonly'
      )

      const store = transaction.objectStore(DirectoryHandleManager.STORE_NAME)

      transaction.onerror = () => {
        reject(new Error('Failed to read directory handle'))
      }

      const request = store.get(compoundKey)

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
   * Get all handles for a project
   */
  async getHandlesByProject(projectId: string): Promise<StoredHandle[]> {
    await this.initialize()

    return new Promise<StoredHandle[]>((resolve, reject) => {
      const transaction = this.db.transaction(
        [DirectoryHandleManager.STORE_NAME],
        'readonly'
      )

      const store = transaction.objectStore(DirectoryHandleManager.STORE_NAME)
      const index = store.index('projectId')

      transaction.onerror = () => {
        reject(new Error('Failed to read directory handles'))
      }

      const request = index.getAll(projectId)

      request.onsuccess = () => {
        resolve(request.result || [])
      }

      request.onerror = () => {
        reject(new Error('Failed to get handles from IndexedDB'))
      }
    })
  }

  /**
   * Release directory handle for a project root
   */
  async releaseHandle(projectId: string, rootName: string): Promise<void> {
    await this.initialize()

    const compoundKey = buildHandleKey(projectId, rootName)

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

      const request = store.delete(compoundKey)

      request.onerror = () => {
        reject(new Error('Failed to delete handle from IndexedDB'))
      }
    })
  }

  /**
   * Check if project root has valid handle
   */
  async hasValidHandle(projectId: string, rootName: string): Promise<boolean> {
    const stored = await this.getHandle(projectId, rootName)
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

// Runtime handles keyed by compound key: `${projectId}:${rootName}`
const runtimeHandles = new Map<string, FileSystemDirectoryHandle>()

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
 * Request directory handle with user prompt and store for a project root
 */
export async function requestDirectoryAccess(
  projectId: string,
  rootName: string,
  options?: DirectoryPickerOptions
): Promise<FileSystemDirectoryHandle | null> {
  const manager = getDirectoryHandleManager()
  const handle = await manager.requestHandle(options)

  if (handle) {
    await manager.storeHandle(projectId, rootName, handle)
    const compoundKey = buildHandleKey(projectId, rootName)
    runtimeHandles.set(compoundKey, handle)
  }

  return handle
}

/**
 * Bind an in-memory handle for a project root.
 * Multi-root version: takes (projectId, rootName, handle).
 */
export function bindRuntimeDirectoryHandle(
  projectId: string,
  rootNameOrHandle: string | FileSystemDirectoryHandle,
  maybeHandle?: FileSystemDirectoryHandle
): void {
  if (typeof rootNameOrHandle === 'string') {
    // New multi-root API: bindRuntimeDirectoryHandle(projectId, rootName, handle)
    const rootName = rootNameOrHandle
    const handle = maybeHandle!
    const compoundKey = buildHandleKey(projectId, rootName)
    runtimeHandles.set(compoundKey, handle)
  } else {
    // Single-arg form: bindRuntimeDirectoryHandle(projectId, handle)
    // Maps to default root using projectId as rootName
    const handle = rootNameOrHandle
    const compoundKey = buildHandleKey(projectId, projectId)
    runtimeHandles.set(compoundKey, handle)
  }
}

/**
 * Get in-memory directory handle for a project root.
 * Multi-root: takes (projectId, rootName).
 * Single-arg: takes just projectId, returns default root handle.
 */
export function getRuntimeDirectoryHandle(
  projectId: string,
  rootName?: string
): FileSystemDirectoryHandle | null {
  if (rootName !== undefined) {
    return runtimeHandles.get(buildHandleKey(projectId, rootName)) ?? null
  }
  // Fallback: return handle keyed by projectId (default root)
  return runtimeHandles.get(buildHandleKey(projectId, projectId)) ?? null
}

/**
 * Get all runtime handles for a project.
 */
export function getRuntimeHandlesForProject(
  projectId: string
): Map<string, FileSystemDirectoryHandle> {
  const result = new Map<string, FileSystemDirectoryHandle>()
  for (const [key, handle] of runtimeHandles.entries()) {
    const parsed = parseHandleKey(key)
    if (parsed.projectId === projectId) {
      result.set(parsed.rootName, handle)
    }
  }
  return result
}

/**
 * Remove an in-memory directory handle binding.
 * Multi-root version: takes (projectId, rootName).
 */
export function unbindRuntimeDirectoryHandle(
  projectId: string,
  rootName?: string
): void {
  if (rootName !== undefined) {
    runtimeHandles.delete(buildHandleKey(projectId, rootName))
  } else {
    // Single-arg: remove by projectId (default root)
    runtimeHandles.delete(buildHandleKey(projectId, projectId))
  }
}

/**
 * Get stored directory handle reference for a project root
 */
export async function getStoredDirectoryHandle(
  projectId: string,
  rootName: string
): Promise<StoredHandle | null> {
  const manager = getDirectoryHandleManager()
  return manager.getHandle(projectId, rootName)
}

/**
 * Release directory handle for a project root
 */
export async function releaseDirectoryHandle(
  projectId: string,
  rootName: string
): Promise<void> {
  const manager = getDirectoryHandleManager()
  await manager.releaseHandle(projectId, rootName)
  runtimeHandles.delete(buildHandleKey(projectId, rootName))
}
