import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { captureTabMock, addFilesMock, conversationState, pageActionAvailable } = vi.hoisted(() => ({
  captureTabMock: vi.fn(async () => ({ ok: true, dataUrl: 'data:image/png;base64,c2NyZWVuc2hvdA==' })),
  addFilesMock: vi.fn(),
  conversationState: { conversations: [] as unknown[] },
  pageActionAvailable: { value: true },
}))

vi.mock('@/store/settings.store', () => ({
  useSettingsStore: (selector: (state: {
    hasApiKey: boolean
    hasApiKeyLoaded: boolean
    checkHasApiKey: () => Promise<void>
    modelName: string
  }) => unknown) => selector({
    hasApiKey: true,
    hasApiKeyLoaded: true,
    checkHasApiKey: async () => {},
    modelName: 'vision-model',
  }),
}))

vi.mock('@/store/conversation.store', () => ({
  useConversationStore: (selector: (state: { conversations: unknown[] }) => unknown) => selector(conversationState),
}))

vi.mock('@/store/folder-access.store', () => ({
  useFolderAccessStore: (selector: (state: { roots: unknown[]; addRoot: () => Promise<void> }) => unknown) => selector({
    roots: [],
    addRoot: async () => {},
  }),
}))

vi.mock('@/hooks/useGatewayLogin', () => ({
  isLLMGatewayConfigured: () => false,
  useGatewayLogin: () => ({ authState: null, isRunning: false, login: async () => false, reset: vi.fn() }),
}))

vi.mock('@/agent/llm/pi-ai-model-resolver', () => ({
  supportsImageInput: () => true,
}))

vi.mock('@/agent/tools/page-action-bridge', () => ({
  captureTab: captureTabMock,
  isPageActionAvailable: () => pageActionAvailable.value,
}))

vi.mock('@/store/asset.store', () => ({
  useAssetStore: { getState: () => ({ addFiles: addFilesMock }) },
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => ({
    'agent.vision.capture': 'Capture screenshot',
    'agent.vision.supported': 'Current model supports image input',
    'agent.vision.unsupported': 'Vision unavailable',
    'agent.vision.screenshotUnavailable': 'Screenshot unavailable',
    'agent.pageScreenshot.captureFailed': 'Could not capture screenshot',
    'onboarding.steps.files.title': 'Let AI read your files',
    'agent.folderTip.description': 'Choose a folder and AI can read and edit its files.',
    'welcome.setupLocalFirstHint': 'Your data stays in this browser.',
  })[key] ?? key,
}))

vi.mock('../agent/AgentRichInput', () => ({
  AgentRichInput: ({ leadingAccessory }: { leadingAccessory?: ReactNode }) => (
    <div data-testid="agent-rich-input">{leadingAccessory}</div>
  ),
}))

vi.mock('../agent/PageScreenshotCropDialog', () => ({
  PageScreenshotCropDialog: ({ onConfirm }: { onConfirm: (file: File) => void }) => (
    <button type="button" onClick={() => onConfirm(new File(['screenshot'], 'page-screenshot.png', { type: 'image/png' }))}>
      Insert screenshot
    </button>
  ),
}))

import { WelcomeScreen } from '../WelcomeScreen'

describe('WelcomeScreen', () => {
  beforeEach(() => {
    pageActionAvailable.value = true
  })

  it('explains why selecting a folder grants AI file access', () => {
    render(<WelcomeScreen onStartConversation={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Let AI read your files' })).toBeInTheDocument()
    expect(screen.getByText('Choose a folder and AI can read and edit its files.')).toBeInTheDocument()
  })

  it('places the folder action before the privacy note', () => {
    render(<WelcomeScreen onStartConversation={vi.fn()} />)

    const folderAction = screen.getByRole('button', { name: 'Let AI read your files' })
    const privacyNote = screen.getByText('Your data stays in this browser.')

    expect(folderAction.compareDocumentPosition(privacyNote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('captures a screenshot and stages it for the first conversation message', async () => {
    render(<WelcomeScreen onStartConversation={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Capture screenshot' }))

    await waitFor(() => expect(captureTabMock).toHaveBeenCalledWith('png'))
    fireEvent.click(screen.getByRole('button', { name: 'Insert screenshot' }))

    expect(addFilesMock).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'page-screenshot.png', type: 'image/png' }),
    ])
  })

  it('shows model vision capability rather than a side-panel instruction outside side-panel mode', () => {
    pageActionAvailable.value = false
    render(<WelcomeScreen onStartConversation={vi.fn()} />)

    const indicator = screen.getByRole('button', { name: 'Current model supports image input' })
    expect(indicator).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Screenshot unavailable' })).not.toBeInTheDocument()
  })
})
