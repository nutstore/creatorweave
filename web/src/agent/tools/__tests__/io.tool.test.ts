import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { readExecutor } from '../io.tool'

const readFileMock = vi.fn<
  (
    path: string,
    directoryHandle?: FileSystemDirectoryHandle | null
  ) => Promise<{ content: string | ArrayBuffer; metadata: { size: number; contentType: string } }>
>()
const getNativeDirectoryHandleMock = vi.fn<() => Promise<FileSystemDirectoryHandle | null>>()
const getActiveWorkspaceMock = vi.fn()

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: {
    getState: () => ({
      readFile: readFileMock,
    }),
  },
}))

vi.mock('@/store/workspace.store', () => ({
  getActiveWorkspace: () => getActiveWorkspaceMock(),
}))

const context: ToolContext = {
  directoryHandle: null,
}

describe('io read tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns full content by default without implicit size truncation', async () => {
    const largeContent = 'x'.repeat(10)
    readFileMock.mockResolvedValueOnce({
      content: largeContent,
      metadata: { size: 5 * 1024 * 1024, contentType: 'text' },
    })

    const result = await readExecutor({ path: 'big.txt' }, context)
    expect(result).toBe(largeContent)
  })

  it('rejects offset/limit for single file (breaking change)', async () => {
    readFileMock.mockResolvedValueOnce({
      content: 'line1\nline2\nline3\nline4',
      metadata: { size: 24, contentType: 'text' },
    })

    const result = await readExecutor({ path: 'a.txt', offset: 2, limit: 2 }, context)
    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('offset/limit are no longer supported')
  })

  it('supports line range read for single file', async () => {
    readFileMock.mockResolvedValueOnce({
      content: 'line1\nline2\nline3\nline4',
      metadata: { size: 24, contentType: 'text' },
    })

    const result = await readExecutor({ path: 'a.txt', start_line: 2, line_count: 2 }, context)
    expect(result).toBe('line2\nline3')
  })

  it('supports advanced batch reads with per-file ranges', async () => {
    readFileMock.mockReset()
    readFileMock
      .mockResolvedValueOnce({ content: 'a1\na2\na3\na4', metadata: { size: 11, contentType: 'text' } })
      .mockResolvedValueOnce({ content: 'line1\nline2\nline3', metadata: { size: 17, contentType: 'text' } })

    const result = await readExecutor(
      {
        reads: [
          { path: 'a.txt', start_line: 3, line_count: 1 },
          { path: 'b.txt', start_line: 2, line_count: 1 },
        ],
      },
      context
    )
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.total).toBe(2)
    expect(parsed.successCount).toBe(2)
    const aResult = parsed.results.find((r: { path: string }) => r.path === 'a.txt')
    const bResult = parsed.results.find((r: { path: string }) => r.path === 'b.txt')
    expect(aResult?.content).toBe('a3')
    expect(bResult?.content).toBe('line2')
  })

  it('returns too_large error when max_size is explicitly requested', async () => {
    readFileMock.mockResolvedValueOnce({
      content: '0123456789',
      metadata: { size: 10, contentType: 'text' },
    })

    const result = await readExecutor({ path: 'a.txt', max_size: 5 }, context)
    const parsed = JSON.parse(result)
    expect(parsed.error).toBe('too_large')
    expect(parsed.maxSize).toBe(5)
  })

  it('falls back to native directory when file is missing in OPFS workspace and syncs via read cache', async () => {
    const nativeHandle = {} as FileSystemDirectoryHandle
    readFileMock
      .mockRejectedValueOnce(new Error('File not found in OPFS workspace: src/components/agent/ConversationView.tsx'))
      .mockResolvedValueOnce({
        content: 'export const ConversationView = () => null',
        metadata: { size: 40, contentType: 'text' },
      })
    getNativeDirectoryHandleMock.mockResolvedValue(nativeHandle)
    getActiveWorkspaceMock.mockResolvedValue({
      workspace: {
        getNativeDirectoryHandle: getNativeDirectoryHandleMock,
      },
      workspaceId: 'ws_1',
    })

    const result = await readExecutor({ path: 'src/components/agent/ConversationView.tsx' }, { directoryHandle: null })
    expect(result).toBe('export const ConversationView = () => null')
    expect(getNativeDirectoryHandleMock).toHaveBeenCalledOnce()
    expect(readFileMock).toHaveBeenNthCalledWith(1, 'src/components/agent/ConversationView.tsx', null)
    expect(readFileMock).toHaveBeenNthCalledWith(2, 'src/components/agent/ConversationView.tsx', nativeHandle)
  })

  it('does not fail entire batch when resolving native workspace handle throws', async () => {
    readFileMock.mockResolvedValueOnce({
      content: 'line1\nline2',
      metadata: { size: 11, contentType: 'text' },
    })
    getActiveWorkspaceMock.mockRejectedValueOnce(new Error('workspace unavailable'))

    const result = await readExecutor({ paths: ['a.txt'] }, { directoryHandle: null })
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.total).toBe(1)
    expect(parsed.successCount).toBe(1)
    expect(parsed.errorCount).toBe(0)
    expect(parsed.results[0]?.path).toBe('a.txt')
    expect(parsed.results[0]?.content).toBe('line1\nline2')
    expect(readFileMock).toHaveBeenCalledOnce()
    expect(readFileMock).toHaveBeenCalledWith('a.txt', null)
  })
})
