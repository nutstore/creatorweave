import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { lsExecutor } from '../ls.tool'

const getActiveConversationMock = vi.fn()
const getCurrentHandleMock = vi.fn()
const resolveVfsTargetMock = vi.fn()
const getWorkspaceManagerMock = vi.fn()

vi.mock('@/store/conversation-context.store', () => ({
  getActiveConversation: () => getActiveConversationMock(),
}))

vi.mock('@/store/folder-access.store', () => ({
  useFolderAccessStore: {
    getState: () => ({
      getCurrentHandle: () => getCurrentHandleMock(),
    }),
  },
}))

vi.mock('../vfs-resolver', () => ({
  resolveVfsTarget: (...args: unknown[]) => resolveVfsTargetMock(...args),
}))

vi.mock('@/opfs', () => ({
  getWorkspaceManager: () => getWorkspaceManagerMock(),
}))

function createEmptyDirectoryHandle(name = 'root'): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      return
    },
    getDirectoryHandle: vi.fn(async () => createEmptyDirectoryHandle('child')),
  } as unknown as FileSystemDirectoryHandle
}

describe('ls tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getActiveConversationMock.mockResolvedValue(undefined)
    getCurrentHandleMock.mockReturnValue(null)
  })

  it('falls back to folder-access current handle when context handle is missing', async () => {
    getCurrentHandleMock.mockReturnValue(createEmptyDirectoryHandle())

    const result = await lsExecutor(
      { pattern: '**/*.ts' },
      { directoryHandle: null } as unknown as ToolContext
    )

    expect(result).toContain('No files matching pattern')
    expect(result).not.toContain('No directory selected.')
  })

  it('returns no-directory error when all handle sources are unavailable', async () => {
    const result = await lsExecutor(
      { pattern: '**/*.ts' },
      { directoryHandle: null } as unknown as ToolContext
    )

    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('No directory selected.')
  })

  it('falls back to workspace files dir when native directory is unavailable', async () => {
    const getNativeDirectoryHandle = vi.fn().mockResolvedValue(null)
    const getFilesDir = vi.fn().mockResolvedValue(createEmptyDirectoryHandle())
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn().mockResolvedValue({
        getNativeDirectoryHandle,
        getFilesDir,
      }),
    })

    const result = await lsExecutor(
      { pattern: '**/*.ts' },
      { directoryHandle: null, workspaceId: 'ws_1' } as unknown as ToolContext
    )

    expect(result).toContain('No files matching pattern')
    expect(result).not.toContain('No directory selected.')
    expect(getNativeDirectoryHandle).toHaveBeenCalled()
    expect(getFilesDir).toHaveBeenCalled()
  })

  it('supports glob scans on vfs agents namespace', async () => {
    const getDirectoryHandle = vi.fn(async () => ({
      handle: createEmptyDirectoryHandle('agent-root'),
      exists: false,
    }))
    resolveVfsTargetMock.mockResolvedValueOnce({
      kind: 'agent',
      path: '',
      agentId: 'default',
      projectId: 'project-1',
      agentManager: {
        getDirectoryHandle,
      },
    })

    const result = await lsExecutor(
      { path: 'vfs://agents/default', pattern: 'src/**/*.ts' },
      { directoryHandle: null } as unknown as ToolContext
    )

    expect(result).toContain('No files matching pattern')
    expect(getDirectoryHandle).toHaveBeenCalledWith('default', 'src', { allowMissing: true })
  })

  it('lists agents for vfs://agents in list mode', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({
      kind: 'agent',
      path: '',
      agentId: '',
      projectId: 'project-1',
      agentManager: {
        listAgents: vi.fn(async () => [
          { id: 'default', name: 'default' },
          { id: 'novel-editor', name: 'novel-editor' },
        ]),
      },
    })

    const result = await lsExecutor(
      { path: 'vfs://agents' },
      { directoryHandle: null } as unknown as ToolContext
    )

    expect(result).toContain('default/')
    expect(result).toContain('novel-editor/')
  })

  it('supports glob scans on vfs://agents root and returns namespaced paths', async () => {
    const agentRoot = {
      kind: 'directory',
      name: 'root',
      entries: async function* () {
        yield [
          'SOUL.md',
          {
            kind: 'file',
            name: 'SOUL.md',
          } as unknown as FileSystemFileHandle,
        ] as const
      },
    } as unknown as FileSystemDirectoryHandle

    const resolveAgentHandle = vi.fn(async () => ({
      handle: agentRoot,
      exists: true,
    }))

    resolveVfsTargetMock.mockResolvedValueOnce({
      kind: 'agent',
      path: '',
      agentId: '',
      projectId: 'project-1',
      agentManager: {
        listAgents: vi.fn(async () => [{ id: 'novel-editor', name: 'novel-editor' }]),
        getDirectoryHandle: resolveAgentHandle,
      },
    })

    const result = await lsExecutor(
      { path: 'vfs://agents', pattern: '**/SOUL.md' },
      { directoryHandle: null } as unknown as ToolContext
    )

    expect(result).toContain('novel-editor/SOUL.md')
    expect(resolveAgentHandle).toHaveBeenCalledWith('novel-editor', '', { allowMissing: false })
  })
})
