import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { deleteExecutor } from '../delete.tool'

const deleteFileMock = vi.fn<
  (path: string, directoryHandle: FileSystemDirectoryHandle) => Promise<void>
>()
const readFileMock = vi.fn<
  (
    path: string,
    directoryHandle: FileSystemDirectoryHandle
  ) => Promise<{ content: string | ArrayBuffer; metadata: { size: number; contentType: string } }>
>()
const getPendingChangesMock = vi.fn<() => Array<{ id: string }>>()

const recordModificationMock = vi.fn()
const broadcastFileChangeMock = vi.fn()

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: {
    getState: () => ({
      deleteFile: deleteFileMock,
      readFile: readFileMock,
      getPendingChanges: getPendingChangesMock,
    }),
  },
}))

vi.mock('@/undo/undo-manager', () => ({
  getUndoManager: () => ({
    recordModification: recordModificationMock,
  }),
}))

vi.mock('@/store/remote.store', () => ({
  useRemoteStore: {
    getState: () => ({
      session: {
        broadcastFileChange: broadcastFileChangeMock,
      },
    }),
  },
}))

const mockDirectoryHandle = {
  getFileHandle: vi.fn(),
  getDirectoryHandle: vi.fn(),
} as unknown as FileSystemDirectoryHandle

const context: ToolContext = {
  directoryHandle: mockDirectoryHandle,
}

describe('delete tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPendingChangesMock.mockReturnValue([{ id: 'p-1' }, { id: 'p-2' }])
    readFileMock.mockResolvedValue({
      content: 'old content',
      metadata: { size: 11, contentType: 'text' },
    })
    deleteFileMock.mockResolvedValue(undefined)
  })

  it('returns error when no directory selected', async () => {
    const result = await deleteExecutor({ path: 'src/a.ts' }, { directoryHandle: null })
    const parsed = JSON.parse(result)

    expect(parsed.error).toContain('No directory selected')
  })

  it('supports dry_run without mutating state', async () => {
    const result = await deleteExecutor(
      {
        paths: ['src/a.ts', 'src/b.ts'],
        dry_run: true,
      },
      context
    )
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.dryRun).toBe(true)
    expect(parsed.targets).toEqual(['src/a.ts', 'src/b.ts'])
    expect(deleteFileMock).not.toHaveBeenCalled()
    expect(recordModificationMock).not.toHaveBeenCalled()
  })

  it('marks a single file as pending deletion', async () => {
    const result = await deleteExecutor({ path: 'src/a.ts' }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(true)
    expect(parsed.deleted).toEqual(['src/a.ts'])
    expect(parsed.failed).toEqual([])
    expect(parsed.status).toBe('pending')
    expect(parsed.pendingCount).toBe(2)

    expect(deleteFileMock).toHaveBeenCalledTimes(1)
    expect(deleteFileMock).toHaveBeenCalledWith('src/a.ts', mockDirectoryHandle)
    expect(recordModificationMock).toHaveBeenCalledWith('src/a.ts', 'delete', 'old content', null)
    expect(broadcastFileChangeMock).toHaveBeenCalledWith('src/a.ts', 'delete', 'Deleted: src/a.ts')
  })

  it('handles partial failures in batch mode', async () => {
    deleteFileMock.mockImplementation(async (path: string) => {
      if (path === 'src/b.ts') throw new Error('not found')
    })

    const result = await deleteExecutor({ paths: ['src/a.ts', 'src/b.ts'] }, context)
    const parsed = JSON.parse(result)

    expect(parsed.success).toBe(false)
    expect(parsed.deleted).toEqual(['src/a.ts'])
    expect(parsed.failed).toHaveLength(1)
    expect(parsed.failed[0]).toMatchObject({ path: 'src/b.ts' })
    expect(parsed.status).toBe('pending')

    expect(deleteFileMock).toHaveBeenCalledTimes(2)
    expect(recordModificationMock).toHaveBeenCalledTimes(1)
    expect(broadcastFileChangeMock).toHaveBeenCalledTimes(1)
  })
})
