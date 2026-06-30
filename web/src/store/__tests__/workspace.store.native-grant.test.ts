import { beforeEach, describe, expect, it, vi } from 'vitest'

const rebindMock = vi.hoisted(() => vi.fn())
const getWorkspaceMock = vi.hoisted(() => vi.fn())
const getWorkspaceManagerMock = vi.hoisted(() => vi.fn())
const bindRuntimeDirectoryHandleMock = vi.hoisted(() => vi.fn())
const getRuntimeDirectoryHandleMock = vi.hoisted(() => vi.fn())
const getRuntimeHandlesForProjectMock = vi.hoisted(() => vi.fn((_id: string) => new Map()))
const requestDirectoryAccessMock = vi.hoisted(() => vi.fn())
const conversationSetActiveMock = vi.hoisted(() => vi.fn(async () => {}))
const toastInfoMock = vi.hoisted(() => vi.fn())
const workspaceRepoMock = vi.hoisted(() => ({
  findWorkspacesByProject: vi.fn(async () => []),
  getRealPendingCounts: vi.fn(async () => new Map()),
  findWorkspaceById: vi.fn(async () => null),
  findActiveWorkspaceByProject: vi.fn(async () => null),
  setActiveWorkspaceForProject: vi.fn(async () => {}),
  updateWorkspaceAccessTime: vi.fn(async () => {}),
  createWorkspace: vi.fn(async () => {}),
  upsertWorkspace: vi.fn(async () => {}),
  updateWorkspaceStats: vi.fn(async () => {}),
  deleteWorkspace: vi.fn(async () => {}),
  updateWorkspaceName: vi.fn(async () => {}),
}))

vi.mock('@/opfs', () => ({
  getWorkspaceManager: getWorkspaceManagerMock,
  WorkspaceFiles: {},
}))

vi.mock('@/native-fs', () => ({
  requestDirectoryAccess: requestDirectoryAccessMock,
  releaseDirectoryHandle: vi.fn(),
  bindRuntimeDirectoryHandle: bindRuntimeDirectoryHandleMock,
  getRuntimeDirectoryHandle: getRuntimeDirectoryHandleMock,
  getRuntimeHandlesForProject: getRuntimeHandlesForProjectMock,
}))

vi.mock('@/sqlite/repositories/workspace.repository', () => ({
  getWorkspaceRepository: vi.fn(() => workspaceRepoMock),
}))

// PR-B: resolveActiveProjectId() in workspace.store now reads
// useProjectStore.getState().activeProjectId (URL-driven, not a persisted
// singleton) instead of getProjectRepository().findActiveProject(). Mock the
// project store so the workspace store's initialize() proceeds past the
// early-return guard and re-derives hasDirectoryHandle.
const projectStoreStateMock = vi.hoisted(() => ({ activeProjectId: 'project-1' }))
vi.mock('../project.store', () => ({
  useProjectStore: {
    getState: () => projectStoreStateMock,
  },
}))
vi.mock('@/sqlite/repositories/project.repository', () => ({
  getProjectRepository: vi.fn(() => ({
    // Legacy dead-code mock — retained for any import that still references it.
    findActiveProject: vi.fn(async () => ({ id: 'project-1' })),
  })),
}))

vi.mock('@/sqlite/repositories/fs-overlay.repository', () => ({
  getFSOverlayRepository: vi.fn(() => ({
    listSnapshotOps: vi.fn(async () => []),
  })),
}))

