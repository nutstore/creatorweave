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
})
