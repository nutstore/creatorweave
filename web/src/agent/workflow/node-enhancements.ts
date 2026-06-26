/**
 * Workflow Node Enhancement Pipeline
 *
 * Reuses AgentLoop's enhancement capabilities for workflow node execution:
 * - Skills injection (available skills metadata)
 * - Intelligence coordinator (agent personality, tool recommendations)
 *
 * This ensures workflow nodes have access to the same context and capabilities
 * as the main agent loop, rather than making bare LLM calls.
 */

import { getIntelligenceCoordinator } from '../intelligence-coordinator'
import { getSkillManager } from '@/skills/skill-manager'

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
 * 1. Intelligence coordinator (agent personality, fingerprint, tool recs, memory)
 * 2. Skills matching (relevant skills for the node's task)
 *
 * Each enhancement is applied independently with try/catch so a failure
 * in one doesn't block the others.
 *
 * NOTE: workflow nodes call the LLM with `tools: []` (no tool-calling), so we
 * deliberately do NOT inject any tool-catalog blocks here — they would mislead
 * the model into expecting tools it cannot invoke.
 */
export async function buildEnhancedWorkflowNodePrompt(
  basePrompt: string,
  userMessage: string,
  options: NodeEnhancementOptions = {}
): Promise<string> {
  let enhanced = basePrompt

  // 1. Intelligence coordinator (agent personality, fingerprint, tool recs, memory)
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

  // 2. Skills block
  try {
    const skillManager = getSkillManager()
    const skillsBlock = skillManager.getEnhancedSystemPrompt('')
    if (skillsBlock) {
      enhanced += '\n\n' + skillsBlock
    }
  } catch (error) {
    console.warn('[workflow-node-enhance] Skill injection failed:', error)
  }

  return enhanced
}
