/**
 * Agent Manager
 *
 * 管理项目中的 Agent 系统。
 * 每个 Agent 有独立的目录，包含 SOUL.md、IDENTITY.md 等文件。
 */

import { getDefaultAgentTemplate, type AgentTemplate } from './agent-templates'

const AGENTS_DIR = 'agents'
const SKILLS_DIR = 'skills'
const MEMORY_DIR = 'memory'

// Agent 文件名
const SOUL_FILE = 'SOUL.md'
const IDENTITY_FILE = 'IDENTITY.md'
const AGENTS_FILE = 'AGENTS.md'
const USER_FILE = 'USER.md'
const MEMORY_FILE = 'MEMORY.md'

/**
 * Agent 元数据
 */
export interface AgentMeta {
  id: string
  name: string
  createdAt: number
  lastAccessedAt: number
}

/**
 * Agent 完整信息
 */
export interface AgentInfo {
  id: string
  meta: AgentMeta
  soul: string
  identity: string
  agents: string
  user: string
  memory: string
}

/**
 * Agent Manager
 *
 * 管理单个项目的 Agent 系统。
 */
export class AgentManager {
  private agentsDir: FileSystemDirectoryHandle

  constructor(agentsDir: FileSystemDirectoryHandle) {
    this.agentsDir = agentsDir
  }

  /**
   * 从项目目录创建 AgentManager
   */
  static async fromProjectDir(projectDir: FileSystemDirectoryHandle): Promise<AgentManager> {
    const agentsDir = await projectDir.getDirectoryHandle(AGENTS_DIR, { create: true })
    return new AgentManager(agentsDir)
  }

  // ==================== Agent 列表 ====================

  /**
   * 列出所有 Agent
   */
  async listAgents(): Promise<AgentMeta[]> {
    const agents: AgentMeta[] = []

    try {
      for await (const [name, handle] of this.agentsDir.entries()) {
        if (handle.kind === 'directory') {
          const meta = await this.loadAgentMeta(name)
          if (meta) {
            agents.push(meta)
          }
        }
      }
    } catch (err) {
      console.warn('Failed to list agents:', err)
    }

    return agents.sort((a, b) => a.createdAt - b.createdAt)
  }

  /**
   * 检查 Agent 是否存在
   */
  async hasAgent(id: string): Promise<boolean> {
    try {
      await this.agentsDir.getDirectoryHandle(id)
      return true
    } catch {
      return false
    }
  }

  // ==================== Agent CRUD ====================

  /**
   * 创建新 Agent
   * @param id Agent ID (e.g., 'default', 'frontend')
   * @param template 可选的自定义模板，默认使用通用模板
   */
  async createAgent(id: string, template?: Partial<AgentTemplate>): Promise<AgentInfo> {
    const defaultTemplate = getDefaultAgentTemplate()
    const t = { ...defaultTemplate, ...template }

    // 创建 Agent 目录
    const agentDir = await this.agentsDir.getDirectoryHandle(id, { create: true })

    // 创建子目录
    await agentDir.getDirectoryHandle(SKILLS_DIR, { create: true })
    await agentDir.getDirectoryHandle(MEMORY_DIR, { create: true })

    // 写入文件
    await this.writeFile(agentDir, SOUL_FILE, t.SOUL)
    await this.writeFile(agentDir, IDENTITY_FILE, t.IDENTITY)
    await this.writeFile(agentDir, AGENTS_FILE, t.AGENTS)
    await this.writeFile(agentDir, USER_FILE, t.USER)
    await this.writeFile(agentDir, MEMORY_FILE, t.MEMORY)

    // 写入元数据
    const meta: AgentMeta = {
      id,
      name: id,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    }
    await this.writeMeta(agentDir, meta)

    return {
      id,
      meta,
      soul: t.SOUL,
      identity: t.IDENTITY,
      agents: t.AGENTS,
      user: t.USER,
      memory: t.MEMORY,
    }
  }

  /**
   * 获取 Agent 信息
   */
  async getAgent(id: string): Promise<AgentInfo | null> {
    try {
      const agentDir = await this.agentsDir.getDirectoryHandle(id)

      const [meta, soul, identity, agents, user, memory] = await Promise.all([
        this.loadAgentMeta(id),
        this.readFile(agentDir, SOUL_FILE),
        this.readFile(agentDir, IDENTITY_FILE),
        this.readFile(agentDir, AGENTS_FILE),
        this.readFile(agentDir, USER_FILE),
        this.readFile(agentDir, MEMORY_FILE),
      ])

      if (!meta) return null

      return {
        id,
        meta,
        soul: soul || '',
        identity: identity || '',
        agents: agents || '',
        user: user || '',
        memory: memory || '',
      }
    } catch {
      return null
    }
  }

