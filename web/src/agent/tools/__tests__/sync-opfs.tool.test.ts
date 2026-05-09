import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { syncToOPFSExecutor } from '../sync-opfs.tool'

const resolveNativeDirectoryHandleMock = vi.fn()
const getWorkspaceManagerMock = vi.fn()

vi.mock('../tool-utils', () => ({
  resolveNativeDirectoryHandle: (...args: unknown[]) => resolveNativeDirectoryHandleMock(...args),
}))

vi.mock('@/opfs', () => ({
  getWorkspaceManager: () => getWorkspaceManagerMock(),
}))

type TreeNode = { [name: string]: TreeNode | 'file' }

function createFileHandle(name: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => new File(['x'], name),
    createWritable: async () =>
      ({
        write: async () => {},
        close: async () => {},
      }) as unknown as FileSystemWritableFileStream,
  } as unknown as FileSystemFileHandle
}

function createDirectoryHandle(name: string, tree: TreeNode): FileSystemDirectoryHandle {
  const dirs = new Map<string, FileSystemDirectoryHandle>()
  const files = new Map<string, FileSystemFileHandle>()

  for (const [entryName, node] of Object.entries(tree)) {
    if (node === 'file') {
      files.set(entryName, createFileHandle(entryName))
    } else {
      dirs.set(entryName, createDirectoryHandle(entryName, node))
    }
  }

  return {
    kind: 'directory',
    name,
    async *entries() {
      for (const [entryName, dir] of dirs.entries()) {
        yield [entryName, dir] as const
      }
      for (const [entryName, file] of files.entries()) {
        yield [entryName, file] as const
      }
    },
    getDirectoryHandle: vi.fn(async (entryName: string, options?: { create?: boolean }) => {
      const existing = dirs.get(entryName)
      if (existing) return existing
      if (options?.create) {
        const created = createDirectoryHandle(entryName, {})
        dirs.set(entryName, created)
        return created
      }
      throw new Error(`Directory not found: ${entryName}`)
    }),
    getFileHandle: vi.fn(async (entryName: string, options?: { create?: boolean }) => {
      const existing = files.get(entryName)
      if (existing) return existing
      if (options?.create) {
        const created = createFileHandle(entryName)
        files.set(entryName, created)
        return created
      }
      throw new Error(`File not found: ${entryName}`)
    }),
  } as unknown as FileSystemDirectoryHandle
}

function parseEnvelope(result: string) {
  return JSON.parse(result) as {
    ok: boolean
    data?: Record<string, unknown>
    error?: { code: string; message: string; hint?: string; details?: Record<string, unknown> }
  }
}

describe('sync tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns skipped when files are already present in OPFS even if native has no matches', async () => {
    const nativeRoot = createDirectoryHandle('native', {})
    const opfsRoot = createDirectoryHandle('files', {
      '.skills': {
        'word-editor': {
          scripts: {
            'converter.py': 'file',
            'parser.py': 'file',
          },
        },
      },
    })

    resolveNativeDirectoryHandleMock.mockResolvedValue(nativeRoot)
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn(async () => ({
        getFilesDir: async () => opfsRoot,
        getAllNativeDirectoryHandles: vi.fn(async () => new Map<string, FileSystemDirectoryHandle>()),
      })),
    })

    const result = await syncToOPFSExecutor(
      {
        paths: ['.skills/word-editor/scripts/converter.py', '.skills/word-editor/scripts/parser.py'],
      },
      { directoryHandle: null, workspaceId: 'ws_1' } as unknown as ToolContext
    )

    const parsed = parseEnvelope(result)
    expect(parsed.ok).toBe(true)
    expect(parsed.data?.synced).toBe(0)
    expect(parsed.data?.skipped).toBe(2)
    expect(String(parsed.data?.skippedReason || '')).toContain('already exist in OPFS')
  })

  it('returns no_files with actionable hint when neither native nor OPFS has matches', async () => {
    const nativeRoot = createDirectoryHandle('native', {})
    const opfsRoot = createDirectoryHandle('files', {})

    resolveNativeDirectoryHandleMock.mockResolvedValue(nativeRoot)
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn(async () => ({
        getFilesDir: async () => opfsRoot,
        getAllNativeDirectoryHandles: vi.fn(async () => new Map<string, FileSystemDirectoryHandle>()),
      })),
    })

    const requested = ['.skills/word-editor/scripts/converter.py']
    const result = await syncToOPFSExecutor(
      { paths: requested },
      { directoryHandle: null, workspaceId: 'ws_1' } as unknown as ToolContext
    )

    const parsed = parseEnvelope(result)
    expect(parsed.ok).toBe(false)
    expect(parsed.error?.code).toBe('no_files')
    expect(parsed.error?.message).toContain('native filesystem')
    expect(parsed.error?.hint).toContain('workspace root')
    expect(parsed.error?.details?.requested_paths).toEqual(requested)
  })
})
