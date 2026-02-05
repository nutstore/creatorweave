/**
 * Undo store - exposes undo manager state to React components.
 *
 * Phase 2: Now uses session-aware undo storage from OPFS.
 * Each conversation/session has its own independent undo history.
 */

import { create } from 'zustand'
import type { FileModification } from '@/undo/undo-types'
import { getUndoManager } from '@/undo/undo-manager'
import type { UndoRecord } from '@/opfs/types/opfs-types'
import { getSessionManager } from '@/opfs/session'

interface UndoState {
  /** All modifications (newest first) - legacy format for compatibility */
  modifications: FileModification[]
  /** Undo records from current session (newest first) */
  undoRecords: UndoRecord[]
  /** Active (not undone) count */
  activeCount: number
  /** Current session ID */
  currentSessionId: string | null

  // Actions
  refresh: () => Promise<void>
  undo: (recordId: string) => Promise<boolean>
  redo: (recordId: string) => Promise<boolean>
  clear: () => void
  undoLatest: () => Promise<boolean>
  redoLatest: () => Promise<boolean>
}

export const useUndoStore = create<UndoState>()((set, get) => {
  // Legacy manager for backward compatibility
  const legacyManager = getUndoManager()

  // Auto-refresh when legacy manager changes
  legacyManager.subscribe(() => {
    set({
      modifications: legacyManager.getModifications(),
      activeCount: legacyManager.activeCount,
    })
  })

  return {
    modifications: [],
    undoRecords: [],
    activeCount: 0,
    currentSessionId: null,

    refresh: async () => {
      const manager = await getSessionManager()

      // Get current workspace ID from workspace store
      // Import here to avoid circular dependency
      const { useWorkspaceStore } = await import('./workspace.store')
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId

      if (!activeWorkspaceId) {
        set({ undoRecords: [], currentSessionId: null })
        return
      }

      const workspace = await manager.getSession(activeWorkspaceId)
      if (workspace) {
        const records = workspace.getUndoRecords()
        set({
          undoRecords: records,
          currentSessionId: activeWorkspaceId,
          activeCount: records.filter((r) => !r.undone).length,
        })
      } else {
        set({ undoRecords: [], currentSessionId: activeWorkspaceId, activeCount: 0 })
      }
    },

    undo: async (recordId: string) => {
      const manager = await getSessionManager()
      const { useWorkspaceStore } = await import('./workspace.store')
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId

      if (!activeWorkspaceId) {
        console.warn('[undo.store] No active workspace')
        return false
      }

      const workspace = await manager.getSession(activeWorkspaceId)
      if (!workspace) {
        console.warn('[undo.store] Workspace not found:', activeWorkspaceId)
        return false
      }

      try {
        await workspace.undo(recordId)

        // Refresh state
        const records = workspace.getUndoRecords()
        set({
          undoRecords: records,
          activeCount: records.filter((r) => !r.undone).length,
        })

        // Also update workspace store counts
        useWorkspaceStore.getState().updateCurrentCounts()

        return true
      } catch (e) {
        console.error('[undo.store] Failed to undo:', e)
        return false
      }
    },

    redo: async (recordId: string) => {
      const manager = await getSessionManager()
      const { useWorkspaceStore } = await import('./workspace.store')
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId

      if (!activeWorkspaceId) {
        console.warn('[undo.store] No active workspace')
        return false
      }

      const workspace = await manager.getSession(activeWorkspaceId)
      if (!workspace) {
        console.warn('[undo.store] Workspace not found:', activeWorkspaceId)
        return false
      }

      try {
        await workspace.redo(recordId)

        // Refresh state
        const records = workspace.getUndoRecords()
        set({
          undoRecords: records,
          activeCount: records.filter((r) => !r.undone).length,
        })

        // Also update workspace store counts
        useWorkspaceStore.getState().updateCurrentCounts()

        return true
      } catch (e) {
        console.error('[undo.store] Failed to redo:', e)
        return false
      }
    },

    undoLatest: async () => {
      const { undoRecords } = get()
      if (undoRecords.length === 0) return false

      const latestRecord = undoRecords[0]
      return await get().undo(latestRecord.id)
    },

    redoLatest: async () => {
      const { undoRecords } = get()
      // Find first undone record (oldest undone = most recently undone)
      const undoneRecord = [...undoRecords].reverse().find((r) => r.undone)
      if (!undoneRecord) return false

      return await get().redo(undoneRecord.id)
    },

    clear: () => {
      // Legacy clear for backward compatibility
      legacyManager.clear()

      // For session-aware storage, clear should be called on the workspace directly
      // This is kept for compatibility but should be migrated
      set({ undoRecords: [], activeCount: 0 })
    },
  }
})
