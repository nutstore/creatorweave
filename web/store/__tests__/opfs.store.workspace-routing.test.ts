import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getWorkspaceManagerMock } = vi.hoisted(() => ({
  getWorkspaceManagerMock: vi.fn(),
}))

vi.mock('@/opfs', () => ({
  getWorkspaceManager: getWorkspaceManagerMock,
}))

import { useOPFSStore } from '../opfs.store'
import { useWorkspaceStore } from '../workspace.store'

describe('useOPFSStore workspace routing', () => {
  beforeEach(() => {
    getWorkspaceManagerMock.mockReset()

    useWorkspaceStore.setState({
      activeWorkspaceId: 'ws-b',
    })

    useOPFSStore.setState({
      workspaceId: 'ws-b',
      pendingChanges: [
        {
          id: 'b1',
          path: 'b.txt',
          type: 'modify',
          fsMtime: 1,
          timestamp: 1,
        },
      ],
      cachedPaths: ['b.txt'],
      error: null,
      isLoading: false,
    })
  })

  it('routes readFile by explicit workspaceId instead of active workspace', async () => {
    const workspaceA = {
      readFile: vi.fn(async () => ({
        content: 'from-a',
        metadata: {
          path: 'a.txt',
          mtime: 1,
          size: 6,
          contentType: 'text',
        },
      })),
    }
    const workspaceB = {
      readFile: vi.fn(async () => ({
        content: 'from-b',
        metadata: {
          path: 'b.txt',
          mtime: 1,
          size: 6,
          contentType: 'text',
        },
      })),
    }

    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn(async (id: string) => (id === 'ws-a' ? workspaceA : workspaceB)),
    })

    const result = await useOPFSStore.getState().readFile('a.txt', null, 'ws-a')

    expect(workspaceA.readFile).toHaveBeenCalledWith('a.txt', null, {
      policy: undefined,
      projectId: undefined,
    })
    expect(workspaceB.readFile).not.toHaveBeenCalled()
    expect(result.content).toBe('from-a')
  })

  it('does not overwrite active workspace panel state when writing to another workspace', async () => {
    const workspaceA = {
      writeFile: vi.fn(async () => {}),
      getPendingChanges: vi.fn(() => [
        { id: 'a1', path: 'a.txt', type: 'modify', fsMtime: 2, timestamp: 2 },
      ]),
      getCachedPaths: vi.fn(() => ['a.txt']),
    }
    const workspaceB = {
      writeFile: vi.fn(async () => {}),
      getPendingChanges: vi.fn(() => [
        { id: 'b1', path: 'b.txt', type: 'modify', fsMtime: 1, timestamp: 1 },
      ]),
      getCachedPaths: vi.fn(() => ['b.txt']),
    }

    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn(async (id: string) => (id === 'ws-a' ? workspaceA : workspaceB)),
    })

    await useOPFSStore.getState().writeFile('a.txt', 'next', null, 'ws-a')

    expect(workspaceA.writeFile).toHaveBeenCalledWith('a.txt', 'next', null, undefined)
    expect(workspaceB.writeFile).not.toHaveBeenCalled()

    const state = useOPFSStore.getState()
    expect(state.pendingChanges.map((item) => item.path)).toEqual(['b.txt'])
    expect(state.cachedPaths).toEqual(['b.txt'])
  })
})
