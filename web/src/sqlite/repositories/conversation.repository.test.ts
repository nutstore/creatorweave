import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryFirst = vi.fn()
const queryAll = vi.fn()

vi.mock('../sqlite-database', () => ({
  getSQLiteDB: () => ({ queryFirst, queryAll, execute: vi.fn() }),
  parseJSON: <T>(value: string, fallback: T): T => {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  },
  toJSON: JSON.stringify,
}))

import { ConversationRepository } from './conversation.repository'

describe('ConversationRepository', () => {
  beforeEach(() => {
    queryFirst.mockReset()
    queryAll.mockReset()
  })

  it('loads a flow instance when compression columns are absent', async () => {
    queryFirst.mockImplementation((sql: string) => {
      if (sql.includes('flow_instance_json FROM conversations LIMIT 0')) {
        return Promise.resolve(undefined)
      }
      if (sql.includes('compressed_context_summary')) {
        return Promise.reject(new Error('no such column: compressed_context_summary'))
      }
      return Promise.resolve(undefined)
    })
    queryAll.mockImplementation((sql: string) => {
      if (sql.includes('compressed_context_summary')) {
        return Promise.reject(new Error('no such column: compressed_context_summary'))
      }
      return Promise.resolve([
        {
          id: 'conversation-1',
          title: 'Existing conversation',
          title_mode: 'manual',
          context_usage_json: null,
          flow_instance_json: '{"id":"flow-1"}',
          created_at: 1,
          updated_at: 2,
        },
      ])
    })

    const conversations = await new ConversationRepository().findAll()

    expect(conversations).toMatchObject([
      {
        id: 'conversation-1',
        compressedContextSummary: null,
        flowInstance: { id: 'flow-1' },
      },
    ])
  })
})
