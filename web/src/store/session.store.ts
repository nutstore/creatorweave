/**
 * Session Store - manages session workspaces
 *
 * Now uses SQLite for metadata and OPFS for file operations:
 * - Session metadata stored in SQLite (fast, queryable)
 * - File content remains in OPFS (browser-native storage)
 * - Dual-write strategy ensures data consistency during migration
 *
 * @module session.store
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import type { SessionMetadata } from '@/opfs/types/opfs-types'
import { getSessionManager, SessionWorkspace } from '@/opfs/session'
import { getSessionRepository } from '@/sqlite'
import type { Session } from '@/sqlite/repositories/session.repository'

// Enable Immer Map/Set support
enableMapSet()

/** Default conversation name when title is not available */
export const DEFAULT_CONVERSATION_NAME = '对话'

/**
 * Session metadata shape from SessionManager (matches InternalSessionMetadata)
 */
interface SessionManagerMetadata {
  sessionId: string
  rootDirectory: string
  name: string
  createdAt: number
  lastAccessedAt: number
}

/**
 * Get display name for a session with fallback strategy
 * Priority: stored name > conversation title > directory name > session ID
 */
export function getSessionDisplayName(
  meta: SessionManagerMetadata,
  convTitles: Map<string, string>
): string {
  if (meta.name) {
    return meta.name
  }
  const convTitle = convTitles.get(meta.sessionId)
  if (convTitle) {
    return convTitle
  }
  return meta.rootDirectory.split('/').pop() || meta.sessionId
}

/**
 * Extended session metadata with runtime statistics
 */
export interface SessionWithStats extends SessionMetadata {
  /** Number of pending changes */
  pendingCount: number
  /** Number of undo records */
  undoCount: number
}

/**
 * Convert SQLite Session to SessionWithStats
 */
