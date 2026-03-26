/**
 * Workspace Manager
 *
 * Project-scoped workspace directory manager.
 *
 * Canonical metadata source is SQLite `workspaces` table.
 * OPFS index files under root are intentionally removed.
 */

import { generateId } from '../utils/opfs-utils'
import { WorkspaceRuntime } from './workspace-runtime'
import { getWorkspaceRepository } from '@/sqlite/repositories/workspace.repository'
import { getProjectRepository } from '@/sqlite/repositories/project.repository'

const PROJECTS_ROOT_DIR = 'projects'
const PROJECT_WORKSPACES_DIR = 'workspaces'
const WORKSPACE_ATTACHMENTS_DIR = 'attachments'

/**
 * Canonical workspace metadata in memory.
 */
interface WorkspaceMetadataRecord {
  workspaceId: string
  projectId: string
  rootDirectory: string
  name: string
  createdAt: number
  lastAccessedAt: number
}

/**
 * Workspace Manager
 *
 * Responsibilities:
 * - Manage workspace runtimes
 * - Resolve OPFS workspace directory via SQLite `project_id`
 * - Create, retrieve, and delete workspace directories
 */
export class WorkspaceManager {
  private opfsRoot?: FileSystemDirectoryHandle
  private projectsRootDir?: FileSystemDirectoryHandle
  private workspaces: Map<string, WorkspaceRuntime> = new Map()
  private index: WorkspaceMetadataRecord[] = []
  private initialized = false

  /**
   * Initialize workspace manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    this.opfsRoot = (await navigator.storage.getDirectory()) as FileSystemDirectoryHandle
    this.projectsRootDir = await this.opfsRoot.getDirectoryHandle(PROJECTS_ROOT_DIR, { create: true })

    await this.loadIndexFromSQLite()
    this.initialized = true
  }

  /**
   * Reload in-memory metadata from SQLite.
   */
  private async loadIndexFromSQLite(): Promise<void> {
    try {
      const repo = getWorkspaceRepository()
      const rows = await repo.findAllWorkspaces()
      this.index = rows
        .filter((row) => !!row.projectId)
        .map((row) => ({
          workspaceId: row.id,
          projectId: row.projectId!,
          rootDirectory: row.rootDirectory,
          name: row.name,
          createdAt: row.createdAt,
          lastAccessedAt: row.lastAccessedAt,
        }))
    } catch {
      // SQLite may be unavailable during early bootstrap in fallback modes.
      this.index = []
    }
  }

  private async getActiveProjectId(): Promise<string | null> {
    const projectRepo = getProjectRepository()
    const activeProject = await projectRepo.findActiveProject()
    return activeProject?.id || null
  }

  private async ensureProjectsRootDir(): Promise<FileSystemDirectoryHandle> {
    if (!this.initialized) await this.initialize()
    if (!this.projectsRootDir) {
      this.projectsRootDir = await this.opfsRoot!.getDirectoryHandle(PROJECTS_ROOT_DIR, { create: true })
    }
    return this.projectsRootDir
  }

  private upsertIndexRecord(record: WorkspaceMetadataRecord): void {
    const idx = this.index.findIndex((item) => item.workspaceId === record.workspaceId)
    if (idx >= 0) {
      this.index[idx] = record
      return
    }
    this.index.push(record)
  }

  private async resolveWorkspaceProjectId(workspaceId: string): Promise<string | null> {
    const cached = this.index.find((item) => item.workspaceId === workspaceId)
    if (cached?.projectId) {
      return cached.projectId
    }

    const repo = getWorkspaceRepository()
    const row = await repo.findWorkspaceById(workspaceId)
    if (!row?.projectId) {
      return null
    }

    this.upsertIndexRecord({
      workspaceId: row.id,
      projectId: row.projectId,
      rootDirectory: row.rootDirectory,
      name: row.name,
      createdAt: row.createdAt,
      lastAccessedAt: row.lastAccessedAt,
    })

    return row.projectId
  }

