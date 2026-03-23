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
import type { SessionMetadata, ChangeDetectionResult } from '@/opfs/types/opfs-types'
import { getSessionManager, SessionWorkspace } from '@/opfs/session'
import { getWorkspaceRepository, type Workspace } from '@/sqlite/repositories/workspace.repository'
import { getProjectRepository } from '@/sqlite/repositories/project.repository'
import {
  requestDirectoryAccess,
  releaseDirectoryHandle,
  bindRuntimeDirectoryHandle,
} from '@/native-fs'
import { toast } from 'sonner'

// De-duplicate concurrent pending-change scans across UI/tool triggers.
let refreshPendingChangesInFlight: Promise<void> | null = null
let refreshPendingChangesNeedsRerun = false
let refreshPendingChangesRerunSilent = true

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
    modifiedFiles: session.modifiedFiles,
    status: session.status,
  }
}

async function resolveActiveProjectId(): Promise<string | null> {
  const projectRepo = getProjectRepository()
  const activeProject = await projectRepo.findActiveProject()
  return activeProject?.id || null
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

  /** Whether workspaces are being loaded/modified */
  isLoading: boolean

  /** Error message if any operation failed */
  error: string | null

  /** Whether store has been initialized */
  initialized: boolean

  /** Pending file changes from Python execution (for sync preview UI) */
  pendingChanges: ChangeDetectionResult | null

  /** Whether sync preview panel is currently shown */
  showPreview: boolean
  /** Optional preselected file path for change review panel */
  previewSelectedPath: string | null

  /** Whether workspace has valid native FS directory handle */
  hasDirectoryHandle: boolean

  /** Whether sync preview is enabled/disabled */
  isSyncPreviewEnabled: boolean

  /** ID of workspace currently being switched to (prevents concurrent switches) */
  switchingWorkspaceId: string | null

  // Actions

  /** Initialize store (load workspaces from SQLite, fallback to OPFS) */
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

  /** Add file changes from Python execution */
  addChanges: (changes: ChangeDetectionResult) => void

  /** Clear pending changes without syncing (discard pending ledger entries) */
  clearChanges: () => Promise<void>

  /** Discard one pending path without syncing */
  discardPendingPath: (path: string) => Promise<void>

  /** Show the sync preview panel */
  showPreviewPanel: () => void
  /** Show preview panel and preselect a file path */
  showPreviewPanelForPath: (path: string) => void

  /** Hide the sync preview panel (without clearing changes) */
  hidePreviewPanel: () => void
  /** Clear preselected file path for review panel */
  clearPreviewSelectedPath: () => void

  /**
   * Refresh pending changes - independent of Python tool execution
   * Scans OPFS and updates pendingChanges with any new/modified/deleted files
   */
  refreshPendingChanges: (silent?: boolean) => Promise<void>

  /** Get current pending changes */
  getPendingChanges: () => ChangeDetectionResult | null

  /** Request directory access for native filesystem sync */
  requestDirectoryAccess: () => Promise<void>

  /** Release directory handle */
  releaseDirectoryHandle: () => Promise<void>

  /** Enable/disable sync preview UI */
  setSyncPreviewEnabled: (enabled: boolean) => void

  /** Get sync preview state */
  getSyncPreviewEnabled: () => boolean
}

