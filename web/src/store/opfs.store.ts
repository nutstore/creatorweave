/**
 * OPFS Store - provides file operations through workspace runtime
 *
 * This store acts as a bridge between the application and the OPFS workspace system:
 * - All file operations go through the current active workspace
 * - Files are cached in OPFS with mtime-based change detection
 * - Pending changes are tracked for sync to real filesystem
 *
 * Architecture:
 * - Application → OPFSStore → WorkspaceFiles → OPFS
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  FileContent,
  FileMetadata,
  PendingChange,
  SyncResult,
  ReadPolicy,
} from '@/opfs/types/opfs-types'
import { getWorkspaceManager } from '@/opfs'

/**
 * Check if error is a quota exceeded error
 */
function isQuotaError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'QuotaExceededError' ||
      error.message.includes('QuotaExceededError') ||
      error.message.includes('storage quota') ||
      error.message.includes('存储空间不足')
    )
  }
  return false
}

/**
 * Show quota exceeded alert to user
 */
function showQuotaAlert(): void {
  console.warn('[opfs.store] Storage quota exceeded')
  // Could integrate with toast/notification system here
}

/**
 * File read result with metadata
 */
export interface FileReadResult {
  content: FileContent
  metadata: FileMetadata
  source?: 'native' | 'opfs'
}

/**
 * OPFS store state
 */
interface OPFSState {
  /** Current active workspace ID */
  workspaceId: string | null

  /** Whether the store has been initialized */
  initialized: boolean

  /** Pending changes for current workspace */
  pendingChanges: PendingChange[]

  /** File paths that are approved but not yet synced to disk */
  approvedNotSyncedPaths: Set<string>

  /** Cached file paths for current workspace (OPFS cache only) */
  cachedPaths: string[]

  /** Whether an operation is in progress */
  isLoading: boolean

  /** Error message if any operation failed */
  error: string | null

  // Actions

  /** Initialize the store (wait for active workspace) */
  initialize: () => Promise<void>

  /** Read file from current workspace (cache first, then filesystem) */
  readFile: (
    path: string,
    directoryHandle?: FileSystemDirectoryHandle | null,
    workspaceId?: string | null,
    readPolicy?: ReadPolicy
  ) => Promise<FileReadResult>

  /** Write file to current workspace (cache + pending) */
  writeFile: (
    path: string,
    content: FileContent,
    directoryHandle?: FileSystemDirectoryHandle | null,
    workspaceId?: string | null
  ) => Promise<void>

  /** Delete file from current workspace */
  deleteFile: (
    path: string,
    directoryHandle?: FileSystemDirectoryHandle | null,
    workspaceId?: string | null
  ) => Promise<void>

  /** Get pending changes for current workspace */
  getPendingChanges: () => PendingChange[]

  /** Sync pending changes to real filesystem */
  syncPendingChanges: (
    directoryHandle: FileSystemDirectoryHandle,
    workspaceId?: string | null
  ) => Promise<SyncResult>

  /** Clear current workspace's cache and pending */
  clearWorkspace: () => Promise<void>
  /** @deprecated Use clearWorkspace */
  clearSession: () => Promise<void>

  /** Check if file is cached in current workspace */
  hasCachedFile: (path: string) => boolean

  /** Get all cached file paths */
  getCachedPaths: () => string[]

  /** Refresh state from current workspace */
  refresh: () => Promise<void>

  /** Clear error state */
  clearError: () => void
}

/**
 * Helper to get active workspace runtime
 */
async function getWorkspaceForOperation(workspaceId?: string | null) {
  const { useWorkspaceStore } = await import('./workspace.store')
  const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
  const targetWorkspaceId = workspaceId || activeWorkspaceId

  if (!targetWorkspaceId) {
    throw new Error('No active workspace')
  }

  const manager = await getWorkspaceManager()
  const workspace = await manager.getWorkspace(targetWorkspaceId)

  if (!workspace) {
    throw new Error(`Workspace ${targetWorkspaceId} not found`)
  }

  return { workspace, workspaceId: targetWorkspaceId }
}

