/**
 * Intelligence Coordinator - Integrates Phase 2 intelligent enhancements.
 *
 * This module coordinates:
 * 1. Agent Configuration (SOUL, IDENTITY, etc.)
 * 2. Tool Recommendation System
 * 3. Project Fingerprint Identification
 * 4. Context Memory System
 *
 * And injects relevant enhancements into the system prompt.
 */

import {
  getRecommendationEngine,
  getToolRecommendationsForPrompt,
} from './tools/tool-recommendation'
import {
  getFingerprintScanner,
  formatFingerprintForPrompt,
  getProjectTypeDescription,
  type ProjectFingerprint,
} from './project-fingerprint'
import {
  getContextMemoryManager,
  getMemoryBlockForPrompt,
  type MemoryContext,
} from './context-memory'
import { ProjectManager, type AgentInfo } from '@/opfs'
import { buildAgentPrompt, type PromptOptions } from './prompt-builder'

// Re-export AgentInfo for use in this module
export type { AgentInfo } from '@/opfs'

//=============================================================================
// Types
//=============================================================================

/** Intelligence enhancement result */
export interface IntelligenceEnhancement {
  /** Enhanced system prompt */
  systemPrompt: string
  /** Detected project fingerprint */
  fingerprint: ProjectFingerprint | null
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
  /** Directory handle for fingerprinting */
  directoryHandle?: FileSystemDirectoryHandle | null
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

function extractFirstMentionedAgentId(content?: string): string | null {
  if (!content) return null
  const match = /(?:^|\s)@([a-zA-Z0-9_-]+)/.exec(content)
  if (!match) return null
  const id = (match[1] || '').trim()
  if (!id || id.toLowerCase() === 'default') return null
  return id
}

//=============================================================================
// Intelligence Coordinator
//=============================================================================

export class IntelligenceCoordinator {
  private fingerprintCache: Map<string, ProjectFingerprint | null> = new Map()
  private lastScanTime: number = 0
  private readonly SCAN_COOLDOWN = 10000 // 10 seconds between scans

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

    // 1. Project Fingerprint (cached)
    let fingerprint: ProjectFingerprint | null = null
    if (options.directoryHandle) {
      fingerprint = await this.getProjectFingerprint(options.directoryHandle)
      if (fingerprint) {
        const fpBlock = formatFingerprintForPrompt(fingerprint)
        if (fpBlock) {
          enhancements.push(fpBlock)
        }
        recommendedTools.push(...fingerprint.recommendedTools)
      }
    }

    // 2. Tool Recommendations (based on user message)
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

    // 3. Context Memory (previous conversations)
    const memoryContext: MemoryContext = {
      activeFile: options.activeFile,
      recentMessages: options.recentMessages || [],
      projectType: fingerprint?.type,
      sessionId: options.sessionId,
    }

    const memoryBlock = await getMemoryBlockForPrompt(memoryContext)
    if (memoryBlock) {
      enhancements.push(memoryBlock)
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
      fingerprint,
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
   * Get project fingerprint with caching
   */
  private async getProjectFingerprint(
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<ProjectFingerprint | null> {
    const key = directoryHandle.name
    const now = Date.now()

    // Check cache
    if (this.fingerprintCache.has(key)) {
      const cached = this.fingerprintCache.get(key)!
      // Only use cache if recent
      if (now - this.lastScanTime < this.SCAN_COOLDOWN) {
        return cached
      }
    }

    // Scan project
    const scanner = getFingerprintScanner()
    const fingerprint = await scanner.scan(directoryHandle)

    // Update cache
    this.fingerprintCache.set(key, fingerprint)
    this.lastScanTime = now

    return fingerprint
  }

  /**
   * Process user message for learning
   */
  async processUserMessage(message: string, context: MemoryContext): Promise<void> {
    const memoryManager = getContextMemoryManager()
    await memoryManager.processMessage(message, context)
  }

  /**
   * Get quick project type detection
   */
  async quickDetectProjectType(
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<{ type: string; description: string } | null> {
    const scanner = getFingerprintScanner()
    const type = await scanner.quickScan(directoryHandle)

    if (type === 'unknown') return null

    return {
      type,
      description: getProjectTypeDescription(type),
    }
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
   * Clear fingerprint cache
   */
  clearCache(): void {
    this.fingerprintCache.clear()
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
 * Hook for agent-loop to enhance system prompt
 */
export async function enhancePromptForAgentLoop(
  basePrompt: string,
  projectId: string | null | undefined,
  directoryHandle: FileSystemDirectoryHandle | null | undefined,
  userMessage: string,
  sessionId?: string,
  currentAgentId?: string | null
): Promise<string> {
  const coordinator = getIntelligenceCoordinator()

  const result = await coordinator.enhanceSystemPrompt(basePrompt, {
    projectId,
    directoryHandle,
    userMessage,
    sessionId,
    currentAgentId,
  })

  // Process message for learning
  await coordinator.processUserMessage(userMessage, {
    projectType: result.fingerprint?.type,
    sessionId,
    recentMessages: [userMessage],
  })

  return result.systemPrompt
}
