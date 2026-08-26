import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ShareButton } from '../ShareButton'

const { mockSaveAs, mockToBlob } = vi.hoisted(() => ({
  mockSaveAs: vi.fn(),
  mockToBlob: vi.fn(),
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('@/store/conversation.store', () => ({
  useConversationStore: <T,>(selector: (state: { activeConversation: () => { title: string } }) => T) =>
    selector({ activeConversation: () => ({ title: 'Release notes' }) }),
}))

vi.mock('file-saver', () => ({ saveAs: mockSaveAs }))
vi.mock('html-to-image', () => ({ toBlob: mockToBlob }))

describe('ShareButton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T15:30:00'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('opens Markdown and image export options', () => {
    render(<ShareButton content="# Release notes" />)

    fireEvent.click(screen.getByRole('button', { name: 'conversation.share' }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'conversation.shareAsMarkdown' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'conversation.shareAsImage' })).toBeInTheDocument()
  })

  it('downloads Markdown only after the corresponding menu option is selected', () => {
    render(<ShareButton content="# Release notes" />)

    fireEvent.click(screen.getByRole('button', { name: 'conversation.share' }))
    expect(mockSaveAs).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('menuitem', { name: 'conversation.shareAsMarkdown' }))

    expect(mockSaveAs).toHaveBeenCalledOnce()
    expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'Release-notes-2026-07-28-1530.md')
  })

  it('exports the selected message as a PNG image', async () => {
    const target = document.createElement('div')
    target.dataset.messageId = 'message-1'
    document.body.appendChild(target)
    mockToBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))

    render(<ShareButton content="# Release notes" messageId="message-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'conversation.share' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'conversation.shareAsImage' }))

    await act(async () => {})

    expect(mockToBlob).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ pixelRatio: 2, cacheBust: true })
    )
    expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'Release-notes-2026-07-28-1530.png')

    target.remove()
  })

  it('does not attempt an image export when the message element is unavailable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<ShareButton content="Reply" messageId="missing-message" />)

    fireEvent.click(screen.getByRole('button', { name: 'conversation.share' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'conversation.shareAsImage' }))

    expect(warn).toHaveBeenCalledWith('ShareButton: target element not found for image export')
    expect(mockToBlob).not.toHaveBeenCalled()
    expect(mockSaveAs).not.toHaveBeenCalled()
  })
})
