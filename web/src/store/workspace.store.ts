/**
 * Workspace Store - manages local workspaces
 *
 * This replaces the old local Session store semantics.
 * Each workspace has an associated OPFS runtime for file operations.
 *
 * Architecture:
 * - Workspace metadata stored in SQLite (fast, queryable)
 * - File content remains in OPFS (browser-native storage)
 * - Workspace ID is the canonical local runtime context ID
 *
 * @module workspace.store
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { WorkspaceMetadata, ChangeDetectionResult } from '@/opfs/types/opfs-types'
import { getWorkspaceManager, WorkspaceFiles } from '@/opfs'
import { getWorkspaceRepository, type Workspace } from '@/sqlite/repositories/workspace.repository'
import { getFSOverlayRepository } from '@/sqlite/repositories/fs-overlay.repository'
import {
  requestDirectoryAccess,
  releaseDirectoryHandle,
  bindRuntimeDirectoryHandle,
  getRuntimeHandlesForProject,
} from '@/native-fs'
import { getToolRegistry } from '@/agent/tool-registry'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Promise-based switch notification (replaces setInterval busy-wait polling).
// When a workspace switch completes, all waiters for that workspace ID are
// resolved immediately — zero CPU overhead compared to 100ms polling.
// ---------------------------------------------------------------------------
const switchWaiters = new Map<string, Array<() => void>>()

function notifySwitchComplete(workspaceId: string): void {
  const waiters = switchWaiters.get(workspaceId)
  if (waiters) {
    switchWaiters.delete(workspaceId)
    waiters.forEach((resolve) => resolve())
  }
}

function waitForSwitchComplete(workspaceId: string, timeoutMs = 30000): Promise<void> {
  return new Promise<void>((resolve) => {
    // Timeout guard: if notifySwitchComplete is never called (e.g. unexpected
    // error path), we still resolve so callers don't hang forever.
    const timer = setTimeout(() => {
      const waiters = switchWaiters.get(workspaceId)
      if (waiters) {
        const idx = waiters.indexOf(wrappedResolve)
        if (idx >= 0) waiters.splice(idx, 1)
        if (waiters.length === 0) switchWaiters.delete(workspaceId)
      }
      resolve()
    }, timeoutMs)

    const wrappedResolve = () => {
      clearTimeout(timer)
      resolve()
    }

    if (!switchWaiters.has(workspaceId)) {
      switchWaiters.set(workspaceId, [])
    }
    switchWaiters.get(workspaceId)!.push(wrappedResolve)
  })
}

// ---------------------------------------------------------------------------
// PENDING_RESET_PATCH — single source of truth for workspace-derived runtime
// state that must be cleared whenever the active workspace (or project)
// changes. These fields all describe the *current* workspace's data; if they
// leak across a switch, the UI shows stale badge counts, pending file lists,
// unsynced-snapshot toasts, etc.
//
// NOT included here (persisted user preferences): `isSyncPreviewEnabled`,
// `pinnedWorkspaceIds`.
// NOT included here (set contextually by callers): `activeWorkspaceId`,
// `workspaces`, `initialized`, `isLoading`.
// ---------------------------------------------------------------------------
export const PENDING_RESET_PATCH: Partial<WorkspaceState> = {
  currentPendingCount: 0,
  pendingChanges: null,
  showPreview: false,
  previewSelectedPath: null,
  switchingWorkspaceId: null,
  unsyncedSnapshots: [],
  opfsOnlyFileCount: 0,
  opfsOnlyFilesPaths: [],
  hasDirectoryHandle: false,
  error: null,
}

/**
 * Derive `hasDirectoryHandle` from the live in-memory runtime handle table.
 *
 * `PENDING_RESET_PATCH` hard-codes `hasDirectoryHandle: false`. Any store
 * reset that spreads `...PENDING_RESET_PATCH` will clobber the field to false
 * unless it is explicitly re-derived afterwards. This helper centralizes the
 * re-derivation so every reset site (initialize early-return, initialize
 * catch, switchWorkspace reset) stays consistent with the already-mounted
 * native directory.
 *
 * Returns false on error so callers can safely use it as a fallback.
 */
async function deriveLiveHasDirectoryHandle(activeProjectId: string | null): Promise<boolean> {
  if (!activeProjectId) return false
  try {
    const { getRuntimeHandlesForProject } = await import('@/native-fs')
    return getRuntimeHandlesForProject(activeProjectId).size > 0
  } catch {
    return false
  }
}

// De-duplicate concurrent pending-change scans across UI/tool triggers.
let refreshPendingChangesInFlight: Promise<void> | null = null
let refreshPendingChangesNeedsRerun = false
let refreshPendingChangesRerunSilent = true

