/**
 * Folder Access Store - Single source of truth
 *
 * Unified folder permission state management, solving:
 * 1. Scattered state
 * 2. Permission records not deleted after release()
 * 3. Re-add not showing picker after release
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'
import type { FolderAccessRecord, FolderAccessStatus, FolderAccessStore } from '@/types/folder-access'
import { folderAccessRepo } from '@/services/folder-access.repository'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { bindRuntimeDirectoryHandle, unbindRuntimeDirectoryHandle } from '@/native-fs'

/**
 * Create an empty record
 */
function createEmptyRecord(projectId: string): FolderAccessRecord {
  return {
    projectId,
    folderName: null,
    handle: null,
    persistedHandle: null,
    status: 'idle',
    error: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

async function notifyWorkspaceNativeDirectoryGranted(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const { useWorkspaceStore } = await import('./workspace.store')
    await useWorkspaceStore.getState().onNativeDirectoryGranted(handle)
  } catch (error) {
    console.warn('[FolderAccessStore] Failed to notify workspace native handle grant:', error)
  }
}

/**
 * Module-level dedup: prevents concurrent ensureFilePaths from triggering multiple traversals
 */
let _filePathPromise: Promise<string[]> | null = null

export const useFolderAccessStore = create<FolderAccessStore>()(
  immer((set, get) => ({
    activeProjectId: null,
    records: {},
    allFilePaths: [],

    // ========================================================================
    // Actions
    // ========================================================================

    /**
     * Set active project and hydrate
     */
    setActiveProject: async (projectId: string | null) => {
      // Clear file path cache on project switch
      get().clearFilePaths()
      set((state) => {
        state.activeProjectId = projectId
      })

      if (!projectId) return

      // Create empty record if none exists yet
      if (!get().records[projectId]) {
        set((state) => {
          state.records[projectId] = createEmptyRecord(projectId)
        })
      }

      await get().hydrateProject(projectId)
    },

    /**
     * Hydrate project data (restore from IndexedDB)
     */
    hydrateProject: async (projectId: string) => {
      set((state) => {
        const record = state.records[projectId]
        if (record) {
          record.status = 'checking'
        }
      })

      try {
        // Load record from IndexedDB
        const existing = await folderAccessRepo.load(projectId)

        if (!existing || !existing.persistedHandle) {
          // No record -> idle
          set((state) => {
            state.records[projectId] = createEmptyRecord(projectId)
          })
          return
        }

        // Has persisted handle -> check permission status
        const handle = existing.persistedHandle

        try {
          const permission = await handle.queryPermission({ mode: 'readwrite' })

          if (permission === 'granted') {
            // Permission already granted -> ready
            set((state) => {
              state.records[projectId] = {
                ...existing,
                handle,
                status: 'ready',
                updatedAt: Date.now(),
              }
            })
            bindRuntimeDirectoryHandle(projectId, handle)
            await notifyWorkspaceNativeDirectoryGranted(handle)
            console.log('[FolderAccessStore] Permission granted, handle ready:', handle.name)
          } else if (permission === 'prompt') {
            // Needs user activation -> needs_user_activation
            set((state) => {
              state.records[projectId] = {
                ...existing,
                handle: null,
                status: 'needs_user_activation',
                updatedAt: Date.now(),
              }
            })
            console.log('[FolderAccessStore] Permission prompt, needs activation:', handle.name)
          } else {
            // Permission denied -> delete record, back to idle
            console.log('[FolderAccessStore] Permission denied, clearing record')
            await folderAccessRepo.delete(projectId)
            set((state) => {
              state.records[projectId] = createEmptyRecord(projectId)
            })
          }
        } catch (permError) {
          // Permission query failed, handle may have expired
          console.error('[FolderAccessStore] Permission query failed:', permError)
          await folderAccessRepo.delete(projectId)
          set((state) => {
            state.records[projectId] = createEmptyRecord(projectId)
          })
        }
      } catch (error) {
        console.error('[FolderAccessStore] Hydrate failed:', error)
        set((state) => {
          const record = state.records[projectId]
          if (record) {
            record.status = 'error'
            record.error = error instanceof Error ? error.message : 'Unknown error'
          }
        })
      }
    },

    /**
     * Pick a new folder (shows folder picker dialog)
     */
    pickDirectory: async (projectId: string) => {
      set((state) => {
        const record = state.records[projectId]
        if (record) {
          record.status = 'requesting'
        }
      })

      try {
        const handle = await selectFolderReadWrite()

        if (!handle) {
          // User cancelled -> restore previous state
          set((state) => {
            const record = state.records[projectId]
            if (record) {
              // Fix: if there's a valid handle, keep ready status
              // Only set idle/needs_user_activation when no persisted handle exists
              if (record.handle || record.persistedHandle) {
                record.status = 'ready'
              } else {
                record.status = 'idle'
              }
            }
          })
          return false
        }

        const record: FolderAccessRecord = {
          projectId,
          folderName: handle.name,
          handle,
          persistedHandle: handle,
          status: 'ready',
          error: undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        // Persist
        await folderAccessRepo.save(record)
        bindRuntimeDirectoryHandle(projectId, handle)
        await notifyWorkspaceNativeDirectoryGranted(handle)

        set((state) => {
          state.records[projectId] = record
        })

        toast.success(`Folder selected: ${handle.name}`)

        // Notify file tree to refresh + clear file path cache (lazy reload on next search)
        get().clearFilePaths()
        get().notifyFileTreeRefresh()

        return true
      } catch (error) {
        console.error('[FolderAccessStore] Pick directory failed:', error)

        if (error instanceof Error && error.message === 'User cancelled') {
          // User cancelled, don't set error state
          set((state) => {
            const record = state.records[projectId]
            if (record) {
              // Fix: if there's a valid handle, keep ready status
              // Only set idle/needs_user_activation when no persisted handle exists
              if (record.handle || record.persistedHandle) {
                record.status = 'ready'
              } else {
                record.status = 'idle'
              }
            }
          })
          return false
        }

        set((state) => {
          const record = state.records[projectId]
          if (record) {
            record.status = 'error'
            record.error = error instanceof Error ? error.message : 'Unknown error'
          }
        })

        toast.error('Failed to select folder: ' + (error instanceof Error ? error.message : 'Unknown error'))
        return false
      }
    },

    /**
     * Set folder handle directly (no dialog, for externally obtained handles)
     */
    setHandle: async (projectId: string, handle: FileSystemDirectoryHandle) => {
      set((state) => {
        const record = state.records[projectId]
        if (record) {
          record.status = 'ready'
          record.error = undefined
        }
      })

      const record: FolderAccessRecord = {
        projectId,
        folderName: handle.name,
        handle,
        persistedHandle: handle,
        status: 'ready',
        error: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      // Persist
      await folderAccessRepo.save(record)
      bindRuntimeDirectoryHandle(projectId, handle)
      await notifyWorkspaceNativeDirectoryGranted(handle)

      set((state) => {
        state.records[projectId] = record
      })

      console.log('[FolderAccessStore] Handle set directly:', handle.name)

      // Notify file tree to refresh + clear file path cache
      get().clearFilePaths()
      get().notifyFileTreeRefresh()
    },

    /**
     * Request permission restoration (from needs_user_activation state)
     */
    requestPermission: async (projectId: string) => {
      const record = get().records[projectId]
      if (!record?.persistedHandle) {
        console.warn('[FolderAccessStore] No persisted handle to request permission')
        return false
      }

      set((state) => {
        const r = state.records[projectId]
        if (r) r.status = 'requesting'
      })

      try {
        const handle = record.persistedHandle
        const result = await handle.requestPermission({ mode: 'readwrite' })

        if (result === 'granted') {
          set((state) => {
            const r = state.records[projectId]
            if (r) {
              r.handle = handle
              r.status = 'ready'
              r.error = undefined
              r.updatedAt = Date.now()
            }
          })

          // Update persistence
          await folderAccessRepo.save(get().records[projectId])
          bindRuntimeDirectoryHandle(projectId, handle)
          await notifyWorkspaceNativeDirectoryGranted(handle)

          toast.success('Folder permission restored')
          get().clearFilePaths()
          get().notifyFileTreeRefresh()
          return true
        } else {
          toast.error('Permission denied')
          set((state) => {
            const r = state.records[projectId]
            if (r) r.status = 'needs_user_activation'
          })
          return false
        }
      } catch (error) {
        console.error('[FolderAccessStore] Request permission failed:', error)

        if (error instanceof Error && error.name === 'SecurityError') {
          // Requires user interaction
          set((state) => {
            const r = state.records[projectId]
            if (r) r.status = 'needs_user_activation'
          })
          toast.info('Please click the button again to restore permission')
        } else {
          set((state) => {
            const r = state.records[projectId]
            if (r) {
              r.status = 'error'
              r.error = error instanceof Error ? error.message : 'Unknown error'
            }
          })
          toast.error('Failed to restore permission')
        }
        return false
      }
    },

    /**
     * Fully release (delete record)
     * Critical: must delete IndexedDB record so next add shows the picker
     */
    release: async (projectId: string) => {
      set((state) => {
        const record = state.records[projectId]
        if (record) {
          record.status = 'releasing'
        }
      })

      try {
        // Critical: fully delete IndexedDB record
        await folderAccessRepo.delete(projectId)
        unbindRuntimeDirectoryHandle(projectId)

        set((state) => {
          state.records[projectId] = createEmptyRecord(projectId)
        })

        get().clearFilePaths()
        toast.success('Folder permission released')
        console.log('[FolderAccessStore] Released and deleted record for project:', projectId)
      } catch (error) {
        console.error('[FolderAccessStore] Release failed:', error)
        set((state) => {
          const record = state.records[projectId]
          if (record) {
            record.status = 'error'
            record.error = error instanceof Error ? error.message : 'Unknown error'
          }
        })
      }
    },

    /**
     * Clear error state
     */
    clearError: (projectId: string) => {
      set((state) => {
        const record = state.records[projectId]
        if (record) {
          record.status = record.persistedHandle ? 'needs_user_activation' : 'idle'
          record.error = undefined
        }
      })
    },

    // ========================================================================
    // Selectors
    // ========================================================================

    /**
     * Get current project record
     */
    getRecord: (): FolderAccessRecord | null => {
      const { activeProjectId, records } = get()
      if (!activeProjectId) return null
      return records[activeProjectId] ?? null
    },

    /**
     * Get current project status
     */
    getCurrentStatus: (): FolderAccessStatus | null => {
      const { activeProjectId, records } = get()
      if (!activeProjectId) return null
      return records[activeProjectId]?.status ?? null
    },

    /**
     * Get current project handle
     */
    getCurrentHandle: (): FileSystemDirectoryHandle | null => {
      const { activeProjectId, records } = get()
      if (!activeProjectId) return null
      return records[activeProjectId]?.handle ?? null
    },

    /**
     * Whether the current project is ready
     */
    isReady: (): boolean => {
      const status = get().getCurrentStatus()
      return status === 'ready'
    },

    // ========================================================================
    // Shared file path cache
    // ========================================================================

    ensureFilePaths: async () => {
      const existing = get().allFilePaths
      if (existing.length > 0) return existing
      // Dedup: concurrent calls share the same traversal Promise
      if (!_filePathPromise) {
        _filePathPromise = get().refreshFilePaths().finally(() => {
          _filePathPromise = null
        })
      }
      return _filePathPromise
    },

    refreshFilePaths: async () => {
      const handle = get().getCurrentHandle()
      if (!handle) return []

      const { traverseDirectory } = await import('../services/traversal.service')
      const paths: string[] = []
      for await (const entry of traverseDirectory(handle)) {
        if (entry.type === 'file') paths.push(entry.path)
        if (paths.length >= 5000) break
      }
      set({ allFilePaths: paths })
      return paths
    },

    clearFilePaths: () => {
      _filePathPromise = null
      set({ allFilePaths: [] })
    },

    // ========================================================================
    // Helpers
    // ========================================================================

    notifyFileTreeRefresh: async () => {
      try {
        const { useRemoteStore } = await import('./remote.store')
        const remoteStore = useRemoteStore.getState()
        if (remoteStore.session && remoteStore.getRole() === 'host') {
          remoteStore.refreshFileTree()
        }
      } catch (error) {
        console.error('[FolderAccessStore] Failed to notify file tree refresh:', error)
      }
    },
  }))
)

// ============================================================================
// Convenience hook
// ============================================================================

/**
 * Convenience hook: get the current project's folder access state
 */
export function useCurrentFolderAccess() {
  const store = useFolderAccessStore()
  const { activeProjectId, records } = store

  const record = activeProjectId ? records[activeProjectId] : null

  return {
    ...store,
    record,
    projectId: activeProjectId,
    isReady: record?.status === 'ready',
    isIdle: record?.status === 'idle',
    isNeedsActivation: record?.status === 'needs_user_activation',
    isChecking: record?.status === 'checking',
    isRequesting: record?.status === 'requesting',
    isReleasing: record?.status === 'releasing',
    hasError: record?.status === 'error',
    folderName: record?.folderName ?? null,
    handle: record?.handle ?? null,
    error: record?.error,
  }
}
