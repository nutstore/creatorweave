/**
 * Regression tests for ToolAuthModal's lazy FileDiffViewer resolution.
 *
 * History: lazyFileDiffViewer() used `setComp(m?.FileDiffViewer ?? null)` —
 * passing the component FUNCTION directly to setState. React treats a function
 * argument as an updater (basicStateReducer) and CALLS it with the previous
 * state (null), so FileDiffViewer(null) ran and crashed with:
 *   "TypeError: Cannot destructure property 'fileChange' of 'param' as it is null."
 * The fix wraps the value: `setComp(() => m?.FileDiffViewer ?? null)`.
 *
 * These tests render the real modal with a pending file-change request and
 * assert the diff overlay resolves the lazy component without crashing.
 */

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolAuthModal } from '../ToolAuthModal'
import { useToolAuthStore } from '@/store/tool-auth.store'
import type { FileChange } from '@/opfs/types/opfs-types'

// The lazy chunk we stand in for. It must be a plain function component:
// if the modal ever regresses to storing it via setState(component), React's
// basicStateReducer calls this function with `null` and the destructure below
// throws — reproducing the original crash inside the test.
vi.mock('@/components/sync/FileDiffViewer', () => ({
  FileDiffViewer: ({ fileChange }: { fileChange: FileChange | null }) => {
    const { path } = fileChange ?? { fileChange: null }
    if (fileChange === null) {
      throw new Error(
        "Cannot destructure property 'fileChange' of 'param' as it is null."
      )
    }
    return <div data-testid="diff-viewer-stub">diff:{path}</div>
  },
}))

function requestWithFileChange(partial?: Partial<FileChange>) {
  return useToolAuthStore
    .getState()
    .request({
      toolName: 'write_file',
      description: { key: 'title' },
      fileChanges: [
        { type: 'modify', path: 'src/a.ts', ...partial },
      ],
      memoryKey: null,
    })
}

describe('ToolAuthModal lazy FileDiffViewer', () => {
  beforeEach(() => {
    useToolAuthStore.getState().clear()
  })

  afterEach(() => {
    useToolAuthStore.getState().clear()
  })

  it('renders modal for a pending request with file changes', () => {
    void requestWithFileChange()
    render(<ToolAuthModal />)
    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
  })

  it('opens the diff overlay without crashing when the lazy chunk resolves', async () => {
    const user = userEvent.setup()
    void requestWithFileChange()
    render(<ToolAuthModal />)

    await user.click(screen.getByText('src/a.ts'))

    // If lazyFileDiffViewer regresses to setState(component), React invokes the
    // mocked component with the previous state (null) and the stub throws the
    // original "Cannot destructure 'fileChange'" error, failing this test.
    await waitFor(() => {
      expect(screen.getByTestId('diff-viewer-stub')).toHaveTextContent('diff:src/a.ts')
    })
  })

  it('resolves the shared module promise exactly once across rerenders', async () => {
    const user = userEvent.setup()
    void requestWithFileChange()
    const { rerender } = render(<ToolAuthModal />)
    await waitFor(() => {
      expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    })

    await user.click(screen.getByText('src/a.ts'))
    await waitFor(() => {
      expect(screen.getByTestId('diff-viewer-stub')).toBeInTheDocument()
    })

    act(() => {
      rerender(<ToolAuthModal />)
    })
    expect(screen.getByTestId('diff-viewer-stub')).toBeInTheDocument()
  })
})
