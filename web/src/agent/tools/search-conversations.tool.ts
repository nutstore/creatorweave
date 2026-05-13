/**
 * Search Conversations Tool
 *
 * Searches across all workspaces' chat history for a keyword/phrase.
 * Uses SQLite LIKE on messages.content_json/meta_json.
 */

import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import { getSQLiteDB } from '@/sqlite/sqlite-database'
import { toolOkJson, toolErrorJson } from './tool-envelope'

export const searchConversationsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_conversations',
    description:
      'Search across all workspaces chat history for a keyword or phrase. ' +
      'Returns matching conversation titles, workspace names, and project names. ' +
      'Use this when the user asks about a topic they discussed before but cannot remember which workspace it was in.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The keyword or phrase to search for in chat messages.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return. Default 20.',
        },
      },
      required: ['query'],
    },
  },
}

interface SearchResultRow {
  conversationId: string
  title: string
  workspaceName: string | null
  projectName: string | null
  updatedAt: number
  matchedContentJson: string
}

/**
 * Extract a short snippet around the first occurrence of the query in plain message text.
 */
function extractSnippet(text: string, query: string, contextChars = 300): string | null {
  const lowerJson = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerJson.indexOf(lowerQuery)
  if (idx === -1) return null

  const start = Math.max(0, idx - contextChars)
  const end = Math.min(text.length, idx + query.length + contextChars)

  let snippet = text.slice(start, end)

  // Trim punctuation artifacts at boundaries
  snippet = snippet.replace(/^[^"'`\w\u4e00-\u9fff]+/, '').replace(/[^"'`\w\u4e00-\u9fff]+$/, '')

  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'

  return snippet
}

function extractSnippetFromContentJson(contentJson: string, query: string): string | null {
  try {
    const parsed = JSON.parse(contentJson) as unknown
    const text = typeof parsed === 'string' ? parsed : ''
    if (!text) return null
    return extractSnippet(text, query)
  } catch {
    return null
  }
}

export const searchConversationsExecutor: ToolExecutor = async (args) => {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    return toolErrorJson('search_conversations', 'invalid_arguments', 'query is required')
  }

  const limit = typeof args.limit === 'number' ? Math.min(args.limit, 50) : 20

  try {
    const db = getSQLiteDB()

    // LIKE search on messages table, then map back to conversation/project/workspace metadata
    const likePattern = `%${query}%`

    const rows = await db.queryAll<SearchResultRow>(
      `WITH matched AS (
         SELECT
           m.conversation_id AS conversationId,
           MAX(m.seq) AS matchedSeq
         FROM messages m
         WHERE lower(m.content_json) LIKE lower(?)
            OR lower(COALESCE(m.meta_json, '')) LIKE lower(?)
         GROUP BY m.conversation_id
       )
       SELECT
         c.id as conversationId,
         c.title,
         w.name as workspaceName,
         p.name as projectName,
         c.updated_at as updatedAt,
         m.content_json as matchedContentJson
       FROM conversations c
       INNER JOIN matched mt ON mt.conversationId = c.id
       INNER JOIN messages m ON m.conversation_id = mt.conversationId AND m.seq = mt.matchedSeq
       LEFT JOIN workspaces w ON c.id = w.id
       LEFT JOIN projects p ON w.project_id = p.id
       ORDER BY c.updated_at DESC
       LIMIT ?`,
      [likePattern, likePattern, limit + 1] // +1 to detect if there are more results
    )

    const hasMore = rows.length > limit
    const results = rows.slice(0, limit).map((row) => ({
      conversationId: row.conversationId,
      title: row.title,
      workspaceName: row.workspaceName || '(未命名工作区)',
      projectName: row.projectName || '(未命名项目)',
      updatedAt: row.updatedAt,
      snippet: extractSnippetFromContentJson(row.matchedContentJson, query),
    }))

    return toolOkJson('search_conversations', {
      query,
      totalMatches: results.length,
      hasMore,
      results,
    })
  } catch (error) {
    return toolErrorJson(
      'search_conversations',
      'internal_error',
      `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      { retryable: true }
    )
  }
}

export const searchConversationsPromptDoc: ToolPromptDoc = {
  category: 'search',
  section: '### Cross-Workspace Search',
  lines: [
    '- `search_conversations(query, limit?)` - Search across all workspaces chat history for a keyword or phrase',
  ],
}