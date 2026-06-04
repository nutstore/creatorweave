import { getMCPManager } from '@/mcp'
import { getIntelligenceCoordinator } from '../intelligence-coordinator'
import type { Message } from '../message-types'
import { triggerPrefetch } from '../prefetch'
import { buildStableSystemPrompt } from '../prompts/universal-system-prompt'
import type { ToolRegistry } from '../tool-registry'
import { buildAvailableToolsPrompt } from '../tool-registry'
import type { ToolContext } from '../tools/tool-types'
// import { buildAvailableWorkflowsBlock } from '../workflow/workflow-injection' -- disabled: workflows unused, saves ~700 tokens/turn
import type { AgentMode } from '../agent-mode'

export interface InjectEnhancementsInput {
  baseSystemPrompt: string
  messages: Message[]
  mode: AgentMode
  toolRegistry: ToolRegistry
  toolContext: ToolContext
  sessionId?: string
}

/**
 * Build the full system prompt with cache-friendly ordering:
 *
 * ┌──────────────────────────────────────────┐
 * │  STABLE SECTION (cache-friendly prefix)  │
 * │  ① Base prompt                           │  ← static
 * │  ② Agent mode                            │  ← changes per session
 * │  ③ Intelligence (fingerprint/memory)     │  ← cached per project
 * │  ④ Workflow catalog                      │  ← static
 * │  ⑤ MCP services                          │  ← changes per session
 * ├──────────────────────────────────────────┤
 * │  DYNAMIC SECTION (varies per turn)        │
 * │  ⑥ Scenario detection                    │  ← changes per user message
 * │  ⑦ Skills block                          │  ← changes per user message
 * │  ⑧ Tool discovery                        │  ← changes per user message
 * │  ⑨ Current date                          │  ← changes daily
 * └──────────────────────────────────────────┘
 */
export async function buildRuntimeEnhancedPrompt(input: InjectEnhancementsInput): Promise<string> {
  // Keep tab-discovered WebMCP tools in sync before generating tool docs.
  try {
    await input.toolRegistry.registerWebMCPTools()
  } catch (error) {
    console.warn('[AgentLoop] Failed to sync WebMCP tools:', error)
  }

  // ── STABLE SECTION ──────────────────────────────────────────────────
  // ① + ②: Base prompt + agent mode (changes infrequently)
  let enhancedPrompt = buildStableSystemPrompt(input.baseSystemPrompt, input.mode)

  // ①.5: Inject dynamic Available Tools doc (replaces hardcoded section in base prompt)
  try {
    const toolsDoc = buildAvailableToolsPrompt()
    if (toolsDoc) {
      // Replace the {{AVAILABLE_TOOLS}} placeholder in the base prompt
      const sentinelIdx = enhancedPrompt.indexOf('{{AVAILABLE_TOOLS}}')
      if (sentinelIdx !== -1) {
        enhancedPrompt = enhancedPrompt.replace('{{AVAILABLE_TOOLS}}', toolsDoc)
      } else {
        // Fallback: if no sentinel found, append before Tool Usage Notes
        const usageNotesIdx = enhancedPrompt.indexOf('\n## Tool Usage Notes')
        if (usageNotesIdx !== -1) {
          enhancedPrompt =
            enhancedPrompt.slice(0, usageNotesIdx) +
            '\n' + toolsDoc + '\n' +
            enhancedPrompt.slice(usageNotesIdx)
        }
      }
    }
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject available tools doc:', error)
  }

  // ③: Intelligence enhancements (tool recs, project fingerprint, memory)
  try {
    const coordinator = getIntelligenceCoordinator()
    const intelligenceResult = await coordinator.enhanceSystemPrompt(enhancedPrompt, {
      projectId: input.toolContext.projectId ?? null,
      sessionId: input.sessionId,
      currentAgentId: input.toolContext.currentAgentId ?? null,
    })

    enhancedPrompt = intelligenceResult.systemPrompt
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject intelligence enhancements:', error)
    // Continue without intelligence enhancements
  }

  // ④: Workflow catalog — DISABLED (workflows unused, saves ~700 tokens/turn)
  // try {
  //   const workflowBlock = buildAvailableWorkflowsBlock()
  //   if (workflowBlock) {
  //     enhancedPrompt += '\n\n' + workflowBlock
  //   }
  // } catch (error) {
  //   console.warn('[AgentLoop] Failed to inject workflow catalog:', error)
  // }

  // ⑤: MCP services (changes per session)
  try {
    const mcpManager = getMCPManager()
    await mcpManager.initialize()

    // Register MCP tools to ToolRegistry (must happen before getToolDefinitions)
    await input.toolRegistry.registerMCPTools()

    const mcpBlock = mcpManager.getAvailableMCPServicesBlock()
    if (mcpBlock) {
      enhancedPrompt += '\n\n' + mcpBlock
    }
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject MCP services:', error)
  }

  // ── DYNAMIC SECTION ─────────────────────────────────────────────────
  // Everything below varies per user message or per minute.
  // Appended at the end to preserve prompt cache for the stable prefix above.

  // ⑦: Skills block (available skills for on-demand loading)
  try {
    const { getSkillManager } = await import('@/skills/skill-manager')
    const skillManager = getSkillManager()
    if (skillManager.initialized) {
      const lastUserMsg = [...input.messages].reverse().find((m) => m.role === 'user')
      const userMessage = lastUserMsg?.content || ''
      const { buildAvailableSkillsBlock } = await import('@/skills/skill-injection')
      const metadata = skillManager.getSkillMetadata()
      const skillsBlock = buildAvailableSkillsBlock(metadata, { userMessage })
      if (skillsBlock) {
        enhancedPrompt += '\n\n' + skillsBlock
      }
    }
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject skills block:', error)
  }

  // ⑦.5: WebMCP catalog block (available WebMCP tools for on-demand loading)
  try {
    const { buildAvailableWebMCPBlock } = await import('@/webmcp/catalog-injection')
    const webmcpBlock = buildAvailableWebMCPBlock()
    if (webmcpBlock) {
      enhancedPrompt += '\n\n' + webmcpBlock
    }
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject WebMCP catalog block:', error)
  }

  // ⑨: Current date only (day-level variability, appended at the bottom)
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
  enhancedPrompt += `\n\n## Current Date\nCurrent date: ${dateStr} (${weekday})\nUse this only when the user asks about date-sensitive tasks.`

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

  // Trigger prefetch in background (don't await)
  const projectType = 'typescript'
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
