import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileDiffViewer } from '../FileDiffViewer'

const getActiveConversationMock = vi.fn()
const getNativeDirectoryHandleMock = vi.fn()

const fileExistsInNativeFSMock = vi.fn()
const readFileFromOPFSMock = vi.fn()
const readFileFromNativeFSMock = vi.fn()

vi.mock('../MonacoDiffEditor', () => ({
  default: () => <div data-testid="monaco-diff-editor" />,
}))

vi.mock('../LazyDiffViewer', () => ({
  default: () => <div data-testid="lazy-diff-viewer" />,
}))

vi.mock('@/store/conversation-context.store', () => ({
  getActiveConversation: () => getActiveConversationMock(),
}))

vi.mock('@/opfs', () => ({
  isImageFile: () => false,
  getFileContentType: () => 'text',
  fileExistsInNativeFS: (...args: unknown[]) => fileExistsInNativeFSMock(...args),
  readFileFromOPFS: (...args: unknown[]) => readFileFromOPFSMock(...args),
  readFileFromNativeFS: (...args: unknown[]) => readFileFromNativeFSMock(...args),
  readBinaryFileFromOPFS: vi.fn(),
  readBinaryFileFromNativeFS: vi.fn(),
}))

describe('FileDiffViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNativeDirectoryHandleMock.mockResolvedValue({} as FileSystemDirectoryHandle)
    getActiveConversationMock.mockResolvedValue({
      conversationId: 'conv_1',
      conversation: {
        getNativeDirectoryHandle: getNativeDirectoryHandleMock,
      },
    })
    fileExistsInNativeFSMock.mockResolvedValue(true)
    readFileFromOPFSMock.mockResolvedValue('const n = 2')
    readFileFromNativeFSMock.mockResolvedValue('const n = 1')
  })

  it('renders lazy diff viewer for text file changes', async () => {
    render(
      <FileDiffViewer
        fileChange={{
          type: 'modify',
          path: 'src/example.ts',
          size: 128,
        }}
      />
    )

    // Default renderer is LazyDiffViewer (only changed hunks).
    // Monaco full editor is opt-in via the "switch" button.
    expect(await screen.findByTestId('lazy-diff-viewer')).toBeDefined()
  })
})
