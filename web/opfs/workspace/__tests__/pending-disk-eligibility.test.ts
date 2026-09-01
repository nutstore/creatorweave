import { describe, expect, it } from 'vitest'
import {
  filterDiskEligiblePendingChanges,
  isDiskEligiblePendingChange,
  partitionPathsByDiskEligibility,
} from '../pending-disk-eligibility'
import type { PendingChange } from '../../types/opfs-types'

const change = (path: string, type: PendingChange['type']): PendingChange =>
  ({ id: `op-${path}`, path, type, timestamp: 1 }) as PendingChange

describe('pending-disk-eligibility (authorized vs unattended channels)', () => {
  it('creates/modifies are always eligible', () => {
    expect(isDiskEligiblePendingChange(change('a.ts', 'create'))).toBe(true)
    expect(isDiskEligiblePendingChange(change('a.ts', 'modify'))).toBe(true)
    expect(
      isDiskEligiblePendingChange(change('a.ts', 'modify'), { includeDeletions: true }),
    ).toBe(true)
  })

  it('deletions are eligible ONLY on authorized channels (includeDeletions)', () => {
    // Unattended channel (run-level auto-apply): deletion must NOT reach disk.
    expect(isDiskEligiblePendingChange(change('a.ts', 'delete'))).toBe(false)
    expect(
      isDiskEligiblePendingChange(change('a.ts', 'delete'), { includeDeletions: false }),
    ).toBe(false)
    // Authorized channel (sync-to-disk with a deletion-bearing approval): honored.
    expect(
      isDiskEligiblePendingChange(change('a.ts', 'delete'), { includeDeletions: true }),
    ).toBe(true)
  })

  it('filter keeps run-level auto-apply deletion-free by default', () => {
    const changes = [change('a.ts', 'modify'), change('b.ts', 'delete'), change('c.ts', 'create')]
    expect(filterDiskEligiblePendingChanges(changes).map((c) => c.path)).toEqual([
      'a.ts',
      'c.ts',
    ])
    // Authorized channel keeps the deletion.
    expect(
      filterDiskEligiblePendingChanges(changes, { includeDeletions: true }).map((c) => c.path),
    ).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })

  it('partition splits deletions out only when the channel excludes them', () => {
    const pending = [change('a.ts', 'modify'), change('gone.ts', 'delete')]
    const paths = ['a.ts', 'gone.ts']

    expect(partitionPathsByDiskEligibility(paths, pending)).toEqual({
      eligible: ['a.ts'],
      excluded: [{ path: 'gone.ts', reason: 'delete' }],
    })
    expect(partitionPathsByDiskEligibility(paths, pending, { includeDeletions: true })).toEqual({
      eligible: ['a.ts', 'gone.ts'],
      excluded: [],
    })
  })

  it('partition reports unknown paths regardless of channel', () => {
    const pending = [change('gone.ts', 'delete')]
    expect(partitionPathsByDiskEligibility(['nope.ts'], pending, { includeDeletions: true })).toEqual({
      eligible: [],
      excluded: [{ path: 'nope.ts', reason: 'unknown' }],
    })
  })
})
