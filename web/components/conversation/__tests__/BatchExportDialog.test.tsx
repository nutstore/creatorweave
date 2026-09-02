/**
 * Tests for BatchExportDialog — the user-facing entry to the
 * `search_conversations` pipeline (list + batch export).
 *
 * Interaction contract (2026-09 redesign):
 * - No search button: any filter change re-queries automatically
 *   (250ms debounce for the keyword input).
 * - Projects filter by ID (with per-project counts in the dropdown).
 * - Selection survives filter changes; the export button carries the count.
 * - Re-queries keep the list rendered (opacity dim instead of spinner).
 *
 * The service module is mocked; we assert the *wiring*: filters passed to
 * `listConversationsForExport`, selections passed to
 * `exportConversationsBatch`, and the visible result states.
 *
 * i18n is real (test locale = en-US); assertions use resolved copy.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchExportDialog } from '../BatchExportDialog'

const { listConversationsMock, listProjectsMock, exportBatchMock } = vi.hoisted(() => ({
  listConversationsMock: vi.fn(),
  listProjectsMock: vi.fn(),
  exportBatchMock: vi.fn(),
}))

vi.mock('@/services/export/conversation-batch-export', () => ({
  listConversationsForExport: listConversationsMock,
  listProjectsWithCounts: listProjectsMock,
  exportConversationsBatch: exportBatchMock,
}))

const DAY = 24 * 60 * 60 * 1000
const BASE = new Date('2026-09-01T12:00:00').getTime()

const ROWS = [
  {
    conversationId: 'c1',
    title: 'React performance',
    workspaceName: 'ws1',
    projectName: 'Web',
    updatedAt: BASE - 2 * DAY,
    createdAt: BASE - 3 * DAY,
    messageCount: 5,
  },
  {
    conversationId: 'c2',
    title: 'Meeting notes',
    workspaceName: 'ws2',
    projectName: 'Docs',
    updatedAt: BASE - 40 * DAY,
    createdAt: BASE - 41 * DAY,
    messageCount: 3,
  },
]

const PROJECTS = [
  { projectId: 'p-web', name: 'Web', conversationCount: 1 },
  { projectId: 'p-docs', name: 'Docs', conversationCount: 1 },
]

/** A conversation with no project link (NULL after the LEFT JOINs). */
const ORPHAN_ROW = {
  conversationId: 'c3',
  title: 'Orphan conversation',
  workspaceName: '',
  projectName: null,
  updatedAt: BASE - 5 * DAY,
  createdAt: BASE - 6 * DAY,
  messageCount: 2,
}

function lastListCall(): { filter: Record<string, unknown> } {
  const calls = listConversationsMock.mock.calls
  const last = calls[calls.length - 1]
  return { filter: last?.[0] ?? {} }
}

/** The initial auto-search is debounced; wait for its rows to land. */
async function waitForInitialRows() {
  await screen.findByText('React performance')
}

