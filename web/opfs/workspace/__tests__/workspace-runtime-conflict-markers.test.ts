import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceRuntime } from '../workspace-runtime'
import {
  CONFLICT_MARKER_END,
  CONFLICT_MARKER_MIDDLE,
  CONFLICT_MARKER_START,
} from '../conflict-markers'

describe('WorkspaceRuntime conflict marker materialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes conflict markers into OPFS text files when conflicts are detected', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      detectConflicts: vi.fn(async () => [
        {
          path: 'src/a.ts',
          workspaceId: 'w1',
          otherWorkspaces: [],
          opfsMtime: 100,
          currentFsMtime: 200,
        },
      ]),
    }
    runtime.readFromFilesDir = vi.fn(async () => ({
      content: 'const value = 1;\n',
      mtime: 100,
      size: 16,
      contentType: 'text',
    }))
    runtime.readFromNativeFS = vi.fn(async () => ({
      content: 'const value = 2;\n',
      metadata: {
        path: 'src/a.ts',
        mtime: 200,
        size: 16,
        contentType: 'text',
      },
    }))
    runtime.writeToFilesDir = vi.fn(async () => {})

    const conflicts = await runtime.detectSyncConflicts({} as FileSystemDirectoryHandle)

    expect(conflicts).toHaveLength(1)
    expect(runtime.writeToFilesDir).toHaveBeenCalledTimes(1)
    expect(runtime.writeToFilesDir).toHaveBeenCalledWith(
      'src/a.ts',
      expect.stringContaining(CONFLICT_MARKER_START)
    )

    const merged = runtime.writeToFilesDir.mock.calls[0][1] as string
    expect(merged).toContain(CONFLICT_MARKER_START)
    expect(merged).toContain(CONFLICT_MARKER_MIDDLE)
    expect(merged).toContain(CONFLICT_MARKER_END)
    expect(merged).toContain('const value = 1;')
    expect(merged).toContain('const value = 2;')
  })

  it('does not rewrite files that already contain conflict markers', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      detectConflicts: vi.fn(async () => [
        {
          path: 'src/a.ts',
          workspaceId: 'w1',
          otherWorkspaces: [],
          opfsMtime: 100,
          currentFsMtime: 200,
        },
      ]),
    }
    runtime.readFromFilesDir = vi.fn(async () => ({
      content: `${CONFLICT_MARKER_START}\nleft\n${CONFLICT_MARKER_MIDDLE}\nright\n${CONFLICT_MARKER_END}\n`,
      mtime: 100,
      size: 16,
      contentType: 'text',
    }))
    runtime.readFromNativeFS = vi.fn(async () => ({
      content: 'const value = 2;\n',
      metadata: {
        path: 'src/a.ts',
        mtime: 200,
        size: 16,
        contentType: 'text',
      },
    }))
    runtime.writeToFilesDir = vi.fn(async () => {})

    await runtime.detectSyncConflicts({} as FileSystemDirectoryHandle)

    expect(runtime.writeToFilesDir).not.toHaveBeenCalled()
  })

  it('prefers OPFS conflict markers on pending read even when disk is newer', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.filesIndex = new Set(['src/a.ts'])
    runtime.pendingManager = {
      hasPendingPath: vi.fn(() => true),
      getAll: vi.fn(async () => [
        {
          id: 'p1',
          path: 'src/a.ts',
          type: 'modify',
          fsMtime: 100,
          timestamp: 100,
        },
      ]),
    }

    const markerContent = `${CONFLICT_MARKER_START}\nleft\n${CONFLICT_MARKER_MIDDLE}\nright\n${CONFLICT_MARKER_END}\n`
    runtime.readFromFilesDir = vi.fn(async () => ({
      content: markerContent,
      mtime: 101,
      size: markerContent.length,
      contentType: 'text',
    }))
    runtime.getFileMetadata = vi.fn(async () => ({
      mtime: 200,
      size: 20,
      contentType: 'text',
    }))
    runtime.readFromNativeFS = vi.fn(async () => ({
      content: 'disk newer content',
      metadata: {
        path: 'src/a.ts',
        mtime: 200,
        size: 20,
        contentType: 'text',
      },
    }))

    const result = await runtime.readFile('src/a.ts', {} as FileSystemDirectoryHandle)

    expect(result.content).toBe(markerContent)
    expect(result.source).toBe('opfs')
    expect(runtime.readFromNativeFS).not.toHaveBeenCalled()
  })

  it('prefers native disk for non-pending reads to observe external changes', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.filesIndex = new Set(['src/a.ts'])
    runtime.pendingManager = {
      hasPendingPath: vi.fn(() => false),
    }
    runtime.readFromFilesDir = vi.fn(async () => ({
      content: 'stale opfs content',
      mtime: 100,
      size: 18,
      contentType: 'text',
    }))
    runtime.readFromNativeFS = vi.fn(async () => ({
      content: 'fresh disk content',
      metadata: {
        path: 'src/a.ts',
        mtime: 200,
        size: 17,
        contentType: 'text',
      },
    }))
    runtime.deleteFromFilesDirIfExists = vi.fn(async () => {})

    const result = await runtime.readFile('src/a.ts', {} as FileSystemDirectoryHandle)

    expect(result.content).toBe('fresh disk content')
    expect(result.source).toBe('native')
    expect(runtime.readFromNativeFS).toHaveBeenCalledTimes(1)
    expect(runtime.deleteFromFilesDirIfExists).not.toHaveBeenCalled()
  })

  it('supports prefer_opfs policy for pending files', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.filesIndex = new Set(['src/a.ts'])
    runtime.pendingManager = {
      hasPendingPath: vi.fn(() => true),
      getAll: vi.fn(() => [
        {
          id: 'p1',
          path: 'src/a.ts',
          type: 'modify',
          fsMtime: 100,
          timestamp: 100,
        },
      ]),
    }
    runtime.readFromFilesDir = vi.fn(async () => ({
      content: 'opfs draft content',
      mtime: 101,
      size: 18,
      contentType: 'text',
    }))
    runtime.getFileMetadata = vi.fn(async () => ({
      mtime: 200,
      size: 20,
      contentType: 'text',
    }))
    runtime.readFromNativeFS = vi.fn(async () => ({
      content: 'native content',
      metadata: {
        path: 'src/a.ts',
        mtime: 200,
        size: 13,
        contentType: 'text',
      },
    }))

    const result = await runtime.readFile('src/a.ts', {} as FileSystemDirectoryHandle, {
      policy: 'prefer_opfs',
    })

    expect(result.content).toBe('opfs draft content')
    expect(result.source).toBe('opfs')
    expect(runtime.readFromNativeFS).not.toHaveBeenCalled()
  })

  it('supports prefer_native policy for pending files', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.filesIndex = new Set(['src/a.ts'])
    runtime.pendingManager = {
      hasPendingPath: vi.fn(() => true),
      getAll: vi.fn(() => []),
    }
    runtime.readFromFilesDir = vi.fn(async () => ({
      content: `${CONFLICT_MARKER_START}\nleft\n${CONFLICT_MARKER_MIDDLE}\nright\n${CONFLICT_MARKER_END}\n`,
      mtime: 101,
      size: 42,
      contentType: 'text',
    }))
    runtime.readFromNativeFS = vi.fn(async () => ({
      content: 'fresh disk content',
      metadata: {
        path: 'src/a.ts',
        mtime: 200,
        size: 17,
        contentType: 'text',
      },
    }))

    const result = await runtime.readFile('src/a.ts', {} as FileSystemDirectoryHandle, {
      policy: 'prefer_native',
    })

    expect(result.content).toBe('fresh disk content')
    expect(result.source).toBe('native')
    expect(runtime.readFromFilesDir).not.toHaveBeenCalled()
  })
})
