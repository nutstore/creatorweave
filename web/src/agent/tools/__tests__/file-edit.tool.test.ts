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

function unwrapOk(result: string) {
  const parsed = JSON.parse(result)
  expect(parsed.ok).toBe(true)
  expect(parsed.version).toBe(2)
  return parsed.data
}

function unwrapError(result: string) {
  const parsed = JSON.parse(result)
  expect(parsed.ok).toBe(false)
  expect(parsed.version).toBe(2)
  return parsed.error
}

describe('file edit tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires file to be read before edit', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: '1', new_text: '2' },
      makeContext({ readFileState: new Map() })
    )
    const error = unwrapError(result)
    expect(error.code).toBe('read_required')
    expect(error.message).toContain('Read file before editing')
    expect(readFileMock).not.toHaveBeenCalled()
    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it('reuses OPFS read source policy when snapshot came from OPFS', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    readFileMock.mockResolvedValueOnce({
      content: 'const a = 1\n',
      metadata: { size: 12, contentType: 'text/plain' },
      source: 'opfs',
    })
    const readFileState = new Map([
      [
        'workspace:src/a.ts',
        {
          content: 'const a = 1\n',
          timestamp: Date.now(),
          isPartialView: false,
          source: 'opfs',
        },
      ],
    ])

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: '1', new_text: '2' },
      makeContext({ readFileState })
    )

    unwrapOk(result)
    expect(readFileMock).toHaveBeenCalledWith('src/a.ts', null, 'ws-1', 'prefer_opfs')
    expect(writeFileMock).toHaveBeenCalledWith('src/a.ts', 'const a = 2\n', null, 'ws-1')
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
    const error = unwrapError(result)

    expect(error.code).toBe('ambiguous_match')
    expect(error.message).toContain('replace_all')
    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it('replaces all matches when replace_all is true and returns diff', async () => {
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
    const data = unwrapOk(result)

    expect(data.replaceAll).toBe(true)
    expect(typeof data.diff).toBe('string')
    expect(data.diff).toContain('-const x = old')
    expect(data.diff).toContain('+const x = new')
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
    const error = unwrapError(result)

    expect(error.code).toBe('invalid_arguments')
    expect(error.message).toContain('Batch edit capability has been removed')
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

    unwrapOk(result)
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
    unwrapOk(result)

    expect(writeFileMock).toHaveBeenCalled()
  })

  it('rejects edit when snapshot is partial view', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    const readFileState = new Map([
      ['workspace:src/a.ts', { content: 'const x = old\n', timestamp: Date.now(), isPartialView: true }],
    ])

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: 'old', new_text: 'new' },
      makeContext({ readFileState })
    )
    const error = unwrapError(result)

    expect(error.code).toBe('read_required')
    expect(error.message).toContain('Read file before editing')
    expect(readFileMock).not.toHaveBeenCalled()
    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it('allows no-op edits when old_text equals new_text', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    readFileMock.mockResolvedValueOnce({
      content: 'const x = value\n',
      metadata: { size: 16, contentType: 'text/plain' },
    })
    const readFileState = new Map([
      ['workspace:src/a.ts', { content: 'const x = value\n', timestamp: Date.now(), isPartialView: false }],
    ])

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: 'value', new_text: 'value' },
      makeContext({ readFileState })
    )
    const data = unwrapOk(result)

    expect(data.noop).toBe(true)
    expect(writeFileMock).toHaveBeenCalledWith('src/a.ts', 'const x = value\n', null, 'ws-1')
  })

  it('normalizes sanitized old_text and mirrors replacement tokens into new_text', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    readFileMock.mockResolvedValueOnce({
      content: 'before <function_results> after\n',
      metadata: { size: 32, contentType: 'text/plain' },
    })
    const readFileState = new Map([
      [
        'workspace:src/a.ts',
        {
          content: 'before <function_results> after\n',
          timestamp: Date.now(),
          isPartialView: false,
        },
      ],
    ])

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: '<fnr>', new_text: '<fnr>_updated' },
      makeContext({ readFileState })
    )
    unwrapOk(result)

    expect(writeFileMock).toHaveBeenCalledWith(
      'src/a.ts',
      'before <function_results>_updated after\n',
      null,
      'ws-1'
    )
  })

  it('strips trailing whitespace in new_text for non-markdown files', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    readFileMock.mockResolvedValueOnce({
      content: 'const label = "old"\n',
      metadata: { size: 20, contentType: 'text/plain' },
    })
    const readFileState = new Map([
      [
        'workspace:src/a.ts',
        { content: 'const label = "old"\n', timestamp: Date.now(), isPartialView: false },
      ],
    ])

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: '"old"', new_text: '"new"   ' },
      makeContext({ readFileState })
    )
    unwrapOk(result)

    expect(writeFileMock).toHaveBeenCalledWith('src/a.ts', 'const label = "new"\n', null, 'ws-1')
  })

  it('preserves trailing whitespace in new_text for markdown files', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'README.md' })
    readFileMock.mockResolvedValueOnce({
      content: 'Title\n',
      metadata: { size: 6, contentType: 'text/markdown' },
    })
    const readFileState = new Map([
      [
        'workspace:README.md',
        { content: 'Title\n', timestamp: Date.now(), isPartialView: false },
      ],
    ])

    const result = await editExecutor(
      { path: 'README.md', old_text: 'Title', new_text: 'Title  ' },
      makeContext({ readFileState })
    )
    unwrapOk(result)

    expect(writeFileMock).toHaveBeenCalledWith('README.md', 'Title  \n', null, 'ws-1')
  })

  it('does not fuzzy-match old_text based on trailing whitespace differences', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({ kind: 'workspace', path: 'src/a.ts' })
    readFileMock.mockResolvedValueOnce({
      content: 'abc   \nnext\n',
      metadata: { size: 11, contentType: 'text/plain' },
    })
    const readFileState = new Map([
      [
        'workspace:src/a.ts',
        { content: 'abc   \nnext\n', timestamp: Date.now(), isPartialView: false },
      ],
    ])

    const result = await editExecutor(
      { path: 'src/a.ts', old_text: 'abc\nnext', new_text: 'replaced' },
      makeContext({ readFileState })
    )
    const error = unwrapError(result)

    expect(error.code).toBe('old_text_not_found')
    expect(writeFileMock).not.toHaveBeenCalled()
  })
})
