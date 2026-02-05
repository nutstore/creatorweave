/**
 * Workspace Store - manages conversation workspaces
 *
 * This replaces the old Session Store.
 * Each conversation has an associated workspace for file operations.
 *
 * Architecture:
 * - Workspace metadata stored in SQLite (fast, queryable)
 * - File content remains in OPFS (browser-native storage)
 * - Workspace ID matches Conversation ID (1:1 relationship)
 *
 * @module workspace.store
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import type { SessionMetadata } from '@/opfs/types/opfs-types'
import { getSessionManager, SessionWorkspace } from '@/opfs/session'
import { getWorkspaceRepository, type Workspace } from '@/sqlite/repositories/workspace.repository'

// Enable Immer Map/Set support
enableMapSet()

/**
 * Workspace metadata shape from SessionManager (matches InternalSessionMetadata)
 */
interface WorkspaceManagerMetadata {
  workspaceId: string
  rootDirectory: string
  name: string
  createdAt: number
  lastAccessedAt: number
}

/**
 * Get display name for a workspace with fallback strategy
 * Priority: stored name > conversation title > directory name > workspace ID
 */
export function getWorkspaceDisplayName(
  meta: WorkspaceManagerMetadata,
  convTitles: Map<string, string>
): string {
  if (meta.name) {
    return meta.name
  }
  const convTitle = convTitles.get(meta.workspaceId)
  if (convTitle) {
    return convTitle
  }
  return meta.rootDirectory.split('/').pop() || meta.workspaceId
}

/**
 * Extended workspace metadata with runtime statistics
 */
export interface WorkspaceWithStats extends SessionMetadata {
  /** Number of pending changes */
  pendingCount: number
  /** Number of undo records */
  undoCount: number
}

/**
 * Convert SQLite Workspace to WorkspaceWithStats
 */
function sqliteSessionToWorkspaceStats(session: Workspace): WorkspaceWithStats {
  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    lastActiveAt: session.lastAccessedAt,
    cacheSize: session.cacheSize,
    pendingCount: session.pendingCount,
    undoCount: session.undoCount,
    modifiedFiles: session.modifiedFiles,
    status: session.status,
  }
}

/**
 * Workspace store state
 */
interface WorkspaceState {
  /** Current active workspace ID (matches active conversation ID) */
  activeWorkspaceId: string | null

  /** All workspace metadata with stats */
  workspaces: WorkspaceWithStats[]

  /** Current workspace's pending count (for quick access) */
  currentPendingCount: number

  /** Current workspace's undo count (for quick access) */
  currentUndoCount: number

  /** Whether workspaces are being loaded/modified */
  isLoading: boolean

  /** Error message if any operation failed */
  error: string | null

  /** Whether the store has been initialized */
  initialized: boolean

  // Actions

  /** Initialize the store (load workspaces from SQLite, fallback to OPFS) */
  initialize: () => Promise<void>

  /** Create a new workspace (writes to both SQLite and OPFS) */
  createWorkspace: (id: string, rootDirectory: string, name?: string) => Promise<SessionMetadata>

  /** Switch to a different workspace */
  switchWorkspace: (id: string) => Promise<void>

  /** Delete a workspace (deletes from both SQLite and OPFS) */
  deleteWorkspace: (id: string) => Promise<void>

  /** Update workspace name */
  updateWorkspaceName: (id: string, name: string) => Promise<void>

  /** Refresh all workspaces from SQLite */
  refreshWorkspaces: () => Promise<void>

  /** Update current workspace counts (pending/undo) */
  updateCurrentCounts: () => Promise<void>

