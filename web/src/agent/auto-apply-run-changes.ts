/**
 * Applies the safe subset of a completed agent run's pending workspace changes.
 *
 * The caller owns run attribution. This module deliberately only performs the
 * existing snapshot + conflict + sync workflow for the paths it receives.
 */

import type { PendingChange, SyncResult } from '@/opfs/types/opfs-types'

export interface AutoApplyWorkspace {
  getNativeDirectoryHandle(): Promise<FileSystemDirectoryHandle | null>
  getPendingChanges(): PendingChange[]
  detectSyncConflicts(
    directoryHandle: FileSystemDirectoryHandle,
    onlyPaths?: string[],
  ): Promise<SyncResult['conflicts']>
  createApprovedSnapshotForPaths(
    paths: string[],
    summary?: string,
    directoryHandle?: FileSystemDirectoryHandle | null,
    runId?: string | null,
  ): Promise<{ snapshotId: string; opCount: number } | null>
  syncToDisk(
    directoryHandle: FileSystemDirectoryHandle,
    onlyPaths?: string[],
    forceOverwrite?: boolean,
  ): Promise<SyncResult>
  markSnapshotAsSynced(snapshotId: string): Promise<void>
}

export type AutoApplyRunResult =
  | { status: 'skipped'; reason: 'no_paths' | 'no_native_directory' | 'no_pending_paths' }
  | { status: 'conflict'; conflictPaths: string[] }
  | { status: 'synced'; paths: string[]; snapshotId: string }
  | { status: 'partial'; paths: string[]; snapshotId?: string; failed: number; skipped: number; conflictPaths: string[] }

/**
 * Never forces an overwrite. Any detected conflict keeps the full run batch
 * pending for the existing manual review flow.
 */
export async function autoApplyCompletedRunChanges(
  workspace: AutoApplyWorkspace,
  candidatePaths: readonly string[],
  refreshPendingChanges: () => Promise<unknown>,
  runId?: string | null,
): Promise<AutoApplyRunResult> {
  const uniqueCandidates = [...new Set(candidatePaths.filter(Boolean))]
  if (uniqueCandidates.length === 0) {
    return { status: 'skipped', reason: 'no_paths' }
  }

  const nativeDirectory = await workspace.getNativeDirectoryHandle()
  if (!nativeDirectory) {
    return { status: 'skipped', reason: 'no_native_directory' }
  }

  // Changes can cancel themselves out (for example, create then delete), so
  // only consider paths that are still pending at finalization time. Deletions
  // remain in the manual review flow: a run-completion policy must never turn
  // a background success into an irreversible local removal.
  const eligiblePendingPaths = new Set(
    workspace
      .getPendingChanges()
      .filter((change) => change.type === 'create' || change.type === 'modify')
      .map((change) => change.path),
  )
  const paths = uniqueCandidates.filter((path) => eligiblePendingPaths.has(path))
  if (paths.length === 0) {
    return { status: 'skipped', reason: 'no_pending_paths' }
  }

  const conflicts = await workspace.detectSyncConflicts(nativeDirectory, paths)
  const conflictPaths = new Set(conflicts.map((conflict) => conflict.path))
  if (conflictPaths.size > 0) {
    await refreshPendingChanges()
    return { status: 'conflict', conflictPaths: [...conflictPaths] }
  }

  // `undefined` deliberately creates the normal rollback record without a
  // user-facing description, matching the existing manual application flow.
  const snapshot = await workspace.createApprovedSnapshotForPaths(paths, undefined, nativeDirectory, runId)
  if (!snapshot) {
    await refreshPendingChanges()
    return {
      status: 'partial',
      paths,
      failed: 0,
      skipped: paths.length,
      conflictPaths: [],
    }
  }

  try {
    // Keep force-overwrite explicitly disabled: any race after the preflight
    // conflict check stays in the manual review flow instead of overwriting disk.
    const result = await workspace.syncToDisk(nativeDirectory, paths, false)

    // Only mark the snapshot as synced when every file IN THIS BATCH
    // succeeded. We intentionally ignore `result.skipped`: syncToDisk
    // increments `skipped` for ANY pending change not in the `paths`
    // allowlist (e.g. changes from a prior run still awaiting manual review).
    // Those skipped files are unrelated to this snapshot, so a non-zero skip
    // count must NOT block marking this batch's snapshot as synced.
    if (
      result.success === paths.length &&
      result.failed === 0 &&
      result.conflicts.length === 0
    ) {
      await workspace.markSnapshotAsSynced(snapshot.snapshotId)
    }

    await refreshPendingChanges()

    const resultConflictPaths = [...new Set([
      ...conflictPaths,
      ...result.conflicts.map((conflict) => conflict.path),
    ])]
    if (
      result.success === paths.length &&
      result.failed === 0 &&
      resultConflictPaths.length === 0
    ) {
      return { status: 'synced', paths, snapshotId: snapshot.snapshotId }
    }

    // Compute skipped count relative to THIS batch only — syncToDisk reports
    // skips for all pending changes outside the `paths` allowlist, which would
    // inflate the number and mislead callers into thinking batch files were
    // skipped.
    const batchSkipped = Math.max(0, paths.length - result.success - result.failed)
    return {
      status: 'partial',
      paths,
      snapshotId: snapshot.snapshotId,
      failed: result.failed,
      skipped: batchSkipped,
      conflictPaths: resultConflictPaths,
    }
  } catch (error) {
    // Snapshot approval has already happened, but the pending operation remains
    // unsynced for normal manual recovery. Refresh UI state before surfacing it.
    await refreshPendingChanges()
    throw error
  }
}