  private async resolveWorkspaceRootDirectory(workspaceId: string): Promise<string | null> {
    const cached = this.index.find((item) => item.workspaceId === workspaceId)
    if (cached) return cached.rootDirectory

    const repo = getWorkspaceRepository()
    const row = await repo.findWorkspaceById(workspaceId)
    if (!row?.projectId) return null

    this.upsertIndexRecord({
      workspaceId: row.id,
      projectId: row.projectId,
      rootDirectory: row.rootDirectory,
      name: row.name,
      createdAt: row.createdAt,
      lastAccessedAt: row.lastAccessedAt,
    })

    return row.rootDirectory
  }

  private async getWorkspaceDirForProject(
    projectId: string,
    workspaceId: string,
    create: boolean
  ): Promise<FileSystemDirectoryHandle> {
    const projectsRoot = await this.ensureProjectsRootDir()
    const projectDir = await projectsRoot.getDirectoryHandle(projectId, { create })
    const projectWorkspacesDir = await projectDir.getDirectoryHandle(PROJECT_WORKSPACES_DIR, {
      create,
    })
    return await projectWorkspacesDir.getDirectoryHandle(workspaceId, { create })
  }

  /**
   * Create workspace runtime and directory.
   */
  async createWorkspace(
    rootDirectory: string,
    workspaceId?: string,
    name?: string
  ): Promise<WorkspaceRuntime> {
    if (!this.initialized) await this.initialize()

    const id = workspaceId || generateId('workspace')

    const existingProjectId = await this.resolveWorkspaceProjectId(id)
    const projectId = existingProjectId || (await this.getActiveProjectId())
    if (!projectId) {
      throw new Error('No active project selected for workspace creation')
    }

    const workspaceDir = await this.getWorkspaceDirForProject(projectId, id, true)
    await workspaceDir.getDirectoryHandle(WORKSPACE_ATTACHMENTS_DIR, { create: true })

    const workspace = new WorkspaceRuntime(id, workspaceDir, rootDirectory)
    await workspace.initialize()

    this.workspaces.set(id, workspace)

    const now = Date.now()
    this.upsertIndexRecord({
      workspaceId: id,
      projectId,
      rootDirectory,
      name: name || rootDirectory.split('/').pop() || id,
      createdAt: now,
      lastAccessedAt: now,
    })

    return workspace
  }

  /**
   * Get workspace runtime by ID.
   */
  async getWorkspace(workspaceId: string): Promise<WorkspaceRuntime | undefined> {
    if (!this.initialized) await this.initialize()

    if (this.workspaces.has(workspaceId)) {
      return this.workspaces.get(workspaceId)!
    }

    const projectId = await this.resolveWorkspaceProjectId(workspaceId)
    const rootDirectory = await this.resolveWorkspaceRootDirectory(workspaceId)
    if (!projectId || !rootDirectory) {
      return undefined
    }

    try {
      const workspaceDir = await this.getWorkspaceDirForProject(projectId, workspaceId, false)
      await workspaceDir.getDirectoryHandle(WORKSPACE_ATTACHMENTS_DIR, { create: true })
      const workspace = new WorkspaceRuntime(workspaceId, workspaceDir, rootDirectory)
      await workspace.initialize()

      this.workspaces.set(workspaceId, workspace)

      const metadata = this.index.find((item) => item.workspaceId === workspaceId)
      if (metadata) {
        metadata.lastAccessedAt = Date.now()
      }

      try {
        await getWorkspaceRepository().updateWorkspaceAccessTime(workspaceId)
      } catch {
        // keep runtime usable even if SQLite update fails
      }

      return workspace
    } catch {
      return undefined
    }
  }

  /**
   * Get existing workspace by root directory, or create one.
   */
  async getOrCreateWorkspace(rootDirectory: string): Promise<WorkspaceRuntime> {
    if (!this.initialized) await this.initialize()

    const existing = this.getWorkspaceByRoot(rootDirectory)
    if (existing) {
      const workspace = await this.getWorkspace(existing.workspaceId)
      if (workspace) {
        return workspace
      }
    }

    return await this.createWorkspace(rootDirectory)
  }

