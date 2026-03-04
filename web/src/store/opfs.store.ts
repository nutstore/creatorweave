/**
 * OPFS Store - provides file operations through SessionWorkspace
 *
 * This store acts as a bridge between the application and the OPFS session system:
 * - All file operations go through the current active session's workspace
 * - Files are cached in OPFS with mtime-based change detection
 * - Pending changes are tracked for sync to real filesystem
 * - Undo history is maintained per session
 *
 * Architecture:
 * - Application → OPFSStore → SessionWorkspace → OPFS
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import type {
  FileContent,
  FileMetadata,
  PendingChange,
  UndoRecord,
  SyncResult,
} from '@/opfs/types/opfs-types'
import { getSessionManager } from '@/opfs/session'

// Enable Immer Map/Set support
enableMapSet()

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

  /** Undo records for current session */
  undoRecords: UndoRecord[]

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
  readFile: (path: string, directoryHandle: FileSystemDirectoryHandle) => Promise<FileReadResult>

  /** Write file to current session (cache + pending + undo) */
  writeFile: (
    path: string,
    content: FileContent,
    directoryHandle: FileSystemDirectoryHandle
  ) => Promise<void>

  /** Delete file from current session */
  deleteFile: (path: string, directoryHandle: FileSystemDirectoryHandle) => Promise<void>

  /** Get pending changes for current session */
  getPendingChanges: () => PendingChange[]

  /** Get undo records for current session */
  getUndoRecords: () => UndoRecord[]

  /** Sync pending changes to real filesystem */
  syncPendingChanges: (directoryHandle: FileSystemDirectoryHandle) => Promise<SyncResult>

  /** Undo a specific operation */
  undo: (recordId: string) => Promise<void>

  /** Redo a specific operation */
  redo: (recordId: string) => Promise<void>

  /** Clear current session's cache, pending, and undo */
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

/**
 * Check if error is a quota exceeded error
 */
function isQuotaError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return true
  }
  if (error instanceof Error && error.name === 'QuotaExceededError') {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('QuotaExceededError') ||
    message.includes('quota') ||
    message.includes('配额') ||
    message.includes('空间不足')
  )
}

/**
 * Show quota exceeded alert to user
 */
function showQuotaAlert() {
  alert(
    '存储空间不足\n\n' +
      '浏览器配额已满或磁盘剩余空间不足。\n\n' +
      '建议：\n' +
      '1. 清空所有缓存（点击会话菜单 → 清空所有缓存）\n' +
      '2. 清理旧会话（点击会话菜单 → 清理旧会话）\n' +
      '3. 检查磁盘剩余空间'
  )
}

export const useOPFSStore = create<OPFSState>()(
  immer((set, get) => ({
    sessionId: null,
    initialized: false,
    pendingChanges: [],
    undoRecords: [],
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
            undoRecords: workspace.getUndoRecords(),
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
          state.undoRecords = workspace.getUndoRecords()
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
          state.undoRecords = workspace.getUndoRecords()
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

    getUndoRecords: () => {
      return get().undoRecords
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

    undo: async (recordId) => {
      set({ isLoading: true, error: null })

      try {
        const { workspace } = await getActiveWorkspace()
        await workspace.undo(recordId)

        // Update state
        set((state) => {
          state.undoRecords = workspace.getUndoRecords()
          state.cachedPaths = workspace.getCachedPaths()
          state.isLoading = false
        })

        // Update workspace store counts
        const { useWorkspaceStore } = await import('./workspace.store')
        useWorkspaceStore.getState().updateCurrentCounts()
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to undo'
        set({ error: message, isLoading: false })
        throw new Error(message)
      }
    },

    redo: async (recordId) => {
      set({ isLoading: true, error: null })

      try {
        const { workspace } = await getActiveWorkspace()
        await workspace.redo(recordId)

        // Update state
        set((state) => {
          state.undoRecords = workspace.getUndoRecords()
          state.cachedPaths = workspace.getCachedPaths()
          state.isLoading = false
        })

        // Update workspace store counts
        const { useWorkspaceStore } = await import('./workspace.store')
        useWorkspaceStore.getState().updateCurrentCounts()
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to redo'
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
          state.undoRecords = []
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
          state.undoRecords = workspace.getUndoRecords()
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

    clearError: () =>
      set((state) => {
        state.error = null
      }),
  }))
)