export const useWorkspaceStore = create<WorkspaceState>()(
  immer((set, get) => ({
        activeWorkspaceId: null,
        workspaces: [],
        currentPendingCount: 0,
        isLoading: false,
        error: null,
        initialized: false,
        pendingChanges: null,
        showPreview: false,
        previewSelectedPath: null,
        hasDirectoryHandle: false,
        isSyncPreviewEnabled: true,
        switchingWorkspaceId: null,

        //=============================================================================
        // Actions
        //=============================================================================

        initialize: async () => {
          const started = performance.now()
          console.log('[WorkspaceStore] initialize start')
          set({ isLoading: true, error: null })

          try {
            const repo = getWorkspaceRepository()
            const activeProjectId = await resolveActiveProjectId()

            if (!activeProjectId) {
              set({
                workspaces: [],
                activeWorkspaceId: null,
                currentPendingCount: 0,
                isLoading: false,
                initialized: true,
              })
              console.log(
                `[WorkspaceStore] initialize done (${Math.round(performance.now() - started)}ms)`,
                { activeProjectId: null, workspaceCount: 0 }
              )
              return
            }

            // Load from SQLite only (no OPFS auto-migration in current dev phase)
            let workspaces: WorkspaceWithStats[] = []
            const sqliteSessions = await repo.findWorkspacesByProject(activeProjectId)
            if (sqliteSessions.length > 0) {
              workspaces = sqliteSessions.map(sqliteSessionToWorkspaceStats)
            }

            // Set first workspace as active if none active
            const activeId = workspaces.length > 0 ? workspaces[0].id : null

            set({
              workspaces,
              activeWorkspaceId: activeId,
              currentPendingCount: activeId ? workspaces[0]?.pendingCount || 0 : 0,
              isLoading: false,
              initialized: true,
            })
            console.log(
              `[WorkspaceStore] initialize done (${Math.round(performance.now() - started)}ms)`,
              { activeProjectId, workspaceCount: workspaces.length }
            )
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to initialize workspaces'
            set({
              error: message,
              isLoading: false,
              initialized: true,
            })
            console.error(
              `[WorkspaceStore] initialize failed (${Math.round(performance.now() - started)}ms):`,
              message
            )
          }
        },

        createWorkspace: async (id, rootDirectory, name) => {
          set({ isLoading: true, error: null })

          try {
            const repo = getWorkspaceRepository()
            const activeProjectId = await resolveActiveProjectId()
            if (!activeProjectId) {
              throw new Error('No active project selected')
            }
            const manager = await getSessionManager()

            // Create OPFS workspace
            const workspace = await manager.createSession(rootDirectory, id)

            // Create SQLite record
            await repo.createWorkspace({
              id,
              projectId: activeProjectId,
              rootDirectory,
              name: name || rootDirectory.split('/').pop() || id,
              status: 'active',
              cacheSize: 0,
              pendingCount: workspace.pendingCount,
              modifiedFiles: 0,
            })

            const newWorkspace: WorkspaceWithStats = {
              id,
              name: name || rootDirectory.split('/').pop() || id,
              createdAt: Date.now(),
              lastActiveAt: Date.now(),
              cacheSize: 0,
              pendingCount: workspace.pendingCount,
              modifiedFiles: 0,
              status: 'active',
            }

            set({
              workspaces: [newWorkspace, ...get().workspaces],
              activeWorkspaceId: id,
              currentPendingCount: workspace.pendingCount,
              isLoading: false,
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

          // Prevent concurrent switch operations
          const switchingId = get().switchingWorkspaceId
          if (switchingId && switchingId !== id) {
            console.warn(`[WorkspaceStore] Switching to ${id} while already switching to ${switchingId}, waiting...`)
            // Wait for the current switch to complete, then check if we need to switch again
            await new Promise<void>((resolve) => {
              const checkInterval = setInterval(() => {
                if (get().switchingWorkspaceId !== switchingId) {
                  clearInterval(checkInterval)
                  resolve()
                }
              }, 100)
            })
            // After waiting, check if we're now on the desired workspace
            if (get().activeWorkspaceId === id) {
              return
            }
          }

          // Set switching lock
          set({ switchingWorkspaceId: id, isLoading: true, error: null })

          // Capture target conversation ID before async operations to avoid race condition
          const targetConversationId = id

          try {
            const repo = getWorkspaceRepository()
            const activeProjectId = await resolveActiveProjectId()
            if (!activeProjectId) {
              throw new Error('No active project selected')
            }
            const manager = await getSessionManager()

            // Check if workspace exists in SQLite first
            const sessionRecord = await repo.findWorkspaceById(id)

            // If workspace doesn't exist in SQLite, it's a new conversation
            // We need to create the workspace OPFS structure immediately
            if (!sessionRecord) {
              console.log(`[WorkspaceStore] Creating new workspace for conversation: ${id}`)

              // Create OPFS workspace using conversation ID as root directory
              // Each conversation gets its own isolated workspace directory
              const rootDirectory = `workspaces/${id}`

              // Create the workspace (this creates OPFS structure and adds to SQLite)
              const workspace = await manager.createSession(rootDirectory, id)

              // Get conversation title for workspace name
              const { useConversationStore } = await import('./conversation.store')
              const conversations = useConversationStore.getState().conversations
              const convTitle = conversations.find((c) => c.id === id)?.title

              // Create workspace in SQLite
              await repo.createWorkspace({
                id,
                projectId: activeProjectId,
                rootDirectory,
                name: convTitle || id,
                status: 'active',
                cacheSize: 0,
                pendingCount: workspace.pendingCount,
                modifiedFiles: 0,
              })

              const newWorkspace: WorkspaceWithStats = {
                id,
                name: convTitle || id,
                createdAt: Date.now(),
                lastActiveAt: Date.now(),
                cacheSize: 0,
                pendingCount: workspace.pendingCount,
                modifiedFiles: 0,
                status: 'active',
              }

              set({
                workspaces: [newWorkspace, ...get().workspaces],
                activeWorkspaceId: id,
                currentPendingCount: workspace.pendingCount,
                isLoading: false,
              })

              // Also switch active conversation
              const convStore = useConversationStore.getState()
              if (convStore.activeConversationId !== id) {
                await convStore.setActive(id)
              }

              await get().refreshPendingChanges(true)

              return
            }

            // Try to load from OPFS workspace
            const workspace = await manager.getSession(id)

            if (!workspace) {
              // Workspace exists in SQLite but not in OPFS - data inconsistency
              // This can happen if OPFS was cleared or corrupted
              // Recreate the workspace to fix the inconsistency
              console.warn(
                `[WorkspaceStore] Workspace ${id} exists in database but OPFS workspace missing. Recreating...`
              )

              // Get the session record to retrieve root directory
              const sessionRecord = await repo.findWorkspaceById(id)
              if (!sessionRecord) {
                console.error(`[WorkspaceStore] Cannot recreate workspace ${id}: no record in database`)
                await repo.deleteWorkspace(id)
                set({
                  workspaces: get().workspaces.filter((w) => w.id !== id),
                  activeWorkspaceId: get().activeWorkspaceId === id ? null : get().activeWorkspaceId,
                  isLoading: false,
                })
                return
              }

              // Recreate the workspace
              const newWorkspace = await manager.createSession(sessionRecord.rootDirectory, id)

              // Update the workspace in SQLite with fresh stats
              await repo.updateWorkspaceStats(id, {
                pendingCount: newWorkspace.pendingCount,
                modifiedFiles: 0,
              })

              set({
                workspaces: get().workspaces.map((w) =>
                  w.id === id
                    ? {
                        id,
                        name: sessionRecord.name,
                        createdAt: sessionRecord.createdAt,
                        lastActiveAt: Date.now(),
                        cacheSize: 0,
                        pendingCount: newWorkspace.pendingCount,
                        modifiedFiles: 0,
                        status: 'active',
                      }
                    : w
                ),
                activeWorkspaceId: id,
                currentPendingCount: newWorkspace.pendingCount,
                isLoading: false,
              })

              // Also switch active conversation
              const { useConversationStore } = await import('./conversation.store')
              const convStore = useConversationStore.getState()
              if (convStore.activeConversationId !== id) {
                await convStore.setActive(id)
              }

              await get().refreshPendingChanges(true)

              return
            }

            // Update last access time in SQLite
            await repo.updateWorkspaceAccessTime(id)

            set({
              workspaces: get().workspaces.map((w) =>
                w.id === id ? { ...w, lastActiveAt: Date.now() } : w
              ),
              activeWorkspaceId: id,
              currentPendingCount: workspace.pendingCount,
              isLoading: false,
              switchingWorkspaceId: null,
            })

            // Also switch active conversation to match workspace
            const { useConversationStore } = await import('./conversation.store')
            // Only call setActive if conversation is different (avoid circular call)
            // Check against captured target to avoid race condition
            const convStore = useConversationStore.getState()
            if (convStore.activeConversationId !== targetConversationId) {
              await convStore.setActive(targetConversationId)
            }

            await get().refreshPendingChanges(true)
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to switch workspace'
            set({
              error: message,
              isLoading: false,
              switchingWorkspaceId: null,
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

            const currentWorkspaces = get().workspaces
            const remaining = currentWorkspaces.filter((w) => w.id !== id)
            const newActiveId =
              get().activeWorkspaceId === id
                ? remaining.length > 0
                  ? remaining[0].id
                  : null
                : get().activeWorkspaceId

            set({
              workspaces: remaining,
              activeWorkspaceId: newActiveId,
              currentPendingCount:
                newActiveId && remaining.length > 0 ? remaining[0]?.pendingCount || 0 : 0,
              isLoading: false,
            })

            // Also switch active conversation to match new workspace
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
            set({
              workspaces: get().workspaces.map((w) =>
                w.id === id ? { ...w, name } : w
              ),
              isLoading: false,
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
          const activeWorkspaceId = get().activeWorkspaceId
          if (!activeWorkspaceId) return

          try {
            const manager = await getSessionManager()
            const repo = getWorkspaceRepository()
            const workspace = await manager.getSession(activeWorkspaceId)

            if (workspace) {
              // Update counts in SQLite
              await repo.updateWorkspaceStats(activeWorkspaceId, {
                pendingCount: workspace.pendingCount,
              })

              set({
                currentPendingCount: workspace.pendingCount,
                workspaces: get().workspaces.map((w) =>
                  w.id === activeWorkspaceId
                    ? { ...w, pendingCount: workspace.pendingCount }
                    : w
                ),
              })
            }
          } catch (e) {
            console.error('Failed to update counts:', e)
          }
        },

        clearError: () => {
          set({ error: null })
        },

        addChanges: (changes: ChangeDetectionResult) => {
          set({ pendingChanges: changes })
          // Also refresh OPFS store so FileTreePanel updates (fire-and-forget)
          ;(async () => {
            try {
              const { useOPFSStore } = await import('./opfs.store')
              useOPFSStore.getState().refresh()
            } catch (e) {
              console.warn('[WorkspaceStore] Failed to refresh OPFS store:', e)
            }
          })()
        },

        clearChanges: async () => {
          const activeWorkspace = await getActiveWorkspace()
          if (activeWorkspace) {
            await activeWorkspace.workspace.discardAllPendingChanges()
            await get().updateCurrentCounts()
          }
          set({ pendingChanges: null, showPreview: false })
          // Also refresh OPFS store so FileTreePanel updates
          try {
            const { useOPFSStore } = await import('./opfs.store')
            await useOPFSStore.getState().refresh()
          } catch (e) {
            console.warn('[WorkspaceStore] Failed to refresh OPFS store:', e)
          }
        },

        discardPendingPath: async (path: string) => {
          const activeWorkspace = await getActiveWorkspace()
          if (!activeWorkspace) return

          await activeWorkspace.workspace.discardPendingPath(path)
          await get().updateCurrentCounts()

          // Refresh pending list from source-of-truth ledger.
          await get().refreshPendingChanges(true)
        },

        showPreviewPanel: () => {
          set({ showPreview: true })
        },

        showPreviewPanelForPath: (path: string) => {
          set({ showPreview: true, previewSelectedPath: path })
        },

        hidePreviewPanel: () => {
          set({ showPreview: false, previewSelectedPath: null })
        },

        clearPreviewSelectedPath: () => {
          set({ previewSelectedPath: null })
        },

        refreshPendingChanges: async (silent = false) => {
          if (refreshPendingChangesInFlight) {
            refreshPendingChangesNeedsRerun = true
            refreshPendingChangesRerunSilent = refreshPendingChangesRerunSilent && silent
            return refreshPendingChangesInFlight
          }

          refreshPendingChangesRerunSilent = true

          refreshPendingChangesInFlight = (async () => {
            const activeWorkspace = await getActiveWorkspace()
            if (!activeWorkspace) return

            const changes = await activeWorkspace.workspace.refreshPendingChanges()
            const hasChanges = changes && changes.changes.length > 0
            const pendingCount = changes?.changes.length ?? 0
            set((state) => ({
              pendingChanges: changes,
              currentPendingCount:
                state.activeWorkspaceId === activeWorkspace.workspaceId
                  ? pendingCount
                  : state.currentPendingCount,
              workspaces: state.workspaces.map((w) =>
                w.id === activeWorkspace.workspaceId ? { ...w, pendingCount } : w
              ),
              // Keep current panel state when there are changes; only auto-close when empty.
              showPreview: hasChanges ? state.showPreview : false,
            }))

            // Also refresh OPFS store so FileTreePanel updates (it subscribes to opfs.store.pendingChanges)
            try {
              const { useOPFSStore } = await import('./opfs.store')
              await useOPFSStore.getState().refresh()
            } catch (e) {
              console.warn('[WorkspaceStore] Failed to refresh OPFS store:', e)
            }

            // Show toast notification when changes are detected
            if (!silent && hasChanges && changes) {
              const changeCount = changes.changes.length
              const message = changeCount === 1
                ? '检测到 1 个文件变更，请查看变更待审阅'
                : `检测到 ${changeCount} 个文件变更，请查看变更待审阅`

              toast(message, {
                action: {
                  label: '查看',
                  onClick: () => {
                    set({ showPreview: true })
                  },
                },
                duration: 5000,
              })
            }
          })()

          try {
            await refreshPendingChangesInFlight
          } finally {
            refreshPendingChangesInFlight = null
            if (refreshPendingChangesNeedsRerun) {
              const rerunSilent = refreshPendingChangesRerunSilent
              refreshPendingChangesNeedsRerun = false
              refreshPendingChangesRerunSilent = true
              await get().refreshPendingChanges(rerunSilent)
            }
          }
        },

        getPendingChanges: () => {
          return get().pendingChanges
        },

        setSyncPreviewEnabled: (enabled: boolean) => {
          set({ isSyncPreviewEnabled: enabled })
        },

        getSyncPreviewEnabled: () => {
          return get().isSyncPreviewEnabled
        },

        requestDirectoryAccess: async () => {
          const activeProjectId = await resolveActiveProjectId()
          if (!activeProjectId) return
          const activeWorkspaceId = get().activeWorkspaceId

          set({ isLoading: true, error: null })

          try {
            // Request directory access from user
            const handle = await requestDirectoryAccess(activeProjectId, {
              mode: 'readwrite',
              startIn: '/',
            })

            if (handle) {
              // Bind handle for both project scope and active workspace scope.
              // SessionWorkspace reads by workspace/session id.
              bindRuntimeDirectoryHandle(activeProjectId, handle)
              if (activeWorkspaceId) {
                bindRuntimeDirectoryHandle(activeWorkspaceId, handle)
              }

              // Store handle and update state
              set({
                hasDirectoryHandle: true,
                isLoading: false,
              })
            } else {
              // User cancelled
              set({ isLoading: false })
            }
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to request directory access'
            set({
              error: message,
              isLoading: false,
            })
          }
        },

        releaseDirectoryHandle: async () => {
          const activeProjectId = await resolveActiveProjectId()
          if (!activeProjectId) return

          try {
            await releaseDirectoryHandle(activeProjectId)
            set({ hasDirectoryHandle: false })
          } catch (e) {
            console.error('Failed to release directory handle:', e)
          }
        },
      })
)
)

/**
 * Get current active workspace
 */
export async function getActiveWorkspace(): Promise<
  { workspace: SessionWorkspace; workspaceId: string } | undefined
> {
  const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
  if (!activeWorkspaceId) return undefined

  const manager = await getSessionManager()
  const workspace = await manager.getSession(activeWorkspaceId)

  return workspace ? { workspace, workspaceId: activeWorkspaceId } : undefined
}

// Export types
export type { WorkspaceState }
