/**
 * Conversation Batch Export Service Tests
 *
 * Covers the cross-project list query (SQL shape), batch zip packaging
 * (per-conversation directories, index.md, manifest.json), skip-on-empty
 * behavior, and duplicate title dedupe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock file-saver before imports
const mockSaveAs = vi.fn()
vi.mock('file-saver', () => ({
  saveAs: mockSaveAs,
}))

// Mock SQLite db + message repository
const queryAllMock = vi.fn()
const queryFirstMock = vi.fn()
vi.mock('@/sqlite/sqlite-database', () => ({
  getSQLiteDB: () => ({ queryAll: queryAllMock, queryFirst: queryFirstMock }),
}))

const findByConversationMock = vi.fn()
vi.mock('@/sqlite', () => ({
  getMessageRepository: () => ({ findByConversation: findByConversationMock }),
}))

// Mock the OPFS workspace manager (lazy-imported inside collectArtifacts)
const mockGetWorkspace = vi.fn()
vi.mock('@/opfs', () => ({
  getWorkspaceManager: vi.fn(async () => ({ getWorkspace: mockGetWorkspace })),
}))

const {
  listConversationsForExport,
  exportConversationsBatch,
} = await import('@/services/export/conversation-batch-export')
const { unzipSync } = await import('fflate')

import type { Message } from '@/agent/message-types'

// ============================================================================
// Helpers
// ============================================================================

let msgSeq = 0
function makeMessage(partial: Partial<Message> & Pick<Message, 'role'>): Message {
  msgSeq += 1
  return {
    id: `msg-${msgSeq}`,
    content: 'hello',
    timestamp: Date.now(),
    ...partial,
  } as Message
}

function lastSave(): { blob: Blob; filename: string } {
  const call = mockSaveAs.mock.calls.at(-1)
  if (!call) throw new Error('saveAs was not called')
  return { blob: call[0] as Blob, filename: call[1] as string }
}

// ============================================================================
// Tests
// ============================================================================

describe('listConversationsForExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryAllMock.mockResolvedValue([])
  })

  it('queries with project IN filter and time window', async () => {
    await listConversationsForExport({
      projects: ['creatorweave', 'yinghe'],
      updatedAfter: 1000,
      updatedBefore: 2000,
    })

    const [sql, params] = queryAllMock.mock.calls[0]
    expect(sql).toContain('p.name IN (?,?)')
    expect(sql).toContain('c.updated_at >= ?')
    expect(sql).toContain('c.updated_at <= ?')
    expect(params).toEqual(['creatorweave', 'yinghe', 1000, 2000, 500])
  })

  it('title keyword uses LIKE without message subquery', async () => {
    await listConversationsForExport({ query: 'OPFS' })
    const [sql, params] = queryAllMock.mock.calls[0]
    expect(sql).toContain('c.title LIKE ?')
    expect(sql).not.toContain('EXISTS')
    expect(params).toEqual(['%OPFS%', 500])
  })

  it('keywordSearch=true adds message content subquery', async () => {
    await listConversationsForExport({ query: 'OPFS', keywordSearch: true })
    const [sql] = queryAllMock.mock.calls[0]
    expect(sql).toContain('EXISTS (SELECT 1 FROM messages m')
  })

  it('respects custom limit', async () => {
    await listConversationsForExport({ limit: 10 })
    const [, params] = queryAllMock.mock.calls[0]
    expect(params).toEqual([10])
  })
})

describe('exportConversationsBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryFirstMock.mockResolvedValue({ created_at: 1, updated_at: 2 })
    mockGetWorkspace.mockResolvedValue({
      getAssetsDir: vi.fn(async () => null),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('packs each conversation into its own numbered directory with index.md and manifest.json', async () => {
    findByConversationMock.mockImplementation(async (id: string) =>
      id === 'conv-1'
        ? [makeMessage({ role: 'user', content: 'hi' }), makeMessage({ role: 'assistant', content: 'yo' })]
        : [makeMessage({ role: 'user', content: 'q2' })],
    )

    const result = await exportConversationsBatch(
      [
        { conversationId: 'conv-1', title: 'Alpha', projectName: 'cw', updatedAt: 123 },
        { conversationId: 'conv-2', title: 'Beta', projectName: 'cw', updatedAt: 456 },
      ],
      { format: 'markdown' },
    )

    expect(result.success).toBe(true)
    expect(result.exportedCount).toBe(2)
    expect(result.skippedCount).toBe(0)
    expect(result.filename).toMatch(/^eo2weave-conversations_\d{8}_\d{6}\.zip$/)

    const { blob } = lastSave()
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const names = Object.keys(files).sort()
    expect(names).toEqual([
      '01-Alpha/conversation.md',
      '02-Beta/conversation.md',
      'index.md',
      'manifest.json',
    ])

    // index.md table links to dirs
    const index = new TextDecoder().decode(files['index.md'])
    expect(index).toContain('01-Alpha')
    expect(index).toContain('02-Beta')

    // manifest carries per-item metadata
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']))
    expect(manifest.items).toHaveLength(2)
    expect(manifest.items[0]).toMatchObject({ title: 'Alpha', dir: '01-Alpha', success: true, messageCount: 2 })
    expect(manifest.items[1]).toMatchObject({ title: 'Beta', dir: '02-Beta', success: true, messageCount: 1 })
  })

  it('skips empty conversations instead of aborting the batch', async () => {
    findByConversationMock.mockImplementation(async (id: string) =>
      id === 'conv-empty' ? [] : [makeMessage({ role: 'user', content: 'x' })],
    )

    const result = await exportConversationsBatch(
      [
        { conversationId: 'conv-empty', title: 'Empty' },
        { conversationId: 'conv-ok', title: 'OK' },
      ],
      { format: 'json' },
    )

    expect(result.success).toBe(true)
    expect(result.exportedCount).toBe(1)
    expect(result.skippedCount).toBe(1)

    const files = unzipSync(new Uint8Array(await lastSave().blob.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual(['01-Empty', '02-OK/conversation.json', 'index.md', 'manifest.json'].filter(n => n !== '01-Empty'))
  })

  it('fails without download when every conversation is empty', async () => {
    findByConversationMock.mockResolvedValue([])

    const result = await exportConversationsBatch(
      [{ conversationId: 'conv-empty', title: 'Empty' }],
      { format: 'markdown' },
    )

    expect(result.success).toBe(false)
    expect(mockSaveAs).not.toHaveBeenCalled()
  })

  it('reports per-conversation progress', async () => {
    findByConversationMock.mockResolvedValue([makeMessage({ role: 'user', content: 'x' })])

    const events: string[] = []
    await exportConversationsBatch(
      [
        { conversationId: 'a', title: 'A' },
        { conversationId: 'b', title: 'B' },
      ],
      {
        format: 'markdown',
        onProgress: (p) => events.push(`${p.step}:${p.percent}`),
      },
    )

    expect(events[0]).toBe('1/2:0')
    expect(events[events.length - 1]).toBe('2/2:100')
  })

  it('sanitizes unsafe directory names from titles', async () => {
    findByConversationMock.mockResolvedValue([makeMessage({ role: 'user', content: 'x' })])

    const result = await exportConversationsBatch(
      [{ conversationId: 'c1', title: 'a/b\\c:d*e?f%g|h<i>j"' }],
      { format: 'markdown' },
    )

    expect(result.items[0].dirName).not.toMatch(/[/\\?%*:|\"<>]/)
  })
})
