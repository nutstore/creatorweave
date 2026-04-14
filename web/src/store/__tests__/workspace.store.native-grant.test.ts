import { beforeEach, describe, expect, it, vi } from 'vitest'

const rebindMock = vi.hoisted(() => vi.fn())
const getWorkspaceMock = vi.hoisted(() => vi.fn())
const getWorkspaceManagerMock = vi.hoisted(() => vi.fn())
const bindRuntimeDirectoryHandleMock = vi.hoisted(() => vi.fn())
const getRuntimeDirectoryHandleMock = vi.hoisted(() => vi.fn())
const requestDirectoryAccessMock = vi.hoisted(() => vi.fn())
const conversationSetActiveMock = vi.hoisted(() => vi.fn(async () => {}))
const toastInfoMock = vi.hoisted(() => vi.fn())
const workspaceRepoMock = vi.hoisted(() => ({
  findWorkspacesByProject: vi.fn(async () => []),
  getRealPendingCounts: vi.fn(async () => new Map()),
  findWorkspaceById: vi.fn(async () => null),
  updateWorkspaceAccessTime: vi.fn(async () => {}),
  createWorkspace: vi.fn(async () => {}),
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
}))

vi.mock('@/sqlite/repositories/workspace.repository', () => ({
  getWorkspaceRepository: vi.fn(() => workspaceRepoMock),
}))

vi.mock('@/sqlite/repositories/project.repository', () => ({
  getProjectRepository: vi.fn(() => ({
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
          lastActiveAt: 1,
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
    getRuntimeDirectoryHandleMock.mockImplementation((id: string) =>
      id === 'project-1' ? projectHandle : null
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
          lastActiveAt: 1,
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
    expect(conversationSetActiveMock).toHaveBeenCalledWith('ws-2')
  })

  it('requestDirectoryAccess binds runtime handle only by project id', async () => {
    const handle = {} as FileSystemDirectoryHandle
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
      expect.objectContaining({ mode: 'readwrite' })
    )
    expect(bindRuntimeDirectoryHandleMock).toHaveBeenCalledWith('project-1', handle)
    expect(bindRuntimeDirectoryHandleMock).not.toHaveBeenCalledWith('ws-1', handle)
  })
})
