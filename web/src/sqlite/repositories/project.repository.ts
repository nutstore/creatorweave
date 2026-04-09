/**
 * Project Repository
 *
 * SQLite storage for project metadata and active project selection.
 */

import { generateId, getSQLiteDB } from '../sqlite-database'

export const DEFAULT_PROJECT_ID = 'default-project'

export interface Project {
  id: string
  name: string
  rootDirectoryHint?: string
  status: 'active' | 'archived'
  createdAt: number
  updatedAt: number
}

export interface ProjectStats {
  projectId: string
  workspaceCount: number
  lastWorkspaceAccessAt?: number
}

interface ProjectRow {
  id: string
  name: string
  root_directory_hint: string | null
  status: 'active' | 'archived'
  created_at: number
  updated_at: number
}

interface ProjectStatsRow {
  project_id: string
  workspace_count: number
  last_workspace_access_at: number | null
}

export class ProjectRepository {
  async ensureDefaultProject(): Promise<void> {
    // Development phase: do not auto-create a default project.
    // Keep method for API compatibility with existing call sites.
    return
  }

  async findAllProjects(): Promise<Project[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<ProjectRow>('SELECT * FROM projects ORDER BY updated_at DESC')
    return rows.map((row) => this.rowToProject(row))
  }

  async findProjectStats(): Promise<ProjectStats[]> {
    const db = getSQLiteDB()
    const rows = await db.queryAll<ProjectStatsRow>(
      `SELECT
         p.id AS project_id,
         COUNT(w.id) AS workspace_count,
         MAX(w.last_accessed_at) AS last_workspace_access_at
       FROM projects p
       LEFT JOIN workspaces w ON w.project_id = p.id
       GROUP BY p.id`
    )

    return rows.map((row) => ({
      projectId: row.project_id,
      workspaceCount: Number(row.workspace_count || 0),
      lastWorkspaceAccessAt: row.last_workspace_access_at || undefined,
    }))
  }

  async findById(id: string): Promise<Project | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id])
    return row ? this.rowToProject(row) : null
  }

  async createProject(input: {
    id?: string
    name: string
    rootDirectoryHint?: string
    status?: 'active' | 'archived'
  }): Promise<Project> {
    const db = getSQLiteDB()
    const now = Date.now()
    const project: Project = {
      id: input.id || generateId('proj'),
      name: input.name,
      rootDirectoryHint: input.rootDirectoryHint,
      status: input.status || 'active',
      createdAt: now,
      updatedAt: now,
    }

    await db.execute(
      `INSERT INTO projects (id, name, root_directory_hint, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        project.id,
        project.name,
        project.rootDirectoryHint || null,
        project.status,
        project.createdAt,
        project.updatedAt,
      ]
    )

    return project
  }

  async updateProject(project: Project): Promise<void> {
    const db = getSQLiteDB()
    await db.execute(
      `UPDATE projects
       SET name = ?, root_directory_hint = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [project.name, project.rootDirectoryHint || null, project.status, Date.now(), project.id]
    )
  }

  async deleteProject(id: string): Promise<void> {
    const db = getSQLiteDB()
    await db.transaction(async () => {
      // active_project uses ON DELETE RESTRICT; clear pointer before deleting the project row.
      await db.execute('DELETE FROM active_project WHERE singleton_id = 0 AND project_id = ?', [id])
      await db.execute('DELETE FROM projects WHERE id = ?', [id])
    })
  }

  async findActiveProject(): Promise<Project | null> {
    const db = getSQLiteDB()
    const row = await db.queryFirst<ProjectRow>(
      `SELECT p.*
       FROM projects p
       JOIN active_project a ON a.project_id = p.id
       WHERE a.singleton_id = 0`
    )
    return row ? this.rowToProject(row) : null
  }

  async setActiveProject(projectId: string): Promise<void> {
    if (!projectId) {
      throw new Error('Project ID is required')
    }

    const db = getSQLiteDB()
    const now = Date.now()

    // Avoid opaque FK errors by validating existence first.
    const existing = await db.queryFirst<{ id: string }>('SELECT id FROM projects WHERE id = ?', [projectId])
    if (!existing) {
      throw new Error(`Project not found: ${projectId}`)
    }

    await db.execute(
      `INSERT INTO active_project (singleton_id, project_id, last_modified)
       VALUES (0, ?, ?)
       ON CONFLICT(singleton_id) DO UPDATE SET
         project_id = excluded.project_id,
         last_modified = excluded.last_modified`,
      [projectId, now]
    )

    // Treat opening/switching project as project activity for "recent work" sorting.
    await db.execute('UPDATE projects SET updated_at = ? WHERE id = ?', [now, projectId])
  }

  async clearActiveProject(): Promise<void> {
    const db = getSQLiteDB()
    await db.execute('DELETE FROM active_project WHERE singleton_id = 0')
  }

  private rowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      rootDirectoryHint: row.root_directory_hint || undefined,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

let projectRepositoryInstance: ProjectRepository | null = null

export function getProjectRepository(): ProjectRepository {
  if (!projectRepositoryInstance) {
    projectRepositoryInstance = new ProjectRepository()
  }
  return projectRepositoryInstance
}
