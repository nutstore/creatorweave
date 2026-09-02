import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import type { VfsReadResult } from '../vfs-backend'
import { readExecutor } from '../read.tool'

/**
 * Mock boundary: the read tool's primary path is
 *   readExecutor → resolveVfsTarget → target.backend.readFile(path, options)
 * (VfsBackend contract, see vfs-backend.ts). We fully stub the resolver and
 * hand back a fake workspace backend whose readFile delegates to
 * readBackendMock — no OPFS/SQLite machinery is loaded.
 *
 * Contract notes (aligned with the current executor):
 * - reads/paths batch mode NO LONGER EXISTS — executor is single-path only.
 * - Binary content: known binary extensions are REJECTED with a run_python
 *   hint; unknown extensions get a UTF-8 decode attempt (binary_base64
 *   payload kind is gone with batch mode).
 * - The legacy useOPFSStore.readFile is only reached on the native-fallback
 *   path, and its current signature is 5-arg
 *   (path, handle, workspaceId, readPolicy, projectId).
 */
const readBackendMock = vi.fn<(path: string, options?: { readPolicy?: string }) => Promise<VfsReadResult>>()
const resolveVfsTargetMock = vi.fn()
const resolveNativeHandleForPathMock = vi.fn()
const readFileStoreMock = vi.fn()

vi.mock('../vfs-resolver', () => ({
  resolveVfsTarget: (...args: unknown[]) => resolveVfsTargetMock(...args),
  isVfsPath: (path: string) => path.startsWith('vfs://'),
  withVfsAgentIdHint: (message: string) => message,
  AGENT_ID_FORMAT_HINT: 'hint',
}))

// read.tool builds the WorkspaceBackend itself via its own vfs-resolver import;
// the backend delegates to useOPFSStore.readFile which we stub below.
vi.mock('@/store/agents.store', () => ({
  useAgentsStore: {
    getState: () => ({ activeAgentId: 'default' }),
  },
}))

vi.mock('../tool-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tool-utils')>()
  return {
    ...actual,
    resolveNativeDirectoryHandleForPath: (...args: unknown[]) =>
      resolveNativeHandleForPathMock(...args),
  }
})

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: {
    getState: () => ({
      readFile: readFileStoreMock,
    }),
  },
}))

// WorkspaceBackend constructor needs these at import time via vfs-resolver
vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: {
    getState: () => ({ activeWorkspaceId: null }),
  },
}))

function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    directoryHandle: null,
    workspaceId: 'ws-1',
    projectId: null,
    ...overrides,
  }
}

const context: ToolContext = makeContext()

/** Resolver hands back a workspace target WITH a minimal backend. Both are
 *  needed: getResolvedPathForLoopGuard reads target.backend.label, and
 *  target.backend.readFile() returns readBackendMock's queued response —
 *  the VfsBackend result shape, no OPFS machinery involved. The stubbed
 *  OPFS store readFile is NOT on this path; it only serves the
 *  native-fallback branch (see the fallback test below). */
function mockWorkspaceTarget() {
  resolveVfsTargetMock.mockImplementation(async (path: string) => ({
    kind: 'workspace',
    path,
    backend: {
      label: 'workspace',
      readFile: (p: string, options?: { readPolicy?: string }) => readBackendMock(p, options),
    },
  }))
}

