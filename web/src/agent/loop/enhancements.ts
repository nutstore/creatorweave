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
  // Keep tab-discovered WebMCP tools in sync (store only, no tool registration —
  // the unified external-tool bridge handles search_tools/call_tool).
  try {
    const { discoverWebMCPCatalog } = await import('@/webmcp/manager')
    await discoverWebMCPCatalog()
  } catch (error) {
    console.warn('[AgentLoop] Failed to sync WebMCP catalog:', error)
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
  let todayLog: string | null = null
  try {
    const coordinator = getIntelligenceCoordinator()
    const intelligenceResult = await coordinator.enhanceSystemPrompt(enhancedPrompt, {
      projectId: input.toolContext.projectId ?? null,
      sessionId: input.sessionId,
      currentAgentId: input.toolContext.currentAgentId ?? null,
    })

    enhancedPrompt = intelligenceResult.systemPrompt
    // Save todayLog for dynamic-section injection (keeps stable prefix cache-hot).
    todayLog = intelligenceResult.todayLog
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

  // ⑤: MCP services — initialize connections only (the compact summary is
  // generated in the DYNAMIC section below because its content can vary per
  // turn based on connection state and tab-discovery timing).
  try {
    const mcpManager = getMCPManager()
    await mcpManager.initialize()

    // Auto-connect any enabled servers that are not yet connected
    await mcpManager.connectUnconnectedEnabled()
  } catch (error) {
    console.warn('[AgentLoop] Failed to initialize MCP services:', error)
  }

  // ── DYNAMIC SECTION ─────────────────────────────────────────────────
  // Everything below varies per user message or per minute.
  // Appended at the end to preserve prompt cache for the stable prefix above.

  // ⑦: Skills block (available skills for on-demand loading)
  try {
    const { getSkillManager } = await import('@/skills/skill-manager')
    const skillManager = getSkillManager()
    if (skillManager.initialized) {
      const { buildAvailableSkillsBlock } = await import('@/skills/skill-injection')
      const metadata = skillManager.getSkillMetadata()

      // Best-effort: count uninstalled skills in the store for a search hint.
      // The count is injected into the system prompt to make the agent aware
      // that relevant uninstalled skills may exist, nudging it toward
      // search_skills instead of defaulting to a manual approach.
      let uninstalledCount = 0
      try {
        const { fetchSkillStoreManifest, scanInstalledDirNames } =
          await import('@/skills/skill-store')
        const manifest = await fetchSkillStoreManifest()
        const installedSet = await scanInstalledDirNames()
        uninstalledCount = manifest.skills.filter(
          (s) => !installedSet.has(s.dirName),
        ).length
      } catch {
        // Skill store manifest unavailable (offline / dev without pack) — skip count
      }

      const skillsBlock = buildAvailableSkillsBlock(metadata, uninstalledCount)
      if (skillsBlock) {
        enhancedPrompt += '\n\n' + skillsBlock
      }
    }
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject skills block:', error)
  }

  // ⑦.5: WebMCP catalog — NO LONGER injected as full catalog
  // WebMCP tools are now discoverable via search_tools alongside MCP tools.
  // The compact summary in step ⑤ already covers both MCP and WebMCP.

  // ⑧: Workspace Assistant page context — MOVED OUT of system prompt
  //
  // Previously the upstream page context was injected here into the system
  // prompt. That broke prompt caching: every turn re-pulled fresh context,
  // changing the system prompt and invalidating the cache prefix.
  //
  // Now context is captured per-user-message at send time (see
  // useConversationLogic.ts → capturePageContext) and stored on the message
  // as `pageContext`. It is rendered into the user message text only at
  // LLM-send time (see message-mappers.ts → renderPageContextBlock),
  // analogous to how image OCR text is attached — invisible in the UI but
  // visible to the model. The system prompt stays stable, so caching hits
  // across turns in the same conversation.

  // ⑧.5: External tools summary — MOVED to DYNAMIC section.
  //
  // Previously injected in the stable section (step ⑤). That broke prompt
  // caching because buildCompactExternalToolsSummary() output varies per turn:
  //   - WebMCP discovery scans all tabs every turn → tool count changes as
  //     users open/close pages
  //   - MCP/WebMCP Map iteration order depends on connection/scan timing
  //   - Even with deterministic sorting (now added), the *membership* of the
  //     set changes whenever a tab connects/disconnects
  // Moving it here means only this tail segment changes when external tools
  // fluctuate, keeping the large stable prefix above cache-hot.
  try {
    const { buildCompactExternalToolsSummary } = await import('../external-tool-bridge')
    const summary = buildCompactExternalToolsSummary()
    if (summary) {
      enhancedPrompt += '\n\n<available_external_tools>\n\n## Available External Tools\n\n' +
        'Use search_tools to discover tools and get their full schemas, then call_tool to execute.\n\n' +
        summary + '\n\n</available_external_tools>'
    }
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject external tools summary:', error)
  }

  // ⑧.6: Today's log — injected in DYNAMIC section.
  //
  // The diary grows throughout the day (agent writes new entries during a
  // run). If it were in the stable prefix, every new entry would invalidate
  // the cache for everything before it. By placing it here (after external
  // tools, before current date), only this tail segment re-caches.
  if (todayLog && todayLog.trim()) {
    enhancedPrompt += '\n\n# 今日日志\n\n' + todayLog.trim()
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