describe('BatchExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listProjectsMock.mockResolvedValue(PROJECTS)
    listConversationsMock.mockResolvedValue(ROWS)
    exportBatchMock.mockResolvedValue({
      success: true,
      filename: 'eo2weave-conversations_x.zip',
      size: 1024,
      exportedCount: 1,
      skippedCount: 0,
      items: [],
    })
  })

  it('auto-loads recent conversations when opened (no search button)', async () => {
    render(<BatchExportDialog open onOpenChange={() => {}} />)

    await waitForInitialRows()
    expect(screen.getByText('Meeting notes')).toBeInTheDocument()
    expect(screen.getByText('2 conversations')).toBeInTheDocument()
    // Projects dropdown trigger is present
    expect(screen.getByRole('button', { name: /Projects · All/ })).toBeInTheDocument()
    // The old explicit search button must be gone
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
  })

  it('localizes the untitled-project label for conversations with no project link', async () => {
    // Service returns raw null (no SQL COALESCE); the dialog must localize it.
    listConversationsMock.mockResolvedValue([...ROWS, ORPHAN_ROW])
    listProjectsMock.mockResolvedValue([
      ...PROJECTS,
      { projectId: null, name: null, conversationCount: 1 },
    ])
    render(<BatchExportDialog open onOpenChange={() => {}} />)

    // en-US resolved copy in the conversation row
    expect(await screen.findByText(/\(Untitled project\) ·/)).toBeInTheDocument()

    // ...and in the project dropdown (with count)
    await userEvent.setup().click(screen.getByRole('button', { name: /Projects · All/ }))
    expect(screen.getByText('(Untitled project)')).toBeInTheDocument()
    // The localized label must not leak the raw null into the DOM
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })

  it('re-queries automatically when the keyword changes (debounced, full text on by default)', async () => {
    const user = userEvent.setup()
    render(<BatchExportDialog open onOpenChange={() => {}} />)
    await waitForInitialRows()

    listConversationsMock.mockClear()
    await user.type(screen.getByPlaceholderText('Search title or content...'), 'react')

    await waitFor(() => {
      expect(lastListCall().filter).toMatchObject({
        query: 'react',
        keywordSearch: true,
        limit: 500,
      })
    })
  })

  it('re-queries when a time range chip is clicked', async () => {
    const user = userEvent.setup()
    render(<BatchExportDialog open onOpenChange={() => {}} />)
    await waitForInitialRows()

    listConversationsMock.mockClear()
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }))

    await waitFor(() => {
      const filter = lastListCall().filter
      expect(filter.updatedAfter).toBeGreaterThan(Date.now() - 8 * DAY)
      expect(filter.query).toBeUndefined()
    })
  })

  it('filters by project ID from the dropdown and shows per-project counts', async () => {
    const user = userEvent.setup()
    render(<BatchExportDialog open onOpenChange={() => {}} />)
    await waitForInitialRows()

    // Dropdown lists each project with its conversation count
    await user.click(screen.getByRole('button', { name: /Projects · All/ }))
    expect(screen.getByText('Web')).toBeInTheDocument()
    expect(screen.getByText('Docs')).toBeInTheDocument()
    expect(screen.getAllByText('1')).toHaveLength(2)

    listConversationsMock.mockClear()
    await user.click(screen.getByRole('checkbox', { name: /^Web/ }))

    await waitFor(() => {
      expect(lastListCall().filter).toMatchObject({ projectIds: ['p-web'] })
    })
  })

  it('keeps the selection across filter changes and exports it', async () => {
    const user = userEvent.setup()
    render(<BatchExportDialog open onOpenChange={() => {}} />)
    await waitForInitialRows()

    // Tick the first row via its label
    await user.click(screen.getByText('React performance'))
    expect(screen.getByRole('button', { name: 'Export 1' })).toBeInTheDocument()

    // Change a filter → selection must survive (no checkbox reset)
    await user.click(screen.getByRole('button', { name: 'Last 90 days' }))
    await waitFor(() => {
      expect(screen.getByText(/selected/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('checkbox', { name: /React performance/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Export 1' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Export 1' }))

    await waitFor(() => {
      expect(exportBatchMock).toHaveBeenCalledTimes(1)
    })
    const [selections, options] = exportBatchMock.mock.calls[0]
    expect(selections).toHaveLength(1)
    expect(selections[0]).toMatchObject({ conversationId: 'c1', title: 'React performance' })
    expect(options.format).toBe('markdown')
    expect(typeof options.onProgress).toBe('function')

    expect(await screen.findByText(/Exported 1 conversations/)).toBeInTheDocument()
  })

  it('keeps rows rendered while a re-query is in flight (no spinner flash)', async () => {
    let resolveSecond!: (rows: unknown) => void
    listConversationsMock.mockImplementationOnce(async () => ROWS)
    listConversationsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve
        }),
    )
    const user = userEvent.setup()
    render(<BatchExportDialog open onOpenChange={() => {}} />)
    await waitForInitialRows()

    // Trigger a re-query; the previous rows must stay on screen (dimmed).
    listConversationsMock.mockClear()
    await user.click(screen.getByRole('button', { name: 'Last 90 days' }))
    await waitFor(() => {
      expect(listConversationsMock).toHaveBeenCalled()
    })
    expect(screen.getByText('React performance')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()

    resolveSecond(ROWS)
    await waitFor(() => {
      expect(screen.getByText('React performance')).toBeInTheDocument()
    })
  })

  it('shows the service error when the export fails', async () => {
    exportBatchMock.mockResolvedValue({
      success: false,
      filename: '',
      size: 0,
      exportedCount: 0,
      skippedCount: 0,
      items: [],
      error: 'boom',
    })
    const user = userEvent.setup()
    render(<BatchExportDialog open onOpenChange={() => {}} />)
    await waitForInitialRows()

    await user.click(screen.getByText('Meeting notes'))
    await user.click(screen.getByRole('button', { name: 'Export 1' }))

    expect(await screen.findByText('boom')).toBeInTheDocument()
  })

  it('shows the empty state with a clear-filters action when nothing matches', async () => {
    listConversationsMock.mockResolvedValue([])
    const user = userEvent.setup()
    render(<BatchExportDialog open onOpenChange={() => {}} />)

    await waitFor(() => {
      expect(listConversationsMock).toHaveBeenCalled()
    })
    expect(await screen.findByText('No conversations yet.')).toBeInTheDocument()

    // Apply a filter → empty state switches to the filtered variant
    listConversationsMock.mockClear()
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }))
    await waitFor(() => {
      expect(listConversationsMock).toHaveBeenCalled()
    })
    expect(await screen.findByText('No conversations match the current filters.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })
})
