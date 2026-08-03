/**
 * Shared sync-dialog store
 *
 * Centralizes the duplicated state machines that lived in both
 * `PendingSyncPanel` and `SyncPreviewPanel`:
 *   - SnapshotApprovalDialog visibility (just confirm/cancel, no description)
 *   - ConflictResolutionDialog queue traversal
 *
 * The store renders the two dialogs **once** at WorkspaceLayout level
 * (via `<SharedSyncDialogs />`), eliminating duplicate instances.
 *
 * Panel-specific sync behavior (HMR guard, markSnapshotAsSynced,
 * nativeDir policy, post-sync side effects) is injected via the
 * `syncExecutor` callback registered by whichever panel initiated the
 * current approval flow. The store is agnostic to the executor's internals.
 *
 * NOTE: The dialog used to ask the user to type an AI-generated description
 * for each snapshot. That field is gone — `summary` is now stored as null
 * on fs_changesets. Approval is just a confirmation step.
 */

import { create } from 'zustand'
import type { FileChange, ConflictInfo, ConflictDetail } from '@/opfs/types/opfs-types'

/**
 * Resolution chosen in the conflict dialog.
 * - 'opfs'   → keep OPFS version, force-overwrite native file
 * - 'native' → keep native version, discard OPFS pending change
 * - 'skip'   → exclude this file from the sync
 */
export type ConflictResolution = 'opfs' | 'native' | 'skip'

/**
 * Contract every approval-flow consumer must register.
 *
 * Called when the user confirms the SnapshotApprovalDialog.
 * Must return `true` on success (dialog closes) or `false` on failure
 * (dialog stays open so the user can retry).
 *
 * @param files       The staged FileChange list (already filtered by conflict resolution).
 * @param forcePaths  Paths the user chose to force-overwrite (conflict 'opfs').
 */
export type SyncExecutor = (
  files: FileChange[],
  forcePaths: Set<string>,
) => Promise<boolean>

/**
 * Called when a conflict resolution picks 'native' (keep native file).
 * The panel must discard the OPFS pending change for this path.
 * Throwing aborts the remaining conflict resolution.
 */
export type DiscardPendingFn = (path: string) => Promise<void>

/**
 * Translates a flow outcome into a localized user-facing message.
 *
 * Implementations are expected to:
 *   - call `toast.info(...)` for `noFilesAfterConflict`
 *   - call `toast.error(...)` for `keepNativeFailed`
 */
export type NotifyFn = (
  kind: 'noFilesAfterConflict' | 'keepNativeFailed',
  detail?: unknown,
) => void

export interface SyncDialogState {
  // ─── Approval dialog ───────────────────────────────────────────
  approveDialogOpen: boolean
  pendingFiles: FileChange[]
  isSyncing: boolean

  // ─── Conflict dialog ───────────────────────────────────────────
  conflictQueue: ConflictDetail[]
  conflictIndex: number
  forceOverwritePaths: Set<string>
  skippedConflictPaths: Set<string>
  /** Paths currently flagged as conflicting — consumed by list rows for the "C" badge. */
  conflictPaths: Set<string>

  // ─── Injected callbacks (set per approval flow) ────────────────
  syncExecutor: SyncExecutor | null
  discardPending: DiscardPendingFn | null
  notify: NotifyFn | null
}

interface SyncDialogActions {
  // ─── Conflict-path badge state (used by both list renderers) ────
  setConflictPaths: (paths: Set<string>) => void

  /**
   * Begin an approval flow for the given staged files.
   * Runs conflict detection (delegated to caller via `detectConflicts`).
   *
   * If conflicts are found, the conflict dialog opens instead.
   * Otherwise the approval dialog opens directly.
   *
   * @param files           Staged FileChange list.
   * @param options.ctx     Injected callbacks (executor, discard, notify).
   * @param options.detect  Async conflict detector returning ConflictInfo[].
   */
  beginApprovalFlow: (
    files: FileChange[],
    options: {
      ctx: {
        syncExecutor: SyncExecutor
        discardPending: DiscardPendingFn
        notify: NotifyFn
      }
      detect: () => Promise<ConflictInfo[]>
    },
  ) => Promise<void>

  // ─── SnapshotApprovalDialog wiring ─────────────────────────────
  closeApprovalDialog: () => void
  /** Confirm: invoke the registered syncExecutor. Closes the dialog on success. */
  confirmApproval: () => Promise<void>

  // ─── ConflictResolutionDialog wiring ───────────────────────────
  resolveConflict: (resolution: ConflictResolution) => Promise<void>
  cancelConflictResolution: () => void

  /** Reset the entire flow (e.g. when the panel unmounts). */
  reset: () => void
}

type Store = SyncDialogState & SyncDialogActions

