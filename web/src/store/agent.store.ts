/**
 * Agent store - manages global agent configuration.
 * Runtime status is now managed per-conversation in conversation.store.
 *
 * Directory handle is persisted in IndexedDB (supports structured clone).
 * On page reload, the handle is restored and permission is re-requested.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

const DIR_HANDLE_DB = 'bfosa-dir-handle'
const DIR_HANDLE_STORE = 'handles'
const DIR_HANDLE_KEY = 'directory'

interface AgentState {
  /** Directory handle for file operations */
  directoryHandle: FileSystemDirectoryHandle | null
  /** Directory name for display */
  directoryName: string | null

  // Actions
  setDirectoryHandle: (handle: FileSystemDirectoryHandle | null) => void
  restoreDirectoryHandle: () => Promise<void>
}

/** Open the dedicated IndexedDB for directory handle storage */
function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DIR_HANDLE_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) {
        db.createObjectStore(DIR_HANDLE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Persist a directory handle to IndexedDB */
async function persistHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await openHandleDB()
  return new Promise((resolve, reject) => {
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
}

/** Load a directory handle from IndexedDB */
async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openHandleDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DIR_HANDLE_STORE, 'readonly')
    const store = tx.objectStore(DIR_HANDLE_STORE)
    const req = store.get(DIR_HANDLE_KEY)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
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

    setDirectoryHandle: (handle) => {
      set((state) => {
        state.directoryHandle = handle
        // Treat empty string as null (some browsers return empty name)
        state.directoryName = handle?.name && handle.name.trim() ? handle.name : null
      })
      persistHandle(handle).catch(console.error)

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
      try {
        const handle = await loadHandle()
        if (!handle) return
        const granted = await verifyPermission(handle)
        if (granted) {
          set((state) => {
            state.directoryHandle = handle
            // Treat empty string as null (some browsers return empty name)
            state.directoryName = handle.name && handle.name.trim() ? handle.name : null
          })
        }
      } catch {
        // Handle missing or permission denied — silently ignore
      }
    },
  }))
)
