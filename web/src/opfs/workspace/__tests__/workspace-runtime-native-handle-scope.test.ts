import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRuntimeDirectoryHandleMock = vi.hoisted(() => vi.fn())
const findActiveProjectMock = vi.hoisted(() => vi.fn())

vi.mock('@/native-fs', () => ({
  getRuntimeDirectoryHandle: getRuntimeDirectoryHandleMock,
}))

vi.mock('@/sqlite/repositories/project.repository', () => ({
  getProjectRepository: () => ({
    findActiveProject: findActiveProjectMock,
  }),
}))

import { WorkspaceRuntime } from '../workspace-runtime'

describe('WorkspaceRuntime native handle scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves native handle by active project id (not workspace id)', async () => {
    const runtime = new WorkspaceRuntime('ws-1', {} as FileSystemDirectoryHandle, '/tmp')
    const projectHandle = {} as FileSystemDirectoryHandle

    findActiveProjectMock.mockResolvedValue({ id: 'project-1' })
    getRuntimeDirectoryHandleMock.mockImplementation((id: string) =>
      id === 'project-1' ? projectHandle : null
    )

    const result = await runtime.getNativeDirectoryHandle()

    expect(result).toBe(projectHandle)
    expect(getRuntimeDirectoryHandleMock).toHaveBeenCalledWith('project-1')
    expect(getRuntimeDirectoryHandleMock).not.toHaveBeenCalledWith('ws-1')
  })

  it('returns null when no active project is available', async () => {
    const runtime = new WorkspaceRuntime('ws-1', {} as FileSystemDirectoryHandle, '/tmp')
    findActiveProjectMock.mockResolvedValue(null)

    const result = await runtime.getNativeDirectoryHandle()

    expect(result).toBeNull()
  })
})