export const useSyncDialogStore = create<Store>((set, get) => ({
  // ── initial state ──
  approveDialogOpen: false,
  pendingFiles: [],
  isSyncing: false,
  conflictQueue: [],
  conflictIndex: 0,
  forceOverwritePaths: new Set(),
  skippedConflictPaths: new Set(),
  conflictPaths: new Set(),
  syncExecutor: null,
  discardPending: null,
  notify: null,

  setConflictPaths: (paths) => set({ conflictPaths: paths }),

  beginApprovalFlow: async (files, { ctx, detect }) => {
    set({
      syncExecutor: ctx.syncExecutor,
      discardPending: ctx.discardPending,
      notify: ctx.notify,
      pendingFiles: files,
    })

    let conflicts: ConflictInfo[] = []
    try {
      conflicts = await detect()
    } catch {
      conflicts = []
    }

    if (conflicts.length > 0) {
      set({
        conflictPaths: new Set(conflicts.map((c) => c.path)),
        forceOverwritePaths: new Set(),
        skippedConflictPaths: new Set(),
        conflictQueue: conflicts.map(toConflictDetail),
        conflictIndex: 0,
      })
      return
    }

    // No conflicts → open approval dialog
    set({
      conflictPaths: new Set(),
      approveDialogOpen: true,
    })
  },

  closeApprovalDialog: () => {
    set({ approveDialogOpen: false })
  },

  confirmApproval: async () => {
    const { syncExecutor, pendingFiles, forceOverwritePaths } = get()
    if (!syncExecutor) return
    if (pendingFiles.length === 0) return

    set({ isSyncing: true })
    try {
      const ok = await syncExecutor(pendingFiles, forceOverwritePaths)
      if (ok) {
        set({ approveDialogOpen: false })
      }
    } finally {
      set({ isSyncing: false })
    }
  },

  resolveConflict: async (resolution) => {
    const state = get()
    const current = selectActiveConflict(state)
    if (!current) return

    const nextForce = new Set(state.forceOverwritePaths)
    const nextSkipped = new Set(state.skippedConflictPaths)

    if (resolution === 'opfs') {
      nextForce.add(current.path)
    } else {
      nextSkipped.add(current.path)
      if (resolution === 'native') {
        try {
          await state.discardPending?.(current.path)
          const { refreshPendingChanges } = await import('@/store/conversation-context.store').then(
            (m) => m.useConversationContextStore.getState(),
          )
          await refreshPendingChanges(true)
        } catch (error) {
          state.notify?.('keepNativeFailed', { error })
          return
        }
      }
      // Remove this path from the conflict badge set
      const nextConflictPaths = new Set(state.conflictPaths)
      nextConflictPaths.delete(current.path)
      set({ conflictPaths: nextConflictPaths })
    }

    const nextIndex = state.conflictIndex + 1
    set({
      forceOverwritePaths: nextForce,
      skippedConflictPaths: nextSkipped,
    })

    if (nextIndex < state.conflictQueue.length) {
      set({ conflictIndex: nextIndex })
      return
    }

    // Queue exhausted → finalize, open approval dialog with remaining files
    const nextFiles = state.pendingFiles.filter((f) => !nextSkipped.has(f.path))
    if (nextFiles.length === 0) {
      set({
        conflictQueue: [],
        conflictIndex: 0,
        pendingFiles: [],
      })
      state.notify?.('noFilesAfterConflict')
      return
    }

    set({
      conflictQueue: [],
      conflictIndex: 0,
      pendingFiles: nextFiles,
      approveDialogOpen: true,
    })
  },

  cancelConflictResolution: () =>
    set({
      conflictQueue: [],
      conflictIndex: 0,
      forceOverwritePaths: new Set(),
      skippedConflictPaths: new Set(),
    }),

  reset: () => {
    set({
      approveDialogOpen: false,
      pendingFiles: [],
      isSyncing: false,
      conflictQueue: [],
      conflictIndex: 0,
      forceOverwritePaths: new Set(),
      skippedConflictPaths: new Set(),
      syncExecutor: null,
      discardPending: null,
      notify: null,
    })
  },
}))

/** Shared ConflictInfo → ConflictDetail mapper (verbatim from both panels). */
export function toConflictDetail(conflict: ConflictInfo): ConflictDetail {
  return {
    path: conflict.path,
    opfsVersion: {
      workspaceId: conflict.workspaceId,
      mtime: conflict.opfsMtime,
    },
    nativeVersion: {
      exists: conflict.currentFsMtime > 0,
      mtime: conflict.currentFsMtime > 0 ? conflict.currentFsMtime : undefined,
    },
  }
}

/** Selector: the conflict currently shown in the dialog. */
export function selectActiveConflict(state: Store): ConflictDetail | null {
  return state.conflictQueue[state.conflictIndex] ?? null
}