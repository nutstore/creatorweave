/**
 * Intelligence Coordinator - Integrates intelligent prompt enhancements.
 *
 * This module coordinates:
 * 1. Agent Configuration (SOUL, IDENTITY, etc.)
 * 2. Tool Recommendation System
 * 3. Context Memory System
 *
 * And injects relevant enhancements into the system prompt.
 */

import {
  getRecommendationEngine,
  getToolRecommendationsForPrompt,
} from './tools/tool-recommendation'
import {
  getContextMemoryManager,
  getMemoryBlockForPrompt,
  type MemoryContext,
} from './context-memory'
import { ProjectManager, type AgentInfo } from '@/opfs'
import { buildAgentPrompt, type PromptOptions } from './prompt-builder'
import { extractFirstMentionedAgentId } from './agent-mention'

// Re-export AgentInfo for use in this module
export type { AgentInfo } from '@/opfs'

//=============================================================================
// Types
//=============================================================================

/** Intelligence enhancement result */
export interface IntelligenceEnhancement {
  /** Enhanced system prompt */
  systemPrompt: string
  /** Recommended tools */
  recommendedTools: string[]
  /** Memory context used */
  memoryContext: MemoryContext
  /** Agent info (if loaded) */
  agentInfo: AgentInfo | null
}

/** Coordinator options */
export interface CoordinatorOptions {
  /** Explicit project id for this run (preferred over any global active pointer) */
  projectId?: string | null
  /** Current user message for intent analysis */
  userMessage?: string
  /** Recent conversation history */
  recentMessages?: string[]
  /** Session ID for memory tracking */
  sessionId?: string
  /** Active file being discussed */
  activeFile?: string
  /** Current routed agent id for this run (from @mention routing) */
  currentAgentId?: string | null
}

//=============================================================================
// Intelligence Coordinator
//=============================================================================

export class IntelligenceCoordinator {
  /**
   * Enhance system prompt with intelligent context
   */
  async enhanceSystemPrompt(
    basePrompt: string,
    options: CoordinatorOptions = {}
  ): Promise<IntelligenceEnhancement> {
    const enhancements: string[] = []
    const recommendedTools: string[] = []
    let agentInfo: AgentInfo | null = null

    // 0. Load Agent Configuration (routed agent, fallback to default)
    const routedAgentId =
      options.currentAgentId?.trim() || extractFirstMentionedAgentId(options.userMessage || undefined)
    agentInfo = await this.loadAgentForRun(routedAgentId, options.projectId)

    // 1. Tool Recommendations (based on user message)
    if (options.userMessage) {
      const toolRecs = getRecommendationEngine().recommend(options.userMessage, 3)
      if (toolRecs.length > 0) {
        const toolBlock = getToolRecommendationsForPrompt(options.userMessage)
        if (toolBlock) {
          enhancements.push(toolBlock)
        }
        recommendedTools.push(...toolRecs.map((t) => t.toolName))
      }
    }

    // 2. Context Memory (previous conversations)
    const memoryContext: MemoryContext = {
      activeFile: options.activeFile,
      recentMessages: options.recentMessages || [],
      sessionId: options.sessionId,
    }

    const memoryBlock = await getMemoryBlockForPrompt(memoryContext)
    if (memoryBlock) {
      enhancements.push(memoryBlock)
    }

    // 3. Multi-root project context (inject root names so agent uses correct paths)
    try {
      const rootBlock = await buildMultiRootBlock(options.projectId)
      if (rootBlock) {
        enhancements.push(rootBlock)
      }
    } catch {
      // Non-critical
    }

    // Combine all enhancements
    let enhancedPrompt = basePrompt

    // If agent info is available, prepend agent prompt as personality layer
    // The base prompt (UNIVERSAL_SYSTEM_PROMPT) contains tool usage rules that must be preserved
    if (agentInfo) {
      const promptOptions: PromptOptions = {
        includeTodayLog: true,
        todayLog: await this.loadTodayLog(agentInfo.id, options.projectId),
      }
      const agentPrompt = buildAgentPrompt(agentInfo, promptOptions)
      // Agent prompt goes first (personality), then base prompt (capabilities & tools)
      enhancedPrompt = agentPrompt + '\n\n---\n\n' + basePrompt
    }

    if (enhancements.length > 0) {
      enhancedPrompt += '\n\n' + enhancements.join('\n\n')
    }

    return {
      systemPrompt: enhancedPrompt,
      recommendedTools: [...new Set(recommendedTools)],
      memoryContext,
      agentInfo,
    }
  }

