import { describe, expect, it } from 'vitest'
import { BASE_SCHEMA_VERSION, initializeSchema } from './index'

class SchemaDatabase {
  statements: string[] = []

  constructor(
    public userVersion = 0,
    private readonly failConversationSchemaValidation = false,
  ) {}

  exec(sql: string): Array<{ values: number[][] }> {
    if (sql.trim() === 'PRAGMA user_version') {
      return [{ values: [[this.userVersion]] }]
    }

    if (
      this.failConversationSchemaValidation &&
      sql.trim().startsWith('SELECT compressed_context_summary')
    ) {
      throw new Error('no such column: compressed_context_summary')
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

    expect(db.userVersion).toBe(BASE_SCHEMA_VERSION)
    expect(db.statements.some((sql) => sql.includes('ALTER TABLE subagent_tasks'))).toBe(false)
  })

  it('runs missing DDL when upgrading a v9 database', async () => {
    const db = new SchemaDatabase(9)

    await initializeSchema(db)

    expect(db.userVersion).toBe(BASE_SCHEMA_VERSION)
    expect(db.statements).toContainEqual(
      expect.stringContaining('ADD COLUMN subagent_type')
    )
    expect(db.statements).toContainEqual(
      expect.stringContaining('ADD COLUMN parent_tool_call_id')
    )
  })

  it('applies the complete release upgrade in one v14 migration', async () => {
    const db = new SchemaDatabase(13)

    await initializeSchema(db)

    expect(db.userVersion).toBe(14)
    expect(db.statements).toContainEqual(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS flow_templates')
    )
    expect(db.statements).toContainEqual(
      expect.stringContaining('ADD COLUMN run_id')
    )
    expect(db.statements).toContainEqual(
      expect.stringContaining('ADD COLUMN flow_instance_json')
    )
  })

  it('rejects a database whose declared schema still lacks required conversation columns', async () => {
    const db = new SchemaDatabase(14, true)

    await expect(initializeSchema(db)).rejects.toThrow('SCHEMA_INCOMPATIBLE')
  })
})
