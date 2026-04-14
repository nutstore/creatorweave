import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileTreePanel } from '../FileTreePanel'

const mockOpfsState = {
  pendingChanges: [] as Array<{ type: 'create' | 'modify' | 'delete'; path: string }>,
  approvedNotSyncedPaths: new Set<string>(),
  cachedPaths: [] as string[],
}

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: (selector: (state: typeof mockOpfsState) => unknown) => selector(mockOpfsState),
}))

describe('FileTreePanel', () => {
  beforeEach(() => {
    mockOpfsState.pendingChanges = []
    mockOpfsState.approvedNotSyncedPaths = new Set()
    mockOpfsState.cachedPaths = []
  })

  it('shows directory hierarchy for cached OPFS files after pending list is empty', async () => {
    mockOpfsState.cachedPaths = ['src/components/App.tsx']
    mockOpfsState.approvedNotSyncedPaths = new Set(['src/components/App.tsx'])

    render(<FileTreePanel directoryHandle={null} onFileSelect={vi.fn()} />)

    const user = userEvent.setup()
    const srcDir = await screen.findByText('src')
    await user.click(srcDir)

    const componentsDir = await screen.findByText('components')
    await user.click(componentsDir)

    expect(await screen.findByText('App.tsx')).toBeInTheDocument()
  })

  it('shows OPFS sandbox hint when no directory, pending, or cached files exist', () => {
    render(<FileTreePanel directoryHandle={null} onFileSelect={vi.fn()} />)

    expect(screen.getByText(/未选择本地目录也可继续使用/)).toBeInTheDocument()
    expect(screen.getByText(/纯 OPFS 沙箱模式下，文件变更会显示在这里/)).toBeInTheDocument()
  })
})
