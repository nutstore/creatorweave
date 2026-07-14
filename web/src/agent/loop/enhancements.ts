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

  // ⑤: MCP services — initialize connections + inject compact summary
  // (tool discovery/execution is handled by the unified bridge search_tools/call_tool
  //  which are registered as builtins; no per-MCP tool registration needed)
  try {
    const mcpManager = getMCPManager()
    await mcpManager.initialize()

    // Auto-connect any enabled servers that are not yet connected
    await mcpManager.connectUnconnectedEnabled()

    // Inject compact external tools summary instead of full catalog
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
      const skillsBlock = buildAvailableSkillsBlock(metadata)
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

  // ⑧: Workspace Assistant page context (pull mode — runtime fetch)
  //
  // If CreatorWeave is running inside the browser extension's side panel,
  // we ask the extension to pull context from the upstream tab and inject
  // it into this system prompt. The pull happens HERE on every LLM call,
  // so context is always fresh — no race, no stale state, no module-level
  // context cache to manage.
  //
  // The data shape is fully upstream-defined (the upstream page or a
  // userscript exposes `window.__sidePanelContextProvider.getContext()`
  // returning whatever it wants). CreatorWeave just stringifies and
  // forwards. See workspace-assistant-context.ts for the full contract.
  try {
    const wsCtx = await import('../workspace-assistant-context')
    // Skip this step entirely when not in side panel mode. Bare `return` here
    // would exit buildRuntimeEnhancedPrompt and skip the date step ⑨ too —
    // that was a real bug fixed in the 2026-07-14 review.
    if (wsCtx.isSidePanelMode()) {
      const hostname = wsCtx.getSidePanelHostname()
      // New shape (since 2026-07-13 split):
      //   { url, title, providerContext } | null
      //   - url / title: read live by our content script's __cwUpstreamPage.
      //     Always available when the upstream tab is reachable.
      //   - providerContext: whatever the upstream site's optional
      //     __sidePanelContextProvider.getContext() returns (business fields).
      //     May be null if the upstream site didn't expose a provider.
      const upstream = await wsCtx.fetchSidePanelContext()
      const url =
        upstream && typeof upstream === 'object' && 'url' in upstream
          ? (upstream as { url?: unknown }).url
          : null
      const title =
        upstream && typeof upstream === 'object' && 'title' in upstream
          ? (upstream as { title?: unknown }).title
          : null
      const selectedText =
        upstream && typeof upstream === 'object' && 'selectedText' in upstream
          ? (upstream as { selectedText?: unknown }).selectedText
          : null
      const providerContext =
        upstream && typeof upstream === 'object' && 'providerContext' in upstream
          ? (upstream as { providerContext?: unknown }).providerContext
          : null

      let ctxBlock = '\n\n<current_page_context>\n'
      ctxBlock += `You are running as a side panel in the browser sidebar, linked to the upstream page the user is browsing. The user invoked you from ${hostname || 'an upstream website'}.\n`

      // ── 我们记录的（来自 CreatorWeave 的 content script，URL/title 实时读）──
      ctxBlock += '\n[Source — read live by CreatorWeave]\n'
      ctxBlock += `- Website: ${hostname || 'unknown'}\n`
      ctxBlock += `- URL: ${typeof url === 'string' && url ? url : 'unknown'}\n`
      ctxBlock += `- Title: ${typeof title === 'string' && title ? title : 'unknown'}\n`
      const selStr = typeof selectedText === 'string' ? selectedText : ''
      ctxBlock += `- Selected text: ${selStr ? selStr : '(none)'}\n`

      if (providerContext != null) {
        const rendered =
          typeof providerContext === 'string'
            ? providerContext
            : JSON.stringify(providerContext, null, 2)
        ctxBlock += '\n[Page details — provided live by ' + (hostname || 'the upstream site') + ']\n```\n' + rendered + '\n```\n'
      } else {
        ctxBlock += `\n[Page details — ${hostname || 'the upstream site'} provided no additional business fields]\n`
      }

      ctxBlock += '\nWhen the user says "this", "it", or "that one above", they usually mean an element in the context above. When the user navigates to a different page, URL/title/details refresh automatically — the user does not need to restate.\n'
      ctxBlock += '\nTip: use the `web_fetch` tool on the URL above if you need the full page content.\n'
      ctxBlock += '</current_page_context>'

      enhancedPrompt += ctxBlock
    }
  } catch (error) {
    console.warn('[AgentLoop] Failed to inject workspace assistant context:', error)
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
