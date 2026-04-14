import { describe, expect, it, vi } from 'vitest'
import { WorkspacePendingManager } from '../workspace-pending'
import type { PendingChange } from '@/opfs/types/opfs-types'

function createPending(path: string, type: PendingChange['type'], fsMtime: number): PendingChange {
  return {
    id: `p-${type}`,
    path,
    type,
    fsMtime,
    timestamp: Date.now(),
  }
}

describe('WorkspacePendingManager migration conflict fallback', () => {
  it('treats modify as non-conflict when native content still equals baseline', async () => {
    const manager = new WorkspacePendingManager('w1', {} as FileSystemDirectoryHandle) as any
    manager.readNativeMtime = vi.fn(async () => 200)
    manager.readBaselineBytes = vi.fn(async () => new Uint8Array([1, 2, 3]))
    manager.readNativeBytes = vi.fn(async () => new Uint8Array([1, 2, 3]))

    const check = await manager.checkNativeConflict(
      {} as FileSystemDirectoryHandle,
      createPending('src/a.ts', 'modify', 100)
    )

    expect(check.isConflict).toBe(false)
  })

  it('keeps modify as conflict when native content diverged from baseline', async () => {
    const manager = new WorkspacePendingManager('w1', {} as FileSystemDirectoryHandle) as any
    manager.readNativeMtime = vi.fn(async () => 200)
    manager.readBaselineBytes = vi.fn(async () => new Uint8Array([1, 2, 3]))
    manager.readNativeBytes = vi.fn(async () => new Uint8Array([9, 9, 9]))

    const check = await manager.checkNativeConflict(
      {} as FileSystemDirectoryHandle,
      createPending('src/a.ts', 'modify', 100)
    )

    expect(check.isConflict).toBe(true)
  })

  it('treats delete as non-conflict when native content still equals baseline', async () => {
    const manager = new WorkspacePendingManager('w1', {} as FileSystemDirectoryHandle) as any
    manager.readNativeMtime = vi.fn(async () => 200)
    manager.readBaselineBytes = vi.fn(async () => new Uint8Array([4, 5, 6]))
    manager.readNativeBytes = vi.fn(async () => new Uint8Array([4, 5, 6]))

    const check = await manager.checkNativeConflict(
      {} as FileSystemDirectoryHandle,
      createPending('src/a.ts', 'delete', 100)
    )

    expect(check.isConflict).toBe(false)
  })
})

