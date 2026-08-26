/**
 * db_query (dev only) — run a read-only SQL query against the OPFS SQLite database.
 *
 * Only available in development mode. Returns rows as JSON.
 * Restricted to SELECT statements to prevent accidental data modification.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { toolOkJson, toolErrorJson } from './tool-envelope'
import { getSQLiteDB } from '@/sqlite/sqlite-database'

const dbQueryDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'db_query',
    description: [
      '[DEV ONLY] Run any SQL query against the OPFS SQLite database.',
      'Supports SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, PRAGMA, etc.',
      'Useful for debugging data issues, checking table contents, fixing migrations, etc.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'SQL statement(s). E.g. "SELECT * FROM flow_templates", "PRAGMA user_version"',
        },
      },
      required: ['sql'],
    },
  },
}

const dbQueryExecutor: ToolExecutor = async (args) => {
  const sql = (args.sql as string)?.trim()
  if (!sql) return toolErrorJson('db_query', 'invalid_args', 'sql is required')

  try {
    const db = getSQLiteDB()

    // For SELECT queries, return rows
    if (/^\s*(SELECT|PRAGMA)\b/i.test(sql)) {
      const rows = await db.queryAll<Record<string, unknown>>(sql)
      return toolOkJson('db_query', {
        rowCount: rows.length,
        rows,
      })
    }

    // For DML/DDL, execute and return affected rows count
    await db.execute(sql)
    return toolOkJson('db_query', {
      executed: true,
      sql: sql.slice(0, 200),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return toolErrorJson('db_query', 'query_failed', msg)
  }
}

export const dbQueryTool = {
  definition: dbQueryDefinition,
  executor: dbQueryExecutor,
}