vi.mock('sonner', () => ({
  toast: {
    info: toastInfoMock,
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../conversation.store', () => ({
  useConversationStore: {
    getState: () => ({
      activeConversationId: null,
      setActive: conversationSetActiveMock,
      conversations: [],
    }),
  },
}))

import { useWorkspaceStore } from '../workspace.store'

describe('workspace.store native directory grant feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    getWorkspaceMock.mockResolvedValue({
      pendingCount: 0,
      rebindPendingBaselinesToNative: rebindMock,
      getUnsyncedSnapshots: vi.fn(async () => []),
    })
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: getWorkspaceMock,
      createWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
    })

    getRuntimeDirectoryHandleMock.mockReturnValue(null)
    requestDirectoryAccessMock.mockResolvedValue(null)

    useWorkspaceStore.setState({
      activeWorkspaceId: 'ws-1',
      workspaces: [
        {
          id: 'ws-1',
          name: 'ws-1',
          createdAt: 1,
          lastAccessedAt: 1,
          cacheSize: 0,
          pendingCount: 0,
          modifiedFiles: 0,
          status: 'active',
        },
      ],
      hasDirectoryHandle: false,
      showPreview: false,
      // Avoid running full side-effects in this unit test.
      checkUnsyncedSnapshots: vi.fn(async () => {}),
      refreshPendingChanges: vi.fn(async () => {}),
    })
  })

  it('shows migration summary when rebase or conflicts are detected', async () => {
    rebindMock.mockResolvedValue({
      checked: 3,
      rebased: 2,
      skipped: 1,
      conflicts: 1,
    })

    await useWorkspaceStore.getState().onNativeDirectoryGranted({} as FileSystemDirectoryHandle)

    expect(bindRuntimeDirectoryHandleMock).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().hasDirectoryHandle).toBe(true)
    expect(toastInfoMock).toHaveBeenCalledWith(
      expect.stringContaining('已重建 2 个变更基线'),
      expect.objectContaining({
        action: expect.objectContaining({ label: '查看' }),
      })
    )
  })

  it('does not show migration toast when no rebase/conflict happened', async () => {
    rebindMock.mockResolvedValue({
      checked: 0,
      rebased: 0,
      skipped: 0,
      conflicts: 0,
    })

    await useWorkspaceStore.getState().onNativeDirectoryGranted({} as FileSystemDirectoryHandle)

    expect(toastInfoMock).not.toHaveBeenCalled()
  })

  it('switchWorkspace reuses project native handle and triggers migration rebind', async () => {
    const projectHandle = {} as FileSystemDirectoryHandle
    // Multi-root: switchWorkspace picks any handle bound for the project
    // (folder-access.store binds under handle.name, not projectId), so the
    // single-root getRuntimeDirectoryHandle lookup is not used here.
    getRuntimeHandlesForProjectMock.mockImplementation((id: string) =>
      id === 'project-1'
        ? new Map([['my-root', projectHandle]])
        : new Map()
    )
    rebindMock.mockResolvedValue({
      checked: 2,
      rebased: 1,
      skipped: 1,
      conflicts: 0,
    })
    workspaceRepoMock.findWorkspaceById.mockResolvedValue({
      id: 'ws-2',
      projectId: 'project-1',
      rootDirectory: 'workspaces/ws-2',
      name: 'ws-2',
      status: 'active',
      cacheSize: 0,
      pendingCount: 0,
      modifiedFiles: 0,
      createdAt: 1,
      lastAccessedAt: 1,
    } as any)

    useWorkspaceStore.setState((state) => ({
      ...state,
      workspaces: [
        ...state.workspaces,
        {
          id: 'ws-2',
          name: 'ws-2',
          createdAt: 1,
          lastAccessedAt: 1,
          cacheSize: 0,
          pendingCount: 0,
          modifiedFiles: 0,
          status: 'active',
        },
      ],
    }))

    await useWorkspaceStore.getState().switchWorkspace('ws-2')

    expect(bindRuntimeDirectoryHandleMock).not.toHaveBeenCalledWith('ws-2', projectHandle)
    expect(rebindMock).toHaveBeenCalledWith(projectHandle)
    expect(useWorkspaceStore.getState().hasDirectoryHandle).toBe(true)
    // PR-B: conversation activation is now URL-driven (syncFromRoute in
    // App.tsx), NOT done by switchWorkspace. Assert it does NOT call
    // conversation.setActive — that would re-introduce cross-tab coupling.
    expect(conversationSetActiveMock).not.toHaveBeenCalled()
  })

  it('requestDirectoryAccess binds runtime handle only by project id', async () => {
    const handle = { name: 'my-project' } as FileSystemDirectoryHandle
    requestDirectoryAccessMock.mockResolvedValue(handle)
    rebindMock.mockResolvedValue({
      checked: 0,
      rebased: 0,
      skipped: 0,
      conflicts: 0,
    })

    await useWorkspaceStore.getState().requestDirectoryAccess()

    expect(requestDirectoryAccessMock).toHaveBeenCalledWith(
      'project-1',
      'project-1',
      expect.objectContaining({ mode: 'readwrite' })
    )
    // Multi-root: bindRuntimeDirectoryHandle is called with (projectId, rootName, handle)
    expect(bindRuntimeDirectoryHandleMock).toHaveBeenCalledWith('project-1', 'my-project', handle)
    expect(bindRuntimeDirectoryHandleMock).not.toHaveBeenCalledWith('ws-1', expect.anything(), handle)
  })

  it('initialize re-derives hasDirectoryHandle from the live runtime handle table', async () => {
    // Regression: initialize() applies PENDING_RESET_PATCH which contains
    // `hasDirectoryHandle: false`. folder-access hydration (triggered earlier
    // by initializeProjects) may have already set it to `true` and bound a
    // live runtime handle. initialize() must re-derive the value from the
    // live handle table instead of clobbering it back to false.
    const { getRuntimeHandlesForProject } = await import('@/native-fs')
    ;(getRuntimeHandlesForProject as ReturnType<typeof vi.fn>).mockReturnValue(
      new Map([['my-root', {} as FileSystemDirectoryHandle]])
    )
    useWorkspaceStore.setState({ hasDirectoryHandle: true })
    // PR-B: resolveActiveProjectId() reads the project store. Ensure a project
    // is "active" so initialize() loads the workspace list instead of
    // early-returning (which would skip the hasDirectoryHandle re-derivation).
    projectStoreStateMock.activeProjectId = 'project-1'

    await useWorkspaceStore.getState().initialize()

    expect(useWorkspaceStore.getState().hasDirectoryHandle).toBe(true)

    // And when no live handle exists, it must be false.
    ;(getRuntimeHandlesForProject as ReturnType<typeof vi.fn>).mockReturnValue(new Map())
    await useWorkspaceStore.getState().initialize()
    expect(useWorkspaceStore.getState().hasDirectoryHandle).toBe(false)
  })

  it('refreshWorkspaces clears stale pendingChanges and preview state', async () => {
    useWorkspaceStore.setState({
      pendingChanges: {
        changes: [{ type: 'modify', path: 'stale.txt', size: 1 }],
        added: 0,
        modified: 1,
        deleted: 0,
      },
      showPreview: true,
      previewSelectedPath: 'stale.txt',
      unsyncedSnapshots: [
        {
          snapshotId: 'snap_stale',
          summary: 'stale',
          createdAt: Date.now(),
          opCount: 1,
        },
      ],
    })

    await useWorkspaceStore.getState().refreshWorkspaces()

    const state = useWorkspaceStore.getState()
    expect(state.pendingChanges).toBeNull()
    expect(state.showPreview).toBe(false)
    expect(state.previewSelectedPath).toBeNull()
    expect(state.unsyncedSnapshots).toEqual([])
  })
})
