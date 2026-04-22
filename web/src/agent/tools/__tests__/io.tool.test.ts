import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { readExecutor } from '../io.tool'

const readFileMock =
  vi.fn<
    (
      path: string,
      directoryHandle?: FileSystemDirectoryHandle | null,
      workspaceId?: string | null,
      readPolicy?: 'auto' | 'prefer_native' | 'prefer_opfs'
    ) => Promise<{
      content: string | ArrayBuffer
      metadata: { size: number; contentType: string }
      source?: 'native' | 'opfs'
    }>
  >()
const getNativeDirectoryHandleMock = vi.fn<() => Promise<FileSystemDirectoryHandle | null>>()
const getActiveConversationMock = vi.fn()

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: {
    getState: () => ({
      readFile: readFileMock,
    }),
  },
}))

vi.mock('@/store/conversation-context.store', () => ({
  getActiveConversation: () => getActiveConversationMock(),
}))

const context: ToolContext = {
  directoryHandle: null,
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

describe('io read tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns full content by default without implicit size truncation', async () => {
    const largeContent = 'x'.repeat(10)
    readFileMock.mockResolvedValueOnce({
      content: largeContent,
      metadata: { size: 5 * 1024 * 1024, contentType: 'text' },
      source: 'opfs',
    })

    const readFileState = new Map()
    const result = await readExecutor({ path: 'big.txt' }, { ...context, readFileState })
    const data = unwrapOk(result)
    expect(data.kind).toBe('text')
    expect(data.content).toBe(largeContent)
    const entry = readFileState.get('workspace:big.txt')
    expect(entry?.isPartialView).toBe(false)
    expect(entry?.offset).toBeUndefined()
    expect(entry?.limit).toBeUndefined()
    expect(entry?.content).toBe(largeContent)
  })

  it('rejects offset/limit for single file (breaking change)', async () => {
    readFileMock.mockResolvedValueOnce({
      content: 'line1\nline2\nline3\nline4',
      metadata: { size: 24, contentType: 'text' },
    })

    const result = await readExecutor({ path: 'a.txt', offset: 2, limit: 2 }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('invalid_arguments')
    expect(error.message).toContain('offset/limit are no longer supported')
  })

  it('supports line range read for single file', async () => {
    readFileMock.mockResolvedValueOnce({
      content: 'line1\nline2\nline3\nline4',
      metadata: { size: 24, contentType: 'text' },
      source: 'opfs',
    })

    const readFileState = new Map()
    const result = await readExecutor(
      { path: 'a.txt', start_line: 2, line_count: 2 },
      { ...context, readFileState }
    )
    const data = unwrapOk(result)
    expect(data.content).toBe('line2\nline3')
    const entry = readFileState.get('workspace:a.txt')
    expect(entry?.isPartialView).toBe(false)
    expect(entry?.offset).toBe(2)
    expect(entry?.limit).toBe(2)
    expect(entry?.content).toBe('line2\nline3')
  })

  it('supports advanced batch reads with per-file ranges', async () => {
    readFileMock.mockReset()
    readFileMock
      .mockResolvedValueOnce({
        content: 'a1\na2\na3\na4',
        metadata: { size: 11, contentType: 'text' },
      })
      .mockResolvedValueOnce({
        content: 'line1\nline2\nline3',
        metadata: { size: 17, contentType: 'text' },
      })

    const result = await readExecutor(
      {
        reads: [
          { path: 'a.txt', start_line: 3, line_count: 1 },
          { path: 'b.txt', start_line: 2, line_count: 1 },
        ],
      },
      context
    )
    const data = unwrapOk(result)

    expect(data.total).toBe(2)
    expect(data.successCount).toBe(2)
    const aResult = data.results.find((r: { path: string }) => r.path === 'a.txt')
    const bResult = data.results.find((r: { path: string }) => r.path === 'b.txt')
    expect(aResult?.content).toBe('a3')
    expect(bResult?.content).toBe('line2')
  })

  it('returns too_large error when max_size is explicitly requested', async () => {
    readFileMock.mockResolvedValueOnce({
      content: '0123456789',
      metadata: { size: 10, contentType: 'text' },
      source: 'opfs',
    })

    const result = await readExecutor({ path: 'a.txt', max_size: 5 }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('too_large')
    expect(error.details.maxSize).toBe(5)
  })

  it('keeps character safety limit even when max_size is provided', async () => {
    const oversizedText = 'x'.repeat(100_001)
    readFileMock.mockResolvedValueOnce({
      content: oversizedText,
      metadata: { size: oversizedText.length, contentType: 'text' },
    })

    const result = await readExecutor({ path: 'huge.txt', max_size: 200_000 }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('content_too_large')
    expect(error.message).toContain('safety limit')
  })

  it('allows range read from large file when sliced output is under safety limit', async () => {
    const line = 'x'.repeat(1000)
    const largeMultiLine = Array.from({ length: 150 }, () => line).join('\n')
    readFileMock.mockResolvedValueOnce({
      content: largeMultiLine,
      metadata: { size: largeMultiLine.length, contentType: 'text' },
    })

    const result = await readExecutor(
      { path: 'large.txt', start_line: 1, line_count: 1, max_size: largeMultiLine.length + 1024 },
      context
    )
    const data = unwrapOk(result)
    expect(data.kind).toBe('text')
    expect(data.content).toBe(line)
  })

  it('falls back to native directory when file is missing in OPFS workspace and syncs via read cache', async () => {
    const nativeHandle = {} as FileSystemDirectoryHandle
    readFileMock
      .mockRejectedValueOnce(
        new Error('File not found in OPFS workspace: src/components/agent/ConversationView.tsx')
      )
      .mockResolvedValueOnce({
        content: 'export const ConversationView = () => null',
        metadata: { size: 40, contentType: 'text' },
      })
    getNativeDirectoryHandleMock.mockResolvedValue(nativeHandle)
    getActiveConversationMock.mockResolvedValue({
      conversation: {
        getNativeDirectoryHandle: getNativeDirectoryHandleMock,
      },
      conversationId: 'conv_1',
    })

    const result = await readExecutor(
      { path: 'src/components/agent/ConversationView.tsx' },
      { directoryHandle: null }
    )
    const data = unwrapOk(result)
    expect(data.content).toBe('export const ConversationView = () => null')
    expect(getNativeDirectoryHandleMock).toHaveBeenCalledOnce()
    expect(readFileMock).toHaveBeenNthCalledWith(
      1,
      'src/components/agent/ConversationView.tsx',
      null,
      undefined
    )
    expect(readFileMock).toHaveBeenNthCalledWith(
      2,
      'src/components/agent/ConversationView.tsx',
      nativeHandle,
      undefined
    )
  })

  it('does not fail entire batch when resolving native workspace handle throws', async () => {
    readFileMock.mockResolvedValueOnce({
      content: 'line1\nline2',
      metadata: { size: 11, contentType: 'text' },
    })
    getActiveConversationMock.mockRejectedValueOnce(new Error('conversation context unavailable'))

    const result = await readExecutor({ paths: ['a.txt'] }, { directoryHandle: null })
    const data = unwrapOk(result)

    expect(data.total).toBe(1)
    expect(data.successCount).toBe(1)
    expect(data.errorCount).toBe(0)
    expect(data.results[0]?.path).toBe('a.txt')
    expect(data.results[0]?.content).toBe('line1\nline2')
    expect(readFileMock).toHaveBeenCalledOnce()
    expect(readFileMock).toHaveBeenCalledWith('a.txt', null, undefined)
  })

  it('validates max_size must be greater than 0', async () => {
    const result = await readExecutor({ path: 'a.txt', max_size: 0 }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('invalid_arguments')
    expect(error.message).toContain('max_size must be > 0')
  })

  it('validates read_policy values', async () => {
    const result = await readExecutor({ path: 'a.txt', read_policy: 'random' }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('invalid_arguments')
    expect(error.message).toContain('read_policy must be one of')
  })

  it('passes read_policy through to workspace readFile', async () => {
    readFileMock.mockResolvedValueOnce({
      content: 'opfs data',
      metadata: { size: 9, contentType: 'text' },
      source: 'opfs',
    })

    await readExecutor({ path: 'a.txt', read_policy: 'prefer_opfs' }, context)

    expect(readFileMock).toHaveBeenCalledWith('a.txt', null, undefined, 'prefer_opfs')
  })

  it('surfaces read source in envelope meta', async () => {
    readFileMock.mockResolvedValueOnce({
      content: 'native content',
      metadata: { size: 14, contentType: 'text' },
      source: 'native',
    })

    const result = await readExecutor({ path: 'a.txt' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.ok).toBe(true)
    expect(parsed.meta?.source).toBe('native')
  })

  it('returns binary payload in batch mode without nested JSON encoding', async () => {
    readFileMock.mockResolvedValueOnce({
      content: new Uint8Array([1, 2, 3, 4]).buffer,
      metadata: { size: 4, contentType: 'binary' },
    })

    const result = await readExecutor({ paths: ['bin.dat'] }, context)
    const data = unwrapOk(result)

    expect(data.successCount).toBe(1)
    expect(data.results[0].kind).toBe('binary_base64')
    expect(data.results[0].content).toBe('AQIDBA==')
  })

  it('reads large binary files without stack overflow', async () => {
    readFileMock.mockResolvedValueOnce({
      content: new Uint8Array(1_000_000).buffer,
      metadata: { size: 1_000_000, contentType: 'binary' },
    })

    const result = await readExecutor({ path: 'large.bin' }, context)
    const data = unwrapOk(result)

    expect(data.kind).toBe('binary_base64')
    expect(data.metadata.size).toBe(1_000_000)
    expect(typeof data.content).toBe('string')
    expect(data.content.length).toBeGreaterThan(0)
  })
})
