/**
 * Flow Template Repository
 *
 * SQLite storage for project-level flow templates.
 * Follows the same pattern as skill.repository.ts.
 */

import { getSQLiteDB, parseJSON, toJSON } from '../sqlite-database'
import type { FlowTemplate, FlowNode, FlowEdge } from '@/agent/flow/types'

/**
 * Special project ID for templates shared across all projects.
 * These appear in every project's template library.
 */
export const GLOBAL_PROJECT_ID = '__global__'

// Database row type (snake_case)
interface FlowTemplateRow {
  id: string
  project_id: string
  name: string
  description: string | null
  nodes_json: string // JSON array of FlowNode
  edges_json: string // JSON array of FlowEdge
  entry_node_id: string | null
  created_at: number
  updated_at: number
}

//=============================================================================
// Flow Template Repository
//=============================================================================

export class FlowTemplateRepository {
  /**
   * Get all flow templates visible to a project — includes both
   * project-scoped templates and global ones (projectId = '__global__').
   */
  async findByProject(projectId: string): Promise<FlowTemplate[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<FlowTemplateRow>(
      `SELECT * FROM flow_templates WHERE project_id IN (?, ?) ORDER BY
         CASE WHEN project_id = ? THEN 0 ELSE 1 END,
         updated_at DESC`,
      [GLOBAL_PROJECT_ID, projectId, GLOBAL_PROJECT_ID]
    )
    return rows.map((row) => this.rowToTemplate(row))
  }

  /**
   * Find a template by id
   */
  async findById(id: string): Promise<FlowTemplate | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<FlowTemplateRow>(
      `SELECT * FROM flow_templates WHERE id = ?`,
      [id]
    )
    return row ? this.rowToTemplate(row) : null
  }

  /**
   * Save (upsert) a template.
   * Ensures the 'projects' sentinel row exists before inserting, to satisfy
   * the FOREIGN KEY constraint (especially for GLOBAL_PROJECT_ID = '__global__').
   */
  async save(template: FlowTemplate): Promise<void> {
    const db = getSQLiteDB()
    const now = Date.now()
    const updatedAt = template.updatedAt || now

    await db.execute(
      `INSERT INTO flow_templates (id, project_id, name, description, nodes_json, edges_json, entry_node_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         project_id = excluded.project_id,
         name = excluded.name,
         description = excluded.description,
         nodes_json = excluded.nodes_json,
         edges_json = excluded.edges_json,
         entry_node_id = excluded.entry_node_id,
         updated_at = excluded.updated_at`,
      [
        template.id,
        template.projectId,
        template.name,
        template.description ?? null,
        toJSON(template.nodes),
        toJSON(template.edges),
        template.entryNodeId ?? null,
        template.createdAt || now,
        updatedAt,
      ]
    )
  }

  /**
   * Rename a template
   */
  async rename(id: string, name: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE flow_templates SET name = ?, updated_at = ? WHERE id = ?`,
      [name, Date.now(), id]
    )
  }

  /**
   * Delete a template
   */
  async delete(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(`DELETE FROM flow_templates WHERE id = ?`, [id])
  }

  /**
   * Count templates for a project
   */
  async countByProject(projectId: string): Promise<number> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM flow_templates WHERE project_id = ?`,
      [projectId]
    )
    return row?.count ?? 0
  }

  // -----------------------------------------------------------------------
  // Row ↔ Domain mapping
  // -----------------------------------------------------------------------

  private rowToTemplate(row: FlowTemplateRow): FlowTemplate {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description ?? undefined,
      nodes: parseJSON<FlowNode[]>(row.nodes_json, []),
      edges: parseJSON<FlowEdge[]>(row.edges_json, []),
      entryNodeId: row.entry_node_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: FlowTemplateRepository | null = null

export function getFlowTemplateRepository(): FlowTemplateRepository {
  if (!instance) {
    instance = new FlowTemplateRepository()
  }
  return instance
}