  /** Clear error state */
  clearError: () => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  immer((set, get) => ({
    activeWorkspaceId: null,
    workspaces: [],
    currentPendingCount: 0,
    currentUndoCount: 0,
    isLoading: false,
    error: null,
    initialized: false,

    initialize: async () => {
      set({ isLoading: true, error: null })

      try {
        const repo = getWorkspaceRepository()
        const manager = await getSessionManager()

        // Try to load from SQLite first
        let workspaces: WorkspaceWithStats[] = []
        let loadedFromSQLite = false

        try {
          const sqliteSessions = await repo.findAllWorkspaces()
          if (sqliteSessions.length > 0) {
            workspaces = sqliteSessions.map(sqliteSessionToWorkspaceStats)
            loadedFromSQLite = true
          }
        } catch (sqliteError) {
          console.warn(
            '[WorkspaceStore] Failed to load from SQLite, falling back to OPFS:',
            sqliteError
          )
        }

        // Fallback: migrate from OPFS if SQLite is empty
        if (!loadedFromSQLite) {
          console.log('[WorkspaceStore] No workspaces in SQLite, migrating from OPFS...')

          // Get conversation titles for better workspace names
          const { useConversationStore } = await import('./conversation.store')
          const conversations = useConversationStore.getState().conversations
          const convTitles = new Map(conversations.map((c) => [c.id, c.title]))

          // Get all workspace metadata from OPFS
          const internalSessions = manager.getAllSessions()

          for (const meta of internalSessions) {
            const workspace = await manager.getSession(meta.sessionId)
            if (!workspace) continue

            // Use fallback strategy for workspace name
            const workspaceName = getWorkspaceDisplayName(
              { workspaceId: meta.sessionId, ...meta },
              convTitles
            )

            // Update the metadata if name was missing and we found a conversation title
            if (!meta.name) {
              const convTitle = convTitles.get(meta.sessionId)
              if (convTitle) {
                await manager.updateSessionName(meta.sessionId, convTitle)
              }
            }

            // Create workspace in SQLite
            try {
              await repo.createWorkspace({
                id: meta.sessionId,
                rootDirectory: meta.rootDirectory,
                name: workspaceName,
                status: 'active',
                cacheSize: 0,
                pendingCount: workspace.pendingCount,
                undoCount: workspace.undoCount,
                modifiedFiles: 0,
              })
            } catch (createError) {
              console.warn(
                `[WorkspaceStore] Failed to create workspace ${meta.sessionId} in SQLite:`,
                createError
              )
            }

            workspaces.push({
              id: meta.sessionId,
              name: workspaceName,
              createdAt: meta.createdAt,
              lastActiveAt: meta.lastAccessedAt,
              cacheSize: 0,
              pendingCount: workspace.pendingCount,
              undoCount: workspace.undoCount,
              modifiedFiles: 0,
              status: 'active',
            })
          }
        }

        // Set first workspace as active if none active
        const activeId = workspaces.length > 0 ? workspaces[0].id : null

        set({
          workspaces,
          activeWorkspaceId: activeId,
          currentPendingCount: activeId ? workspaces[0]?.pendingCount || 0 : 0,
          currentUndoCount: activeId ? workspaces[0]?.undoCount || 0 : 0,
          isLoading: false,
          initialized: true,
        })
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to initialize workspaces'
        set({
          error: message,
          isLoading: false,
          initialized: true,
        })
      }
    },

    createWorkspace: async (id, rootDirectory, name) => {
      set({ isLoading: true, error: null })

      try {
        const repo = getWorkspaceRepository()
        const manager = await getSessionManager()

        // Create OPFS workspace
        const workspace = await manager.createSession(rootDirectory, id)

        // Create SQLite record
        await repo.createWorkspace({
          id,
          rootDirectory,
          name: name || rootDirectory.split('/').pop() || id,
          status: 'active',
          cacheSize: 0,
          pendingCount: workspace.pendingCount,
          undoCount: workspace.undoCount,
          modifiedFiles: 0,
        })

        const newWorkspace: WorkspaceWithStats = {
          id,
          name: name || rootDirectory.split('/').pop() || id,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          cacheSize: 0,
          pendingCount: workspace.pendingCount,
          undoCount: workspace.undoCount,
          modifiedFiles: 0,
          status: 'active',
        }

        set((state) => {
          state.workspaces.unshift(newWorkspace)
          state.activeWorkspaceId = id
          state.currentPendingCount = workspace.pendingCount
          state.currentUndoCount = workspace.undoCount
          state.isLoading = false
        })

        return newWorkspace
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to create workspace'
        set({
          error: message,
          isLoading: false,
        })
        throw new Error(message)
      }
    },

    switchWorkspace: async (id) => {
      // Avoid redundant call if already active
      const currentActiveId = get().activeWorkspaceId
      if (currentActiveId === id) {
        return
      }

      // Capture target conversation ID before async operations to avoid race condition
      const targetConversationId = id

      set({ isLoading: true, error: null })

      try {
        const repo = getWorkspaceRepository()
        const manager = await getSessionManager()

        // Check if workspace exists in SQLite first
        const sessionRecord = await repo.findWorkspaceById(id)

        // If workspace doesn't exist in SQLite, it might be a new conversation
        // that hasn't had its workspace created yet - just return silently
        // The workspace will be created when the agent loop starts
        if (!sessionRecord) {
          set({ isLoading: false })
          return
        }

        // Try to load from OPFS workspace
        const workspace = await manager.getSession(id)

        if (!workspace) {
          // Workspace exists in SQLite but not in OPFS - data inconsistency
          // Clean up the orphaned SQLite record and clear from state
          console.warn(
            `[WorkspaceStore] Workspace ${id} exists in database but OPFS workspace missing. Cleaning up orphaned record.`
          )
          await repo.deleteWorkspace(id)

          // Remove from state if present
          set((state) => {
            state.workspaces = state.workspaces.filter((w) => w.id !== id)
            if (state.activeWorkspaceId === id) {
              state.activeWorkspaceId = null
            }
            state.isLoading = false
          })
          return
        }

        // Update last access time in SQLite
        await repo.updateWorkspaceAccessTime(id)

        // Update workspace metadata
        set((state) => {
          const workspaceIndex = state.workspaces.findIndex((w) => w.id === id)
          if (workspaceIndex >= 0) {
            state.workspaces[workspaceIndex].lastActiveAt = Date.now()
          }
          state.activeWorkspaceId = id
          state.currentPendingCount = workspace.pendingCount
          state.currentUndoCount = workspace.undoCount
          state.isLoading = false
        })

        // Also switch the active conversation to match the workspace
        const { useConversationStore } = await import('./conversation.store')
        // Only call setActive if conversation is different (avoid circular call)
        // Check against captured target to avoid race condition
        const convStore = useConversationStore.getState()
        if (convStore.activeConversationId !== targetConversationId) {
          await convStore.setActive(targetConversationId)
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to switch workspace'
        set({
          error: message,
          isLoading: false,
        })
        throw new Error(message)
      }
    },

    deleteWorkspace: async (id) => {
      set({ isLoading: true, error: null })

      try {
        const repo = getWorkspaceRepository()
        const manager = await getSessionManager()

        // Delete from OPFS
        await manager.deleteSession(id)

        // Delete from SQLite (cascade deletes related records)
        await repo.deleteWorkspace(id)

        let newActiveId: string | null = null

        set((state) => {
          // First, filter to get remaining workspaces
          const remaining = state.workspaces.filter((w) => w.id !== id)
          state.workspaces = remaining

          // If deleted workspace was active, clear active or switch to another
          if (state.activeWorkspaceId === id) {
            newActiveId = remaining.length > 0 ? remaining[0].id : null
            state.activeWorkspaceId = newActiveId
            state.currentPendingCount = remaining.length > 0 ? remaining[0]?.pendingCount || 0 : 0
            state.currentUndoCount = remaining.length > 0 ? remaining[0]?.undoCount || 0 : 0
          }

          state.isLoading = false
        })

        // Also switch the active conversation to match the new workspace
        if (newActiveId !== null) {
          const { useConversationStore } = await import('./conversation.store')
          await useConversationStore.getState().setActive(newActiveId)
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to delete workspace'
        set({
          error: message,
          isLoading: false,
        })
        throw new Error(message)
      }
    },

    updateWorkspaceName: async (id, name) => {
      set({ isLoading: true, error: null })

      try {
        const repo = getWorkspaceRepository()

        // Update in SQLite
        await repo.updateWorkspaceName(id, name)

        // Update local state
        set((state) => {
          const workspace = state.workspaces.find((w) => w.id === id)
          if (workspace) {
            workspace.name = name
          }
          state.isLoading = false
        })
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to update workspace name'
        set({
          error: message,
          isLoading: false,
        })
        throw new Error(message)
      }
    },

    refreshWorkspaces: async () => {
      await get().initialize()
    },

    updateCurrentCounts: async () => {
      const { activeWorkspaceId } = get()
      if (!activeWorkspaceId) return

      try {
        const manager = await getSessionManager()
        const repo = getWorkspaceRepository()
        const workspace = await manager.getSession(activeWorkspaceId)

        if (workspace) {
          // Update counts in SQLite
          await repo.updateWorkspaceStats(activeWorkspaceId, {
            pendingCount: workspace.pendingCount,
            undoCount: workspace.undoCount,
          })

          set((state) => {
            state.currentPendingCount = workspace.pendingCount
            state.currentUndoCount = workspace.undoCount

            // Also update workspace in list
            const w = state.workspaces.find((w) => w.id === activeWorkspaceId)
            if (w) {
              w.pendingCount = workspace.pendingCount
              w.undoCount = workspace.undoCount
            }
          })
        }
      } catch (e) {
        console.error('Failed to update counts:', e)
      }
    },

    clearError: () =>
      set((state) => {
        state.error = null
      }),
  }))
)

/**
 * Get the current active workspace
 */
export async function getActiveWorkspace(): Promise<
  { workspace: SessionWorkspace; workspaceId: string } | undefined
> {
  const { activeWorkspaceId } = useWorkspaceStore.getState()
  if (!activeWorkspaceId) return undefined

  const manager = await getSessionManager()
  const workspace = await manager.getSession(activeWorkspaceId)

  return workspace ? { workspace, workspaceId: activeWorkspaceId } : undefined
}

// Export types
export type { WorkspaceState }
