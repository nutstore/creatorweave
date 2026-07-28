import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchConversationsExecutor } from '../search-conversations.tool'

const queryAllMock = vi.fn()

vi.mock('@/sqlite/sqlite-database', () => ({
  getSQLiteDB: () => ({ queryAll: queryAllMock }),
}))

describe('search_conversations', () => {
  beforeEach(() => {
    queryAllMock.mockReset()
    queryAllMock.mockResolvedValue([])
  })

  it('clamps a negative result limit to one row before querying SQLite', async () => {
    await searchConversationsExecutor({ query: 'release notes', limit: -1 }, { directoryHandle: null })

    expect(queryAllMock).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT ?'),
      ['%release notes%', '%release notes%', 2]
    )
  })

  it('rejects a list request with no filter instead of querying every conversation', async () => {
    const result = await searchConversationsExecutor({}, { directoryHandle: null })

    expect(JSON.parse(result)).toMatchObject({
      ok: false,
      error: { code: 'invalid_arguments' },
    })
    expect(queryAllMock).not.toHaveBeenCalled()
  })

  it('lists conversations and project activity using the same time window', async () => {
    queryAllMock
      .mockResolvedValueOnce([
        {
          conversationId: 'conv-1',
          title: 'Daily notes',
          workspaceName: 'daily',
          projectName: 'CreatorWeave',
          updatedAt: 200,
          matchedContentJson: '',
        },
      ])
      .mockResolvedValueOnce([
        { projectName: 'CreatorWeave', conversationCount: 1, lastActivityAt: 200 },
      ])

    const result = await searchConversationsExecutor(
      { updated_after: 100, updated_before: 300, sort_by: 'updated_asc' },
      { directoryHandle: null }
    )

    expect(queryAllMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('ORDER BY c.updated_at ASC'),
      [100, 300, 21]
    )
    expect(queryAllMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('GROUP BY p.name'),
      [100, 300]
    )
    expect(JSON.parse(result)).toMatchObject({
      ok: true,
      data: {
        mode: 'list',
        results: [{ conversationId: 'conv-1', snippet: null }],
        projects_breakdown: [{ projectName: 'CreatorWeave', conversationCount: 1 }],
      },
    })
  })

  it('combines keyword, project, and time filters in keyword mode', async () => {
    await searchConversationsExecutor(
      { query: 'release', project: 'CreatorWeave', updated_after: 100, sort_by: 'updated_asc' },
      { directoryHandle: null }
    )

    expect(queryAllMock).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY c.updated_at ASC'),
      ['%release%', '%release%', 100, 'CreatorWeave', 21]
    )
  })
})
