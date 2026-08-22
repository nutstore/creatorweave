/**
 * Tests for WorkspaceBackend.listDir native-host disk scan fallback.
 *
 * Background: pre-patch, `WorkspaceBackend.listDir` had Phase 1 (FS Access API
 * iteration) + Phase 2 (OPFS-only merge). For native-host-backed roots, the
 * FS Access API handle is null, so Phase 1 was a no-op and Phase 2 only added
 * OPFS-cached paths — `ls`, `find`, and tree traversal all missed native-host-
 * only directories entirely. Phase 1b fills the gap by querying `diskExec.
 * listDir(rootId, relativePath)` for native-host roots.
 *
 * These tests mock the workspace + diskExec surfaces and verify Phase 1b
 * contributes the expected entries alongside OPFS-only ones.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiskEntry, DiskExecutor } from '@/opfs/native-disk/executor'
import type { VfsDirEntry } from '../vfs-backend'

// Mock the opfs store and workspace store before importing WorkspaceBackend.
const useOPFSStoreMock = vi.hoisted(() => ({
  getState: vi.fn(),
}))
const useWorkspaceStoreMock = vi.hoisted(() => ({
  getState: vi.fn(),
}))
const getWorkspaceManagerMock = vi.hoisted(() => vi.fn())
const resolveNativeDirectoryHandleMock = vi.hoisted(() => vi.fn())

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: useOPFSStoreMock,
}))
vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))
vi.mock('@/opfs', () => ({
  getWorkspaceManager: getWorkspaceManagerMock,
}))
vi.mock('../tool-utils', () => ({
  resolveNativeDirectoryHandle: resolveNativeDirectoryHandleMock,
}))

import { WorkspaceBackend } from '../backends/workspace-backend'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DiskExecMock extends Pick<DiskExecutor, 'listDir'> {}

function createDiskExecMock(entries: DiskEntry[] = []): DiskExecMock {
  return {
    listDir: vi.fn(async (_rootId: string, _relativePath: string): Promise<DiskEntry[]> => entries),
  }
}

function createWorkspaceMock(opts: {
  rootId: string | null
  backend: 'native-host' | 'fsaccess'
  diskEntries?: DiskEntry[]
  nativeHandle?: FileSystemDirectoryHandle | null
  relativePath?: string
}): {
  workspace: {
    resolvePath: ReturnType<typeof vi.fn>
    getNativeDirectoryHandleForPath: ReturnType<typeof vi.fn>
    diskExec: DiskExecMock
  }
} {
  const diskExec = createDiskExecMock(opts.diskEntries ?? [])
  return {
    workspace: {
      resolvePath: vi.fn(async () => ({
        rootName: 'creatorweave',
        rootId: opts.rootId,
        backend: opts.backend,
        relativePath: opts.relativePath ?? '',
        readOnly: false,
      })),
      getNativeDirectoryHandleForPath: vi.fn(async () => opts.nativeHandle ?? null),
      diskExec: diskExec as unknown as DiskExecutor,
    },
  }
}

function setupActiveWorkspace(workspaceId: string | null = 'ws-test') {
  useWorkspaceStoreMock.getState.mockReturnValue({ activeWorkspaceId: workspaceId })
  useOPFSStoreMock.getState.mockReturnValue({
    getCachedPaths: () => [],
    getPendingChanges: () => [],
  })
  resolveNativeDirectoryHandleMock.mockResolvedValue(null)
}

// ---------------------------------------------------------------------------
// Phase 1b — native-host disk scan fallback
// ---------------------------------------------------------------------------

describe('WorkspaceBackend.listDir — native-host fallback (Phase 1b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupActiveWorkspace()
  })

  it('returns diskExec.listDir entries when root is native-host and no FS Access handle', async () => {
    const diskEntries: DiskEntry[] = [
      { name: 'backup.ts', kind: 'file' },
      { name: 'agent', kind: 'directory' },
      { name: 'lib', kind: 'directory' },
    ]
    const { workspace } = createWorkspaceMock({
      rootId: 'scope-123',
      backend: 'native-host',
      diskEntries,
      nativeHandle: null, // native-host roots have no FS Access API handle
      relativePath: 'web/src/opfs',
    })
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn(async () => workspace),
    })

    const backend = new WorkspaceBackend('ws-test', null, 'project-test')
    const entries = await backend.listDir('creatorweave/web/src/opfs')

    const names = entries.map((e: VfsDirEntry) => e.name).sort()
    expect(names).toEqual(['agent', 'backup.ts', 'lib'])
    expect((workspace.diskExec.listDir as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'scope-123',
      'web/src/opfs',
    )
  })

  it('does NOT call diskExec.listDir for fsaccess-backed roots (Phase 1a handles them)', async () => {
    const { workspace } = createWorkspaceMock({
      rootId: 'project-a:root',
      backend: 'fsaccess',
      diskEntries: [{ name: 'should-not-appear', kind: 'file' }],
      nativeHandle: null,
      relativePath: '',
    })
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn(async () => workspace),
    })

    const backend = new WorkspaceBackend('ws-test', null, 'project-test')
    await backend.listDir('creatorweave')

    // Phase 1b must skip when backend !== 'native-host'
    expect((workspace.diskExec.listDir as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('merges native-host disk entries with OPFS-only extras', async () => {
    // Disk has 2 files; OPFS-only has 1 file in a new directory
    const { workspace } = createWorkspaceMock({
      rootId: 'scope-123',
      backend: 'native-host',
      diskEntries: [
        { name: 'from-disk-1.ts', kind: 'file' },
        { name: 'from-disk-2.ts', kind: 'file' },
      ],
      nativeHandle: null,
      relativePath: 'web/src',
    })
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn(async () => workspace),
    })
    // OPFS-only: a Python-written file (not on disk). Prefix with rootName so
    // Phase 2's prefix check matches.
    useOPFSStoreMock.getState.mockReturnValue({
      getCachedPaths: () => ['creatorweave/web/src/opfs-only.py'],
      getPendingChanges: () => [],
    })

    const backend = new WorkspaceBackend('ws-test', null, 'project-test')
    const entries = await backend.listDir('creatorweave/web/src')

    const names = entries.map((e: VfsDirEntry) => e.name).sort()
    expect(names).toContain('from-disk-1.ts')
    expect(names).toContain('from-disk-2.ts')
    expect(names).toContain('opfs-only.py')
  })

  it('silently swallows diskExec.listDir errors (e.g., ENOENT for missing dir)', async () => {
    const diskExec: DiskExecMock = {
      listDir: vi.fn(async () => {
        throw new Error('disk read failed')
      }),
    }
    const workspace = {
      resolvePath: vi.fn(async () => ({
        rootName: 'creatorweave',
        rootId: 'scope-123',
        backend: 'native-host' as const,
        relativePath: 'missing-dir',
        readOnly: false,
      })),
      getNativeDirectoryHandleForPath: vi.fn(async () => null),
      diskExec: diskExec as unknown as DiskExecutor,
    }
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn(async () => workspace),
    })

    const backend = new WorkspaceBackend('ws-test', null, 'project-test')
    // Should NOT throw — Phase 1b's catch swallows the error.
    const entries = await backend.listDir('creatorweave/missing-dir')
    expect(entries).toEqual([])
  })
})