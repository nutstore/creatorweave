/**
 * Shared pending-change eligibility filter for DISK sync operations.
 *
 * Redesign doc §3.9-8, as amended by the "authorized deletions" follow-up:
 * whether delete-type changes may reach the REAL disk depends on whether the
 * sync path carries its own user authorization:
 *   - AUTHORIZED paths (sync-to-disk tool — every call goes through the
 *     policy engine / ToolAuthModal, and a flush containing deletions uses a
 *     deletion-specific description + memory key that lists the paths) MAY
 *     include deletions. The modal IS the informed consent; silently
 *     stripping the deletions afterwards would betray it.
 *   - UNATTENDED paths (run-level auto-apply — fires automatically when a
 *     run completes, no modal) must NEVER include deletions: a run-completion
 *     policy must not turn a background success into an irreversible local
 *     removal. They keep landing in the manual Sync panel review flow.
 *
 * `includeDeletions` makes that fork explicit at the single source of truth,
 * so a new PendingChange type or a new sync path cannot silently pick the
 * wrong side.
 */

import type { PendingChange } from '../types/opfs-types'

/** Change types that may be written to the real disk without manual review. */
export type DiskEligibleChangeType = 'create' | 'modify'

/**
 * True when the pending change may be applied to the real disk on the given
 * channel. Deletions are only eligible on channels that carry their own
 * per-call authorization (`includeDeletions: true`).
 */
export function isDiskEligiblePendingChange(
  change: PendingChange,
  options?: { includeDeletions?: boolean },
): boolean {
  if (change.type === 'create' || change.type === 'modify') return true
  return options?.includeDeletions === true && change.type === 'delete'
}

/**
 * Filter pending changes down to the disk-eligible subset. Use BEFORE
 * passing `onlyPaths` to any syncToDisk call (§3.9-8: the exclusion must
 * happen before the disk pipeline, not inside it).
 *
 * `includeDeletions: true` is reserved for authorized channels (sync-to-disk
 * tool). Run-level auto-apply must keep the default (deletions excluded).
 */
export function filterDiskEligiblePendingChanges(
  changes: readonly PendingChange[],
  options?: { includeDeletions?: boolean },
): PendingChange[] {
  return changes.filter((c) => isDiskEligiblePendingChange(c, options))
}

/**
 * Filter an explicit path list down to disk-eligible pending paths.
 * Returns the eligible paths plus the excluded ones, split by reason:
 *  - 'delete': pending delete-type change excluded by policy (only possible
 *    when `includeDeletions` is false — authorized channels pass them through)
 *  - 'unknown': not currently pending (already synced, or never existed)
 */
export function partitionPathsByDiskEligibility(
  paths: readonly string[],
  pendingChanges: readonly PendingChange[],
  options?: { includeDeletions?: boolean },
): {
  eligible: string[]
  excluded: Array<{ path: string; reason: 'delete' | 'unknown' }>
} {
  const byPath = new Map(pendingChanges.map((c) => [c.path, c]))
  const eligible: string[] = []
  const excluded: Array<{ path: string; reason: 'delete' | 'unknown' }> = []
  for (const path of paths) {
    const change = byPath.get(path)
    if (!change) {
      excluded.push({ path, reason: 'unknown' })
    } else if (isDiskEligiblePendingChange(change, options)) {
      eligible.push(path)
    } else {
      excluded.push({ path, reason: 'delete' })
    }
  }
  return { eligible, excluded }
}
