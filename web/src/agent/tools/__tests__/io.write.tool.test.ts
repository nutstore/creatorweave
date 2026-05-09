import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { writeExecutor } from '../io.tool'

type PendingChangeMock = {
  id: string
  path: string
  type: 'create' | 'modify' | 'delete'
  fsMtime: number
  timestamp: number
}

const writeFileMock = vi.fn()
const getPendingChangesMock = vi.fn<() => PendingChangeMock[]>(() => [])
const hasCachedFileMock = vi.fn(() => false)
const resolveVfsTargetMock = vi.fn()

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: {
    getState: () => ({
      writeFile: writeFileMock,
      getPendingChanges: getPendingChangesMock,
      hasCachedFile: hasCachedFileMock,
      readFile: vi.fn(),
    }),
  },
}))

vi.mock('@/store/remote.store', () => ({
  useRemoteStore: {
    getState: () => ({
      session: null,
    }),
  },
}))

vi.mock('../vfs-resolver', () => ({
  resolveVfsTarget: async (...args: unknown[]) => {
    const target = await resolveVfsTargetMock(...args)
    if (!target || target.backend) return target
    if (target.kind === 'workspace') {
      return {
        ...target,
        backend: {
          label: 'workspace',
          writeFile: async (path: string, content: string) => writeFileMock(path, content, null, undefined, 'project-1'),
        },
      }
    }
    if (target.kind === 'agent') {
      return {
        ...target,
        backend: {
          label: 'agent',
          exists: async (path: string) => Boolean(await target.agentManager.readPath(target.agentId, path)),
          writeFile: async (path: string, content: string) => target.agentManager.writePath(target.agentId, path, content),
        },
      }
    }
    return target
  },
  withVfsAgentIdHint: (message: string) => message,
}))

function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    directoryHandle: null,
    projectId: 'project-1',
    currentAgentId: 'default',
    ...overrides,
  }
}

function unwrapOk(result: string) {
  const parsed = JSON.parse(result)
  expect(parsed.ok).toBe(true)
  expect(parsed.version).toBe(2)
  return parsed.data
}

describe('io write tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports updated for workspace write when pending type is modify even if not cached', async () => {
    hasCachedFileMock.mockReturnValue(false)
    getPendingChangesMock.mockReturnValue([
      {
        id: 'p-1',
        path: 'src/existing.ts',
        type: 'modify',
        fsMtime: 1,
        timestamp: Date.now(),
      },
    ])

    resolveVfsTargetMock.mockResolvedValueOnce({
      kind: 'workspace',
      path: 'src/existing.ts',
    })

    const result = await writeExecutor(
      {
        path: 'src/existing.ts',
        content: 'next',
      },
      makeContext()
    )

    const data = unwrapOk(result)
    expect(data.action).toBe('modify')
    expect(data.message).toContain('updated')
  })

  it('counts workspace batch writes using pending types (create vs modify)', async () => {
    hasCachedFileMock.mockReturnValue(false)
    getPendingChangesMock
      .mockReturnValueOnce([
        {
          id: 'p-1',
          path: 'src/existing.ts',
          type: 'modify',
          fsMtime: 1,
          timestamp: Date.now(),
        },
      ])
      .mockReturnValueOnce([
        {
          id: 'p-1',
          path: 'src/existing.ts',
          type: 'modify',
          fsMtime: 1,
          timestamp: Date.now(),
        },
        {
          id: 'p-2',
          path: 'src/new.ts',
          type: 'create',
          fsMtime: 0,
          timestamp: Date.now(),
        },
      ])
      .mockReturnValue([
        {
          id: 'p-1',
          path: 'src/existing.ts',
          type: 'modify',
          fsMtime: 1,
          timestamp: Date.now(),
        },
        {
          id: 'p-2',
          path: 'src/new.ts',
          type: 'create',
          fsMtime: 0,
          timestamp: Date.now(),
        },
      ])

    resolveVfsTargetMock
      .mockResolvedValueOnce({
        kind: 'workspace',
        path: 'src/existing.ts',
      })
      .mockResolvedValueOnce({
        kind: 'workspace',
        path: 'src/new.ts',
      })

    const result = await writeExecutor(
      {
        files: [
          { path: 'src/existing.ts', content: 'update' },
          { path: 'src/new.ts', content: 'create' },
        ],
      },
      makeContext()
    )

    const data = unwrapOk(result)
    expect(data.created).toBe(1)
    expect(data.updated).toBe(1)
  })

  it('auto-creates missing agent for single write to agents namespace', async () => {
    const hasAgentMock = vi.fn(async () => false)
    const createAgentMock = vi.fn(async () => ({
      id: 'novel-editor',
    }))
    const readPathMock = vi.fn(async () => null)
    const writePathMock = vi.fn(async () => {})

    resolveVfsTargetMock.mockResolvedValueOnce({
      kind: 'agent',
      path: 'SOUL.md',
      agentId: 'novel-editor',
      projectId: 'project-1',
      agentManager: {
        hasAgent: hasAgentMock,
        createAgent: createAgentMock,
        readPath: readPathMock,
        writePath: writePathMock,
      },
    })

    const result = await writeExecutor(
      {
        path: 'vfs://agents/novel-editor/SOUL.md',
        content: 'soul',
      },
      makeContext()
    )

    unwrapOk(result)
    expect(createAgentMock).toHaveBeenCalledTimes(0)
    expect(writePathMock).toHaveBeenCalledWith('novel-editor', 'SOUL.md', 'soul')
  })

  it('auto-creates missing agent once for batch writes to agents namespace', async () => {
    const hasAgentMock = vi.fn(async () => false)
    const createAgentMock = vi.fn(async () => ({
      id: 'novel-editor',
    }))
    const readPathMock = vi.fn(async () => '# old')
    const writePathMock = vi.fn(async () => {})

    resolveVfsTargetMock.mockImplementation(async (path: string) => {
      const relPath = path.replace(/^vfs:\/\/agents\/[^/]+\//, '')
      return {
        kind: 'agent',
        path: relPath,
        agentId: 'novel-editor',
        projectId: 'project-1',
        agentManager: {
          hasAgent: hasAgentMock,
          createAgent: createAgentMock,
          readPath: readPathMock,
          writePath: writePathMock,
        },
      }
    })

    const result = await writeExecutor(
      {
        files: [
          { path: 'vfs://agents/novel-editor/SOUL.md', content: 'soul' },
          { path: 'vfs://agents/novel-editor/IDENTITY.md', content: 'identity' },
          { path: 'vfs://agents/novel-editor/AGENTS.md', content: 'agents' },
        ],
      },
      makeContext()
    )

    const data = unwrapOk(result)
    expect(data.failed).toBe(0)
    expect(createAgentMock).toHaveBeenCalledTimes(0)
    expect(writePathMock).toHaveBeenCalledTimes(3)
  })
})
