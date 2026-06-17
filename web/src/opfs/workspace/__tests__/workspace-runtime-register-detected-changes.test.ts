import { describe, expect, it, vi } from 'vitest'
import { WorkspaceRuntime } from '../workspace-runtime'

describe('WorkspaceRuntime.registerDetectedChanges', () => {
  it('treats detected add as modify when native file already exists', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      markAsCreated: vi.fn(async () => {}),
      add: vi.fn(async () => {}),
      markForDeletion: vi.fn(async () => {}),
    }

    runtime.getFileHandle = vi.fn(async () => ({
      getFile: async () => ({
        lastModified: 111,
        arrayBuffer: async () => new TextEncoder().encode('native').buffer,
      }),
    }))
    runtime.readFromFilesDir = vi.fn(async () => ({
      content: 'opfs-changed',
      mtime: 222,
      size: 11,
      contentType: 'text',
    }))
    runtime.areFileContentsEqual = vi.fn(async () => false)
    runtime.captureModifyBaseline = vi.fn(async () => {})

    await runtime.registerDetectedChanges(
      [{ type: 'add', path: 'src/a.ts', size: 11, mtime: 222 }],
      {} as FileSystemDirectoryHandle
    )

    expect(runtime.pendingManager.markAsCreated).not.toHaveBeenCalled()
    expect(runtime.pendingManager.add).toHaveBeenCalledWith('src/a.ts', 111)
    expect(runtime.captureModifyBaseline).toHaveBeenCalledTimes(1)
  })

  // Regression: in a multi-root workspace, paths carry a rootName prefix
  // (e.g. "creatorweave/CHANGELOG.md"). The native disk path does NOT have
  // the rootName prefix — the root's directoryHandle already points to the
  // root directory on disk. Before this fix, registerDetectedChanges called
  // getFileHandle(directoryHandle, "creatorweave/CHANGELOG.md") which looked
  // for a real "creatorweave" subdirectory inside the workspace, threw, and
  // fell through to the catch branch that used OPFS mtime as nativeFsMtime.
  // That made pending.fsMtime diverge from the actual disk mtime and
  // triggered false "mtime_or_marker" conflicts in detect_conflicts after
  // every sync → python write cycle.
  it('resolves per-path native handle and strips rootName prefix in multi-root', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      markAsCreated: vi.fn(async () => {}),
      add: vi.fn(async () => {}),
      markForDeletion: vi.fn(async () => {}),
    }

    const creatorweaveHandle = { name: 'creatorweave-handle' } as FileSystemDirectoryHandle
    runtime.getNativeDirectoryHandleForPath = vi.fn(async (p: string) => {
      // Only resolve for the creatorweave root
      if (p.startsWith('creatorweave/')) return creatorweaveHandle
      return null
    })
    runtime.resolvePath = vi.fn(async (p: string) => {
      if (p.startsWith('creatorweave/')) {
        return { rootName: 'creatorweave', relativePath: p.slice('creatorweave/'.length), readOnly: false }
      }
      return { rootName: '_default', relativePath: p, readOnly: false }
    })
    runtime.getFileHandle = vi.fn(async () => ({
      getFile: async () => ({
        lastModified: 1780394111797, // disk mtime (unchanged)
        arrayBuffer: async () => new TextEncoder().encode('native content').buffer,
      }),
    }))
    runtime.readFromFilesDir = vi.fn(async () => ({
      content: 'opfs-changed',
      mtime: 1781687065891, // OPFS mtime (python wrote)
      size: 11,
      contentType: 'text',
    }))
    runtime.areFileContentsEqual = vi.fn(async () => false)
    runtime.captureModifyBaseline = vi.fn(async () => {})

    await runtime.registerDetectedChanges(
      [{ type: 'modify', path: 'creatorweave/CHANGELOG.md', size: 11, mtime: 1781687065891 }],
      {} as FileSystemDirectoryHandle
    )

    // Must use the per-root native handle
    expect(runtime.getNativeDirectoryHandleForPath).toHaveBeenCalledWith('creatorweave/CHANGELOG.md')
    // Must strip the rootName prefix before reading the native file
    expect(runtime.getFileHandle).toHaveBeenCalledWith(creatorweaveHandle, 'CHANGELOG.md')
    // nativeFsMtime must come from the native file's lastModified (disk mtime),
    // NOT the OPFS mtime from the change. This is what prevents false conflicts.
    expect(runtime.pendingManager.add).toHaveBeenCalledWith('creatorweave/CHANGELOG.md', 1780394111797)
  })

  it('falls back to change.mtime when native file does not exist (new file)', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    runtime.initialized = true
    runtime.pendingManager = {
      markAsCreated: vi.fn(async () => {}),
      add: vi.fn(async () => {}),
      markForDeletion: vi.fn(async () => {}),
    }

    const creatorweaveHandle = { name: 'creatorweave-handle' } as FileSystemDirectoryHandle
    runtime.getNativeDirectoryHandleForPath = vi.fn(async () => creatorweaveHandle)
    runtime.resolvePath = vi.fn(async () => ({
      rootName: 'creatorweave',
      relativePath: 'new-file.md',
      readOnly: false,
    }))
    // Simulate "file does not exist on native FS" by making getFileHandle throw
    runtime.getFileHandle = vi.fn(async () => {
      throw new Error('NotFoundError')
    })
    runtime.readFromFilesDir = vi.fn(async () => null)
    runtime.areFileContentsEqual = vi.fn(async () => false)
    runtime.captureModifyBaseline = vi.fn(async () => {})

    await runtime.registerDetectedChanges(
      [{ type: 'add', path: 'creatorweave/new-file.md', size: 0, mtime: 1781687065891 }],
      {} as FileSystemDirectoryHandle
    )

    // For genuinely new files, nativeFsMtime = change.mtime (OPFS mtime) is the
    // best we can do — the file doesn't exist on disk yet.
    expect(runtime.pendingManager.markAsCreated).toHaveBeenCalledWith(
      'creatorweave/new-file.md',
      1781687065891
    )
  })
})
