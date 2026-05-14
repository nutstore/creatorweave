import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRuntimeDirectoryHandleMock = vi.hoisted(() => vi.fn())
const findWorkspaceByIdMock = vi.hoisted(() => vi.fn())

vi.mock('@/native-fs', () => ({
  getRuntimeDirectoryHandle: getRuntimeDirectoryHandleMock,
  getRuntimeHandlesForProject: () => new Map(),
}))

vi.mock('@/sqlite/repositories/project-root.repository', () => ({
  getProjectRootRepository: () => ({
    findByProject: vi.fn(async () => [
      { name: 'root-a', readOnly: false, isDefault: true },
    ]),
  }),
}))

vi.mock('@/sqlite/repositories/workspace.repository', () => ({
  getWorkspaceRepository: () => ({
    findWorkspaceById: findWorkspaceByIdMock,
  }),
}))

import { WorkspaceRuntime } from '../workspace-runtime'

describe('WorkspaceRuntime native handle scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves native handle via workspace-bound projectId (not global activeProject)', async () => {
    const runtime = new WorkspaceRuntime('ws-1', {} as FileSystemDirectoryHandle, '/tmp')
    const projectHandle = {} as FileSystemDirectoryHandle

    // Simulate: workspace ws-1 belongs to project-1
    findWorkspaceByIdMock.mockResolvedValue({ id: 'ws-1', projectId: 'project-1' })
    getRuntimeDirectoryHandleMock.mockImplementation((id: string) =>
      id === 'project-1' ? projectHandle : null
    )

    const result = await runtime.getNativeDirectoryHandle()

    expect(result).toBe(projectHandle)
    expect(getRuntimeDirectoryHandleMock).toHaveBeenCalledWith('project-1')
    expect(getRuntimeDirectoryHandleMock).not.toHaveBeenCalledWith('ws-1')
  })

  it('returns null when workspace has no associated project', async () => {
    const runtime = new WorkspaceRuntime('ws-1', {} as FileSystemDirectoryHandle, '/tmp')
    findWorkspaceByIdMock.mockResolvedValue({ id: 'ws-1', projectId: null })

    const result = await runtime.getNativeDirectoryHandle()

    expect(result).toBeNull()
  })

  it('returns null when workspace lookup fails', async () => {
    const runtime = new WorkspaceRuntime('ws-1', {} as FileSystemDirectoryHandle, '/tmp')
    findWorkspaceByIdMock.mockResolvedValue(null)

    const result = await runtime.getNativeDirectoryHandle()

    expect(result).toBeNull()
  })
})
