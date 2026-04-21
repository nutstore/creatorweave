import type { AgentMode } from '@/agent/agent-mode'
import type { Message } from '@/agent/message-types'
import type { SubagentTaskStatus, SubagentTaskUsage } from '@/agent/tools/tool-types'
import { boolToInt, getSQLiteDB, intToBool, parseJSON, toJSON } from '../sqlite-database'

interface SubagentTaskRow {
  agent_id: string
  workspace_id: string
  name: string | null
  description: string
  status: string
  mode: string
  messages_json: string
  queue_json: string
  usage_json: string | null
  error_json: string | null
  stopped: number
  created_at: number
  updated_at: number
  last_activity_at: number
}

export interface StoredSubagentTask {
  agentId: string
  workspaceId: string
  name?: string
  description: string
  status: SubagentTaskStatus
  mode: AgentMode
  messages: Message[]
  queue: Array<{ message: string; enqueued_at: number }>
  usage?: SubagentTaskUsage
  error?: { code: string; message: string }
  stopped: boolean
  created_at: number
  updated_at: number
  last_activity_at: number
}

export class SubagentRepository {
  async findByWorkspaceId(workspaceId: string): Promise<StoredSubagentTask[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<SubagentTaskRow>(
      `SELECT *
         FROM subagent_tasks
        WHERE workspace_id = ?
        ORDER BY updated_at DESC`,
      [workspaceId]
    )
    return rows.map((row) => this.rowToTask(row))
  }

  async saveBatch(workspaceId: string, tasks: StoredSubagentTask[]): Promise<void> {
    const db = getSQLiteDB()
    await db.transaction(async () => {
      await db.execute('DELETE FROM subagent_tasks WHERE workspace_id = ?', [workspaceId])
      for (const task of tasks) {
        await db.execute(
          `INSERT INTO subagent_tasks (
              agent_id, workspace_id, name, description, status, mode,
              messages_json, queue_json, usage_json, error_json, stopped,
              created_at, updated_at, last_activity_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.agentId,
            workspaceId,
            task.name || null,
            task.description,
            task.status,
            task.mode,
            toJSON(task.messages),
            toJSON(task.queue),
            toJSON(task.usage || null),
            toJSON(task.error || null),
            boolToInt(task.stopped),
            task.created_at,
            task.updated_at,
            task.last_activity_at,
          ]
        )
      }
    })
  }

  private rowToTask(row: SubagentTaskRow): StoredSubagentTask {
    return {
      agentId: row.agent_id,
      workspaceId: row.workspace_id,
      name: row.name || undefined,
      description: row.description,
      status: row.status as SubagentTaskStatus,
      mode: row.mode === 'plan' ? 'plan' : 'act',
      messages: parseJSON<Message[]>(row.messages_json, []),
      queue: parseJSON<Array<{ message: string; enqueued_at: number }>>(row.queue_json, []),
      usage: parseJSON<SubagentTaskUsage | null>(row.usage_json || '', null) || undefined,
      error: parseJSON<{ code: string; message: string } | null>(row.error_json || '', null) || undefined,
      stopped: intToBool(row.stopped),
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_activity_at: row.last_activity_at,
    }
  }
}

let subagentRepoInstance: SubagentRepository | null = null

export function getSubagentRepository(): SubagentRepository {
  if (!subagentRepoInstance) {
    subagentRepoInstance = new SubagentRepository()
  }
  return subagentRepoInstance
}
