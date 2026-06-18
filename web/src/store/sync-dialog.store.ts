/**
 * Shared sync-dialog store
 *
 * Centralizes the duplicated state machines that lived in both
 * `PendingSyncPanel` and `SyncPreviewPanel`:
 *   - SnapshotApprovalDialog visibility + summary generation
 *   - ConflictResolutionDialog queue traversal
 *
 * The store renders the two dialogs **once** at WorkspaceLayout level
 * (via `<SharedSyncDialogs />`), eliminating duplicate instances.
 *
 * Panel-specific sync behavior (HMR guard, markSnapshotAsSynced,
 * nativeDir policy, post-sync side effects) is injected via the
 * `syncExecutor` callback registered by whichever panel initiated the
 * current approval flow. The store is agnostic to the executor's internals.
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
 * @param summary     The (possibly AI-generated) commit summary.
 * @param forcePaths  Paths the user chose to force-overwrite (conflict 'opfs').
 */
export type SyncExecutor = (
  files: FileChange[],
  summary: string,
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
 *   - call `toast.error(...)` for `keepNativeFailed` / `summaryFailed`
 *   - for `summaryFailed`, also call `useSyncDialogStore.setState({ summaryError: <localized> })`
 *     so the SnapshotApprovalDialog can render the inline error.
 */
export type NotifyFn = (
  kind: 'noFilesAfterConflict' | 'keepNativeFailed' | 'summaryFailed',
  detail?: unknown,
) => void

export interface SyncDialogState {
  // ─── Approval dialog ───────────────────────────────────────────
  approveDialogOpen: boolean
  pendingFiles: FileChange[]
  snapshotSummary: string
  generatingSummary: boolean
  summaryError: string | null
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
  /** Generates an AI commit-summary stream. Adopted from PendingSyncPanel (with abort support). */
  generateSummary: ((files: FileChange[], onChunk: (text: string) => void, signal?: AbortSignal) => Promise<string | null>) | null
  notify: NotifyFn | null

  // Module-scoped (non-reactive) controller so React doesn't re-render on reassignment.
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
   * @param options.ctx     Injected callbacks (executor, discard, generateSummary, notify).
   * @param options.detect  Async conflict detector returning ConflictInfo[].
   */
  beginApprovalFlow: (
    files: FileChange[],
    options: {
      ctx: {
        syncExecutor: SyncExecutor
        discardPending: DiscardPendingFn
        generateSummary: SyncDialogState['generateSummary']
        notify: NotifyFn
      }
      detect: () => Promise<ConflictInfo[]>
    },
  ) => Promise<void>

  // ─── SnapshotApprovalDialog wiring ─────────────────────────────
  closeApprovalDialog: () => void
  setSummary: (value: string) => void
  /** Kicks off the (abortable) AI summary generation. */
  requestGenerateSummary: () => Promise<void>
  /** Abort an in-flight summary stream (e.g. on dialog close). */
  abortSummary: () => void
  /** Confirm: invoke the registered syncExecutor. Closes the dialog on success. */
  confirmApproval: () => Promise<void>

  // ─── ConflictResolutionDialog wiring ───────────────────────────
  resolveConflict: (resolution: ConflictResolution) => Promise<void>
  cancelConflictResolution: () => void

  /** Reset the entire flow (e.g. when the panel unmounts). */
  reset: () => void
}

type Store = SyncDialogState & SyncDialogActions

// Module-scoped abort controller (not stored in reactive state to avoid re-renders).
let summaryController: AbortController | null = null
// Throttle token: avoid re-rendering on every LLM token.
let summaryRafId: number | null = null
let summaryPendingText = ''

export const useSyncDialogStore = create<Store>((set, get) => ({
  // ── initial state ──
  approveDialogOpen: false,
  pendingFiles: [],
  snapshotSummary: '',
  generatingSummary: false,
  summaryError: null,
  isSyncing: false,
  conflictQueue: [],
  conflictIndex: 0,
  forceOverwritePaths: new Set(),
  skippedConflictPaths: new Set(),
  conflictPaths: new Set(),
  syncExecutor: null,
  discardPending: null,
  generateSummary: null,
  notify: null,

  setConflictPaths: (paths) => set({ conflictPaths: paths }),

  beginApprovalFlow: async (files, { ctx, detect }) => {
    set({
      syncExecutor: ctx.syncExecutor,
      discardPending: ctx.discardPending,
      generateSummary: ctx.generateSummary,
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
      snapshotSummary: '',
      generatingSummary: false,
      summaryError: null,
      approveDialogOpen: true,
    })
  },

  closeApprovalDialog: () => {
    // Abort any in-flight summary generation
    if (get().generatingSummary) {
      get().abortSummary()
    }
    set({ approveDialogOpen: false })
  },

  setSummary: (value) => set({ snapshotSummary: value }),

  requestGenerateSummary: async () => {
    const { pendingFiles, generateSummary } = get()
    if (!generateSummary || pendingFiles.length === 0) return

    // Abort any previous run
    get().abortSummary()

    const controller = new AbortController()
    summaryController = controller

    set({ generatingSummary: true, snapshotSummary: '', summaryError: null })

    const flush = (text: string) => {
      set({ snapshotSummary: text })
    }
    const throttledFlush = (text: string) => {
      // Throttle to one update per animation frame
      summaryPendingText = text
      if (summaryRafId !== null) return // already scheduled
      summaryRafId = requestAnimationFrame(() => {
        summaryRafId = null
        flush(summaryPendingText)
      })
    }

    try {
      const aiSummary = await generateSummary(
        pendingFiles,
        (chunk) => throttledFlush(chunk),
        controller.signal,
      )
      // Stale-guard: another request superseded this one
      if (summaryController !== controller) return

      // Cancel any pending RAF and flush final value
      if (summaryRafId !== null) {
        cancelAnimationFrame(summaryRafId)
        summaryRafId = null
      }

      if (controller.signal.aborted) {
        // Cancelled — leave whatever was streamed
      } else if (aiSummary && aiSummary.trim().length > 0) {
        set({ snapshotSummary: aiSummary.trim(), summaryError: null })
      } else {
        // Empty result — let the consumer surface a localized error
        get().notify?.('summaryFailed', { phase: 'empty' })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      get().notify?.('summaryFailed', { phase: 'exception', error: err })
    } finally {
      if (summaryController === controller) {
        set({ generatingSummary: false })
        summaryController = null
      }
    }
  },

  abortSummary: () => {
    if (summaryController) {
      summaryController.abort()
      summaryController = null
      set({ generatingSummary: false })
    }
    if (summaryRafId !== null) {
      cancelAnimationFrame(summaryRafId)
      summaryRafId = null
    }
  },

  confirmApproval: async () => {
    const { syncExecutor, pendingFiles, snapshotSummary, forceOverwritePaths } = get()
    if (!syncExecutor) return
    if (pendingFiles.length === 0) return
    if (snapshotSummary.trim().length === 0) return

    set({ isSyncing: true })
    try {
      const ok = await syncExecutor(pendingFiles, snapshotSummary, forceOverwritePaths)
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
      snapshotSummary: '',
      generatingSummary: false,
      summaryError: null,
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
    get().abortSummary()
    set({
      approveDialogOpen: false,
      pendingFiles: [],
      snapshotSummary: '',
      generatingSummary: false,
      summaryError: null,
      isSyncing: false,
      conflictQueue: [],
      conflictIndex: 0,
      forceOverwritePaths: new Set(),
      skippedConflictPaths: new Set(),
      syncExecutor: null,
      discardPending: null,
      generateSummary: null,
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
