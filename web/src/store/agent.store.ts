/**
 * Agent store - manages global agent configuration.
 * Runtime status is now managed per-conversation in conversation.store.
 *
 * Directory handle is persisted in IndexedDB (supports structured clone).
 * On page reload, the handle is restored and permission is re-requested.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'

const DIR_HANDLE_DB = 'bfosa-dir-handle'
const DIR_HANDLE_STORE = 'handles'
const DIR_HANDLE_KEY = 'directory'

interface AgentState {
  /** Directory handle for file operations */
  directoryHandle: FileSystemDirectoryHandle | null
  /** Directory name for display */
  directoryName: string | null
  /** Whether handle restoration is in progress */
  isRestoringHandle: boolean

  // Actions
  setDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void
  restoreDirectoryHandle: () => Promise<void>
}

/** Open the dedicated IndexedDB for directory handle storage */
async function withHandleDB<T>(callback: (db: IDBDatabase) => T | Promise<T>): Promise<T> {
  const request = indexedDB.open(DIR_HANDLE_DB, 1)
  return new Promise<T>((resolve, reject) => {
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) {
        db.createObjectStore(DIR_HANDLE_STORE)
      }
    }
    request.onsuccess = async () => {
      const db = request.result
      try {
        const result = await callback(db)
        db.close() // Always close the connection after use
        resolve(result)
      } catch (error) {
        db.close()
        reject(error)
      }
    }
    request.onerror = () => reject(request.error)
  })
}

/** Persist a directory handle to IndexedDB */
async function persistHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  return withHandleDB((db) => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DIR_HANDLE_STORE, 'readwrite')
      const store = tx.objectStore(DIR_HANDLE_STORE)
      if (handle) {
        store.put(handle, DIR_HANDLE_KEY)
      } else {
        store.delete(DIR_HANDLE_KEY)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  })
}

/** Load a directory handle from IndexedDB */
async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  return withHandleDB((db) => {
    return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(DIR_HANDLE_STORE, 'readonly')
      const store = tx.objectStore(DIR_HANDLE_STORE)
      const req = store.get(DIR_HANDLE_KEY)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  })
}

/** Verify and re-request readwrite permission on a restored handle */
async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  if ((await handle.requestPermission(opts)) === 'granted') return true
  return false
}

export const useAgentStore = create<AgentState>()(
  immer((set) => ({
    directoryHandle: null,
    directoryName: null,
    isRestoringHandle: false,

    setDirectoryHandle: (handle) => {
      set((state) => {
        state.directoryHandle = handle
        // Treat empty string as null (some browsers return empty name)
        state.directoryName = handle?.name && handle.name.trim() ? handle.name : null
      })
      persistHandle(handle).catch((error) => {
        console.error('[AgentStore] Failed to persist directory handle:', error)
        toast.error('文件夹选择保存失败，刷新后可能需要重新选择')
      })

      // Notify remote session of directory change
      if (handle) {
        // Trigger async file tree rebuild and broadcast to remotes
        import('./remote.store').then(({ useRemoteStore }) => {
          const remoteStore = useRemoteStore.getState()
          if (remoteStore.session && remoteStore.getRole() === 'host') {
            remoteStore.refreshFileTree().catch((err) => {
              console.error('[AgentStore] Failed to refresh file tree:', err)
            })
          }
        })
      }
    },

    restoreDirectoryHandle: async () => {
      set((state) => {
        state.isRestoringHandle = true
      })

      try {
        console.log('[AgentStore] Starting directory handle restoration...')
        const handle = await loadHandle()

        if (!handle) {
          console.log('[AgentStore] No saved directory handle found in IndexedDB')
          return
        }

        console.log('[AgentStore] Found saved handle, verifying permissions...')
        const granted = await verifyPermission(handle)

        if (granted) {
          console.log('[AgentStore] Permission granted, restoring handle:', handle.name)
          set((state) => {
            state.directoryHandle = handle
            // Treat empty string as null (some browsers return empty name)
            state.directoryName = handle.name && handle.name.trim() ? handle.name : null
          })
        } else {
          console.warn('[AgentStore] Permission verification failed for handle:', handle.name)
          // Permission denied - notify user and clear the stale handle from IndexedDB
          toast.info('文件夹权限已过期，请重新选择文件夹')
          // Clear the stale handle so we don't keep prompting for permission
          await persistHandle(null)
        }
      } catch (error) {
        // Handle missing or permission denied — log for debugging
        console.error('[AgentStore] Failed to restore directory handle:', error)
        // Check if it's a specific error type
        if (error instanceof Error) {
          if (error.name === 'NotFoundError') {
            console.log('[AgentStore] Handle not found in IndexedDB (may have been cleared)')
          } else if (error.message.includes('permission') || error.message.includes('Permission')) {
            console.log('[AgentStore] Permission error during restoration')
          } else {
            console.error('[AgentStore] Unexpected error:', error.message)
          }
        }
      } finally {
        set((state) => {
          state.isRestoringHandle = false
        })
      }
    },
  }))
)

