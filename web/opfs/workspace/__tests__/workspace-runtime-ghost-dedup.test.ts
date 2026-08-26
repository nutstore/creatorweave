import { describe, expect, it, vi } from 'vitest'
import { WorkspaceRuntime } from '../workspace-runtime'

/**
 * Helper: create a partially-mocked WorkspaceRuntime for writeFile tests.
 * Only the methods touched by the ghost-dedup path are mocked;
 * everything else is left as-is (and will throw if reached unexpectedly).
 */
function createRuntimeForWriteTest(mocks: Record<string, unknown> = {}) {
  const runtime = new WorkspaceRuntime(
    'w1',
    {} as FileSystemDirectoryHandle,
    '/tmp'
  ) as unknown as Record<string, unknown>
  runtime.initialized = true
  runtime.metadata = {
    workspaceId: 'w1',
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    rootDirectory: '/tmp',
  }

  runtime.saveMetadata = vi.fn(async () => {})
  runtime.pendingManager = {
    hasPendingPath: vi.fn(() => false),
    removeByPath: vi.fn(async () => {}),
    markAsCreated: vi.fn(async () => {}),
    add: vi.fn(async () => {}),
  }
  runtime.deleteFromBaselineDirIfExists = vi.fn(async () => {})
  runtime.writeToFilesDir = vi.fn(async () => {})
  runtime.captureModifyBaseline = vi.fn(async () => {})
  runtime.filesIndex = new Set()
  runtime.hasFileInIndex = vi.fn(() => false)

  Object.assign(runtime, mocks)

  return runtime as any
}

describe('writeFile ghost change dedup', () => {
  it('skips write when content is identical to native baseline (string)', async () => {
    const runtime = createRuntimeForWriteTest({
      readFromNativeFS: vi.fn(async () => ({
        content: 'hello world',
        metadata: { path: 'src/a.ts', mtime: 1000, size: 11, contentType: 'text' },
      })),
    })

    await runtime.writeFile('src/a.ts', 'hello world', {} as FileSystemDirectoryHandle)
    expect(runtime.writeToFilesDir).not.toHaveBeenCalled()
    expect(runtime.pendingManager.add).not.toHaveBeenCalled()
    expect(runtime.pendingManager.markAsCreated).not.toHaveBeenCalled()
    expect(runtime.saveMetadata).toHaveBeenCalled()
  })

  it('skips write and clears existing ghost pending entry', async () => {
    const runtime = createRuntimeForWriteTest({
      readFromNativeFS: vi.fn(async () => ({
        content: 'hello',
        metadata: { path: 'src/a.ts', mtime: 1000, size: 5, contentType: 'text' },
      })),
      pendingManager: {
        hasPendingPath: vi.fn(() => true),
        removeByPath: vi.fn(async () => {}),
        markAsCreated: vi.fn(async () => {}),
        add: vi.fn(async () => {}),
      },
    })

    await runtime.writeFile('src/a.ts', 'hello', {} as FileSystemDirectoryHandle)
    expect(runtime.pendingManager.removeByPath).toHaveBeenCalledWith('src/a.ts')
    expect(runtime.deleteFromBaselineDirIfExists).toHaveBeenCalledWith('src/a.ts')
    expect(runtime.writeToFilesDir).not.toHaveBeenCalled()
  })

  it('does NOT skip write when content differs from baseline', async () => {
    const runtime = createRuntimeForWriteTest({
      readFromNativeFS: vi.fn(async () => ({
        content: 'old content',
        metadata: { path: 'src/a.ts', mtime: 1000, size: 11, contentType: 'text' },
      })),
    })
    await runtime.writeFile('src/a.ts', 'new content', {} as FileSystemDirectoryHandle)
    expect(runtime.writeToFilesDir).toHaveBeenCalled()
    expect(runtime.pendingManager.add).toHaveBeenCalled()
  })

  it('does NOT skip write for new files (no baseline)', async () => {
    const runtime = createRuntimeForWriteTest()
    const notFoundError = new DOMException('Not found', 'NotFoundError')
    Object.defineProperty(runtime, 'readFromNativeFS', {
      value: vi.fn(async () => {
        throw notFoundError
      }),
      writable: true,
    })
    await runtime.writeFile('src/new.ts', 'new file content', {} as FileSystemDirectoryHandle)
    expect(runtime.pendingManager.markAsCreated).toHaveBeenCalled()
    expect(runtime.writeToFilesDir).toHaveBeenCalled()
  })

  it('handles binary content (ArrayBuffer) dedup correctly', async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]).buffer
    const runtime = createRuntimeForWriteTest({
      readFromNativeFS: vi.fn(async () => ({
        content: new Uint8Array([1, 2, 3, 4, 5]).buffer,
        metadata: { path: 'img.png', mtime: 1000, size: 5, contentType: 'binary' },
      })),
    })
    await runtime.writeFile('img.png', content, {} as FileSystemDirectoryHandle)
    expect(runtime.writeToFilesDir).not.toHaveBeenCalled()
  })

  it('detects difference in binary content', async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]).buffer
    const runtime = createRuntimeForWriteTest({
      readFromNativeFS: vi.fn(async () => ({
        content: new Uint8Array([1, 2, 3, 4, 6]).buffer,
        metadata: { path: 'img.png', mtime: 1000, size: 5, contentType: 'binary' },
      })),
    })
    await runtime.writeFile('img.png', content, {} as FileSystemDirectoryHandle)
    expect(runtime.writeToFilesDir).toHaveBeenCalled()
    expect(runtime.pendingManager.add).toHaveBeenCalled()
  })

  it('cleans up conflict markers in files/ when dedup triggers during conflict resolution', async () => {
    const resolvedContent = 'clean content'
    const conflictContent = [
      `${'<'.repeat(7)} OPFS`,
      resolvedContent,
      '='.repeat(7),
      'other',
      `${'>'.repeat(7)} DISK`,
    ].join('\n')
    const runtime = createRuntimeForWriteTest({
      readFromNativeFS: vi.fn(async () => ({
        content: resolvedContent,
        metadata: { path: 'src/a.ts', mtime: 1000, size: 13, contentType: 'text' },
      })),
      readFromFilesDir: vi.fn(async () => ({
        content: conflictContent,
        mtime: 999,
        size: 50,
        contentType: 'text',
      })),
      pendingManager: {
        hasPendingPath: vi.fn(() => true),
        removeByPath: vi.fn(async () => {}),
        markAsCreated: vi.fn(async () => {}),
        add: vi.fn(async () => {}),
      },
    })

    await runtime.writeFile('src/a.ts', resolvedContent, {} as FileSystemDirectoryHandle)
    expect(runtime.writeToFilesDir).toHaveBeenCalledWith('src/a.ts', resolvedContent)
    expect(runtime.pendingManager.removeByPath).toHaveBeenCalledWith('src/a.ts')
    expect(runtime.pendingManager.add).not.toHaveBeenCalled()
  })

  it('handles Blob content dedup correctly', async () => {
    const bytes = new Uint8Array([10, 20, 30, 40])
    const contentBlob = new Blob([bytes])
    const runtime = createRuntimeForWriteTest({
      readFromNativeFS: vi.fn(async () => ({
        content: bytes.buffer,
        metadata: { path: 'data.bin', mtime: 1000, size: 4, contentType: 'binary' },
      })),
    })
    await runtime.writeFile('data.bin', contentBlob, {} as FileSystemDirectoryHandle)
    expect(runtime.writeToFilesDir).not.toHaveBeenCalled()
  })
})

