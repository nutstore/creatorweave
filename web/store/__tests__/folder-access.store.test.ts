import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRepo = vi.hoisted(() => ({
  load: vi.fn(),
  loadAllForProject: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
  deleteByProjectAndRoot: vi.fn(),
}))

const mockNativeFS = vi.hoisted(() => ({
  bindRuntimeDirectoryHandle: vi.fn(),
  unbindRuntimeDirectoryHandle: vi.fn(),
}))

const mockWorkspaceStore = vi.hoisted(() => ({
  onNativeDirectoryGranted: vi.fn(),
}))

const mockProjectRootRepo = vi.hoisted(() => ({
  findByProject: vi.fn(),
  createRoot: vi.fn(),
  deleteRoot: vi.fn(),
  setDefaultRoot: vi.fn(),
}))

const mockNativeHostExecutor = vi.hoisted(() => ({
  revokeRoot: vi.fn(),
}))

vi.mock('@/services/folder-access.repository', () => ({
  folderAccessRepo: mockRepo,
}))

vi.mock('@/services/fsAccess.service', () => ({
  selectFolderReadWrite: vi.fn(),
}))

vi.mock('@/native-fs', () => ({
  bindRuntimeDirectoryHandle: mockNativeFS.bindRuntimeDirectoryHandle,
  unbindRuntimeDirectoryHandle: mockNativeFS.unbindRuntimeDirectoryHandle,
  getRuntimeHandlesForProject: vi.fn(() => new Map()),
}))

vi.mock('@/sqlite', () => ({
  getProjectRootRepository: () => mockProjectRootRepo,
}))

vi.mock('@/opfs/native-disk/executor', () => ({
  isNativeHostAvailable: vi.fn(() => true),
}))

vi.mock('@/opfs/native-disk/executor-native-host', () => ({
  NativeHostExecutor: class {
    revokeRoot = mockNativeHostExecutor.revokeRoot
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/store/remote.store', () => ({
  useRemoteStore: {
    getState: vi.fn(() => ({
      session: null,
      getRole: vi.fn(() => 'participant'),
      refreshFileTree: vi.fn(),
    })),
  },
}))

vi.mock('../workspace.store', () => ({
  useWorkspaceStore: {
    getState: () => ({
      onNativeDirectoryGranted: mockWorkspaceStore.onNativeDirectoryGranted,
    }),
  },
}))

import { useFolderAccessStore } from '../folder-access.store'

describe('folder-access.store runtime handle binding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepo.loadAllForProject.mockResolvedValue([])
    mockProjectRootRepo.findByProject.mockResolvedValue([])
    useFolderAccessStore.setState({
      activeProjectId: null,
      records: {},
    })
  })

  it('binds runtime handle during hydrate when persisted permission is granted', async () => {
    const projectId = 'project-1'
    const handle = {
      name: 'demo',
      queryPermission: vi.fn().mockResolvedValue('granted'),
    } as unknown as FileSystemDirectoryHandle

    mockRepo.load.mockResolvedValue({
      projectId,
      folderName: 'demo',
      handle: null,
      persistedHandle: handle,
      status: 'needs_user_activation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await useFolderAccessStore.getState().setActiveProject(projectId)

    const record = useFolderAccessStore.getState().records[projectId]
    expect(record.status).toBe('ready')
    expect(record.handle).toBe(handle)
    expect(mockNativeFS.bindRuntimeDirectoryHandle).toHaveBeenCalledWith(projectId, 'demo', handle)
    expect(mockWorkspaceStore.onNativeDirectoryGranted).toHaveBeenCalledWith(handle)
  })

  it('binds runtime handle after requestPermission succeeds', async () => {
    const projectId = 'project-2'
    const handle = {
      name: 'repo',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    } as unknown as FileSystemDirectoryHandle

    useFolderAccessStore.setState({
      activeProjectId: projectId,
      records: {
        [projectId]: {
          projectId,
          folderName: 'repo',
          handle: null,
          persistedHandle: handle,
          status: 'needs_user_activation',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    })

    mockRepo.save.mockResolvedValue(undefined)
    const granted = await useFolderAccessStore.getState().requestPermission(projectId)

    const record = useFolderAccessStore.getState().records[projectId]
    expect(granted).toBe(true)
    expect(record.status).toBe('ready')
    expect(record.handle).toBe(handle)
    expect(mockNativeFS.bindRuntimeDirectoryHandle).toHaveBeenCalledWith(projectId, 'repo', handle)
    expect(mockWorkspaceStore.onNativeDirectoryGranted).toHaveBeenCalledWith(handle)
  })

  it('removes a native-host root locally when host revocation fails', async () => {
    const projectId = 'project-3'
    const rootId = 'root-native-1'
    const scopeId = 'scope_missing'
    mockNativeHostExecutor.revokeRoot.mockRejectedValueOnce(new Error(`unknown scope_id: ${scopeId}`))

    useFolderAccessStore.setState({
      activeProjectId: projectId,
      roots: [{
        id: rootId,
        name: 'orphaned-folder',
        isDefault: false,
        readOnly: false,
        backend: 'native-host',
        scopeId,
        handle: null,
        persistedHandle: null,
        status: 'idle',
      }],
    })

    await useFolderAccessStore.getState().removeRoot(rootId)

    expect(mockNativeHostExecutor.revokeRoot).toHaveBeenCalledWith(projectId, scopeId)
    expect(mockProjectRootRepo.deleteRoot).toHaveBeenCalledWith(rootId)
    expect(mockRepo.deleteByProjectAndRoot).toHaveBeenCalledWith(projectId, 'orphaned-folder')
  })
})