function sqliteSessionToWithStats(session: Session): SessionWithStats {
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
 * Session store state
 */
interface SessionState {
  /** Current active session ID */
  activeSessionId: string | null

  /** All session metadata with stats */
  sessions: SessionWithStats[]

  /** Current session's pending count (for quick access) */
  currentPendingCount: number

  /** Current session's undo count (for quick access) */
  currentUndoCount: number

  /** Whether sessions are being loaded/modified */
  isLoading: boolean

  /** Error message if any operation failed */
  error: string | null

  /** Whether the store has been initialized */
  initialized: boolean

  // Actions

  /** Initialize the store (load sessions from SQLite, fallback to OPFS) */
  initialize: () => Promise<void>

  /** Create a new session (writes to both SQLite and OPFS) */
  createSession: (id: string, rootDirectory: string, name?: string) => Promise<SessionMetadata>

  /** Switch to a different session */
  switchSession: (id: string) => Promise<void>

  /** Delete a session (deletes from both SQLite and OPFS) */
  deleteSession: (id: string) => Promise<void>

  /** Update session name */
  updateSessionName: (id: string, name: string) => Promise<void>

  /** Refresh all sessions from SQLite */
  refreshSessions: () => Promise<void>

  /** Update current session counts (pending/undo) */
  updateCurrentCounts: () => Promise<void>

  /** Clear error state */
  clearError: () => void
}

export const useSessionStore = create<SessionState>()(
  immer((set, get) => ({
    activeSessionId: null,
    sessions: [],
    currentPendingCount: 0,
    currentUndoCount: 0,
    isLoading: false,
    error: null,
    initialized: false,

    initialize: async () => {
      set({ isLoading: true, error: null })

      try {
        const repo = getSessionRepository()
        const manager = await getSessionManager()

        // Try to load from SQLite first
        let sessions: SessionWithStats[] = []
        let loadedFromSQLite = false

        try {
          const sqliteSessions = await repo.findAllSessions()
          if (sqliteSessions.length > 0) {
            sessions = sqliteSessions.map(sqliteSessionToWithStats)
            loadedFromSQLite = true
          }
        } catch (sqliteError) {
          console.warn(
            '[SessionStore] Failed to load from SQLite, falling back to OPFS:',
            sqliteError
          )
        }

        // Fallback: migrate from OPFS if SQLite is empty
        if (!loadedFromSQLite) {
          console.log('[SessionStore] No sessions in SQLite, migrating from OPFS...')

          // Get conversation titles for better session names
          const { useConversationStore } = await import('./conversation.store')
          const conversations = useConversationStore.getState().conversations
          const convTitles = new Map(conversations.map((c) => [c.id, c.title]))

          // Get all session metadata from OPFS
          const internalSessions = manager.getAllSessions()

          for (const meta of internalSessions) {
            const workspace = await manager.getSession(meta.sessionId)
            if (!workspace) continue

            // Use fallback strategy for session name
            const sessionName = getSessionDisplayName(meta, convTitles)

            // Update the metadata if name was missing and we found a conversation title
            if (!meta.name) {
              const convTitle = convTitles.get(meta.sessionId)
              if (convTitle) {
                await manager.updateSessionName(meta.sessionId, convTitle)
              }
            }

            // Create session in SQLite
            try {
              await repo.createSession({
                id: meta.sessionId,
                rootDirectory: meta.rootDirectory,
                name: sessionName,
                status: 'active',
                cacheSize: 0,
                pendingCount: workspace.pendingCount,
                undoCount: workspace.undoCount,
                modifiedFiles: 0,
              })
            } catch (createError) {
              console.warn(
                `[SessionStore] Failed to create session ${meta.sessionId} in SQLite:`,
                createError
              )
            }

            sessions.push({
              id: meta.sessionId,
              name: sessionName,
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

        // Set first session as active if none active
        const activeId = sessions.length > 0 ? sessions[0].id : null

        set({
          sessions,
          activeSessionId: activeId,
          currentPendingCount: activeId ? sessions[0]?.pendingCount || 0 : 0,
          currentUndoCount: activeId ? sessions[0]?.undoCount || 0 : 0,
          isLoading: false,
          initialized: true,
        })
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to initialize sessions'
        set({
          error: message,
          isLoading: false,
          initialized: true,
        })
      }
    },

    createSession: async (id, rootDirectory, name) => {
      set({ isLoading: true, error: null })

      try {
        const repo = getSessionRepository()
        const manager = await getSessionManager()

        // Create OPFS workspace
        const workspace = await manager.createSession(rootDirectory, id)

        // Create SQLite record
        await repo.createSession({
          id,
          rootDirectory,
          name: name || rootDirectory.split('/').pop() || id,
          status: 'active',
          cacheSize: 0,
          pendingCount: workspace.pendingCount,
          undoCount: workspace.undoCount,
          modifiedFiles: 0,
        })

        const newSession: SessionWithStats = {
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
          state.sessions.unshift(newSession)
          state.activeSessionId = id
          state.currentPendingCount = workspace.pendingCount
          state.currentUndoCount = workspace.undoCount
          state.isLoading = false
        })

        return newSession
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to create session'
        set({
          error: message,
          isLoading: false,
        })
        throw new Error(message)
      }
    },

    switchSession: async (id) => {
      // Avoid redundant call if already active
      const currentActiveId = get().activeSessionId
      if (currentActiveId === id) {
        return
      }

      // Capture target conversation ID before async operations to avoid race condition
      const targetConversationId = id

      set({ isLoading: true, error: null })

      try {
        const repo = getSessionRepository()
        const manager = await getSessionManager()
        const workspace = await manager.getSession(id)

        if (!workspace) {
          throw new Error(`Session ${id} not found`)
        }

        // Update last access time in SQLite
        await repo.updateSessionAccessTime(id)

        // Update session metadata
        set((state) => {
          const sessionIndex = state.sessions.findIndex((s) => s.id === id)
          if (sessionIndex >= 0) {
            state.sessions[sessionIndex].lastActiveAt = Date.now()
          }
          state.activeSessionId = id
          state.currentPendingCount = workspace.pendingCount
          state.currentUndoCount = workspace.undoCount
          state.isLoading = false
        })

        // Also switch the active conversation to match the session
        const { useConversationStore } = await import('./conversation.store')
        // Only call setActive if conversation is different (avoid circular call)
        // Check against captured target to avoid race condition
        const convStore = useConversationStore.getState()
        if (convStore.activeConversationId !== targetConversationId) {
          await convStore.setActive(targetConversationId)
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to switch session'
        set({
          error: message,
          isLoading: false,
        })
        throw new Error(message)
      }
    },

    deleteSession: async (id) => {
      set({ isLoading: true, error: null })

      try {
        const repo = getSessionRepository()
        const manager = await getSessionManager()

        // Delete from OPFS
        await manager.deleteSession(id)

        // Delete from SQLite (cascade deletes related records)
        await repo.deleteSession(id)

        let newActiveId: string | null = null

        set((state) => {
          // First, filter to get remaining sessions
          const remaining = state.sessions.filter((s) => s.id !== id)
          state.sessions = remaining

          // If deleted session was active, clear active or switch to another
          if (state.activeSessionId === id) {
            newActiveId = remaining.length > 0 ? remaining[0].id : null
            state.activeSessionId = newActiveId
            state.currentPendingCount = remaining.length > 0 ? remaining[0]?.pendingCount || 0 : 0
            state.currentUndoCount = remaining.length > 0 ? remaining[0]?.undoCount || 0 : 0
          }

          state.isLoading = false
        })

        // Also switch the active conversation to match the new session
        if (newActiveId !== null) {
          const { useConversationStore } = await import('./conversation.store')
          await useConversationStore.getState().setActive(newActiveId)
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to delete session'
        set({
          error: message,
          isLoading: false,
        })
        throw new Error(message)
      }
    },

    updateSessionName: async (id, name) => {
      set({ isLoading: true, error: null })

      try {
        const repo = getSessionRepository()

        // Update in SQLite
        await repo.updateSessionName(id, name)

        // Update local state
        set((state) => {
          const session = state.sessions.find((s) => s.id === id)
          if (session) {
            session.name = name
          }
          state.isLoading = false
        })
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to update session name'
        set({
          error: message,
          isLoading: false,
        })
        throw new Error(message)
      }
    },

    refreshSessions: async () => {
      await get().initialize()
    },

    updateCurrentCounts: async () => {
      const { activeSessionId } = get()
      if (!activeSessionId) return

      try {
        const manager = await getSessionManager()
        const repo = getSessionRepository()
        const workspace = await manager.getSession(activeSessionId)

        if (workspace) {
          // Update counts in SQLite
          await repo.updateSessionStats(activeSessionId, {
            pendingCount: workspace.pendingCount,
            undoCount: workspace.undoCount,
          })

          set((state) => {
            state.currentPendingCount = workspace.pendingCount
            state.currentUndoCount = workspace.undoCount

            // Also update session in list
            const session = state.sessions.find((s) => s.id === activeSessionId)
            if (session) {
              session.pendingCount = workspace.pendingCount
              session.undoCount = workspace.undoCount
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
 * Hook to get the current active session workspace
 */
export async function getActiveSessionWorkspace(): Promise<
  { workspace: SessionWorkspace; sessionId: string } | undefined
> {
  const { activeSessionId } = useSessionStore.getState()
  if (!activeSessionId) return undefined

  const manager = await getSessionManager()
  const workspace = await manager.getSession(activeSessionId)

  return workspace ? { workspace, sessionId: activeSessionId } : undefined
}
