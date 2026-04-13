/**
 * Agents Store
 *
 * 管理多 Agent 系统的状态。
 * 每个 Agent 有独立的 SOUL.md、IDENTITY.md 等配置文件。
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'
import { ProjectManager, type AgentMeta, type AgentInfo } from '@/opfs'
import { useProjectStore } from './project.store'

interface AgentsState {
  // 当前活跃的 agent
  activeAgentId: string | null
  activeAgent: AgentInfo | null

  // Agent 列表 (仅元数据，轻量)
  agents: AgentMeta[]

  // 状态
  isLoading: boolean
  isInitialized: boolean
  error: string | null

  // ProjectManager 实例 (由外部注入)
  projectManager: ProjectManager | null

  // Actions
  setProjectManager: (pm: ProjectManager) => void
  initialize: (projectId: string) => Promise<void>
  setActiveAgent: (agentId: string) => Promise<void>
  refreshAgents: () => Promise<void>

  // Agent CRUD
  createAgent: (id: string) => Promise<AgentInfo | null>
  deleteAgent: (id: string) => Promise<boolean>

  // Agent 文件编辑
  updateAgentFile: (
    agentId: string,
    file: 'soul' | 'identity' | 'agents' | 'user' | 'memory',
    content: string
  ) => Promise<boolean>

  // 日记
  appendTodayLog: (agentId: string, content: string) => Promise<boolean>

  // 技能
  listSkills: (agentId: string) => Promise<string[]>
  readSkill: (agentId: string, skillName: string) => Promise<string | null>
  writeSkill: (agentId: string, skillName: string, content: string) => Promise<boolean>
  deleteSkill: (agentId: string, skillName: string) => Promise<boolean>
}

export const useAgentsStore = create<AgentsState>()(
  immer((set, get) => ({
    activeAgentId: null,
    activeAgent: null,
    agents: [],
    isLoading: false,
    isInitialized: false,
    error: null,
    projectManager: null,

    setProjectManager: (pm) => {
      set({ projectManager: pm })
    },

    initialize: async (projectId) => {
      const { projectManager } = get()
      if (!projectManager) {
        set({ error: 'ProjectManager not set', isInitialized: true })
        return
      }

      set({ isLoading: true, error: null })

      try {
        const project = await projectManager.getProject(projectId)
        if (!project) {
          set({ error: 'Project not found', isLoading: false, isInitialized: true })
          return
        }

        const agents = await project.agentManager.listAgents()

        // 默认选中 default agent
        const defaultAgent = agents.find((a) => a.id === 'default') || agents[0]
        let activeAgent: AgentInfo | null = null
        let activeAgentId: string | null = null

        if (defaultAgent) {
          activeAgent = await project.agentManager.getAgent(defaultAgent.id)
          activeAgentId = defaultAgent.id
        }

        set({
          agents,
          activeAgent,
          activeAgentId,
          isLoading: false,
          isInitialized: true,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to initialize agents'
        set({ error: message, isLoading: false, isInitialized: true })
        console.error('[AgentsStore] initialize failed:', e)
      }
    },

    setActiveAgent: async (agentId) => {
      const { projectManager, agents } = get()

      if (!projectManager) {
        toast.error('Project not initialized. Please try again.')
        return
      }

      const meta = agents.find((a) => a.id === agentId)
      if (!meta) {
        toast.error(`Agent "${agentId}" not found`)
        return
      }

      set({ isLoading: true })

      try {
        const currentProjectId = useProjectStore.getState().activeProjectId
        if (!currentProjectId) {
          set({ isLoading: false })
          return
        }

        const project = await projectManager.getProject(currentProjectId)
        if (!project) {
          set({ isLoading: false })
          return
        }

        const agentInfo = await project.agentManager.getAgent(agentId)
        if (agentInfo) {
          set({
            activeAgentId: agentId,
            activeAgent: agentInfo,
            isLoading: false,
          })
        } else {
          toast.error(`Failed to load agent "${agentId}"`)
          set({ isLoading: false })
        }
      } catch (e) {
        console.error('[AgentsStore] setActiveAgent failed:', e)
        set({ isLoading: false })
      }
    },

    refreshAgents: async () => {
      const { projectManager } = get()
      if (!projectManager) return

      try {
        const currentProjectId = useProjectStore.getState().activeProjectId
        if (!currentProjectId) return

        const project = await projectManager.getProject(currentProjectId)
        if (!project) return

        const agents = await project.agentManager.listAgents()
        set({ agents })
      } catch (e) {
        console.error('[AgentsStore] refreshAgents failed:', e)
      }
    },

    createAgent: async (id) => {
      const { projectManager } = get()
      if (!projectManager) {
        toast.error('ProjectManager not initialized')
        return null
      }

      // 验证 ID 格式
      if (!/^[\p{L}\p{N}_-]+$/u.test(id)) {
        toast.error('Agent ID 只能包含字母（含中文）、数字、下划线(_)和连字符(-)')
        return null
      }

      set({ isLoading: true })

      try {
        const currentProjectId = useProjectStore.getState().activeProjectId
        if (!currentProjectId) {
          set({ isLoading: false })
          return null
        }

        const project = await projectManager.getProject(currentProjectId)
        if (!project) {
          set({ isLoading: false })
          return null
        }

        // 检查是否已存在
        const exists = await project.agentManager.hasAgent(id)
        if (exists) {
          toast.error(`Agent "${id}" already exists`)
          set({ isLoading: false })
          return null
        }

        // 创建 agent
        const agentInfo = await project.agentManager.createAgent(id)

        // 刷新列表
        const agents = await project.agentManager.listAgents()
        set({ agents, isLoading: false })

        toast.success(`Agent "${id}" created`)
        return agentInfo
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to create agent'
        set({ isLoading: false })
        toast.error(message)
        return null
      }
    },

    deleteAgent: async (id) => {
      const { projectManager, activeAgentId } = get()
      if (!projectManager) return false

      // 不允许删除 default
      if (id === 'default') {
        toast.error('Cannot delete default agent')
        return false
      }

      set({ isLoading: true })

      try {
        const currentProjectId = useProjectStore.getState().activeProjectId
        if (!currentProjectId) {
          set({ isLoading: false })
          return false
        }

        const project = await projectManager.getProject(currentProjectId)
        if (!project) {
          set({ isLoading: false })
          return false
        }

        await project.agentManager.deleteAgent(id)

        // 如果删除的是当前活跃的，切换到 default
        if (activeAgentId === id) {
          const defaultAgent = await project.agentManager.getAgent('default')
          set({
            activeAgentId: 'default',
            activeAgent: defaultAgent,
          })
        }

        // 刷新列表
        const agents = await project.agentManager.listAgents()
        set({ agents, isLoading: false })

        toast.success(`Agent "${id}" deleted`)
        return true
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to delete agent'
        set({ isLoading: false })
        toast.error(message)
        return false
      }
    },

    updateAgentFile: async (agentId, file, content) => {
      const { projectManager, activeAgent } = get()
      if (!projectManager) return false

      try {
        const currentProjectId = useProjectStore.getState().activeProjectId
        if (!currentProjectId) return false

        const project = await projectManager.getProject(currentProjectId)
        if (!project) return false

        switch (file) {
          case 'soul':
            await project.agentManager.writeSoul(agentId, content)
            break
          case 'identity':
            await project.agentManager.writeIdentity(agentId, content)
            break
          case 'agents':
            await project.agentManager.writeAgents(agentId, content)
            break
          case 'user':
            await project.agentManager.writeUser(agentId, content)
            break
          case 'memory':
            await project.agentManager.writeMemory(agentId, content)
            break
        }

        // 更新缓存中的 activeAgent
        if (activeAgent && activeAgent.id === agentId) {
          set({
            activeAgent: { ...activeAgent, [file]: content },
          })
        }

        return true
      } catch (e) {
        console.error('[AgentsStore] updateAgentFile failed:', e)
        return false
      }
    },

    appendTodayLog: async (agentId, content) => {
      const { projectManager } = get()
      if (!projectManager) return false

      try {
        const currentProjectId = useProjectStore.getState().activeProjectId
        if (!currentProjectId) return false

        const project = await projectManager.getProject(currentProjectId)
        if (!project) return false

        await project.agentManager.appendTodayLog(agentId, content)
        return true
      } catch (e) {
        console.error('[AgentsStore] appendTodayLog failed:', e)
        return false
      }
    },

    listSkills: async (agentId) => {
      const { projectManager } = get()
      if (!projectManager) return []

      try {
        const currentProjectId = useProjectStore.getState().activeProjectId
        if (!currentProjectId) return []

        const project = await projectManager.getProject(currentProjectId)
        if (!project) return []

        return await project.agentManager.listSkills(agentId)
      } catch (e) {
        console.error('[AgentsStore] listSkills failed:', e)
        return []
      }
    },

    readSkill: async (agentId, skillName) => {
      const { projectManager } = get()
      if (!projectManager) return null

      try {
        const currentProjectId = useProjectStore.getState().activeProjectId
        if (!currentProjectId) return null

        const project = await projectManager.getProject(currentProjectId)
        if (!project) return null

        return await project.agentManager.readSkill(agentId, skillName)
      } catch (e) {
        console.error('[AgentsStore] readSkill failed:', e)
        return null
      }
    },

    writeSkill: async (agentId, skillName, content) => {
      const { projectManager } = get()
      if (!projectManager) return false

      try {
        const currentProjectId = useProjectStore.getState().activeProjectId
        if (!currentProjectId) return false

        const project = await projectManager.getProject(currentProjectId)
        if (!project) return false

        await project.agentManager.writeSkill(agentId, skillName, content)
        return true
      } catch (e) {
        console.error('[AgentsStore] writeSkill failed:', e)
        return false
      }
    },

    deleteSkill: async (agentId, skillName) => {
      const { projectManager } = get()
      if (!projectManager) return false

      try {
        const currentProjectId = useProjectStore.getState().activeProjectId
        if (!currentProjectId) return false

        const project = await projectManager.getProject(currentProjectId)
        if (!project) return false

        await project.agentManager.deleteSkill(agentId, skillName)
        return true
      } catch (e) {
        console.error('[AgentsStore] deleteSkill failed:', e)
        return false
      }
    },
  }))
)

export type { AgentsState }
