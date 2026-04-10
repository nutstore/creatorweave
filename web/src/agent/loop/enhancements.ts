import { getMCPManager } from '@/mcp'
import { getSkillManager } from '@/skills/skill-manager'
import type { SkillMatchContext } from '@/skills/skill-types'
import { getIntelligenceCoordinator } from '../intelligence-coordinator'
import type { Message } from '../message-types'
import { triggerPrefetch } from '../prefetch'
import {
  buildEnhancedSystemPrompt,
  getToolDiscoveryMessage,
  shouldShowToolDiscovery,
} from '../prompts/universal-system-prompt'
import type { ToolRegistry } from '../tool-registry'
import type { ToolContext } from '../tools/tool-types'
import { buildAvailableWorkflowsBlock } from '../workflow/workflow-injection'
import type { AgentMode } from '../agent-mode'

export interface InjectEnhancementsInput {
  baseSystemPrompt: string
  messages: Message[]
  mode: AgentMode
  toolRegistry: ToolRegistry
  toolContext: ToolContext
  sessionId?: string
}

export async function buildRuntimeEnhancedPrompt(input: InjectEnhancementsInput): Promise<string> {
  // Extract user message for scenario detection (use the last user message)
  const lastUserMsg = [...input.messages].reverse().find((m) => m.role === 'user')
  const userMessage = lastUserMsg?.content || ''

  // Start with base system prompt, enhanced with scenario detection and agent mode
  let enhancedPrompt = buildEnhancedSystemPrompt(input.baseSystemPrompt, userMessage, input.mode)

  // Phase 2: Inject intelligent enhancements (tool recs, project fingerprint, memory)
  try {
    const coordinator = getIntelligenceCoordinator()
    const intelligenceResult = await coordinator.enhanceSystemPrompt(enhancedPrompt, {
      projectId: input.toolContext.projectId ?? null,
      directoryHandle: input.toolContext.directoryHandle || undefined,
      userMessage,
      sessionId: input.sessionId,
      currentAgentId: input.toolContext.currentAgentId ?? null,
    })

    enhancedPrompt = intelligenceResult.systemPrompt
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject intelligence enhancements:', error)
    // Continue without intelligence enhancements
  }

  // Inject available workflow catalog block
  try {
    const workflowBlock = buildAvailableWorkflowsBlock()
    if (workflowBlock) {
      enhancedPrompt += '\n\n' + workflowBlock
    }
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject workflow catalog:', error)
  }

  // Inject MCP services block AND register MCP tools
  try {
    const mcpManager = getMCPManager()
    await mcpManager.initialize()

    // Register MCP tools to ToolRegistry (must happen before getToolDefinitions)
    await input.toolRegistry.registerMCPTools()

    // Use MCPManager's built-in method
    const mcpBlock = mcpManager.getAvailableMCPServicesBlock()
    if (mcpBlock) {
      enhancedPrompt += '\n\n' + mcpBlock
    }
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject MCP services:', error)
  }

  // Extract user message for skill matching
  if (lastUserMsg) {
    const context: SkillMatchContext = {
      userMessage: userMessage,
    }

    const skillManager = getSkillManager()
    const skillsBlock = skillManager.getEnhancedSystemPrompt('', context)
    if (skillsBlock) {
      enhancedPrompt += skillsBlock
    }
  }

  // Tool discovery: if user asks about capabilities, inject discovery message
  if (shouldShowToolDiscovery(userMessage)) {
    const discoveryMsg = getToolDiscoveryMessage(userMessage)
    if (discoveryMsg) {
      enhancedPrompt += '\n\n' + discoveryMsg
    }
  }

  return enhancedPrompt
}

export async function triggerPrefetchForMessages(
  messages: Message[],
  toolContext: ToolContext,
  sessionId?: string
): Promise<void> {
  // Find the last user message
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUserMsg) return

  // Extract user message content for potential future use in prefetch prediction
  // Currently using recentMessages pattern, but individual message may be used for more targeted prediction
  // Void to avoid unused variable warning
  void (lastUserMsg.content || '')

  // Extract recent messages for context
  const recentMessages: string[] = []
  const recentFiles: string[] = []

  for (const msg of messages.slice(-10)) {
    if (msg.role === 'user') {
      recentMessages.push(msg.content || '')
    }
    // Extract file paths from tool calls
    if (msg.role === 'assistant' && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        if (tc.function.name === 'read') {
          try {
            const args = JSON.parse(tc.function.arguments)
            if (typeof args.path === 'string') {
              recentFiles.push(args.path)
            }
            if (Array.isArray(args.paths)) {
              for (const p of args.paths) {
                if (typeof p === 'string') recentFiles.push(p)
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  // Get project type from intelligence coordinator
  let projectType = 'typescript'
  try {
    const coordinator = getIntelligenceCoordinator()
    if (toolContext.directoryHandle) {
      const detected = await coordinator.quickDetectProjectType(toolContext.directoryHandle)
      if (detected) {
        projectType = detected.type
      }
    }
  } catch {
    // Use default type
  }

  // Trigger prefetch in background (don't await)
  triggerPrefetch({
    directoryHandle: toolContext.directoryHandle,
    recentMessages,
    recentFiles,
    projectType,
    activeFile: recentFiles[recentFiles.length - 1],
    sessionId,
  }).catch((error) => {
    console.warn('[AgentLoop] Prefetch failed:', error)
  })
}
