/**
 * Workflow Node Enhancement Pipeline
 *
 * Reuses AgentLoop's enhancement capabilities for workflow node execution:
 * - Skills injection (matching skills based on node input)
 * - MCP services discovery (available MCP tools)
 * - Intelligence coordinator (agent personality, tool recommendations)
 * - Scenario detection
 *
 * This ensures workflow nodes have access to the same context and capabilities
 * as the main agent loop, rather than making bare LLM calls.
 */

import { buildEnhancedSystemPrompt } from '../prompts/universal-system-prompt'
import { getIntelligenceCoordinator } from '../intelligence-coordinator'
import { getMCPManager } from '@/mcp'
import { getSkillManager } from '@/skills/skill-manager'
import type { SkillMatchContext } from '@/skills/skill-types'

export interface NodeEnhancementOptions {
  /** Explicit project id for this workflow execution */
  projectId?: string | null
  /** File system access for project fingerprinting */
  directoryHandle?: FileSystemDirectoryHandle | null
  /** Agent ID for loading agent personality */
  currentAgentId?: string | null
  /** Workspace ID for multi-workspace routing */
  workspaceId?: string | null
  /** Session ID for memory tracking */
  sessionId?: string
}

/**
 * Enhance a workflow node's system prompt with the full AgentLoop pipeline.
 *
 * This applies:
 * 1. Scenario detection (buildEnhancedSystemPrompt)
 * 2. Intelligence coordinator (agent personality, fingerprint, tool recs, memory)
 * 3. MCP services block (available MCP tools)
 * 4. Skills matching (relevant skills for the node's task)
 *
 * Each enhancement is applied independently with try/catch so a failure
 * in one doesn't block the others.
 */
export async function buildEnhancedWorkflowNodePrompt(
  basePrompt: string,
  userMessage: string,
  options: NodeEnhancementOptions = {}
): Promise<string> {
  // 1. Scenario detection
  let enhanced = buildEnhancedSystemPrompt(basePrompt, userMessage)

  // 2. Intelligence coordinator (agent personality, fingerprint, tool recs, memory)
  try {
    const coordinator = getIntelligenceCoordinator()
    const result = await coordinator.enhanceSystemPrompt(enhanced, {
      projectId: options.projectId ?? null,
      userMessage,
      currentAgentId: options.currentAgentId ?? null,
      sessionId: options.sessionId,
    })
    enhanced = result.systemPrompt
  } catch (error) {
    console.warn('[workflow-node-enhance] Intelligence enhancement failed:', error)
  }

  // 3. MCP services block
  try {
    const mcpManager = getMCPManager()
    await mcpManager.initialize()
    const mcpBlock = mcpManager.getAvailableMCPServicesBlock()
    if (mcpBlock) {
      enhanced += '\n\n' + mcpBlock
    }
  } catch (error) {
    console.warn('[workflow-node-enhance] MCP injection failed:', error)
  }

  // 4. Skills matching
  try {
    const skillManager = getSkillManager()
    const context: SkillMatchContext = { userMessage }
    const skillsBlock = skillManager.getEnhancedSystemPrompt('', context)
    if (skillsBlock) {
      enhanced += '\n\n' + skillsBlock
    }
  } catch (error) {
    console.warn('[workflow-node-enhance] Skill injection failed:', error)
  }

  return enhanced
}