// ============================================================================
// GLOBAL DIAGNOSTIC FUNCTIONS - For debugging handle persistence issues
// ============================================================================

declare global {
  interface Window {
    /** List all IndexedDB databases (helps detect duplicates) */
    __listAllIndexedDB: () => Promise<{
      databases: Array<{ name: string; version: number }>
      duplicates: Record<string, number> // name -> count
      error?: string
    }>
    /** Delete a specific IndexedDB database by name */
    __deleteIndexedDB: (name: string) => Promise<{
      success: boolean
      error?: string
    }>
    /** Check if directory handle exists in IndexedDB */
    __checkHandleInIndexedDB: () => Promise<{
      exists: boolean
      handleName: string | null
      error?: string
    }>
    /** Manually clear the directory handle from IndexedDB */
    __clearHandleFromIndexedDB: () => Promise<{
      success: boolean
      error?: string
    }>
    /** Get current directory handle state from store */
    __getHandleState: () => {
      handle: FileSystemDirectoryHandle | null
      name: string | null
      isRestoring: boolean
    }
  }
}

/**
 * List all IndexedDB databases
 * This helps detect duplicate databases that might cause confusion
 * Usage: await window.__listAllIndexedDB()
 */
window.__listAllIndexedDB = async () => {
  try {
    // @ts-ignore - indexedDB.databases() is supported in modern browsers
    const databases = await indexedDB.databases()

    // Count duplicates
    const nameCount: Record<string, number> = {}
    databases.forEach((db) => {
      if (db?.name) {
        nameCount[db.name] = (nameCount[db.name] || 0) + 1
      }
    })

    // Find duplicates
    const duplicates: Record<string, number> = {}
    for (const [name, count] of Object.entries(nameCount)) {
      if (count > 1) {
        duplicates[name] = count
      }
    }

    return {
      databases: databases.map((db) => ({
        name: db?.name || '(unnamed)',
        version: db?.version || 0,
      })),
      duplicates,
    }
  } catch (error) {
    return {
      databases: [],
      duplicates: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Delete a specific IndexedDB database by name
 * WARNING: This will permanently delete the database and all its data
 * Usage: await window.__deleteIndexedDB('bfosa-dir-handle')
 */
window.__deleteIndexedDB = async (name: string) => {
  try {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = () => resolve({ success: true })
      req.onerror = () => resolve({ success: false, error: req.error?.message || 'Unknown error' })
      req.onblocked = () => {
        console.warn(`[IndexedDB] Delete blocked for ${name} - database is in use`)
        resolve({ success: false, error: 'Database is in use by another tab' })
      }
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Check if directory handle exists in IndexedDB
 * Usage: await window.__checkHandleInIndexedDB()
 */
window.__checkHandleInIndexedDB = async () => {
  try {
    return await withHandleDB((db) => {
      return new Promise<{ exists: boolean; handleName: string | null }>((resolve, reject) => {
        const tx = db.transaction(DIR_HANDLE_STORE, 'readonly')
        const store = tx.objectStore(DIR_HANDLE_STORE)
        const req = store.get(DIR_HANDLE_KEY)
        req.onsuccess = () => {
          const handle = req.result as FileSystemDirectoryHandle | null
          resolve({
            exists: handle !== null && handle !== undefined,
            handleName: handle?.name || null,
          })
        }
        req.onerror = () => reject(req.error)
      })
    })
  } catch (error) {
    return {
      exists: false,
      handleName: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Manually clear the directory handle from IndexedDB
 * Useful for testing or when handle becomes stale
 * Usage: await window.__clearHandleFromIndexedDB()
 */
window.__clearHandleFromIndexedDB = async () => {
  try {
    await persistHandle(null)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Get current directory handle state from store
 * Usage: window.__getHandleState()
 */
window.__getHandleState = () => {
  const state = useAgentStore.getState()
  return {
    handle: state.directoryHandle,
    name: state.directoryName,
    isRestoring: state.isRestoringHandle,
  }
}
