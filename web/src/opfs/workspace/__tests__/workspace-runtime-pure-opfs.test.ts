import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceRuntime } from '../workspace-runtime'
import type { PendingChange } from '@/opfs/types/opfs-types'

function createPending(
  id: string,
  path: string,
  type: PendingChange['type'],
  reviewStatus?: PendingChange['reviewStatus'],
): PendingChange {
  return {
    id,
    path,
    type,
    fsMtime: 0,
    timestamp: Date.now(),
    reviewStatus,
  }
}

describe('WorkspaceRuntime pure-OPFS mode (no native directory mounted)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Helper: configure a runtime stub where `hasAnyNativeDirectoryHandle` returns
   * the given value. All OPFS-touching methods are mocked so the test focuses
   * purely on the short-circuit branch logic.
   */
  function createPureOpfsRuntime(hasNative: boolean) {
    const runtime = new WorkspaceRuntime(
      'w1',
      {} as FileSystemDirectoryHandle,
      '/tmp',
    ) as any
    runtime.initialized = true
    runtime.hasAnyNativeDirectoryHandle = vi.fn(async () => hasNative)
    runtime.writeToFilesDir = vi.fn(async () => {})
    runtime.deleteFromFilesDir = vi.fn(async () => {})
    runtime.saveMetadata = vi.fn(async () => {})
    runtime.pendingManager = {
      add: vi.fn(async () => {}),
      markAsCreated: vi.fn(async () => {}),
      markForDeletion: vi.fn(async () => {}),
      removeByPath: vi.fn(async () => {}),
      hasPendingPath: vi.fn(() => false),
      getAll: vi.fn(() => []),
      reload: vi.fn(async () => {}),
    }
    runtime.filesIndex = new Set<string>()
    return runtime
  }

  describe('writeFile short-circuit', () => {
    it('writes to OPFS and skips pendingManager when no native handle is mounted', async () => {
      const runtime = createPureOpfsRuntime(false)

      await runtime.writeFile('foo.txt', 'hello', null, null)

      expect(runtime.writeToFilesDir).toHaveBeenCalledWith('foo.txt', 'hello')
      expect(runtime.filesIndex.has('foo.txt')).toBe(true)
      expect(runtime.pendingManager.markAsCreated).not.toHaveBeenCalled()
      expect(runtime.pendingManager.add).not.toHaveBeenCalled()
    })

    it('goes through pendingManager when a native handle is mounted', async () => {
      const runtime = createPureOpfsRuntime(true)
      // Stub the rest of the native-mode path so writeFile can complete.
      runtime.hasFileInIndex = vi.fn(() => false)
      runtime.readFromFilesDir = vi.fn(async () => null)
      runtime.readFromNativeFS = vi.fn(async () => ({
        content: '',
        metadata: { mtime: 0 },
      }))
      runtime.getNativeDirectoryHandleForPath = vi.fn(async () => null)
      runtime.resolvePath = vi.fn(async () => ({ rootName: '', relativePath: 'foo.txt' }))
      runtime.areFileContentsEqual = vi.fn(async () => true)
      runtime.captureModifyBaseline = vi.fn(async () => {})
      runtime.deleteFromBaselineDirIfExists = vi.fn(async () => {})

      await runtime.writeFile('foo.txt', 'hello', null, null)

      // In native mode, pendingManager must be called (markAsCreated for new files).
      expect(runtime.pendingManager.markAsCreated).toHaveBeenCalled()
    })

    it('does NOT short-circuit when caller explicitly passes a directoryHandle', async () => {
      const runtime = createPureOpfsRuntime(false)
      // Even with no native handle mounted, an explicit handle param means
      // the caller (e.g. grant flow) is intentionally bypassing pure-OPFS mode.
      // Stub native-mode methods so writeFile can complete without throwing.
      runtime.hasFileInIndex = vi.fn(() => false)
      runtime.readFromFilesDir = vi.fn(async () => null)
      // Throw NotFoundError so writeFile treats this as a brand-new file
      // and calls pendingManager.markAsCreated.
      runtime.readFromNativeFS = vi.fn(async () => {
        const err = new Error('not found')
        ;(err as Error & { name: string }).name = 'NotFoundError'
        throw err
      })
      runtime.areFileContentsEqual = vi.fn(async () => false)
      runtime.captureModifyBaseline = vi.fn(async () => {})
      runtime.deleteFromBaselineDirIfExists = vi.fn(async () => {})

      const explicitHandle = {} as FileSystemDirectoryHandle
      await runtime.writeFile('foo.txt', 'hello', explicitHandle, null)

      // Should fall through to native-mode logic, NOT the short-circuit return.
      // pendingManager.markAsCreated is called for new files in native mode.
      expect(runtime.pendingManager.markAsCreated).toHaveBeenCalledWith('foo.txt', 0)
    })
  })

  describe('deleteFile short-circuit', () => {
    it('deletes from OPFS and skips pendingManager when no native handle is mounted', async () => {
      const runtime = createPureOpfsRuntime(false)
      runtime.filesIndex.add('foo.txt')

      await runtime.deleteFile('foo.txt', null, null)

      expect(runtime.deleteFromFilesDir).toHaveBeenCalledWith('foo.txt')
      expect(runtime.filesIndex.has('foo.txt')).toBe(false)
      expect(runtime.pendingManager.markForDeletion).not.toHaveBeenCalled()
    })

    it('goes through pendingManager when a native handle is mounted', async () => {
      const runtime = createPureOpfsRuntime(true)
      runtime.filesIndex.add('foo.txt')
      runtime.getAll = vi.fn(() => [])
      runtime.normalizeWorkspacePath = vi.fn((p: string) => p)
      // pendingManager.getAll needs to return [] so .find() returns undefined
      runtime.pendingManager.getAll = vi.fn(() => [])
      runtime.getNativeDirectoryHandleForPath = vi.fn(async () => null)
      runtime.resolvePath = vi.fn(async () => ({ rootName: '', relativePath: 'foo.txt' }))
      runtime.readFromNativeFS = vi.fn(async () => ({
        content: '',
        metadata: { mtime: 0 },
      }))
      runtime.captureModifyBaseline = vi.fn(async () => {})
      runtime.deleteFromBaselineDirIfExists = vi.fn(async () => {})

      await runtime.deleteFile('foo.txt', null, null)

      expect(runtime.pendingManager.markForDeletion).toHaveBeenCalled()
    })
  })

  describe('refreshPendingChanges gate', () => {
    it('skips reconcile loop but still returns legacy pending items', async () => {
      const runtime = createPureOpfsRuntime(false)
      const legacyPending = [
        createPending('p1', 'old-pending.txt', 'create', 'pending'),
        createPending('p2', 'old-modified.txt', 'modify'),
      ]
      runtime.pendingManager.getAll = vi.fn(() => legacyPending)

      const result = await runtime.refreshPendingChanges()

      // Legacy items are still surfaced so users can clean them up.
      expect(result.changes).toHaveLength(2)
      expect(result.changes[0].path).toBe('old-pending.txt')
      expect(result.changes[1].path).toBe('old-modified.txt')
      // added counts the 'create' legacy item.
      expect(result.added).toBe(1)
      expect(result.modified).toBe(1)
    })

    it('returns empty changes when there is no legacy pending data', async () => {
      const runtime = createPureOpfsRuntime(false)
      runtime.pendingManager.getAll = vi.fn(() => [])

      const result = await runtime.refreshPendingChanges()

      expect(result.changes).toHaveLength(0)
      expect(result.added).toBe(0)
      expect(result.modified).toBe(0)
      expect(result.deleted).toBe(0)
    })

    it('filters out approved items from legacy data', async () => {
      const runtime = createPureOpfsRuntime(false)
      runtime.pendingManager.getAll = vi.fn(() => [
        createPending('p1', 'pending.txt', 'create', 'pending'),
        createPending('p2', 'approved.txt', 'create', 'approved'),
      ])

      const result = await runtime.refreshPendingChanges()

      // Approved items are filtered out (reviewStatus === 'approved').
      expect(result.changes).toHaveLength(1)
      expect(result.changes[0].path).toBe('pending.txt')
    })
  })

  describe('hasAnyNativeDirectoryHandle', () => {
    it('returns true when at least one native root is mounted', async () => {
      const runtime = new WorkspaceRuntime(
        'w1',
        {} as FileSystemDirectoryHandle,
        '/tmp',
      ) as any
      runtime.getAllNativeDirectoryHandles = vi.fn(async () => {
        const map = new Map()
        map.set('root1', {} as FileSystemDirectoryHandle)
        return map
      })

      expect(await runtime.hasAnyNativeDirectoryHandle()).toBe(true)
    })

    it('returns false when no native root is mounted', async () => {
      const runtime = new WorkspaceRuntime(
        'w1',
        {} as FileSystemDirectoryHandle,
        '/tmp',
      ) as any
      runtime.getAllNativeDirectoryHandles = vi.fn(async () => new Map())

      expect(await runtime.hasAnyNativeDirectoryHandle()).toBe(false)
    })
  })
})
