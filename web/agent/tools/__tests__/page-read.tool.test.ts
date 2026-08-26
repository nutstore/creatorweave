import { beforeEach, describe, expect, it, vi } from 'vitest'

const pageActionBridge = vi.hoisted(() => ({
  isPageActionAvailable: vi.fn(),
  runPageAction: vi.fn(),
}))

vi.mock('../page-action-bridge', () => pageActionBridge)

import { pageSnapshotExecutor } from '../page-read.tool'

describe('page_snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a successful tool envelope when the runner returns a snapshot', async () => {
    pageActionBridge.isPageActionAvailable.mockReturnValue(true)
    pageActionBridge.runPageAction.mockResolvedValue({
      ok: true,
      tree_text: 'button "Save"',
      nodeCount: 1,
      truncated: false,
    })

    const result = JSON.parse(await pageSnapshotExecutor({ maxNodes: 50 }, { directoryHandle: null }))

    expect(result).toMatchObject({
      ok: true,
      tool: 'page_snapshot',
      data: {
        tree_text: 'button "Save"',
        nodeCount: 1,
        truncated: false,
      },
    })
    expect(pageActionBridge.runPageAction).toHaveBeenCalledWith({ type: 'snapshot', maxNodes: 50 })
  })
})
