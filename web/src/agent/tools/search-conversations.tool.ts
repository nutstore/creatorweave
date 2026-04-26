/**
 * Search Conversations Tool
 *
 * Searches across all workspaces' chat history for a keyword/phrase.
 * Uses SQLite LIKE on messages_json — simple, no index needed.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
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
  snippet: string | null
}

/**
 * Extract a short snippet around the first occurrence of the query in messages_json.
 * We scan the raw JSON string to avoid parsing the full message array.
 */
function extractSnippet(messagesJson: string, query: string, contextChars = 80): string | null {
  const lowerJson = messagesJson.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerJson.indexOf(lowerQuery)
  if (idx === -1) return null

  // Find a reasonable boundary (avoid cutting in the middle of JSON syntax)
  const start = Math.max(0, idx - contextChars)
  const end = Math.min(messagesJson.length, idx + query.length + contextChars)

  let snippet = messagesJson.slice(start, end)

  // Trim partial JSON noise at boundaries
  snippet = snippet.replace(/^[^"'\w\u4e00-\u9fff]+/, '').replace(/[^"'\w\u4e00-\u9fff]+$/, '')

  if (start > 0) snippet = '...' + snippet
  if (end < messagesJson.length) snippet = snippet + '...'

  return snippet
}

export const searchConversationsExecutor: ToolExecutor = async (args) => {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    return toolErrorJson('search_conversations', 'invalid_arguments', 'query is required')
  }

  const limit = typeof args.limit === 'number' ? Math.min(args.limit, 50) : 20

  try {
    const db = getSQLiteDB()

    // LIKE search on messages_json, joined with workspaces and projects for display names
    const likePattern = `%${query}%`

    const rows = await db.queryAll<SearchResultRow>(
      `SELECT 
         c.id as conversationId,
         c.title,
         w.name as workspaceName,
         p.name as projectName,
         c.updated_at as updatedAt,
         c.messages_json
       FROM conversations c
       LEFT JOIN workspaces w ON c.id = w.id
       LEFT JOIN projects p ON w.project_id = p.id
       WHERE c.messages_json LIKE ?
       ORDER BY c.updated_at DESC
       LIMIT ?`,
      [likePattern, limit + 1] // +1 to detect if there are more results
    )

    const hasMore = rows.length > limit
    const results = rows.slice(0, limit).map((row) => ({
      conversationId: row.conversationId,
      title: row.title,
      workspaceName: row.workspaceName || '(未命名工作区)',
      projectName: row.projectName || '(未命名项目)',
      updatedAt: row.updatedAt,
      snippet: extractSnippet((row as unknown as { messages_json: string }).messages_json, query),
    }))

    // Strip raw messages_json from results before returning
    const cleanResults = results.map(({ ...rest }) => rest)

    return toolOkJson('search_conversations', {
      query,
      totalMatches: cleanResults.length,
      hasMore,
      results: cleanResults,
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
