/**
 * Project Manager
 *
 * 管理项目系统。每个项目包含 agents、workspaces。
 * 创建项目时会自动初始化默认 agent。
 *
 * 目录结构:
 * projects/{projectId}/
 * ├── agents/{agentId}/
 * └── workspaces/{workspaceId}/
 *     ├── files/
 *     ├── attachments/
 *     └── workspace.json
 */

import { AgentManager } from '../agent'
import { getDefaultAgentTemplate } from '../agent/agent-templates'

const PROJECTS_DIR = 'projects'
const AGENTS_DIR = 'agents'
const WORKSPACES_DIR = 'workspaces'
const ATTACHMENTS_DIR = 'attachments'

/**
 * 项目信息
 */
export interface ProjectInfo {
  id: string
  agentManager: AgentManager
}

/**
 * Project Manager
 */
export class ProjectManager {
  private projectsDir: FileSystemDirectoryHandle
  private projectCache: Map<string, ProjectInfo> = new Map()

  constructor(projectsDir: FileSystemDirectoryHandle) {
    this.projectsDir = projectsDir
  }

  /**
   * 从 OPFS root 创建 ProjectManager
   */
  static async create(): Promise<ProjectManager> {
    const opfsRoot = await navigator.storage.getDirectory()
    const projectsDir = await opfsRoot.getDirectoryHandle(PROJECTS_DIR, { create: true })
    return new ProjectManager(projectsDir)
  }

  /**
   * 检查项目是否存在
   */
  async hasProject(id: string): Promise<boolean> {
    try {
      await this.projectsDir.getDirectoryHandle(id)
      return true
    } catch {
      return false
    }
  }

  /**
   * 创建新项目
   * @param path 项目路径（用于生成 ID）
   */
  async createProject(path: string): Promise<ProjectInfo> {
    const projectId = this.hashPath(path)

    // 检查缓存
    if (this.projectCache.has(projectId)) {
      return this.projectCache.get(projectId)!
    }

    // 创建项目目录结构
    const projectDir = await this.projectsDir.getDirectoryHandle(projectId, { create: true })
    const agentsDir = await projectDir.getDirectoryHandle(AGENTS_DIR, { create: true })
    await projectDir.getDirectoryHandle(WORKSPACES_DIR, { create: true })

    // 创建 AgentManager 并初始化默认 agent
    const agentManager = new AgentManager(agentsDir)
    await agentManager.createAgent('default', getDefaultAgentTemplate())

    const projectInfo: ProjectInfo = {
      id: projectId,
      agentManager,
    }

    this.projectCache.set(projectId, projectInfo)
    return projectInfo
  }

  /**
   * 获取项目
   */
  async getProject(id: string): Promise<ProjectInfo | null> {
    // 检查缓存
    if (this.projectCache.has(id)) {
      return this.projectCache.get(id)!
    }

    try {
      const projectDir = await this.projectsDir.getDirectoryHandle(id)
      const agentsDir = await projectDir.getDirectoryHandle(AGENTS_DIR)
      const agentManager = new AgentManager(agentsDir)

      const projectInfo: ProjectInfo = {
        id,
        agentManager,
      }

      this.projectCache.set(id, projectInfo)
      return projectInfo
    } catch {
      return null
    }
  }

  /**
   * 删除项目
   */
  async deleteProject(id: string): Promise<void> {
    await this.projectsDir.removeEntry(id, { recursive: true })
    this.projectCache.delete(id)
  }

  /**
   * 根据路径获取或创建项目
   */
  async getOrCreateProject(path: string): Promise<ProjectInfo> {
    const id = this.hashPath(path)
    const existing = await this.getProject(id)
    if (existing) return existing
    return this.createProject(path)
  }

  /**
   * 获取项目的 workspaces 目录
   */
  async getWorkspacesDir(id: string): Promise<FileSystemDirectoryHandle | null> {
    try {
      const projectDir = await this.projectsDir.getDirectoryHandle(id)
      return projectDir.getDirectoryHandle(WORKSPACES_DIR)
    } catch {
      return null
    }
  }

  /**
   * 获取工作区级别的 attachments 目录
   */
  async getWorkspaceAttachmentsDir(
    projectId: string,
    workspaceId: string
  ): Promise<FileSystemDirectoryHandle | null> {
    try {
      const projectDir = await this.projectsDir.getDirectoryHandle(projectId)
      const workspacesDir = await projectDir.getDirectoryHandle(WORKSPACES_DIR)
      const workspaceDir = await workspacesDir.getDirectoryHandle(workspaceId)
      return workspaceDir.getDirectoryHandle(ATTACHMENTS_DIR, { create: true })
    } catch {
      return null
    }
  }

  /**
   * 路径 hash
   */
  hashPath(path: string): string {
    let hash = 0
    for (let i = 0; i < path.length; i++) {
      const char = path.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16).padStart(8, '0')
  }
}