  /**
   * 删除 Agent
   */
  async deleteAgent(id: string): Promise<void> {
    // 不允许删除 default agent
    if (id === 'default') {
      throw new Error('Cannot delete default agent')
    }
    await this.agentsDir.removeEntry(id, { recursive: true })
  }

  // ==================== Agent 文件读写 ====================

  /**
   * 读取 Agent 的 SOUL.md
   */
  async readSoul(id: string): Promise<string | null> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    return this.readFile(agentDir, SOUL_FILE)
  }

  /**
   * 写入 Agent 的 SOUL.md
   */
  async writeSoul(id: string, content: string): Promise<void> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    await this.writeFile(agentDir, SOUL_FILE, content)
  }

  /**
   * 读取 Agent 的 IDENTITY.md
   */
  async readIdentity(id: string): Promise<string | null> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    return this.readFile(agentDir, IDENTITY_FILE)
  }

  /**
   * 写入 Agent 的 IDENTITY.md
   */
  async writeIdentity(id: string, content: string): Promise<void> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    await this.writeFile(agentDir, IDENTITY_FILE, content)
  }

  /**
   * 读取 Agent 的 MEMORY.md
   */
  async readMemory(id: string): Promise<string | null> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    return this.readFile(agentDir, MEMORY_FILE)
  }

  /**
   * 写入 Agent 的 MEMORY.md
   */
  async writeMemory(id: string, content: string): Promise<void> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    await this.writeFile(agentDir, MEMORY_FILE, content)
  }

  /**
   * 读取 Agent 的 USER.md
   */
  async readUser(id: string): Promise<string | null> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    return this.readFile(agentDir, USER_FILE)
  }

  /**
   * 写入 Agent 的 USER.md
   */
  async writeUser(id: string, content: string): Promise<void> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    await this.writeFile(agentDir, USER_FILE, content)
  }

  /**
   * 读取 Agent 的 AGENTS.md
   */
  async readAgents(id: string): Promise<string | null> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    return this.readFile(agentDir, AGENTS_FILE)
  }

  /**
   * 写入 Agent 的 AGENTS.md
   */
  async writeAgents(id: string, content: string): Promise<void> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    await this.writeFile(agentDir, AGENTS_FILE, content)
  }

  /**
   * 读取 Agent 相对路径文件（支持子目录）
   */
  async readPath(id: string, relativePath: string): Promise<string | null> {
    const normalized = this.normalizeRelativePath(relativePath)
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    const { dir, fileName } = await this.resolvePath(agentDir, normalized, false)
    return this.readFile(dir, fileName)
  }

  /**
   * 写入 Agent 相对路径文件（支持子目录）
   */
  async writePath(id: string, relativePath: string, content: string): Promise<void> {
    const normalized = this.normalizeRelativePath(relativePath)
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    const { dir, fileName } = await this.resolvePath(agentDir, normalized, true)
    await this.writeFile(dir, fileName, content)
  }

  /**
   * 删除 Agent 相对路径文件（支持子目录）
   */
  async deletePath(id: string, relativePath: string): Promise<void> {
    const normalized = this.normalizeRelativePath(relativePath)
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    const { dir, fileName } = await this.resolvePath(agentDir, normalized, false)
    await dir.removeEntry(fileName)
  }

  /**
   * 解析 Agent 目录相对路径并返回目录句柄（支持空路径返回 agent 根目录）
   */
  async getDirectoryHandle(
    id: string,
    relativeDirPath = '',
    options?: { allowMissing?: boolean }
  ): Promise<{ handle: FileSystemDirectoryHandle; exists: boolean }> {
    const allowMissing = options?.allowMissing ?? false
    const normalizedPath = this.normalizeDirectoryPath(relativeDirPath)
    const agentDir = await this.agentsDir.getDirectoryHandle(id)

    if (!normalizedPath) {
      return { handle: agentDir, exists: true }
    }

    let current = agentDir
    for (const part of normalizedPath.split('/')) {
      try {
        current = await current.getDirectoryHandle(part)
      } catch (error) {
        if (allowMissing) {
          return { handle: agentDir, exists: false }
        }
        throw error
      }
    }

    return { handle: current, exists: true }
  }

  // ==================== 日记记忆 ====================

  /**
   * 获取今日日记路径
   */
  private getTodayLogPath(): string {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}.md`
  }

  /**
   * 读取 Agent 今日日记
   */
  async readTodayLog(id: string): Promise<string | null> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    const memoryDir = await agentDir.getDirectoryHandle(MEMORY_DIR)
    const logPath = this.getTodayLogPath()
    return this.readFile(memoryDir, logPath)
  }

  /**
   * 写入 Agent 今日日记（追加）
   */
  async appendTodayLog(id: string, content: string): Promise<void> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    const memoryDir = await agentDir.getDirectoryHandle(MEMORY_DIR)
    const logPath = this.getTodayLogPath()

    let existing = ''
    try {
      existing = (await this.readFile(memoryDir, logPath)) || ''
    } catch {
      // 文件不存在
    }

    const timestamp = new Date().toLocaleTimeString()
    const newContent = existing + `\n\n## ${timestamp}\n\n${content}\n`
    await this.writeFile(memoryDir, logPath, newContent.trim())
  }

  // ==================== 技能 ====================

  /**
   * 列出 Agent 的技能
   */
  async listSkills(id: string): Promise<string[]> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    const skillsDir = await agentDir.getDirectoryHandle(SKILLS_DIR)

    const skills: string[] = []
    try {
      for await (const [name, handle] of skillsDir.entries()) {
        if (handle.kind === 'file' && name.endsWith('.md')) {
          skills.push(name.replace(/\.md$/, ''))
        }
      }
    } catch {
      // 目录不存在
    }
    return skills
  }

  /**
   * 读取技能
   */
  async readSkill(id: string, skillName: string): Promise<string | null> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    const skillsDir = await agentDir.getDirectoryHandle(SKILLS_DIR)
    return this.readFile(skillsDir, `${skillName}.md`)
  }

  /**
   * 写入技能
   */
  async writeSkill(id: string, skillName: string, content: string): Promise<void> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    const skillsDir = await agentDir.getDirectoryHandle(SKILLS_DIR)
    await this.writeFile(skillsDir, `${skillName}.md`, content)
  }

  /**
   * 删除技能
   */
  async deleteSkill(id: string, skillName: string): Promise<void> {
    const agentDir = await this.agentsDir.getDirectoryHandle(id)
    const skillsDir = await agentDir.getDirectoryHandle(SKILLS_DIR)
    await skillsDir.removeEntry(`${skillName}.md`)
  }

  // ==================== 私有方法 ====================

  private async readFile(dir: FileSystemDirectoryHandle, filename: string): Promise<string | null> {
    try {
      const file = await dir.getFileHandle(filename)
      const blob = await file.getFile()
      return await blob.text()
    } catch {
      return null
    }
  }

  private async writeFile(
    dir: FileSystemDirectoryHandle,
    filename: string,
    content: string
  ): Promise<void> {
    const file = await dir.getFileHandle(filename, { create: true })
    const writable = await file.createWritable()
    await writable.write(content)
    await writable.close()
  }

  private async loadAgentMeta(id: string): Promise<AgentMeta | null> {
    try {
      const agentDir = await this.agentsDir.getDirectoryHandle(id)
      const content = await this.readFile(agentDir, 'meta.json')
      if (!content) return null
      return JSON.parse(content) as AgentMeta
    } catch {
      return null
    }
  }

  private async writeMeta(agentDir: FileSystemDirectoryHandle, meta: AgentMeta): Promise<void> {
    await this.writeFile(agentDir, 'meta.json', JSON.stringify(meta, null, 2))
  }

  private normalizeRelativePath(path: string): string {
    const normalized = path.replace(/\\/g, '/').trim().replace(/^\/+/, '')
    const parts = normalized.split('/').filter(Boolean)
    if (parts.length === 0) {
      throw new Error('Path cannot be empty')
    }
    if (parts.some((part) => part === '.' || part === '..')) {
      throw new Error('Path cannot include "." or ".."')
    }
    return parts.join('/')
  }

  private normalizeDirectoryPath(path: string): string {
    const normalized = path.replace(/\\/g, '/').trim().replace(/^\/+/, '')
    if (!normalized) return ''
    const parts = normalized.split('/').filter(Boolean)
    if (parts.some((part) => part === '.' || part === '..')) {
      throw new Error('Path cannot include "." or ".."')
    }
    return parts.join('/')
  }

  private async resolvePath(
    agentDir: FileSystemDirectoryHandle,
    normalizedPath: string,
    createDirs: boolean
  ): Promise<{ dir: FileSystemDirectoryHandle; fileName: string }> {
    const parts = normalizedPath.split('/')
    const fileName = parts[parts.length - 1]
    let dir = agentDir

    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: createDirs })
    }

    return { dir, fileName }
  }
}
