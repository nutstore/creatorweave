/**
 * Project Store
 *
 * Phase 2 (minimal): manage active project selection while keeping current UI behavior.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  getProjectRepository,
  type Project,
  type ProjectStats,
  DEFAULT_PROJECT_ID,
} from '@/sqlite/repositories/project.repository'

interface ProjectState {
  activeProjectId: string
  projects: Project[]
  projectStats: Record<string, ProjectStats>
  initialized: boolean
  isLoading: boolean
  error: string | null

  initialize: () => Promise<void>
  setActiveProject: (projectId: string) => Promise<boolean>
  refreshProjects: () => Promise<void>
  createProject: (name: string) => Promise<Project | null>
  renameProject: (projectId: string, name: string) => Promise<boolean>
  setProjectArchived: (projectId: string, archived: boolean) => Promise<boolean>
  deleteProject: (projectId: string) => Promise<boolean>
}

export const useProjectStore = create<ProjectState>()(
  immer((set, get) => ({
    activeProjectId: '',
    projects: [],
    projectStats: {},
    initialized: false,
    isLoading: false,
    error: null,

    initialize: async () => {
      if (get().initialized) return

      const started = performance.now()
      console.log('[ProjectStore] initialize start')
      set({ isLoading: true, error: null })
      try {
        const repo = getProjectRepository()
        const [projects, stats, activeProject] = await Promise.all([
          repo.findAllProjects(),
          repo.findProjectStats(),
          repo.findActiveProject(),
        ])
        let normalizedProjects = projects
        let normalizedStats = stats
        let normalizedActiveProjectId = activeProject?.id || ''

        // Dev-phase hard cleanup: remove legacy seeded default project if it exists.
        const hasLegacyDefault = normalizedProjects.some((project) => project.id === DEFAULT_PROJECT_ID)
        if (hasLegacyDefault) {
          if (normalizedActiveProjectId === DEFAULT_PROJECT_ID) {
            await repo.clearActiveProject()
            normalizedActiveProjectId = ''
          }
          await repo.deleteProject(DEFAULT_PROJECT_ID)
          normalizedProjects = normalizedProjects.filter((project) => project.id !== DEFAULT_PROJECT_ID)
          normalizedStats = normalizedStats.filter((entry) => entry.projectId !== DEFAULT_PROJECT_ID)
        }

        // Keep active project in sync with available projects.
        if (!normalizedActiveProjectId && normalizedProjects.length > 0) {
          normalizedActiveProjectId = normalizedProjects[0].id
          await repo.setActiveProject(normalizedActiveProjectId)
        } else if (!normalizedActiveProjectId) {
          await repo.clearActiveProject()
        }

        const projectStats = Object.fromEntries(
          normalizedStats.map((entry) => [entry.projectId, entry])
        )

        set({
          projects: normalizedProjects,
          projectStats,
          activeProjectId: normalizedActiveProjectId,
          initialized: true,
          isLoading: false,
        })

        const { useAgentStore } = await import('./agent.store')
        await useAgentStore.getState().setActiveProject(normalizedActiveProjectId)
        console.log(`[ProjectStore] initialize done (${Math.round(performance.now() - started)}ms)`)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to initialize projects'
        set({
          error: message,
          initialized: true,
          isLoading: false,
        })
        console.error(
          `[ProjectStore] initialize failed (${Math.round(performance.now() - started)}ms):`,
          message
        )
      }
    },

    setActiveProject: async (projectId: string) => {
      set({ isLoading: true, error: null })
      try {
        const repo = getProjectRepository()
        await repo.setActiveProject(projectId)

        set({
          activeProjectId: projectId,
          isLoading: false,
        })

        const { useAgentStore } = await import('./agent.store')
        await useAgentStore.getState().setActiveProject(projectId)

        // Keep workspace list in sync with active project selection.
        const { useConversationContextStore } = await import('./conversation-context.store')
        await useConversationContextStore.getState().refreshWorkspaces()

        // Keep active conversation within current project scope.
        const { useConversationStore } = await import('./conversation.store')
        const conversationContextIds = new Set(
          useConversationContextStore.getState().workspaces.map((w) => w.id)
        )
        const conversationStore = useConversationStore.getState()
        const nextActiveConversationId = conversationStore.conversations.find((c) =>
          conversationContextIds.has(c.id)
        )?.id
        await conversationStore.setActive(nextActiveConversationId || null)
        return true
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to set active project'
        set({
          error: message,
          isLoading: false,
        })
        return false
      }
    },

    refreshProjects: async () => {
      try {
        const repo = getProjectRepository()
        const [projects, stats] = await Promise.all([repo.findAllProjects(), repo.findProjectStats()])
        const projectStats = Object.fromEntries(stats.map((entry) => [entry.projectId, entry]))
        set({ projects, projectStats })
      } catch (e) {
        console.error('[ProjectStore] Failed to refresh projects:', e)
      }
    },

    createProject: async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return null

      set({ isLoading: true, error: null })
      try {
        const repo = getProjectRepository()
        const project = await repo.createProject({ name: trimmed })
        const [projects, stats] = await Promise.all([repo.findAllProjects(), repo.findProjectStats()])
        const projectStats = Object.fromEntries(stats.map((entry) => [entry.projectId, entry]))
        set({
          projects,
          projectStats,
          isLoading: false,
        })
        return project
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to create project'
        set({
          error: message,
          isLoading: false,
        })
        return null
      }
    },

    renameProject: async (projectId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return false

      set({ isLoading: true, error: null })
      try {
        const repo = getProjectRepository()
        const existing = await repo.findById(projectId)
        if (!existing) {
          set({ isLoading: false, error: 'Project not found' })
          return false
        }

        await repo.updateProject({
          ...existing,
          name: trimmed,
          updatedAt: Date.now(),
        })
        await get().refreshProjects()
        set({ isLoading: false })
        return true
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to rename project'
        set({
          error: message,
          isLoading: false,
        })
        return false
      }
    },

    setProjectArchived: async (projectId: string, archived: boolean) => {
      set({ isLoading: true, error: null })
      try {
        const repo = getProjectRepository()
        const existing = await repo.findById(projectId)
        if (!existing) {
          set({ isLoading: false, error: 'Project not found' })
          return false
        }

        await repo.updateProject({
          ...existing,
          status: archived ? 'archived' : 'active',
          updatedAt: Date.now(),
        })
        await get().refreshProjects()
        set({ isLoading: false })
        return true
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to update project status'
        set({
          error: message,
          isLoading: false,
        })
        return false
      }
    },

    deleteProject: async (projectId: string) => {
      set({ isLoading: true, error: null })
      try {
        const repo = getProjectRepository()
        const activeProjectId = get().activeProjectId
        await repo.deleteProject(projectId)
        await get().refreshProjects()

        if (activeProjectId === projectId) {
          const remainingProjects = get().projects
          const nextProjectId = remainingProjects[0]?.id || ''
          const { useAgentStore } = await import('./agent.store')
          const { useConversationContextStore } = await import('./conversation-context.store')

          if (nextProjectId) {
            await repo.setActiveProject(nextProjectId)
            set({ activeProjectId: nextProjectId })
            await useAgentStore.getState().setActiveProject(nextProjectId)
          } else {
            await repo.clearActiveProject()
            set({ activeProjectId: '' })
            await useAgentStore.getState().setActiveProject('')
          }

          await useConversationContextStore.getState().refreshWorkspaces()
        }

        set({ isLoading: false })
        return true
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to delete project'
        set({
          error: message,
          isLoading: false,
        })
        return false
      }
    },
  }))
)

export type { ProjectState }
