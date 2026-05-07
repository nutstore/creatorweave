/**
 * Folder Access Store - Single source of truth
 *
 * Unified folder permission state management, solving:
 * 1. Scattered state
 * 2. Permission records not deleted after release()
 * 3. Re-add not showing picker after release
 *
 * Multi-root support:
 * - Each project can have multiple roots (folder handles)
 * - One root per project is marked as `isDefault`
 * - Roots stored in SQLite via ProjectRootRepository
 * - Handles stored in IndexedDB via DirectoryHandleManager
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'
import type { FolderAccessRecord, FolderAccessStatus, FolderAccessStore, RootInfo } from '@/types/folder-access'
import { folderAccessRepo } from '@/services/folder-access.repository'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import {
  bindRuntimeDirectoryHandle,
  unbindRuntimeDirectoryHandle,
  getRuntimeHandlesForProject,
} from '@/native-fs'
import type { ProjectRoot } from '@/sqlite/repositories/project-root.repository'
import { getProjectRootRepository } from '@/sqlite'

/**
 * Create an empty record
 * @param projectId Project ID
 * @param rootName Root name (defaults to projectId for backward compat)
 */
function createEmptyRecord(projectId: string, rootName?: string): FolderAccessRecord {
  return {
    projectId,
    rootName: rootName ?? projectId,
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

      // Load multi-root state
      await get().loadRoots()
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
                rootName: existing.rootName ?? handle.name ?? projectId,
                handle,
                status: 'ready',
                updatedAt: Date.now(),
              }
            })
            // Multi-root: bind with rootName (handle.name or existing rootName)
            const rootName = existing.rootName ?? handle.name ?? projectId
            bindRuntimeDirectoryHandle(projectId, rootName, handle)
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
          rootName: handle.name,
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
        // Multi-root: bind with rootName = handle.name for per-root lookup
        bindRuntimeDirectoryHandle(projectId, handle.name, handle)
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
        rootName: handle.name,
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
      // Multi-root: bind with rootName = handle.name
      bindRuntimeDirectoryHandle(projectId, handle.name, handle)
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
          const rootName = record.rootName ?? handle.name ?? projectId
          bindRuntimeDirectoryHandle(projectId, rootName, handle)
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
        const record = get().records[projectId]
        const rootName = record?.rootName ?? projectId
        unbindRuntimeDirectoryHandle(projectId, rootName)

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
      const { getRuntimeHandlesForProject } = await import('@/native-fs')
      const projectId = get().activeProjectId
      if (!projectId) return []

      // Multi-root: traverse all root handles and prefix paths with rootName
      const allHandles = getRuntimeHandlesForProject(projectId)
      if (allHandles.size === 0) {
        // Fallback: no root handles in memory, try current handle
        const handle = get().getCurrentHandle()
        if (!handle) return []
        const { traverseDirectory } = await import('../services/traversal.service')
        const paths: string[] = []
        for await (const entry of traverseDirectory(handle)) {
          paths.push(entry.path)
          if (paths.length >= 5000) break
        }
        set({ allFilePaths: paths })
        return paths
      }

      const { traverseDirectory } = await import('../services/traversal.service')
      const paths: string[] = []
      for (const [rootName, handle] of allHandles) {
        if (paths.length >= 5000) break
        for await (const entry of traverseDirectory(handle)) {
          // Prefix with rootName for multi-root routing
          paths.push(`${rootName}/${entry.path}`)
          if (paths.length >= 5000) break
        }
      }
      set({ allFilePaths: paths })
      return paths
    },

    clearFilePaths: () => {
      _filePathPromise = null
      set({ allFilePaths: [] })
      // Reload multi-root state in case handles changed
      const projectId = get().activeProjectId
      if (projectId) {
        get().loadRoots()
      }
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

    // ========================================================================
    // Multi-root actions
    // ========================================================================

    roots: [],

    loadRoots: async () => {
      const projectId = get().activeProjectId
      if (!projectId) {
        set({ roots: [] })
        return
      }

      // Load from SQLite
      const dbRoots: ProjectRoot[] = await getProjectRootRepository().findByProject(projectId)

      // Load handles from DirectoryHandleManager
      const runtimeHandles = getRuntimeHandlesForProject(projectId)

      const roots: RootInfo[] = await Promise.all(
        dbRoots.map(async (dbRoot) => {
          const runtimeHandle = runtimeHandles.get(dbRoot.name)
          let handle = runtimeHandle ?? null

          // Try to restore persisted handle
          let persistedHandle: FileSystemDirectoryHandle | null = null
          let status: FolderAccessStatus = 'idle'
          let error: string | undefined

          if (handle) {
            status = 'ready'
          } else {
            try {
              const record = await folderAccessRepo.findByProjectAndRoot(projectId, dbRoot.name)
              if (record?.persistedHandle) {
                persistedHandle = record.persistedHandle
                // Auto-check if browser still has cached permission
                const permission = await persistedHandle.queryPermission({ mode: 'readwrite' })
                if (permission === 'granted') {
                  handle = persistedHandle
                  status = 'ready'
                  bindRuntimeDirectoryHandle(projectId, dbRoot.name, handle)
                } else {
                  status = 'needs_user_activation'
                }
              } else {
                status = 'idle'
              }
            } catch {
              status = 'idle'
            }
          }

          return {
            id: dbRoot.id,
            name: dbRoot.name,
            isDefault: dbRoot.isDefault,
            readOnly: dbRoot.readOnly,
            handle,
            persistedHandle,
            status,
            error,
          }
        })
      )

      set({ roots })

      // Sync first ready handle to agent.store for backward compat
      const firstReady = roots.find((r) => r.status === 'ready' && r.handle)
      if (firstReady?.handle) {
        try {
          const { useAgentStore } = await import('./agent.store')
          useAgentStore.setState({
            directoryHandle: firstReady.handle,
            directoryName: firstReady.name,
          })
        } catch { /* ignore */ }
      }
    },

    addRoot: async () => {
      const projectId = get().activeProjectId
      if (!projectId) return false

      // Check if we have directory picker capability
      const { getRuntimeCapability } = await import('@/storage/runtime-capability')
      const capability = getRuntimeCapability()
      if (!capability.canPickDirectory) {
        toast.error('Directory picker not available in this browser')
        return false
      }

      // Pick folder
      const handle = await selectFolderReadWrite()
      if (!handle) return false

      const rootName = handle.name

      // Check for duplicate name
      const existing = get().roots
      if (existing.some((r) => r.name === rootName)) {
        toast.error(`A root named "${rootName}" already exists`)
        return false
      }

      // Create root in SQLite
      await getProjectRootRepository().createRoot({ projectId, name: rootName })

      // Bind handle to runtime
      bindRuntimeDirectoryHandle(projectId, rootName, handle)

      // Persist handle
      await folderAccessRepo.save({
        projectId,
        rootName,
        handle,
        persistedHandle: handle,
        folderName: rootName,
        status: 'ready',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      // Reload roots
      await get().loadRoots()

      // Sync first root to agent.store (used by some tools as default handle)
      try {
        const { useAgentStore } = await import('./agent.store')
        useAgentStore.setState({
          directoryHandle: handle,
          directoryName: rootName,
        })
      } catch { /* ignore */ }

      // Trigger file tree refresh
      get().clearFilePaths()
      get().notifyFileTreeRefresh()

      toast.success(`Added root "${rootName}"`)
      return true
    },

    removeRoot: async (rootId: string) => {
      const projectId = get().activeProjectId
      if (!projectId) return

      const root = get().roots.find((r) => r.id === rootId)
      if (!root) return

      // Unbind handle
      unbindRuntimeDirectoryHandle(projectId, root.name)

      // Delete from SQLite
      await getProjectRootRepository().deleteRoot(rootId)

      // Delete handle record
      await folderAccessRepo.deleteByProjectAndRoot(projectId, root.name)

      // If this was the default root, promote another as default
      if (root.isDefault) {
        const remaining = get().roots.filter((r) => r.id !== rootId)
        if (remaining.length > 0) {
          await getProjectRootRepository().setDefaultRoot(projectId, remaining[0].id)
        }
      }

      // Reload roots
      await get().loadRoots()

      // Sync to agent.store: use first remaining root's handle
      try {
        const { useAgentStore } = await import('./agent.store')
        const remaining = get().roots
        if (remaining.length > 0 && remaining[0].handle) {
          useAgentStore.setState({
            directoryHandle: remaining[0].handle,
            directoryName: remaining[0].name,
          })
        } else {
          useAgentStore.setState({
            directoryHandle: null,
            directoryName: null,
          })
        }
      } catch { /* ignore */ }

      // Trigger file tree refresh
      get().clearFilePaths()
      get().notifyFileTreeRefresh()

      toast.success(`Removed root "${root.name}"`)
    },

    setDefaultRoot: async (rootId: string) => {
      const projectId = get().activeProjectId
      if (!projectId) return

      await getProjectRootRepository().setDefaultRoot(projectId, rootId)

      // Reload roots
      await get().loadRoots()
    },

    toggleReadOnly: async (rootId: string) => {
      const root = get().roots.find((r) => r.id === rootId)
      if (!root) return

      const dbRoot = await getProjectRootRepository().findById(rootId)
      if (!dbRoot) return
      await getProjectRootRepository().updateRoot({
        ...dbRoot,
        readOnly: !dbRoot.readOnly,
      })
      await get().loadRoots()
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