/**
 * Workspace metadata shape from OPFS workspace manager.
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
 * Priority: stored name > workspace title > directory name > workspace ID
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
export interface WorkspaceWithStats extends WorkspaceMetadata {
  /** Number of pending changes */
  pendingCount: number
}

/**
 * Sort workspaces for sidebar display: pinned items first (in pinned order),
 * then unpinned items by lastAccessedAt desc.
 *
 * IMPORTANT: pinned items sort by their position in `pinnedIds` — NOT by
 * lastAccessedAt. This is what keeps the pinned section stable across page
 * refreshes: a `switchWorkspace` touch during syncFromRoute must not reorder
 * pinned items relative to each other.
 */
export function sortWorkspacesForDisplay(
  workspaces: WorkspaceWithStats[],
  pinnedIds: string[]
): WorkspaceWithStats[] {
  const pinnedOrder = new Map<string, number>()
  pinnedIds.forEach((id, index) => pinnedOrder.set(id, index))
  const pinnedSet = new Set(pinnedIds)
  return [...workspaces].sort((a, b) => {
    const aPinned = pinnedSet.has(a.id)
    const bPinned = pinnedSet.has(b.id)
    if (aPinned && bPinned) {
      // Both pinned → preserve pinning order (stable, not time-based)
      return (pinnedOrder.get(a.id) ?? 0) - (pinnedOrder.get(b.id) ?? 0)
    }
    if (aPinned) return -1
    if (bPinned) return 1
    // Neither pinned → most recently accessed first
    return (b.lastAccessedAt ?? 0) - (a.lastAccessedAt ?? 0)
  })
}

/**
 * Convert SQLite Workspace to WorkspaceWithStats
 */
function sqliteWorkspaceToWorkspaceStats(workspace: Workspace): WorkspaceWithStats {
  return {
    id: workspace.id,
    name: workspace.name,
    createdAt: workspace.createdAt,
    lastAccessedAt: workspace.lastAccessedAt,
    cacheSize: workspace.cacheSize,
    pendingCount: workspace.pendingCount,
    modifiedFiles: workspace.modifiedFiles,
    status: workspace.status,
  }
}

