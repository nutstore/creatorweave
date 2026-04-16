import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PendingSyncPanel } from '../PendingSyncPanel'

const storeMock = vi.hoisted(() => ({
  pendingChanges: {
    changes: [] as Array<{ type: 'create' | 'modify' | 'delete'; path: string; size?: number }>,
  },
  discardPendingPath: vi.fn<(...args: unknown[]) => Promise<void>>(),
  refreshPendingChanges: vi.fn<(...args: unknown[]) => Promise<void>>(),
  showPreviewPanel: vi.fn(),
  showPreviewPanelForPath: vi.fn(),
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/store/conversation-context.store', () => {
  const useConversationContextStore = ((selector: (state: {
    pendingChanges: typeof storeMock.pendingChanges
    discardPendingPath: typeof storeMock.discardPendingPath
  }) => unknown) =>
    selector({
      pendingChanges: storeMock.pendingChanges,
      discardPendingPath: storeMock.discardPendingPath,
    })) as unknown as {
    <T>(selector: (state: {
      pendingChanges: typeof storeMock.pendingChanges
      discardPendingPath: typeof storeMock.discardPendingPath
    }) => T): T
    getState: () => {
      refreshPendingChanges: typeof storeMock.refreshPendingChanges
      showPreviewPanel: typeof storeMock.showPreviewPanel
      showPreviewPanelForPath: typeof storeMock.showPreviewPanelForPath
    }
  }

  useConversationContextStore.getState = () => ({
    refreshPendingChanges: storeMock.refreshPendingChanges,
    showPreviewPanel: storeMock.showPreviewPanel,
    showPreviewPanelForPath: storeMock.showPreviewPanelForPath,
  })

  return {
    useConversationContextStore,
    getActiveConversation: vi.fn(async () => null),
  }
})

vi.mock('@/opfs', () => ({
  isImageFile: vi.fn(() => false),
  readFileFromNativeFS: vi.fn(),
  readFileFromOPFS: vi.fn(),
}))

vi.mock('@/store/settings.store', () => ({
  useSettingsStore: {
    getState: () => ({
      providerType: 'openai',
      getEffectiveProviderConfig: () => null,
    }),
  },
}))

vi.mock('@/sqlite', () => ({
  getApiKeyRepository: vi.fn(() => ({
    getApiKeyByProvider: vi.fn(async () => null),
  })),
}))

vi.mock('@/agent/llm/provider-factory', () => ({
  createLLMProvider: vi.fn(),
}))

vi.mock('@/workers/commit-summary-worker-manager', () => ({
  buildCommitSummaryDiffSections: vi.fn(async () => []),
}))

vi.mock('@/utils/change-helpers', () => ({
  getChangeTypeInfo: (type: string) => ({ label: type, bg: '', color: '' }),
  formatFileSize: (size?: number) => `${size || 0} B`,
  FileIcon: () => <span data-testid="file-icon" />,
}))

vi.mock('./snapshot-summary-prompt', () => ({
  buildSnapshotSummaryPrompt: vi.fn(() => ''),
}))

vi.mock('./SnapshotApprovalDialog', () => ({
  SnapshotApprovalDialog: () => null,
}))

vi.mock('./review-request', () => ({
  sendChangeReviewToConversation: vi.fn(async () => {}),
}))

vi.mock('./ConflictResolutionDialog', () => ({
  ConflictResolutionDialog: () => null,
}))

vi.mock('@/components/layout/SidebarPanelHeader', () => ({
  SidebarPanelHeader: (props: { title: string; leftExtra?: React.ReactNode; right?: React.ReactNode }) => (
    <div>
      <span>{props.title}</span>
      {props.leftExtra}
      {props.right}
    </div>
  ),
}))

vi.mock('lucide-react', () => ({
  RefreshCw: () => <span>Refresh</span>,
  Sparkles: () => <span>Sparkles</span>,
  ChevronRight: () => <span>ChevronRight</span>,
  X: () => <span>X</span>,
  Check: () => <span>Check</span>,
  AlertTriangle: () => <span>AlertTriangle</span>,
}))

vi.mock('@creatorweave/ui', () => ({
  BrandButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{props.children}</button>
  ),
  BrandDialog: (props: { open: boolean; children: React.ReactNode }) =>
    props.open ? <div>{props.children}</div> : null,
  BrandDialogContent: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  BrandDialogHeader: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  BrandDialogTitle: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  BrandDialogBody: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  BrandDialogFooter: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastMock.success,
    warning: toastMock.warning,
    error: toastMock.error,
  },
}))

describe('PendingSyncPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeMock.pendingChanges = {
      changes: [],
    }
    storeMock.discardPendingPath.mockResolvedValue()
    storeMock.refreshPendingChanges.mockResolvedValue()
  })

  it('shows warning when clearing all has partial discard failures', async () => {
    storeMock.pendingChanges = {
      changes: [
        { type: 'create', path: 'a.txt', size: 10 },
        { type: 'modify', path: 'b.txt', size: 20 },
      ],
    }
    storeMock.discardPendingPath.mockImplementation(async (path: unknown) => {
      if (path === 'b.txt') {
        throw new Error('Missing local file baseline')
      }
    })

    const user = userEvent.setup()
    render(<PendingSyncPanel />)

    await user.click(screen.getByRole('button', { name: 'Discard all changes' }))
    await user.click(screen.getByRole('button', { name: 'Confirm discard' }))

    await waitFor(() => {
      expect(storeMock.discardPendingPath).toHaveBeenCalledTimes(2)
    })
    expect(storeMock.discardPendingPath).toHaveBeenNthCalledWith(1, 'a.txt')
    expect(storeMock.discardPendingPath).toHaveBeenNthCalledWith(2, 'b.txt')
    expect(storeMock.refreshPendingChanges).toHaveBeenCalledWith(true)
    expect(toastMock.warning).toHaveBeenCalledWith(
      'Discarded 1 change, 1 retained in list due to missing local file baseline'
    )
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('shows success when clearing all succeeds', async () => {
    storeMock.pendingChanges = {
      changes: [
        { type: 'create', path: 'a.txt', size: 10 },
        { type: 'modify', path: 'b.txt', size: 20 },
      ],
    }

    const user = userEvent.setup()
    render(<PendingSyncPanel />)

    await user.click(screen.getByRole('button', { name: 'Discard all changes' }))
    await user.click(screen.getByRole('button', { name: 'Confirm discard' }))

    await waitFor(() => {
      expect(storeMock.discardPendingPath).toHaveBeenCalledTimes(2)
    })
    expect(storeMock.refreshPendingChanges).toHaveBeenCalledWith(true)
    expect(toastMock.success).toHaveBeenCalledWith('All changes discarded')
    expect(toastMock.warning).not.toHaveBeenCalled()
  })

  it('shows discard error for single file removal failure', async () => {
    storeMock.pendingChanges = {
      changes: [{ type: 'modify', path: 'broken.txt', size: 8 }],
    }
    storeMock.discardPendingPath.mockRejectedValue(new Error('Cannot discard changes to "broken.txt": missing local file baseline'))

    const user = userEvent.setup()
    render(<PendingSyncPanel />)

    await user.click(screen.getByTitle('Remove from list'))

    await waitFor(() => {
      expect(storeMock.discardPendingPath).toHaveBeenCalledWith('broken.txt')
    })
    expect(toastMock.error).toHaveBeenCalledWith('Cannot discard changes to "broken.txt": missing local file baseline')
  })
})

