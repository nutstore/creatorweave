import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PendingSyncPanel } from '../PendingSyncPanel'

const storeMock = vi.hoisted(() => ({
  pendingChanges: {
    changes: [] as Array<{ type: 'create' | 'modify' | 'delete'; path: string; size?: number }>,
  },
  discardPendingPath: vi.fn<(...args: unknown[]) => Promise<void>>(),
  discardPendingPaths: vi.fn<(...args: unknown[]) => Promise<{ successCount: number; failedCount: number }>>(),
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
    discardPendingPaths: typeof storeMock.discardPendingPaths
  }) => unknown) =>
    selector({
      pendingChanges: storeMock.pendingChanges,
      discardPendingPath: storeMock.discardPendingPath,
      discardPendingPaths: storeMock.discardPendingPaths,
    })) as unknown as {
    <T>(selector: (state: {
      pendingChanges: typeof storeMock.pendingChanges
      discardPendingPath: typeof storeMock.discardPendingPath
      discardPendingPaths: typeof storeMock.discardPendingPaths
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
    discardPendingPaths: storeMock.discardPendingPaths,
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
    storeMock.discardPendingPaths.mockResolvedValue({ successCount: 0, failedCount: 0 })
    storeMock.refreshPendingChanges.mockResolvedValue()
  })

  it('shows warning when clearing all has partial discard failures', async () => {
    storeMock.pendingChanges = {
      changes: [
        { type: 'create', path: 'a.txt', size: 10 },
        { type: 'modify', path: 'b.txt', size: 20 },
      ],
    }
    storeMock.discardPendingPaths.mockResolvedValue({ successCount: 1, failedCount: 1 })

    const user = userEvent.setup()
    render(<PendingSyncPanel />)

    await user.click(screen.getByRole('button', { name: /Reject All Changes|Discard all changes/ }))
    await user.click(screen.getByRole('button', { name: /Confirm Reject|Confirm discard/ }))

    await waitFor(() => {
      expect(storeMock.discardPendingPaths).toHaveBeenCalledTimes(1)
    })
    expect(storeMock.discardPendingPaths).toHaveBeenCalledWith(['a.txt', 'b.txt'])
    expect(storeMock.refreshPendingChanges).toHaveBeenCalled()
    expect(toastMock.warning).toHaveBeenCalled()
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

    await user.click(screen.getByRole('button', { name: /Reject All Changes|Discard all changes/ }))
    await user.click(screen.getByRole('button', { name: /Confirm Reject|Confirm discard/ }))

    await waitFor(() => {
      expect(storeMock.discardPendingPaths).toHaveBeenCalledTimes(1)
    })
    expect(storeMock.refreshPendingChanges).toHaveBeenCalled()
    expect(toastMock.success).toHaveBeenCalledWith('All changes rejected')
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
    expect(storeMock.showPreviewPanelForPath).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith('Cannot discard changes to "broken.txt": missing local file baseline')
  })
})
    storeMock.discardPendingPaths.mockResolvedValue({ successCount: 2, failedCount: 0 })
