import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { editExecutor } from '../file-edit.tool'

const readFileMock = vi.fn()
const writeFileMock = vi.fn()
const getPendingChangesMock = vi.fn(() => [])
const resolveVfsTargetMock = vi.fn()
const readPathMock = vi.fn()
const writePathMock = vi.fn()

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: {
    getState: () => ({
      readFile: readFileMock,
      writeFile: writeFileMock,
      getPendingChanges: getPendingChangesMock,
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
  resolveVfsTarget: (...args: unknown[]) => resolveVfsTargetMock(...args),
  isVfsPath: (path: string) => path.startsWith('vfs://'),
}))

function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    directoryHandle: null,
    workspaceId: 'ws-1',
    projectId: 'project-1',
    currentAgentId: 'default',
    readFileState: new Map(),
    ...overrides,
  }
}

describe('file edit tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires file to be read before edit', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    readFileMock.mockResolvedValueOnce({
      content: 'const a = 1\n',
      metadata: { size: 12, contentType: 'text/plain' },
    })

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: '1', new_text: '2' },
      makeContext({ readFileState: new Map() })
    )
    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('Read file before editing')
    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it('rejects multiple matches when replace_all is false', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    readFileMock.mockResolvedValueOnce({
      content: 'const x = old\nconst y = old\n',
      metadata: { size: 30, contentType: 'text/plain' },
    })
    const readFileState = new Map([
      [
        'workspace:src/a.ts',
        { content: 'const x = old\nconst y = old\n', timestamp: Date.now(), isPartialView: false },
      ],
    ])

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: 'old', new_text: 'new' },
      makeContext({ readFileState })
    )
    const parsed = JSON.parse(result)

    expect(parsed.error).toContain('replace_all')
    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it('replaces all matches when replace_all is true and returns structuredPatch', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    readFileMock.mockResolvedValueOnce({
      content: 'const x = old\nconst y = old\n',
      metadata: { size: 30, contentType: 'text/plain' },
    })
    const readFileState = new Map([
      [
        'workspace:src/a.ts',
        { content: 'const x = old\nconst y = old\n', timestamp: Date.now(), isPartialView: false },
      ],
    ])

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: 'old', new_text: 'new', replace_all: true },
      makeContext({ readFileState })
    )
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.replaceAll).toBe(true)
    expect(Array.isArray(parsed.structuredPatch)).toBe(true)
    expect(writeFileMock).toHaveBeenCalledWith(
      'src/a.ts',
      'const x = new\nconst y = new\n',
      null,
      'ws-1'
    )
  })

  it('rejects legacy batch args because batch edit is removed', async () => {
    const result = await editExecutor(
      { path: 'src/**/*.ts', find: 'old', replace: 'new' },
      makeContext()
    )
    const parsed = JSON.parse(result)

    expect(parsed.error).toContain('Batch edit capability has been removed')
  })

  it('uses read state key for agent namespace edits', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({
      kind: 'agent',
      path: 'SOUL.md',
      agentId: 'novel-editor',
      projectId: 'project-1',
      agentManager: {
        readPath: readPathMock,
        writePath: writePathMock,
      },
    })
    readPathMock.mockResolvedValueOnce('hello old')

    const readFileState = new Map([
      [
        'agent:project-1:novel-editor:SOUL.md',
        { content: 'hello old', timestamp: Date.now(), isPartialView: false },
      ],
    ])

    const result = await editExecutor(
      {
        path: 'vfs://agents/novel-editor/SOUL.md',
        old_text: 'old',
        new_text: 'new',
      },
      makeContext({ readFileState })
    )

    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(true)
    expect(writePathMock).toHaveBeenCalledWith('novel-editor', 'SOUL.md', 'hello new')
  })

  it('allows edit after range read snapshot', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    readFileMock.mockResolvedValueOnce({
      content: 'const x = old\nconst y = old\n',
      metadata: { size: 30, contentType: 'text/plain' },
    })
    const readFileState = new Map([
      ['workspace:src/a.ts', { content: 'const x = old\n', timestamp: Date.now(), offset: 1, limit: 1 }],
    ])

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: 'const x = old', new_text: 'const x = new' },
      makeContext({ readFileState })
    )
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(writeFileMock).toHaveBeenCalled()
  })

  it('rejects edit when snapshot is partial view', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    readFileMock.mockResolvedValueOnce({
      content: 'const x = old\n',
      metadata: { size: 14, contentType: 'text/plain' },
    })
    const readFileState = new Map([
      ['workspace:src/a.ts', { content: 'const x = old\n', timestamp: Date.now(), isPartialView: true }],
    ])

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: 'old', new_text: 'new' },
      makeContext({ readFileState })
    )
    const parsed = JSON.parse(result)

    expect(parsed.error).toContain('Read file before editing')
    expect(writeFileMock).not.toHaveBeenCalled()
  })
})
