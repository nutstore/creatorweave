import { beforeEach, describe, expect, it, vi } from 'vitest'

const getActiveConversationMock = vi.fn()
const getWorkspaceManagerMock = vi.fn()

vi.mock('@/store/conversation-context.store', () => ({
  getActiveConversation: () => getActiveConversationMock(),
}))

vi.mock('@/opfs', () => ({
  getWorkspaceManager: () => getWorkspaceManagerMock(),
}))

import { analyzeDataExecutor } from '../data-analysis.tool'
import type { ToolContext } from '../tool-types'

describe('data-analysis workspace fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to workspace files dir when native directory is unavailable', async () => {
    const fileContent = 'name,age\nAlice,30'
    const fileHandle = {
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(fileContent),
      }),
    } as unknown as FileSystemFileHandle

    const filesDirHandle = {
      getFileHandle: vi.fn().mockResolvedValue(fileHandle),
      getDirectoryHandle: vi.fn(),
    } as unknown as FileSystemDirectoryHandle

    const getNativeDirectoryHandle = vi.fn().mockResolvedValue(null)
    const getFilesDir = vi.fn().mockResolvedValue(filesDirHandle)

    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: vi.fn().mockResolvedValue({
        getNativeDirectoryHandle,
        getFilesDir,
      }),
    })
    getActiveConversationMock.mockResolvedValue(undefined)

    const context: ToolContext = {
      directoryHandle: null,
      workspaceId: 'ws_1',
    }

    const result = await analyzeDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
      },
      context
    )

    const parsed = JSON.parse(result)
    expect(parsed.summary.totalRows).toBe(1)
    expect(getNativeDirectoryHandle).toHaveBeenCalled()
    expect(getFilesDir).toHaveBeenCalled()
  })
})