  /**
   * Load current routed agent configuration.
   * Falls back to default agent if requested agent is missing.
   * Note: No caching - always read fresh from OPFS so user changes take effect immediately.
   */
  private async loadAgentForRun(
    currentAgentId?: string | null,
    projectId?: string | null
  ): Promise<AgentInfo | null> {
    try {
      const targetProjectId = projectId?.trim() || null
      if (!targetProjectId) {
        return null
      }

      const projectManager = await ProjectManager.create()
      const project = await projectManager.getProject(targetProjectId)
      if (!project) {
        return null
      }

      const requestedAgentId = currentAgentId?.trim() || 'default'
      if (requestedAgentId !== 'default') {
        const requested = await project.agentManager.getAgent(requestedAgentId)
        if (requested) {
          return requested
        }
      }

      return await project.agentManager.getAgent('default')
    } catch (error) {
      console.warn('[IntelligenceCoordinator] Failed to load routed agent:', error)
      return null
    }
  }

  /**
   * Load today's log for an agent
   */
  private async loadTodayLog(agentId: string, projectId?: string | null): Promise<string | null> {
    try {
      const targetProjectId = projectId?.trim() || null
      if (!targetProjectId) {
        return null
      }

      const projectManager = await ProjectManager.create()
      const project = await projectManager.getProject(targetProjectId)
      if (!project) {
        return null
      }

      return await project.agentManager.readTodayLog(agentId)
    } catch (error) {
      console.warn('[IntelligenceCoordinator] Failed to load today log:', error)
      return null
    }
  }

  /**
   * Process user message for learning
   */
  async processUserMessage(message: string, context: MemoryContext): Promise<void> {
    const memoryManager = getContextMemoryManager()
    await memoryManager.processMessage(message, context)
  }

  /**
   * Get tool recommendations for UI display
   */
  getToolRecommendations(userMessage: string, maxResults = 5) {
    return getRecommendationEngine().recommend(userMessage, maxResults)
  }

  /**
   * Get all available tools by category
   */
  getAllTools() {
    return getRecommendationEngine().getAllTools()
  }

  /**
   * Search memories
   */
  async searchMemories(query: string, maxResults = 10) {
    const manager = getContextMemoryManager()
    return manager.search(query, maxResults)
  }

  /**
   * Cleanup old memories
   */
  async cleanupMemories(olderThanDays = 30): Promise<number> {
    const manager = getContextMemoryManager()
    return manager.cleanup(olderThanDays)
  }
}

//=============================================================================
// Singleton
//=============================================================================

let instance: IntelligenceCoordinator | null = null

export function getIntelligenceCoordinator(): IntelligenceCoordinator {
  if (!instance) {
    instance = new IntelligenceCoordinator()
  }
  return instance
}

//=============================================================================
// Integration Helpers
//=============================================================================

/**
 * Build multi-root context block for the system prompt.
 * When the project has multiple roots, injects the root names so the agent
 * knows to prefix paths correctly (e.g., "frontend/src/App.tsx").
 */
async function buildMultiRootBlock(
  projectId?: string | null
): Promise<string | null> {
  try {
    if (!projectId) {
      const { getProjectRepository } = await import('@/sqlite/repositories/project.repository')
      const activeProject = await getProjectRepository().findActiveProject()
      projectId = activeProject?.id ?? undefined
    }
    if (!projectId) return null

    const { getProjectRootRepository } = await import('@/sqlite/repositories/project-root.repository')
    const repo = getProjectRootRepository()
    const roots = await repo.findByProject(projectId)

    if (roots.length <= 1) return null // Single-root or no roots — no special instructions needed

    const rootNames = roots.map((r) => `\`${r.name}\``).join(', ')
    const defaultRoot = roots.find((r) => r.isDefault)
    const defaultLine = defaultRoot ? `Default root: \`${defaultRoot.name}\`` : ''

    return [
      '## Current Project Roots',
      '',
      `This project has **${roots.length} roots**: ${rootNames}`,
      defaultLine,
      '',
      'When calling tools, **always prefix file paths with the correct root name**:',
      `- \`read("frontend/src/App.tsx")\` — read a file in the "frontend" root`,
      `- \`search("FileTree", { path: "frontend/src" })\` — search within a specific root`,
      `- \`sync({ paths: ["frontend/src/**/*.tsx"] })\` — sync files from a specific root`,
      `- \`ls()\` — list all root directories`,
      '',
      'Do NOT use bare paths like \`src/App.tsx\` when multiple roots exist — always include the root prefix.',
    ].join('\n')
  } catch {
    return null
  }
}