  /**
   * Get workspace metadata list.
   */
  getAllWorkspaces(): Array<WorkspaceMetadataRecord> {
    return this.index.map((item) => ({ ...item }))
  }

  /**
   * Workspace count.
   */
  get workspaceCount(): number {
    return this.index.length
  }

  /**
   * Delete workspace runtime and directory.
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    if (!this.initialized) await this.initialize()

    this.workspaces.delete(workspaceId)

    const projectId = await this.resolveWorkspaceProjectId(workspaceId)
    this.index = this.index.filter((item) => item.workspaceId !== workspaceId)

    if (!projectId) {
      return
    }

    try {
      const projectsRoot = await this.ensureProjectsRootDir()
      const projectDir = await projectsRoot.getDirectoryHandle(projectId, { create: false })
      const projectWorkspacesDir = await projectDir.getDirectoryHandle(PROJECT_WORKSPACES_DIR, {
        create: false,
      })
      await projectWorkspacesDir.removeEntry(workspaceId, { recursive: true })
    } catch (err) {
      console.warn(`Failed to delete workspace directory: ${workspaceId}`, err)
    }
  }

  /**
   * Cleanup stale workspaces.
   */
  async cleanupOldWorkspaces(olderThanDays: number = 30): Promise<number> {
    if (!this.initialized) await this.initialize()

    const stale = await getWorkspaceRepository().findInactiveWorkspaces(olderThanDays)
    let cleaned = 0

    for (const workspace of stale) {
      await this.deleteWorkspace(workspace.id)
      cleaned++
    }

    return cleaned
  }

  /**
   * Lookup workspace metadata by root directory.
   */
  getWorkspaceByRoot(rootDirectory: string): WorkspaceMetadataRecord | undefined {
    const item = this.index.find((record) => record.rootDirectory === rootDirectory)
    return item ? { ...item } : undefined
  }

  /**
   * Check workspace existence by ID.
   */
  hasWorkspace(workspaceId: string): boolean {
    return this.index.some((item) => item.workspaceId === workspaceId)
  }

  /**
   * Update workspace root directory.
   */
  async updateWorkspaceRoot(workspaceId: string, rootDirectory: string): Promise<void> {
    const repo = getWorkspaceRepository()
    await repo.updateWorkspaceRootDirectory(workspaceId, rootDirectory)

    const metadata = this.index.find((item) => item.workspaceId === workspaceId)
    if (metadata) {
      metadata.rootDirectory = rootDirectory
    }

    const workspace = this.workspaces.get(workspaceId)
    if (workspace) {
      await workspace.updateRootDirectory(rootDirectory)
    }
  }

  /**
   * Update workspace display name.
   */
  async updateWorkspaceName(workspaceId: string, name: string): Promise<void> {
    const repo = getWorkspaceRepository()
    await repo.updateWorkspaceName(workspaceId, name)

    const metadata = this.index.find((item) => item.workspaceId === workspaceId)
    if (metadata) {
      metadata.name = name
    }
  }

  /**
   * Clear all in-memory workspace caches (keeps OPFS data).
   */
  clearMemoryCache(): void {
    this.workspaces.clear()
  }

  /**
   * Get statistics for all indexed workspaces.
   */
  async getAllStats(): Promise<
    Array<{
      workspaceId: string
      stats: Awaited<ReturnType<WorkspaceRuntime['getStats']>>
    }>
  > {
    const results: Array<{
      workspaceId: string
      stats: Awaited<ReturnType<WorkspaceRuntime['getStats']>>
    }> = []

    for (const metadata of this.index) {
      const workspace = await this.getWorkspace(metadata.workspaceId)
      if (workspace) {
        const stats = await workspace.getStats()
        results.push({
          workspaceId: metadata.workspaceId,
          stats,
        })
      }
    }

    return results
  }
}
