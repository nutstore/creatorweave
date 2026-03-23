/**
 * OPFS Store - provides file operations through SessionWorkspace
 *
 * This store acts as a bridge between the application and the OPFS session system:
 * - All file operations go through the current active session's workspace
 * - Files are cached in OPFS with mtime-based change detection
 * - Pending changes are tracked for sync to real filesystem
 *
 * Architecture:
 * - Application → OPFSStore → SessionWorkspace → OPFS
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  FileContent,
  FileMetadata,
  PendingChange,
  SyncResult,
} from '@/opfs/types/opfs-types'
import { getSessionManager } from '@/opfs/session'

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
}

/**
 * OPFS store state
 */
interface OPFSState {
  /** Current active session ID */
  sessionId: string | null

  /** Whether the store has been initialized */
  initialized: boolean

  /** Pending changes for current session */
  pendingChanges: PendingChange[]

  /** Cached file paths for current session */
  cachedPaths: string[]

  /** Whether an operation is in progress */
  isLoading: boolean

  /** Error message if any operation failed */
  error: string | null

  // Actions

  /** Initialize the store (wait for active session) */
  initialize: () => Promise<void>

  /** Read file from current session (cache first, then filesystem) */
  readFile: (path: string, directoryHandle?: FileSystemDirectoryHandle | null) => Promise<FileReadResult>

  /** Write file to current session (cache + pending) */
  writeFile: (
    path: string,
    content: FileContent,
    directoryHandle?: FileSystemDirectoryHandle | null
  ) => Promise<void>

  /** Delete file from current session */
  deleteFile: (path: string, directoryHandle?: FileSystemDirectoryHandle | null) => Promise<void>

  /** Get pending changes for current session */
  getPendingChanges: () => PendingChange[]

  /** Sync pending changes to real filesystem */
  syncPendingChanges: (directoryHandle: FileSystemDirectoryHandle) => Promise<SyncResult>

  /** Clear current session's cache and pending */
  clearSession: () => Promise<void>

  /** Check if file is cached in current session */
  hasCachedFile: (path: string) => boolean

  /** Get all cached file paths */
  getCachedPaths: () => string[]

  /** Refresh state from current session */
  refresh: () => Promise<void>

  /** Clear error state */
  clearError: () => void
}

/**
 * Helper to get active session workspace
 */
async function getActiveWorkspace() {
  const { useWorkspaceStore } = await import('./workspace.store')
  const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId

  if (!activeWorkspaceId) {
    throw new Error('No active workspace')
  }

  const manager = await getSessionManager()
  const workspace = await manager.getSession(activeWorkspaceId)

  if (!workspace) {
    throw new Error(`Workspace ${activeWorkspaceId} not found`)
  }

  return { workspace, workspaceId: activeWorkspaceId }
}

export const useOPFSStore = create<OPFSState>()(
  immer((set, get) => ({
    sessionId: null,
    initialized: false,
    pendingChanges: [],
    cachedPaths: [],
    isLoading: false,
    error: null,

    initialize: async () => {
      try {
        const { workspaceId } = await getActiveWorkspace()

        // Load initial state from workspace
        const manager = await getSessionManager()
        const workspace = await manager.getSession(workspaceId)

        if (workspace) {
          set({
            sessionId: workspaceId,
            pendingChanges: workspace.getPendingChanges(),
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

    readFile: async (path, directoryHandle) => {
      set({ isLoading: true, error: null })

      try {
        const { workspace } = await getActiveWorkspace()
        const result = await workspace.readFile(path, directoryHandle)

        set({ isLoading: false })

        return result
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to read file'
        set({ error: message, isLoading: false })
        throw new Error(message)
      }
    },

    writeFile: async (path, content, directoryHandle) => {
      set({ isLoading: true, error: null })

      try {
        const { workspace } = await getActiveWorkspace()
        await workspace.writeFile(path, content, directoryHandle)

        // Update state
        set((state) => {
          state.pendingChanges = workspace.getPendingChanges()
          state.cachedPaths = workspace.getCachedPaths()
          state.isLoading = false
        })

        // Update workspace store counts
        const { useWorkspaceStore } = await import('./workspace.store')
        await useWorkspaceStore.getState().updateCurrentCounts()
        // Keep sync preview list in sync with OPFS writes (no toast spam).
        await useWorkspaceStore.getState().refreshPendingChanges(true)
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

    deleteFile: async (path, directoryHandle) => {
      set({ isLoading: true, error: null })

      try {
        const { workspace } = await getActiveWorkspace()
        await workspace.deleteFile(path, directoryHandle)

        // Update state
        set((state) => {
          state.pendingChanges = workspace.getPendingChanges()
          state.cachedPaths = workspace.getCachedPaths()
          state.isLoading = false
        })

        // Update workspace store counts
        const { useWorkspaceStore } = await import('./workspace.store')
        await useWorkspaceStore.getState().updateCurrentCounts()
        // Keep sync preview list in sync with OPFS deletes (no toast spam).
        await useWorkspaceStore.getState().refreshPendingChanges(true)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to delete file'
        set({ error: message, isLoading: false })
        throw new Error(message)
      }
    },

    getPendingChanges: () => {
      return get().pendingChanges
    },

    syncPendingChanges: async (directoryHandle) => {
      set({ isLoading: true, error: null })

      try {
        const { workspace } = await getActiveWorkspace()
        const result = await workspace.syncToDisk(directoryHandle)

        // Update state
        set((state) => {
          state.pendingChanges = workspace.getPendingChanges()
          state.isLoading = false
        })

        // Update workspace store counts
        const { useWorkspaceStore } = await import('./workspace.store')
        await useWorkspaceStore.getState().updateCurrentCounts()
        // Refresh preview list after disk sync to reflect cleared/remaining pending files.
        await useWorkspaceStore.getState().refreshPendingChanges(true)

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

    clearSession: async () => {
      set({ isLoading: true, error: null })

      try {
        const { workspace } = await getActiveWorkspace()
        await workspace.clear()

        // Update state
        set((state) => {
          state.pendingChanges = []
          state.cachedPaths = []
          state.isLoading = false
        })

        // Update workspace store counts
        const { useWorkspaceStore } = await import('./workspace.store')
        useWorkspaceStore.getState().updateCurrentCounts()
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to clear session'
        set({ error: message, isLoading: false })
        throw new Error(message)
      }
    },

    hasCachedFile: (path) => {
      return get().cachedPaths.includes(path)
    },

    getCachedPaths: () => {
      return get().cachedPaths
    },

    refresh: async () => {
      try {
        const { workspace, workspaceId: newWorkspaceId } = await getActiveWorkspace()

        set((state) => {
          state.sessionId = newWorkspaceId
          state.pendingChanges = workspace.getPendingChanges()
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
