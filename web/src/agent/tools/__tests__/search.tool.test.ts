import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { searchExecutor } from '../search.tool'

const searchInDirectoryMock = vi.fn()
const getFilesDirMock = vi.fn()
const getActiveWorkspaceMock = vi.fn()

vi.mock('@/workers/search-worker-manager', () => ({
  getSearchWorkerManager: () => ({
    searchInDirectory: searchInDirectoryMock,
  }),
}))

vi.mock('@/store/workspace.store', () => ({
  getActiveWorkspace: () => getActiveWorkspaceMock(),
}))

const directoryHandle = {
  getFileHandle: vi.fn(),
  getDirectoryHandle: vi.fn(),
} as unknown as FileSystemDirectoryHandle

const context: ToolContext = { directoryHandle }

describe('search tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    const result = await searchExecutor({}, context)
    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('query is required')
  })

  it('searches with provided directory handle', async () => {
    const result = await searchExecutor({ query: 'TODO', max_results: 20 }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.totalMatches).toBe(1)
    expect(searchInDirectoryMock).toHaveBeenCalledWith(
      directoryHandle,
      expect.objectContaining({ query: 'TODO', maxResults: 20 })
    )
  })

  it('falls back to active workspace files dir in opfs-only mode', async () => {
    getFilesDirMock.mockResolvedValue(directoryHandle)
    getActiveWorkspaceMock.mockResolvedValue({
      workspace: {
        getFilesDir: getFilesDirMock,
      },
      workspaceId: 'ws_1',
    })

    const result = await searchExecutor({ query: 'TODO' }, { directoryHandle: null })
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(getFilesDirMock).toHaveBeenCalledOnce()
    expect(searchInDirectoryMock).toHaveBeenCalledWith(
      directoryHandle,
      expect.objectContaining({ query: 'TODO' })
    )
  })

  it('returns error when no directory and no active workspace', async () => {
    getActiveWorkspaceMock.mockResolvedValue(undefined)

    const result = await searchExecutor({ query: 'TODO' }, { directoryHandle: null })
    const parsed = JSON.parse(result)

    expect(parsed.error).toContain('No active workspace')
  })
})