describe('areFileContentsEqual', () => {
  it('returns true for identical strings', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    expect(await runtime.areFileContentsEqual('hello', 'hello')).toBe(true)
  })

  it('returns false for different strings of same length', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    expect(await runtime.areFileContentsEqual('hello', 'world')).toBe(false)
  })

  it('returns false for different length strings (fast path)', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    expect(await runtime.areFileContentsEqual('short', 'a much longer string')).toBe(false)
  })

  it('returns true for same reference', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    const str = 'shared reference'
    expect(await runtime.areFileContentsEqual(str, str)).toBe(true)
  })

  it('returns true for identical ArrayBuffers', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    const a = new Uint8Array([1, 2, 3, 4, 5]).buffer
    const b = new Uint8Array([1, 2, 3, 4, 5]).buffer
    expect(await runtime.areFileContentsEqual(a, b)).toBe(true)
  })

  it('returns false for different ArrayBuffers of same length', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    const a = new Uint8Array([1, 2, 3, 4, 5]).buffer
    const b = new Uint8Array([1, 2, 3, 4, 6]).buffer
    expect(await runtime.areFileContentsEqual(a, b)).toBe(false)
  })

  it('returns false for ArrayBuffers of different length', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    const a = new Uint8Array([1, 2, 3]).buffer
    const b = new Uint8Array([1, 2, 3, 4]).buffer
    expect(await runtime.areFileContentsEqual(a, b)).toBe(false)
  })

  it('handles mixed string and ArrayBuffer (same byte content)', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    expect(await runtime.areFileContentsEqual('hello', new TextEncoder().encode('hello').buffer)).toBe(true)
  })

  it('handles mixed string and ArrayBuffer (different content)', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    expect(await runtime.areFileContentsEqual('hello', new TextEncoder().encode('world').buffer)).toBe(false)
  })

  it('handles empty content', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    expect(await runtime.areFileContentsEqual('', '')).toBe(true)
  })

  it('handles empty vs non-empty', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    expect(await runtime.areFileContentsEqual('', 'x')).toBe(false)
  })

  it('handles Unicode/emoji strings correctly', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    expect(await runtime.areFileContentsEqual('hello😊', 'hello😢')).toBe(false)
  })

  it('returns true for identical Unicode/emoji strings', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    expect(await runtime.areFileContentsEqual('你好世界🎉', '你好世界🎉')).toBe(true)
  })

  it('returns false for different length CJK strings (fast path)', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    expect(await runtime.areFileContentsEqual('你好', '你好世界')).toBe(false)
  })
})
