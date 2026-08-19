import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { searchDefinition, searchExecutor } from '../search.tool'

const searchInDirectoryMock = vi.fn()
const getWorkspaceManagerMock = vi.fn()
const findProjectRootsMock = vi.fn()

vi.mock('@/workers/search-worker-manager', () => ({
  getSearchWorkerManager: () => ({
    searchInDirectory: searchInDirectoryMock,
  }),
}))

vi.mock('@/opfs', () => ({
  getWorkspaceManager: () => getWorkspaceManagerMock(),
}))

vi.mock('@/sqlite/repositories/project-root.repository', () => ({
  getProjectRootRepository: () => ({
    findByProject: findProjectRootsMock,
  }),
}))

const directoryHandle = {
  getFileHandle: vi.fn(),
  getDirectoryHandle: vi.fn(),
} as unknown as FileSystemDirectoryHandle

const context: ToolContext = { directoryHandle }

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

describe('search tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findProjectRootsMock.mockResolvedValue([])
    searchInDirectoryMock.mockResolvedValue({
      results: [{ path: 'src/a.ts', line: 3, column: 8, match: 'TODO', preview: 'const x = TODO' }],
      totalMatches: 1,
      scannedFiles: 4,
      skippedFiles: 1,
      truncated: false,
      deadlineExceeded: false,
    })
  })

  it('requires query', async () => {
    const result = await searchExecutor({ mode: 'literal' }, context)
    const error = unwrapError(result)
    expect(error.message).toContain('query is required')
  })

  it('declares only query as required in schema', () => {
    expect(searchDefinition.function.parameters.required).toEqual(['query'])
  })

  it('defaults an omitted mode to literal', async () => {
    const result = await searchExecutor({ query: 'TODO' }, context)
    unwrapOk(result)
    expect(searchInDirectoryMock).toHaveBeenCalledWith(
      directoryHandle,
      expect.objectContaining({ query: 'TODO', regex: false })
    )
  })

  it('searches with provided directory handle', async () => {
    const result = await searchExecutor({ query: 'TODO', mode: 'literal', max_results: 20 }, context)
    const data = unwrapOk(result)

    expect(data.totalMatches).toBe(1)
    expect(searchInDirectoryMock).toHaveBeenCalledWith(
      directoryHandle,
      expect.objectContaining({ query: 'TODO', regex: false, maxResults: 10000 })
    )
  })

  it('searches a native-host root without a browser directory handle', async () => {
    const scanDiskTree = vi.fn().mockResolvedValue([
      { path: 'src/app.ts', type: 'file', size: 32, depth: 2 },
    ])
    const readFile = vi.fn().mockResolvedValue({
      content: 'export const marker = "NATIVE_TODO"\n',
    })
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn().mockResolvedValue({ scanDiskTree, readFile }),
    })
    findProjectRootsMock.mockResolvedValue([
      { name: 'native-root', backend: 'native-host' },
    ])

    const result = await searchExecutor(
      { query: 'NATIVE_TODO', mode: 'literal' },
      { workspaceId: 'ws_1', projectId: 'project_1', directoryHandle: null }
    )
    const data = unwrapOk(result)

    expect(scanDiskTree).toHaveBeenCalledWith(
      'native-root',
      expect.any(Number),
      'project_1',
      expect.objectContaining({ includeSizes: true })
    )
    expect(readFile).toHaveBeenCalledWith('native-root/src/app.ts', null, { projectId: 'project_1' })
    expect(data.totalMatches).toBe(1)
    expect(data.files[0]).toMatchObject({ path: 'native-root/src/app.ts', bestLine: 1 })
    expect(searchInDirectoryMock).not.toHaveBeenCalled()
  })

  it('returns error when no directory or native-host workspace is available', async () => {
    const result = await searchExecutor({ query: 'TODO', mode: 'literal' }, { directoryHandle: null })
    const error = unwrapError(result)

    expect(error.message).toContain('No active workspace')
  })

  it('auto-upgrades regex-like query when mode=literal', async () => {
    const result = await searchExecutor(
      {
        query: 'from.*project-fingerprint|from.*intelligence-coordinator',
        mode: 'literal',
      },
      context
    )
    unwrapOk(result)
    expect(searchInDirectoryMock).toHaveBeenCalledWith(
      directoryHandle,
      expect.objectContaining({ regex: true })
    )
  })

  it('accepts regex-like query when mode=regex', async () => {
    const result = await searchExecutor(
      {
        query: 'Fingerprint|IntelligenceCoordinator|getFingerprintScanner|formatFingerprint',
        mode: 'regex',
      },
      context
    )
    unwrapOk(result)

    expect(searchInDirectoryMock).toHaveBeenCalledWith(
      directoryHandle,
      expect.objectContaining({
        query: 'Fingerprint|IntelligenceCoordinator|getFingerprintScanner|formatFingerprint',
        regex: true,
      })
    )
  })

  it('returns structured path_not_found error from worker details', async () => {
    searchInDirectoryMock.mockRejectedValueOnce(
      new Error(
        JSON.stringify({
          code: 'path_not_found',
          message: 'Search path "web/src/agent" not found under current root "web"',
          requestedPath: 'web/src/agent',
          resolvedRootName: 'web',
        })
      )
    )

    const result = await searchExecutor(
      {
        query: 'ProjectFingerprint',
        mode: 'regex',
        path: 'web/src/agent',
      },
      context
    )
    const error = unwrapError(result)

    expect(error.code).toBe('path_not_found')
    expect(error.details.requestedPath).toBe('web/src/agent')
    expect(error.details.resolvedRootName).toBe('web')
    expect(error.hint).toContain('Try')
  })
})