async function getWorkspaceById(workspaceId: string) {
  const manager = await getWorkspaceManager()
  const workspace = await manager.getWorkspace(workspaceId)
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`)
  }
  return workspace
}

export const useOPFSStore = create<OPFSState>()(
  immer((set, get) => ({
    workspaceId: null,
    initialized: false,
    pendingChanges: [],
    approvedNotSyncedPaths: new Set(),
    cachedPaths: [],
    isLoading: false,
    error: null,

    initialize: async () => {
      try {
        const { workspaceId } = await getWorkspaceForOperation()

        // Load initial state from workspace
        const manager = await getWorkspaceManager()
        const workspace = await manager.getWorkspace(workspaceId)

        if (workspace) {
          // Get approved-not-synced paths (may fail if DB not ready)
          let approvedNotSyncedPaths = new Set<string>()
          try {
            approvedNotSyncedPaths = await workspace.getApprovedNotSyncedPaths()
          } catch (e) {
            console.warn('[opfs.store] Failed to get approvedNotSyncedPaths during init:', e)
          }

          set({
            workspaceId: workspaceId,
            pendingChanges: workspace.getPendingChanges(),
            approvedNotSyncedPaths,
            cachedPaths: workspace.getCachedPaths(),
            initialized: true,
            error: null,
          })
        }
      } catch (e) {
        console.error('[opfs.store] Failed to initialize:', e)
        set({
          error: e instanceof Error ? e.message : 'Failed to initialize OPFS',
          initialized: true,
        })
      }
    },

    readFile: async (path, directoryHandle, workspaceId, readPolicy) => {
      set({ isLoading: true, error: null })

      try {
        const { workspace } = await getWorkspaceForOperation(workspaceId)
        const result = await workspace.readFile(path, directoryHandle, { policy: readPolicy })

        set({ isLoading: false })

        return result
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to read file'
        set({ error: message, isLoading: false })
        throw new Error(message)
      }
    },

    writeFile: async (path, content, directoryHandle, workspaceId) => {
      set({ isLoading: true, error: null })

      try {
        const { workspace, workspaceId: targetWorkspaceId } = await getWorkspaceForOperation(workspaceId)
        await workspace.writeFile(path, content, directoryHandle)

        // Update state
        const { useWorkspaceStore } = await import('./workspace.store')
        const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
        set((state) => {
          if (activeWorkspaceId === targetWorkspaceId) {
            state.pendingChanges = workspace.getPendingChanges()
            state.cachedPaths = workspace.getCachedPaths()
          }
          state.isLoading = false
        })

        // Update workspace store counts
        if (activeWorkspaceId === targetWorkspaceId) {
          await useWorkspaceStore.getState().updateCurrentCounts()
          // Keep sync preview list in sync with OPFS writes (no toast spam).
          await useWorkspaceStore.getState().refreshPendingChanges(true)
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to write file'

        // Check for quota exceeded error
        if (isQuotaError(e)) {
          showQuotaAlert()
          set({ error: '存储空间不足，请清理缓存后重试', isLoading: false })
          throw new Error('存储空间不足')
        }

        set({ error: message, isLoading: false })
        throw new Error(message)
      }
    },

    deleteFile: async (path, directoryHandle, workspaceId) => {
      set({ isLoading: true, error: null })

      try {
        const { workspace, workspaceId: targetWorkspaceId } = await getWorkspaceForOperation(workspaceId)
        await workspace.deleteFile(path, directoryHandle)

        // Update state
        const { useWorkspaceStore } = await import('./workspace.store')
        const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
        set((state) => {
          if (activeWorkspaceId === targetWorkspaceId) {
            state.pendingChanges = workspace.getPendingChanges()
            state.cachedPaths = workspace.getCachedPaths()
          }
          state.isLoading = false
        })

        // Update workspace store counts
        if (activeWorkspaceId === targetWorkspaceId) {
          await useWorkspaceStore.getState().updateCurrentCounts()
          // Keep sync preview list in sync with OPFS deletes (no toast spam).
          await useWorkspaceStore.getState().refreshPendingChanges(true)
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to delete file'
        set({ error: message, isLoading: false })
        throw new Error(message)
      }
    },

    getPendingChanges: () => {
      return get().pendingChanges
    },

    syncPendingChanges: async (directoryHandle, workspaceId) => {
      set({ isLoading: true, error: null })

      try {
        const { workspace, workspaceId: targetWorkspaceId } = await getWorkspaceForOperation(workspaceId)
        const result = await workspace.syncToDisk(directoryHandle)

        // Update state
        const { useWorkspaceStore } = await import('./workspace.store')
        const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
        set((state) => {
          if (activeWorkspaceId === targetWorkspaceId) {
            state.pendingChanges = workspace.getPendingChanges()
          }
          state.isLoading = false
        })

        // Update workspace store counts
        if (activeWorkspaceId === targetWorkspaceId) {
          await useWorkspaceStore.getState().updateCurrentCounts()
          // Refresh preview list after disk sync to reflect cleared/remaining pending files.
          await useWorkspaceStore.getState().refreshPendingChanges(true)
        }

        return result
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to sync changes'

        // Check for quota exceeded error
        if (isQuotaError(e)) {
          showQuotaAlert()
          set({ error: '同步失败：存储空间不足', isLoading: false })
          throw new Error('存储空间不足')
        }

        set({ error: message, isLoading: false })
        throw new Error(message)
      }
    },

    clearWorkspace: async () => {
      set({ isLoading: true, error: null })

      try {
        const { workspace } = await getWorkspaceForOperation()
        await workspace.clear()

        // Update state
        set((state) => {
          state.pendingChanges = []
          state.approvedNotSyncedPaths = new Set()
          state.cachedPaths = []
          state.isLoading = false
        })

        // Update workspace store counts
        const { useWorkspaceStore } = await import('./workspace.store')
        useWorkspaceStore.getState().updateCurrentCounts()
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to clear workspace'
        set({ error: message, isLoading: false })
        throw new Error(message)
      }
    },

    clearSession: async () => {
      await get().clearWorkspace()
    },

    hasCachedFile: (path) => {
      return get().cachedPaths.includes(path)
    },

    getCachedPaths: () => {
      return get().cachedPaths
    },

    refresh: async () => {
      try {
        const { useWorkspaceStore } = await import('./workspace.store')
        const requestedWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
        if (!requestedWorkspaceId) {
          return
        }
        const workspace = await getWorkspaceById(requestedWorkspaceId)

        // Fetch async data with error handling to prevent partial state updates
        let approvedNotSyncedPaths: Set<string>
        try {
          approvedNotSyncedPaths = await workspace.getApprovedNotSyncedPaths()
        } catch (e) {
          console.warn('[opfs.store] Failed to get approvedNotSyncedPaths, using empty set:', e)
          approvedNotSyncedPaths = new Set()
        }

        // Drop stale result if active workspace changed while this refresh was in flight.
        if (useWorkspaceStore.getState().activeWorkspaceId !== requestedWorkspaceId) {
          return
        }

        set((state) => {
          state.workspaceId = requestedWorkspaceId
          state.pendingChanges = workspace.getPendingChanges()
          state.approvedNotSyncedPaths = approvedNotSyncedPaths
          state.cachedPaths = workspace.getCachedPaths()
          state.error = null
        })
      } catch (e) {
        console.error('[opfs.store] Failed to refresh:', e)
        set({
          error: e instanceof Error ? e.message : 'Failed to refresh OPFS',
        })
      }
    },

    clearError: () => {
      set((state) => {
        state.error = null
      })
    },
  }))
)