/** Standard text result factory for the backend mock. */
function textResult(content: string, size = content.length, source = 'opfs'): VfsReadResult {
  return { content, size, mimeType: 'text/plain', source, mtime: 1_000 }
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
    // mockReset (not clearAllMocks): also wipes once-queues, so a queued value
    // from a test that errored before consuming it can never bleed into the
    // next test's backend call. This vitest build has no vi.resetMocks().
    readBackendMock.mockReset()
    resolveVfsTargetMock.mockReset()
    resolveNativeHandleForPathMock.mockReset()
    readFileStoreMock.mockReset()
    mockWorkspaceTarget()
    readFileStoreMock.mockResolvedValue({
      content: 'native content',
      metadata: { size: 14, contentType: 'text' },
      source: 'native',
    })
  })

  it('returns full content by default without implicit size truncation', async () => {
    const largeContent = 'x'.repeat(10)
    readBackendMock.mockResolvedValueOnce(textResult(largeContent, 5 * 1024 * 1024))

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
    readBackendMock.mockResolvedValueOnce(textResult('line1\nline2\nline3\nline4', 24))

    const result = await readExecutor({ path: 'a.txt', offset: 2, limit: 2 }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('invalid_arguments')
    expect(error.message).toContain('offset/limit are no longer supported')
  })

  it('supports line range read for single file', async () => {
    readBackendMock.mockResolvedValueOnce(textResult('line1\nline2\nline3\nline4', 24))

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

  it('rejects legacy batch reads param now that reads are single-path', async () => {
    const result = await readExecutor(
      {
        reads: [
          { path: 'a.txt', start_line: 3, line_count: 1 },
          { path: 'b.txt', start_line: 2, line_count: 1 },
        ],
      },
      context
    )
    const error = unwrapError(result)
    expect(error.code).toBe('invalid_arguments')
    expect(error.message).toContain('path is required')
    expect(readBackendMock).not.toHaveBeenCalled()
  })

  it('rejects legacy paths param now that reads are single-path', async () => {
    const result = await readExecutor({ paths: ['a.txt'] }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('invalid_arguments')
    expect(error.message).toContain('path is required')
  })

  it('returns too_large error when max_size is explicitly requested', async () => {
    readBackendMock.mockResolvedValueOnce(textResult('0123456789', 10))

    const result = await readExecutor({ path: 'a.txt', max_size: 5 }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('too_large')
    expect(error.details.maxSize).toBe(5)
  })

  it('keeps character safety limit even when max_size is provided', async () => {
    const oversizedText = 'x'.repeat(100_001)
    readBackendMock.mockResolvedValueOnce(textResult(oversizedText, oversizedText.length))

    const result = await readExecutor({ path: 'huge.txt', max_size: 200_000 }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('content_too_large')
    expect(error.message).toContain('safety limit')
  })

  it('allows range read from large file when sliced output is under safety limit', async () => {
    const line = 'x'.repeat(1000)
    const largeMultiLine = Array.from({ length: 150 }, () => line).join('\n')
    readBackendMock.mockResolvedValueOnce(
      textResult(largeMultiLine, largeMultiLine.length)
    )

    const result = await readExecutor(
      { path: 'large.txt', start_line: 1, line_count: 1, max_size: largeMultiLine.length + 1024 },
      context
    )
    const data = unwrapOk(result)
    expect(data.kind).toBe('text')
    expect(data.content).toBe(line)
  })

  it('falls back to native directory when file is missing in OPFS workspace', async () => {
    // Native fallback: the executor resolves a handle via tool-utils, then
    // reads through the legacy store readFile (5-arg signature).
    const nativeHandle = {} as FileSystemDirectoryHandle
    readBackendMock.mockRejectedValueOnce(
      new Error('File not found in OPFS workspace: src/components/agent/ConversationView.tsx')
    )
    resolveNativeHandleForPathMock.mockResolvedValue({
      handle: nativeHandle,
      nativePath: 'src/components/agent/ConversationView.tsx',
    })
    readFileStoreMock.mockResolvedValueOnce({
      content: 'export const ConversationView = () => null',
      metadata: { size: 40, contentType: 'text' },
    })

    const result = await readExecutor(
      { path: 'src/components/agent/ConversationView.tsx' },
      makeContext()
    )
    const data = unwrapOk(result)
    expect(data.content).toBe('export const ConversationView = () => null')
    // Current 5-arg signature: (path, handle, workspaceId, readPolicy, projectId)
    expect(readFileStoreMock).toHaveBeenCalledWith(
      'src/components/agent/ConversationView.tsx',
      nativeHandle,
      'ws-1',
      undefined,
      null
    )
  })

  it('returns a graceful error when native handle resolution throws during fallback', async () => {
    readBackendMock.mockRejectedValueOnce(
      new Error('File not found in OPFS workspace: missing.ts')
    )
    resolveNativeHandleForPathMock.mockRejectedValue(new Error('handle resolution unavailable'))

    const result = await readExecutor({ path: 'missing.ts' }, makeContext())
    // Must come back as a structured envelope, never a thrown exception.
    const error = unwrapError(result)
    expect(error.code).toBe('internal_error')
    expect(error.message).toContain('handle resolution unavailable')
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

  it('passes read_policy through to backend readFile', async () => {
    readBackendMock.mockResolvedValueOnce(textResult('opfs data', 9))

    await readExecutor({ path: 'a.txt', read_policy: 'prefer_opfs' }, makeContext())

    expect(readBackendMock).toHaveBeenCalledWith('a.txt', { readPolicy: 'prefer_opfs' })
  })

  it('surfaces read source in envelope meta', async () => {
    readBackendMock.mockResolvedValueOnce(textResult('native content', 14, 'native'))

    const result = await readExecutor({ path: 'a.txt' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.ok).toBe(true)
    expect(parsed.meta?.source).toBe('native')
  })

  it('rejects known binary extensions with a run_python hint', async () => {
    readBackendMock.mockResolvedValueOnce({
      content: new Uint8Array([1, 2, 3, 4]).buffer,
      size: 4,
      mimeType: 'binary',
    })

    const result = await readExecutor({ path: 'bin.dat' }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('binary_file_rejected')
    expect(error.message).toContain('run_python')
  })

  it('decodes unknown-extension binary as UTF-8 text when decodable', async () => {
    const encoder = new TextEncoder()
    readBackendMock.mockResolvedValueOnce({
      content: encoder.encode('plain text payload').buffer as ArrayBuffer,
      size: 18,
      mimeType: 'binary',
    })

    const result = await readExecutor({ path: 'blob.datx' }, context)
    const data = unwrapOk(result)
    expect(data.kind).toBe('text')
    expect(data.content).toBe('plain text payload')
  })

  it('rejects null-byte binary without stack overflow (1MB)', async () => {
    readBackendMock.mockResolvedValueOnce({
      content: new Uint8Array(1_000_000).buffer, // zero-filled → null bytes
      size: 1_000_000,
      mimeType: 'binary',
    })

    const result = await readExecutor({ path: 'blob.datx' }, context)
    const error = unwrapError(result)
    expect(error.code).toBe('binary_file_rejected')
    expect(readBackendMock).toHaveBeenCalledOnce()
  })
})