async function resolveActiveProjectId(): Promise<string | null> {
  // PR-B: active project is URL-driven, mirrored into the project store by
  // App.tsx's syncFromRoute. Read it directly from the store instead of
  // querying a (now-removed) persisted singleton table.
  try {
    const { useProjectStore } = await import('./project.store')
    return useProjectStore.getState().activeProjectId || null
  } catch {
    return null
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

  /** Unsynced snapshots that need to be synced to disk when directory becomes available */
  unsyncedSnapshots: Array<{
    snapshotId: string
    summary: string | null
    createdAt: number
    opCount: number
  }>

  // Actions

  /** Initialize store (load workspaces from SQLite, fallback to OPFS) */
  initialize: () => Promise<void>

  /** Create a new workspace (writes to both SQLite and OPFS) */
  createWorkspace: (id: string, rootDirectory: string, name?: string) => Promise<WorkspaceMetadata>

  /** Switch to a different workspace */
  switchWorkspace: (id: string) => Promise<void>

  /**
   * Bump the active workspace's lastAccessedAt without reloading state.
   * Used when the user clicks the already-active workspace — should still
   * sort it to the top of the unpinned list.
   */
  touchActiveWorkspaceAccessTime: () => Promise<void>

  /** Delete a workspace (deletes from both SQLite and OPFS) */
  deleteWorkspace: (id: string) => Promise<void>

  /** Update workspace name */
  updateWorkspaceName: (id: string, name: string) => Promise<void>

  /** Archive a workspace (hide from active list) */
  archiveWorkspace: (id: string) => Promise<void>

  /** Unarchive a workspace (restore to active list) */
  unarchiveWorkspace: (id: string) => Promise<void>

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

  /** Discard multiple pending paths at once (batch, more efficient than one-by-one) */
  discardPendingPaths: (paths: string[]) => Promise<{ successCount: number; failedCount: number }>

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

  /** Notify workspace that native directory handle is available (bind + migration rebase). */
  onNativeDirectoryGranted: (handle: FileSystemDirectoryHandle) => Promise<void>

  /** Release directory handle */
  releaseDirectoryHandle: () => Promise<void>

  /** Enable/disable sync preview UI */
  setSyncPreviewEnabled: (enabled: boolean) => void

  /** Get sync preview state */
  getSyncPreviewEnabled: () => boolean

  /** Check for unsynced snapshots (call after directory handle becomes available) */
  checkUnsyncedSnapshots: () => Promise<void>

  /** Sync all unsynced snapshots to disk */
  syncUnsyncedSnapshots: () => Promise<void>

  /** Clear unsynced snapshots notification */
  clearUnsyncedSnapshots: () => void

  /**
   * After first native directory mount in pure-OPFS mode, scan OPFS files/
   * for paths that don't exist in the native directory. Shows a toast with
   * a one-click "Sync" action if any are found.
   */
  checkOpfsOnlyFiles: () => Promise<void>

  /** Batch-write collected OPFS-only files to the native directory. */
  syncOpfsOnlyFiles: () => Promise<void>

  /** Count of OPFS-only files pending one-time sync to native disk. */
  opfsOnlyFileCount: number

  /** Paths of OPFS-only files pending one-time sync to native disk. */
  opfsOnlyFilesPaths: string[]

  /** Pinned workspace IDs (persisted via preferences store) */
  pinnedWorkspaceIds: string[]

  /** Toggle pin status for a workspace */
  togglePin: (id: string) => void
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
        unsyncedSnapshots: [],
        opfsOnlyFileCount: 0,
        opfsOnlyFilesPaths: [] as string[],
        pinnedWorkspaceIds: [],

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
                ...PENDING_RESET_PATCH,
                activeWorkspaceId: null,
                workspaces: [],
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
            const sqliteWorkspaces = await repo.findWorkspacesByProject(activeProjectId)
            if (sqliteWorkspaces.length > 0) {
              workspaces = sqliteWorkspaces.map(sqliteWorkspaceToWorkspaceStats)
              // Get real pending counts from fs_ops (not cached values)
              const realPendingCounts = await repo.getRealPendingCounts()
              workspaces = workspaces.map((ws) => ({
                ...ws,
                pendingCount: realPendingCounts.get(ws.id) ?? 0,
              }))
            }

            // Load pinned workspace IDs from preferences
            try {
              const { useWorkspacePreferencesStore } = await import('./workspace-preferences.store')
              const pinnedIds = useWorkspacePreferencesStore.getState().pinnedWorkspaceIds
              if (pinnedIds.length > 0) {
                set({ pinnedWorkspaceIds: pinnedIds })
                // Pinned items stay in pin order; unpinned by lastAccessedAt desc.
                workspaces = sortWorkspacesForDisplay(workspaces, pinnedIds)
              }
            } catch {
              // Ignore preference loading errors, keep default order
            }

            // PR-B: active workspace is URL-driven. Do NOT restore from a
            // persisted singleton here — that caused cross-tab pollution.
            // syncFromRoute (App.tsx) sets activeWorkspaceId from the URL
            // :workspaceId param after init. Leave it null until then; the
            // workspace list is still loaded so the sidebar can render.
            const activeId = null

            // Re-derive hasDirectoryHandle from the live runtime handle table
            // instead of inheriting the `false` from PENDING_RESET_PATCH.
            // folder-access hydration (triggered earlier via initializeProjects
            // -> setActiveProject -> hydrateProject) may have already bound the
            // native handle and set this to `true`; blindly resetting it here
            // would make the PendingSyncPanel show "未挂载本地目录" even when a
            // directory is mounted.
            const liveHasDirectoryHandle = await deriveLiveHasDirectoryHandle(activeProjectId)

            set({
              ...PENDING_RESET_PATCH,
              hasDirectoryHandle: liveHasDirectoryHandle,
              workspaces,
              activeWorkspaceId: activeId,
              // PR-B: active workspace is URL-driven and not known at initialize
              // time (syncFromRoute sets it later). Badge count starts at 0 and
              // is refreshed when activeWorkspaceId is set.
              currentPendingCount: 0,
              isLoading: false,
              initialized: true,
            })
            console.log(
              `[WorkspaceStore] initialize done (${Math.round(performance.now() - started)}ms)`,
              { activeProjectId, workspaceCount: workspaces.length }
            )
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to initialize workspaces'
            // Re-derive hasDirectoryHandle so a transient error (e.g.
            // resolveActiveProjectId timing) does not clobber the already-
            // mounted native directory and make the PendingSyncPanel show
            // "未挂载本地目录" after a successful approval sync.
            const liveHandle = await deriveLiveHasDirectoryHandle(
              await resolveActiveProjectId().catch(() => null),
            )
            set({
              ...PENDING_RESET_PATCH,
              hasDirectoryHandle: liveHandle,
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
            const manager = await getWorkspaceManager()

            // Create OPFS workspace + SQLite record (manager is the Single
            // Source of Truth — it handles the SQLite upsert internally).
            const workspace = await manager.createWorkspace(
              rootDirectory,
              id,
              name || rootDirectory.split('/').pop() || id,
            )

            const newWorkspace: WorkspaceWithStats = {
              id,
              name: name || rootDirectory.split('/').pop() || id,
              createdAt: Date.now(),
              lastAccessedAt: Date.now(),
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

            // Persist per-project active workspace
            try {
              await repo.setActiveWorkspaceForProject(activeProjectId, id)
            } catch (e) {
              console.warn('[WorkspaceStore] Failed to persist project active workspace on create:', e)
            }

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
          const __swT0 = performance.now()
          let __swT1 = 0
          let __swBranch: 'new' | 'recreate' | 'cached' = 'cached'
          // Avoid redundant call if already active.
          // (Clicking the active workspace is handled separately by
          // touchActiveWorkspaceAccessTime to update its sort position.)
          const currentActiveId = get().activeWorkspaceId
          if (currentActiveId === id) {
            console.log(`[WorkspaceStore] switchWorkspace(${id?.slice(0, 8)}) noop (already active)`)
            return
          }

          // Prevent concurrent switch operations using promise-based waiting
          // instead of setInterval busy-wait polling.
          const switchingId = get().switchingWorkspaceId
          if (switchingId === id) {
            // Another switch to the same workspace is already in-flight.
            // Wait for it to finish via the promise-based notification system.
            await waitForSwitchComplete(id)
            if (get().activeWorkspaceId === id) {
              return
            }
            // Another switch to the same workspace failed with error.
            // Clear error and proceed with our own switch attempt.
            if (get().error) {
              console.warn(`[WorkspaceStore] Prior switch to ${id} failed, retrying...`)
              set({ error: null })
            } else {
              const message = `Failed to switch workspace: ${id}`
              throw new Error(message)
            }
          }
          if (switchingId && switchingId !== id) {
            console.warn(`[WorkspaceStore] Switching to ${id} while already switching to ${switchingId}, waiting...`)
            // Wait for the current switch to complete via promise-based notification
            await waitForSwitchComplete(switchingId)
            // After waiting, check if we're now on the desired workspace
            if (get().activeWorkspaceId === id) {
              return
            }
          }

          // Set switching lock.
          // IMPORTANT: reset all pending-derived fields NOW (synchronously)
          // before any async work. This closes the window where the badge and
          // preview panel would briefly show the *previous* workspace's data
          // until `refreshPendingChanges` finishes (Bug 2).
          set({
            ...PENDING_RESET_PATCH,
            switchingWorkspaceId: id,
            isLoading: true,
            // error already nulled by PENDING_RESET_PATCH
          })

          try {
            const repo = getWorkspaceRepository()
            const activeProjectId = await resolveActiveProjectId()
            if (!activeProjectId) {
              throw new Error('No active project selected')
            }
            const manager = await getWorkspaceManager()
            __swT1 = performance.now()
            const refreshForWorkspace = async () => {
              // Multi-root: pick any available handle for this project.
              // Previously this called getRuntimeDirectoryHandle(projectId)
              // without a rootName, which falls back to the synthetic key
              // (projectId, projectId). But hydrateProject binds handles
              // under (projectId, handle.name), so the lookup returned null
              // for any folder whose name isn't the projectId — i.e. almost
              // every real folder. The result: after a page refresh,
              // switchWorkspace reset hasDirectoryHandle to false (via
              // PENDING_RESET_PATCH) and never restored it, leaving the
              // PendingSyncPanel showing "未挂载本地目录".
              const allHandles = getRuntimeHandlesForProject(activeProjectId)
              const anyHandle = allHandles.values().next().value ?? null
              if (anyHandle) {
                await get().onNativeDirectoryGranted(anyHandle)
              } else {
                await get().refreshPendingChanges(true)
              }
              // Fire-and-forget: refresh the OPFS store so FileTreePanel's
              // cachedPaths subscription picks up the new workspace's files.
              // Intentionally NOT awaited so switchWorkspace returns quickly —
              // opfs.store.refresh() has its own stale-result guard that drops
              // the update if the user has already moved on to another workspace.
              ;(async () => {
                try {
                  const { useOPFSStore } = await import('./opfs.store')
                  await useOPFSStore.getState().refresh()
                } catch (e) {
                  console.warn('[WorkspaceStore] Failed to refresh OPFS store after switch:', e)
                }
              })()
            }

            // Check if workspace exists in SQLite first
            const workspaceRecord = await repo.findWorkspaceById(id)

            // If workspace doesn't exist in SQLite, it's a new conversation
            // We need to create the workspace OPFS structure immediately
            if (!workspaceRecord) {
              __swBranch = 'new'
              console.log(`[WorkspaceStore] Creating new workspace for conversation: ${id}`)

              // Create OPFS workspace using conversation ID as root directory
              // Each conversation gets its own isolated workspace directory
              const rootDirectory = `workspaces/${id}`

              // Get conversation title for workspace name
              const { useConversationStore } = await import('./conversation.store')
              const conversations = useConversationStore.getState().conversations
              const convTitle = conversations.find((c) => c.id === id)?.title

              // Create the workspace (OPFS + SQLite via manager, which is the
              // Single Source of Truth for workspace records).
              const workspace = await manager.createWorkspace(
                rootDirectory,
                id,
                convTitle || id,
              )

              const newWorkspace: WorkspaceWithStats = {
                id,
                name: convTitle || id,
                createdAt: Date.now(),
                lastAccessedAt: Date.now(),
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

              // Persist per-project active workspace
              try {
                await repo.setActiveWorkspaceForProject(activeProjectId, id)
              } catch (e) {
                console.warn('[WorkspaceStore] Failed to persist project active workspace on new conversation:', e)
              }

              // NOTE: conversation activation is handled by syncFromRoute in App.tsx.
              // switchWorkspace only manages workspace OPFS/SQLite state.

              await refreshForWorkspace()

              return
            }

            // Try to load from OPFS workspace
            const workspace = await manager.getWorkspace(id)

            if (!workspace) {
              __swBranch = 'recreate'
              // Workspace exists in SQLite but not in OPFS - data inconsistency
              // This can happen if OPFS was cleared or corrupted
              // Recreate the workspace to fix the inconsistency
              console.warn(
                `[WorkspaceStore] Workspace ${id} exists in database but OPFS workspace missing. Recreating...`
              )

              // Get the workspace record to retrieve root directory
              const workspaceRecord = await repo.findWorkspaceById(id)
              if (!workspaceRecord) {
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
              const newWorkspace = await manager.createWorkspace(workspaceRecord.rootDirectory, id)

              // Update the workspace in SQLite with fresh stats
              await repo.updateWorkspaceStats(id, {
                modifiedFiles: 0,
              })

              set({
                workspaces: get().workspaces.map((w) =>
                  w.id === id
                    ? {
                        id,
                        name: workspaceRecord.name,
                        createdAt: workspaceRecord.createdAt,
                        lastAccessedAt: Date.now(),
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

              // NOTE: conversation activation is handled by syncFromRoute in App.tsx.

              await refreshForWorkspace()

              return
            }

            // Update last access time in SQLite
            await repo.updateWorkspaceAccessTime(id)

            // Persist per-project active workspace so switching back to this
            // project restores the workspace the user was using.
            try {
              await repo.setActiveWorkspaceForProject(activeProjectId, id)
            } catch (e) {
              console.warn('[WorkspaceStore] Failed to persist project active workspace:', e)
            }

            set({
              workspaces: get().workspaces.map((w) =>
                w.id === id ? { ...w, lastAccessedAt: Date.now() } : w
              ),
              activeWorkspaceId: id,
              currentPendingCount: workspace.pendingCount,
              isLoading: false,
              switchingWorkspaceId: null,
            })

            // NOTE: conversation activation is handled by syncFromRoute in App.tsx.
            // switchWorkspace only manages workspace OPFS/SQLite state.

            await refreshForWorkspace()
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to switch workspace'
            set({
              error: message,
              isLoading: false,
              switchingWorkspaceId: null,
            })
            throw new Error(message)
          } finally {
            // Always release switching lock for this target workspace.
            // Some early-return success paths (e.g. first-time workspace creation)
            // can otherwise leave the lock stuck and block runAgent forever.
            if (get().switchingWorkspaceId === id) {
              set({
                switchingWorkspaceId: null,
                isLoading: false,
              })
            }
            // Notify any waiters that this switch has completed (replaces busy-wait polling).
            notifySwitchComplete(id)
            console.log(
              `[WorkspaceStore] switchWorkspace(${id?.slice(0, 8)}) done (${Math.round(performance.now() - __swT0)}ms)`,
              { branch: __swBranch, prepareMs: Math.round(__swT1 - __swT0) }
            )
          }
        },

        touchActiveWorkspaceAccessTime: async () => {
          const id = get().activeWorkspaceId
          if (!id) return
          const now = Date.now()
          set({
            workspaces: get().workspaces.map((w) =>
              w.id === id ? { ...w, lastAccessedAt: now } : w
            ),
          })
          // Persist to SQLite (fire-and-forget, non-critical)
          try {
            const repo = getWorkspaceRepository()
            void repo.updateWorkspaceAccessTime(id)
          } catch {
            // Non-critical — in-memory update already applied
          }
        },

        deleteWorkspace: async (id) => {
          set({ isLoading: true, error: null })

          try {
            const repo = getWorkspaceRepository()
            const manager = await getWorkspaceManager()

            // Delete from OPFS
            await manager.deleteWorkspace(id)

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

            // Clean up pinnedWorkspaceIds to remove stale ID
            const currentPinned = get().pinnedWorkspaceIds
            if (currentPinned.includes(id)) {
              const newPinned = currentPinned.filter((pid) => pid !== id)
              set({ pinnedWorkspaceIds: newPinned })
              import('./workspace-preferences.store').then(({ useWorkspacePreferencesStore }) => {
                useWorkspacePreferencesStore.getState().setPinnedWorkspaceIds(newPinned)
              }).catch(() => {})
            }

            // Also switch active conversation to match new workspace
            if (newActiveId !== null) {
              const { useConversationStore } = await import('./conversation.store')
              await useConversationStore.getState().setActive(newActiveId)

              // Update per-project active workspace record
              try {
                const activeProjectId = await resolveActiveProjectId()
                if (activeProjectId) {
                  await repo.setActiveWorkspaceForProject(activeProjectId, newActiveId)
                }
              } catch (e) {
                console.warn('[WorkspaceStore] Failed to update project active workspace after delete:', e)
              }
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

        archiveWorkspace: async (id) => {
          try {
            const repo = getWorkspaceRepository()
            await repo.updateWorkspaceStatus(id, 'archived')

            const currentWorkspaces = get().workspaces
            const wasActive = get().activeWorkspaceId === id
            const remaining = currentWorkspaces.filter((w) => w.id !== id)
            const newActiveId = wasActive
              ? remaining.length > 0
                ? remaining[0].id
                : null
              : get().activeWorkspaceId

            set({
              workspaces: currentWorkspaces.map((w) =>
                w.id === id ? { ...w, status: 'archived' as const } : w
              ),
              activeWorkspaceId: newActiveId,
              currentPendingCount:
                newActiveId && remaining.length > 0 ? remaining[0]?.pendingCount || 0 : 0,
            })

            // Switch active conversation if we archived the current one
            if (wasActive && newActiveId) {
              const { useConversationStore } = await import('./conversation.store')
              await useConversationStore.getState().setActive(newActiveId)

              // Update per-project active workspace record
              try {
                const activeProjectId = await resolveActiveProjectId()
                if (activeProjectId) {
                  await repo.setActiveWorkspaceForProject(activeProjectId, newActiveId)
                }
              } catch (e) {
                console.warn('[WorkspaceStore] Failed to update project active workspace after archive:', e)
              }
            }
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to archive workspace'
            set({ error: message })
            throw new Error(message)
          }
        },

        unarchiveWorkspace: async (id) => {
          try {
            const repo = getWorkspaceRepository()
            await repo.updateWorkspaceStatus(id, 'active')

            set({
              workspaces: get().workspaces.map((w) =>
                w.id === id ? { ...w, status: 'active' as const } : w
              ),
            })
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to unarchive workspace'
            set({ error: message })
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
            const manager = await getWorkspaceManager()
            const workspace = await manager.getWorkspace(activeWorkspaceId)

            if (workspace) {
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

        discardPendingPaths: async (paths: string[]) => {
          const activeWorkspace = await getActiveWorkspace()
          if (!activeWorkspace) return { successCount: 0, failedCount: paths.length }

          const result = await activeWorkspace.workspace.discardPendingPaths(paths)
          await get().updateCurrentCounts()

          // Refresh pending list from source-of-truth ledger (once, not per-file).
          await get().refreshPendingChanges(true)

          return { successCount: result.successCount, failedCount: result.failedCount }
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

            const requestedWorkspaceId = activeWorkspace.workspaceId
            const changes = await activeWorkspace.workspace.refreshPendingChanges()
            if (get().activeWorkspaceId !== requestedWorkspaceId) {
              return
            }

            const hasChanges = changes && changes.changes.length > 0
            const pendingCount = changes?.changes.length ?? 0
            set((state) => ({
              pendingChanges: changes,
              currentPendingCount:
                state.activeWorkspaceId === requestedWorkspaceId
                  ? pendingCount
                  : state.currentPendingCount,
              workspaces: state.workspaces.map((w) =>
                w.id === requestedWorkspaceId ? { ...w, pendingCount } : w
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

          set({ isLoading: true, error: null })

          try {
            // Request directory access from user
            // Multi-root: rootName = handle.name (set after picker returns)
            const handle = await requestDirectoryAccess(activeProjectId, activeProjectId, {
              mode: 'readwrite',
              startIn: '/',
            })

            if (handle) {
              // Multi-root: bind with handle.name as the root name
              bindRuntimeDirectoryHandle(activeProjectId, handle.name, handle)
              await get().onNativeDirectoryGranted(handle)
              set({ isLoading: false })
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

        onNativeDirectoryGranted: async (handle: FileSystemDirectoryHandle) => {
          const activeWorkspaceId = get().activeWorkspaceId

          set({ hasDirectoryHandle: true })

          // Register checkpoint tools (require native directory handle)
          try { getToolRegistry().registerCheckpointTools() } catch {}

          if (activeWorkspaceId) {
            try {
              const manager = await getWorkspaceManager()
              const workspace = await manager.getWorkspace(activeWorkspaceId)
              if (workspace) {
                const rebind = await workspace.rebindPendingBaselinesToNative(handle)
                if (rebind.rebased > 0 || rebind.conflicts > 0) {
                  const summary =
                    rebind.conflicts > 0
                      ? `目录已连接：已重建 ${rebind.rebased} 个变更基线，发现 ${rebind.conflicts} 个潜在冲突`
                      : `目录已连接：已重建 ${rebind.rebased} 个变更基线`
                  toast.info(summary, {
                    action:
                      rebind.conflicts > 0
                        ? {
                            label: '查看',
                            onClick: () => set({ showPreview: true }),
                          }
                        : undefined,
                  })
                }
              }
            } catch (e) {
              console.warn('[WorkspaceStore] Failed to rebind pending baselines after native grant:', e)
            }
          }

          await get().checkUnsyncedSnapshots()
          await get().checkOpfsOnlyFiles()
          await get().refreshPendingChanges(true)
        },

        releaseDirectoryHandle: async () => {
          const activeProjectId = await resolveActiveProjectId()
          if (!activeProjectId) return

          try {
            // Multi-root: release all handles for this project
            const { getRuntimeHandlesForProject } = await import('@/native-fs')
            const handles = getRuntimeHandlesForProject(activeProjectId)
            for (const [rootName] of handles) {
              await releaseDirectoryHandle(activeProjectId, rootName)
            }
            set({ hasDirectoryHandle: false })

            // Unregister checkpoint tools (no longer have native directory handle)
            try { getToolRegistry().unregisterCheckpointTools() } catch {}
          } catch (e) {
            console.error('Failed to release directory handle:', e)
          }
        },

        checkUnsyncedSnapshots: async () => {
          const activeWorkspaceId = get().activeWorkspaceId
          if (!activeWorkspaceId) return

          try {
            const manager = await getWorkspaceManager()
            const workspace = await manager.getWorkspace(activeWorkspaceId)
            if (!workspace) return

            const unsynced = await workspace.getUnsyncedSnapshots()
            set({ unsyncedSnapshots: unsynced })

            if (unsynced.length > 0) {
              toast.info(`发现 ${unsynced.length} 个未同步的快照`, {
                description: '点击同步将文件写入本地磁盘',
                action: {
                  label: '同步',
                  onClick: () => get().syncUnsyncedSnapshots()
                }
              })
            }
          } catch (e) {
            console.error('[WorkspaceStore] Failed to check unsynced snapshots:', e)
          }
        },

        syncUnsyncedSnapshots: async () => {
          const activeWorkspaceId = get().activeWorkspaceId
          if (!activeWorkspaceId) return

          const { unsyncedSnapshots } = get()
          if (unsyncedSnapshots.length === 0) return

          set({ isLoading: true })

          try {
            const manager = await getWorkspaceManager()
            const workspace = await manager.getWorkspace(activeWorkspaceId)
            if (!workspace) return

            // Multi-root aware: get default handle (or first available)
            const nativeDir = await workspace.getNativeDirectoryHandle()
            if (!nativeDir) {
              toast.error('没有可用的本地目录')
              set({ isLoading: false })
              return
            }

            const repo = getFSOverlayRepository()
            let syncedCount = 0

            for (const snapshot of unsyncedSnapshots) {
              const snapshotOps = await repo.listSnapshotOps(
                activeWorkspaceId,
                snapshot.snapshotId
              )
              const paths = snapshotOps.map((op: { path: string }) => op.path)

              if (paths.length > 0) {
                // syncToDisk now internally routes to correct root handles
                const result = await workspace.syncToDisk(nativeDir, paths)
                if (result.failed === 0) {
                  await workspace.markSnapshotAsSynced(snapshot.snapshotId)
                  syncedCount++
                } else {
                  console.warn(`[WorkspaceStore] Snapshot ${snapshot.snapshotId} had ${result.failed} failed files`)
                }
              }
            }

            set({ unsyncedSnapshots: [], isLoading: false })
            toast.success(`已同步 ${syncedCount} 个快照到磁盘`)

            // Refresh pending changes
            await get().refreshPendingChanges(true)
          } catch (e) {
            console.error('[WorkspaceStore] Failed to sync unsynced snapshots:', e)
            set({ isLoading: false })
            toast.error('同步快照失败')
          }
        },

        clearUnsyncedSnapshots: () => {
          set({ unsyncedSnapshots: [] })
        },

        checkOpfsOnlyFiles: async () => {
          const activeWorkspaceId = get().activeWorkspaceId
          if (!activeWorkspaceId) return

          try {
            const manager = await getWorkspaceManager()
            const workspace = await manager.getWorkspace(activeWorkspaceId)
            if (!workspace) return

            // Only fire on the first mount (size === 1); subsequent mounts of
            // additional roots don't re-trigger the one-time sync prompt.
            const handles = await workspace.getAllNativeDirectoryHandles()
            if (handles.size !== 1) {
              set({ opfsOnlyFileCount: 0, opfsOnlyFilesPaths: [] })
              return
            }

            const diffs = await workspace.listOpfsOnlyFiles()
            set({ opfsOnlyFileCount: diffs.length, opfsOnlyFilesPaths: diffs })

            if (diffs.length > 0) {
              toast.info(`OPFS 中有 ${diffs.length} 个文件未同步到本地磁盘`, {
                description: '点击同步将这些文件写入本地目录',
                action: {
                  label: '同步',
                  onClick: () => get().syncOpfsOnlyFiles(),
                },
              })
            }
          } catch (e) {
            console.error('[WorkspaceStore] Failed to check OPFS-only files:', e)
          }
        },

        syncOpfsOnlyFiles: async () => {
          const activeWorkspaceId = get().activeWorkspaceId
          const { opfsOnlyFilesPaths } = get() as { opfsOnlyFilesPaths: string[] }
          if (!activeWorkspaceId || opfsOnlyFilesPaths.length === 0) return

          set({ isLoading: true })
          try {
            const manager = await getWorkspaceManager()
            const workspace = await manager.getWorkspace(activeWorkspaceId)
            if (!workspace) return

            const nativeDir = await workspace.getNativeDirectoryHandle()
            if (!nativeDir) {
              toast.error('没有可用的本地目录')
              set({ isLoading: false })
              return
            }

            const result = await workspace.syncOpfsFilesToNative(nativeDir, opfsOnlyFilesPaths)
            set({ opfsOnlyFileCount: 0, opfsOnlyFilesPaths: [], isLoading: false })

            if (result.failed > 0) {
              toast.warning(`已同步 ${result.synced} 个文件，${result.failed} 个失败`)
            } else {
              toast.success(`已同步 ${result.synced} 个文件到本地磁盘`)
            }

            await get().refreshPendingChanges(true)
          } catch (e) {
            console.error('[WorkspaceStore] Failed to sync OPFS-only files:', e)
            set({ isLoading: false })
            toast.error('同步 OPFS 文件失败')
          }
        },

        togglePin: (id) => {
          const current = get().pinnedWorkspaceIds
          const isPinned = current.includes(id)
          const next = isPinned
            ? current.filter((pid) => pid !== id)
            : [...current, id]

          set({ pinnedWorkspaceIds: next })

          // Re-sort workspaces: pinned items preserve pinning order,
          // unpinned by lastAccessedAt desc.
          const workspaces = sortWorkspacesForDisplay([...get().workspaces], next)
          set({ workspaces })

          // Persist (lazy import to avoid circular dependency)
          import('./workspace-preferences.store').then(({ useWorkspacePreferencesStore }) => {
            useWorkspacePreferencesStore.getState().setPinnedWorkspaceIds(next)
          }).catch((err) => {
            console.error('[WorkspaceStore] Failed to persist pinned workspaces:', err)
          })
        },
      })
)
)

/**
 * Get current active workspace
 */
export async function getActiveWorkspace(): Promise<
  { workspace: WorkspaceFiles; workspaceId: string } | undefined
> {
  const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
  if (!activeWorkspaceId) return undefined

  const manager = await getWorkspaceManager()
  const workspace = await manager.getWorkspace(activeWorkspaceId)

  return workspace ? { workspace, workspaceId: activeWorkspaceId } : undefined
}

// Export types
export type { WorkspaceState }
