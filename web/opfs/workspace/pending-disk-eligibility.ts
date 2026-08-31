/**
 * Shared pending-change eligibility filter for DISK sync operations.
 *
 * Redesign doc §3.9-8: every path that writes pending changes to the REAL
 * disk (run-level auto-apply, sync-to-disk tool) must exclude delete-type
 * changes — deletion of real files stays in the manual Sync panel review
 * flow. Keeping the single source of truth here means a new PendingChange
 * type cannot silently start reaching the disk from one path but not the
 * other.
 */

import type { PendingChange } from '../types/opfs-types'

/** Change types that may be written to the real disk without manual review. */
export type DiskEligibleChangeType = 'create' | 'modify'

/** True when the pending change may be auto-applied to the real disk. */
export function isDiskEligiblePendingChange(change: PendingChange): boolean {
  return change.type === 'create' || change.type === 'modify'
}

/**
 * Filter pending changes down to the disk-eligible subset. Use BEFORE
 * passing `onlyPaths` to any syncToDisk call (§3.9-8: the exclusion must
 * happen before the disk pipeline, not inside it).
 */
export function filterDiskEligiblePendingChanges(
  changes: readonly PendingChange[],
): PendingChange[] {
  return changes.filter(isDiskEligiblePendingChange)
}

/**
 * Filter an explicit path list down to disk-eligible pending paths.
 * Returns the eligible paths plus the excluded ones, split by reason:
 *  - 'delete': pending delete-type change (needs manual Sync panel review)
 *  - 'unknown': not currently pending (already synced, or never existed)
 */
export function partitionPathsByDiskEligibility(
  paths: readonly string[],
  pendingChanges: readonly PendingChange[],
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
    } else if (isDiskEligiblePendingChange(change)) {
      eligible.push(path)
    } else {
      excluded.push({ path, reason: 'delete' })
    }
  }
  return { eligible, excluded }
}
