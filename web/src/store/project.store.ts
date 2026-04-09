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
import { ProjectManager } from '@/opfs'

//=============================================================================
// Cross-Tab Synchronization
//=============================================================================

const PROJECT_CHANGE_CHANNEL = 'creatorweave-project-changes'

type ProjectChangeMessage =
  | { type: 'created'; projectId: string }
  | { type: 'updated'; projectId: string }
  | { type: 'deleted'; projectId: string }
  | { type: 'refresh' }

let projectChangeChannel: BroadcastChannel | null = null

function getProjectChangeChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!projectChangeChannel) {
    projectChangeChannel = new BroadcastChannel(PROJECT_CHANGE_CHANNEL)
  }
  return projectChangeChannel
}

function broadcastProjectChange(message: ProjectChangeMessage): void {
  const channel = getProjectChangeChannel()
  if (channel) {
    try {
      channel.postMessage(message)
    } catch (e) {
      console.warn('[ProjectStore] Failed to broadcast project change:', e)
    }
  }
}

function setupProjectChangeListener(onChange: () => void): () => void {
  const channel = getProjectChangeChannel()
  if (!channel) return () => {}

  const handler = (_event: MessageEvent<ProjectChangeMessage>) => {
    // Always refresh on any change from another tab
    onChange()
  }
  channel.addEventListener('message', handler)
  return () => channel.removeEventListener('message', handler)
}

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

async function bootstrapProjectOpfs(projectId: string): Promise<void> {
  if (!projectId) return
  if (typeof navigator === 'undefined') return
  if (!navigator.storage || typeof navigator.storage.getDirectory !== 'function') return

  try {
    const pm = await ProjectManager.create()
    await pm.getOrCreateProjectById(projectId)
  } catch (error) {
    console.warn('[ProjectStore] Failed to bootstrap OPFS project:', error)
  }
}

async function syncAgentsForProject(projectId: string): Promise<void> {
  if (!projectId) return
  try {
    const [agentsModule, pm] = await Promise.all([
      import('./agents.store'),
      ProjectManager.create(),
    ])
    const agentsStore = agentsModule.useAgentsStore.getState()
    agentsStore.setProjectManager(pm)
    await agentsStore.initialize(projectId)
  } catch (error) {
    console.warn('[ProjectStore] Failed to sync agents store:', error)
  }
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

        if (normalizedActiveProjectId) {
          await bootstrapProjectOpfs(normalizedActiveProjectId)
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
        await syncAgentsForProject(normalizedActiveProjectId)

        // Set up cross-tab sync listener
        setupProjectChangeListener(() => {
          console.log('[ProjectStore] Received cross-tab change, refreshing...')
          get().refreshProjects()
        })

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

        const targetProject = await repo.findById(projectId)
        if (!targetProject) {
          await get().refreshProjects()
          set({
            error: `Project not found: ${projectId}`,
            isLoading: false,
          })
          return false
        }

        await repo.setActiveProject(projectId)
        await bootstrapProjectOpfs(projectId)
        const now = Date.now()

        set({
          activeProjectId: projectId,
          projects: get().projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  updatedAt: now,
                }
              : project
          ),
          isLoading: false,
        })

        const { useAgentStore } = await import('./agent.store')
        await useAgentStore.getState().setActiveProject(projectId)
        await syncAgentsForProject(projectId)

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
        const [projects, stats, persistedActiveProject] = await Promise.all([
          repo.findAllProjects(),
          repo.findProjectStats(),
          repo.findActiveProject(),
        ])
        const projectStats = Object.fromEntries(stats.map((entry) => [entry.projectId, entry]))
        const projectIds = new Set(projects.map((project) => project.id))

        let activeProjectId = get().activeProjectId
        if (persistedActiveProject?.id && projectIds.has(persistedActiveProject.id)) {
          activeProjectId = persistedActiveProject.id
        } else if (!projectIds.has(activeProjectId)) {
          activeProjectId = projects[0]?.id || ''
        }

        const persistedActiveId = persistedActiveProject?.id || ''
        if (activeProjectId && activeProjectId !== persistedActiveId) {
          await repo.setActiveProject(activeProjectId)
        } else if (!activeProjectId && persistedActiveId) {
          await repo.clearActiveProject()
        }

        set({ projects, projectStats, activeProjectId })
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
        await bootstrapProjectOpfs(project.id)
        const [projects, stats] = await Promise.all([repo.findAllProjects(), repo.findProjectStats()])
        const projectStats = Object.fromEntries(stats.map((entry) => [entry.projectId, entry]))
        set({
          projects,
          projectStats,
          isLoading: false,
        })
        broadcastProjectChange({ type: 'created', projectId: project.id })
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
        broadcastProjectChange({ type: 'refresh' })
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
        broadcastProjectChange({ type: 'refresh' })
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
        broadcastProjectChange({ type: 'deleted', projectId })
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
