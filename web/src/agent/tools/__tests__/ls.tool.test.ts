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
  resolveVfsTarget: async (...args: unknown[]) => {
    const target = await resolveVfsTargetMock(...args)
    if (!target || target.backend) return target
    if (target.kind === 'agent') {
      return {
        ...target,
        backend: {
          label: 'agent',
          getDirectoryHandle: async () =>
            target.agentManager.getDirectoryHandle?.(target.agentId, target.path, { allowMissing: false }),
          listAgents: target.agentManager.listAgents,
        },
      }
    }
    return target
  },
  withVfsAgentIdHint: (message: string) => message,
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

function createDirectoryHandleWithFiles(fileNames: string[], name = 'root'): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      for (const fileName of fileNames) {
        yield [
          fileName,
          {
            kind: 'file',
            name: fileName,
          } as unknown as FileSystemFileHandle,
        ] as const
      }
    },
    getDirectoryHandle: vi.fn(async () => createEmptyDirectoryHandle('child')),
  } as unknown as FileSystemDirectoryHandle
}

/** Parse the Tool Envelope V2 result */
function parseEnvelope(result: string) {
  return JSON.parse(result) as {
    ok: boolean
    tool: string
    version: number
    data: unknown
    meta?: Record<string, unknown>
    error?: { code: string; message: string }
  }
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

    const envelope = parseEnvelope(result)
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual([])
    expect(envelope.meta?._hint).toContain('No files matching pattern')
  })

  it('returns no-directory error when all handle sources are unavailable', async () => {
    const result = await lsExecutor(
      { pattern: '**/*.ts' },
      { directoryHandle: null } as unknown as ToolContext
    )

    const envelope = parseEnvelope(result)
    expect(envelope.ok).toBe(false)
    expect(envelope.error?.message).toContain('No directory selected.')
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

    const envelope = parseEnvelope(result)
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual([])
    expect(getNativeDirectoryHandle).toHaveBeenCalled()
    expect(getFilesDir).toHaveBeenCalled()
  })

  it('supports glob scans on vfs agents namespace', async () => {
    const getDirectoryHandle = vi.fn(async () => createEmptyDirectoryHandle('agent-root'))
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

    const envelope = parseEnvelope(result)
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual([])
    expect(getDirectoryHandle).toHaveBeenCalledWith('default', '', { allowMissing: false })
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

    const envelope = parseEnvelope(result)
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual([
      { name: 'default', kind: 'directory' },
      { name: 'novel-editor', kind: 'directory' },
    ])
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

    const envelope = parseEnvelope(result)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as Array<{ name: string; path: string }>
    expect(data.some(e => e.path === 'novel-editor/SOUL.md')).toBe(true)
    expect(resolveAgentHandle).toHaveBeenCalledWith('novel-editor', '', { allowMissing: false })
  })

  it('matches exact filename pattern at workspace root', async () => {
    const rootHandle = createDirectoryHandleWithFiles([
      'loan-contract-template.docx',
      'ai-assistant-overview-rich.docx',
      'ai-assistant-overview.docx',
    ])

    const result = await lsExecutor(
      { pattern: 'loan-contract-template.docx' },
      { directoryHandle: rootHandle } as unknown as ToolContext
    )

    const envelope = parseEnvelope(result)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as Array<{ name: string }>
    expect(data.some(e => e.name === 'loan-contract-template.docx')).toBe(true)
  })

  it('matches exact filename pattern when path is "./"', async () => {
    const rootHandle = createDirectoryHandleWithFiles([
      'loan-contract-template.docx',
      'ai-assistant-overview-rich.docx',
      'ai-assistant-overview.docx',
    ])

    const result = await lsExecutor(
      { path: './', pattern: 'loan-contract-template.docx' },
      { directoryHandle: rootHandle } as unknown as ToolContext
    )

    const envelope = parseEnvelope(result)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as Array<{ name: string }>
    expect(data.some(e => e.name === 'loan-contract-template.docx')).toBe(true)
  })
})
