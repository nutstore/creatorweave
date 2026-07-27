import { describe, expect, it } from 'vitest'
import { initializeSchema } from './index'

class SchemaDatabase {
  statements: string[] = []

  constructor(public userVersion = 0) {}

  exec(sql: string): Array<{ values: number[][] }> {
    if (sql.trim() === 'PRAGMA user_version') {
      return [{ values: [[this.userVersion]] }]
    }

    this.statements.push(sql)
    const versions = [...sql.matchAll(/PRAGMA user_version = (\d+)/g)]
    const latestVersion = versions.at(-1)?.[1]
    if (latestVersion) this.userVersion = Number(latestVersion)
    return []
  }
}

describe('initializeSchema', () => {
  it('does not rerun a migration already represented in the fresh schema', async () => {
    const db = new SchemaDatabase()

    await initializeSchema(db)

    expect(db.userVersion).toBe(11)
    expect(db.statements.some((sql) => sql.includes('ALTER TABLE subagent_tasks'))).toBe(false)
  })

  it('runs missing DDL when upgrading a v9 database', async () => {
    const db = new SchemaDatabase(9)

    await initializeSchema(db)

    expect(db.userVersion).toBe(11)
    expect(db.statements).toContainEqual(
      expect.stringContaining('ADD COLUMN subagent_type')
    )
    expect(db.statements).toContainEqual(
      expect.stringContaining('ADD COLUMN parent_tool_call_id')
    )
  })
})
