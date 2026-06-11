/**
 * Tool Registry - manages tool registration, lookup, and execution.
 *
 * Integrated with intelligent error handling for better user experience.
 * Supports mode-based tool filtering (Plan vs Act mode).
 */

import type { ToolDefinition, ToolExecutor, ToolEntry, ToolContext, ToolPromptDoc } from './tools/tool-types'
import type { PluginMetadata } from '@/types/plugin'
import { formatErrorForUser, withAutoRetry } from './error-handling'
import { isToolAllowedInMode, type AgentMode } from './agent-mode'
import { useSettingsStore } from '@/store/settings.store'

// Import read tool
import { readDefinition, readExecutor, readPromptDoc } from './tools/read.tool'
// Import write tool
import { writeDefinition, writeExecutor, writePromptDoc } from './tools/write.tool'
import { deleteDefinition, deleteExecutor, deletePromptDoc } from './tools/delete.tool'
import { editDefinition, editExecutor, editPromptDoc } from './tools/file-edit.tool'
import { searchDefinition, searchExecutor, searchPromptDoc } from './tools/search.tool'
import { lsDefinition, lsExecutor, lsPromptDoc } from './tools/ls.tool'
import { pythonDefinition, pythonToolExecutor, pythonPromptDoc } from './tools/execute.tool'
import { pluginToToolDefinition, createPluginBridgeExecutor } from './tools/wasm-bridge.tool'
import { analyzeDataDefinition, analyzeDataExecutor, analyzeDataPromptDoc } from './tools/data-analysis.tool'
// Bash shell tool (just-bash sandbox)
import { bashDefinition, bashToolExecutor, bashPromptDoc } from './tools/bash.tool'
// import { runWorkflowDefinition, runWorkflowExecutor, workflowPromptDoc } from './tools/workflow.tool' -- disabled: workflows unused

// Git tools
import {
  gitStatusDefinition,
  gitStatusExecutor,
  gitDiffDefinition,
  gitDiffExecutor,
  gitLogDefinition,
  gitLogExecutor,
  gitShowDefinition,
  gitShowExecutor,
  gitRestoreDefinition,
  gitRestoreExecutor,
  gitPromptDoc,
} from './tools/git.tool'

// Import skill tools
import {
  readSkillDefinition,
  readSkillExecutor,
  readSkillResourceDefinition,
  readSkillResourceExecutor,
  skillPromptDoc,
} from '@/skills/skill-tools'

// Sync-to-OPFS tool
import { syncToOPFSDefinition, syncToOPFSExecutor, syncPromptDoc } from './tools/sync-opfs.tool'

// Switch mode tool
import { switchAgentModeDefinition, createSwitchModeExecutor, switchModePromptDoc } from './tools/switch-mode.tool'

// Ask user question tool
import {
  askUserQuestionDefinition,
  askUserQuestionExecutor,
  askUserQuestionPromptDoc,
} from './tools/ask-user-question.tool'

import {
  batchSpawnDefinition,
  batchSpawnExecutor,
  getSubagentStatusDefinition,
  getSubagentStatusExecutor,
  listSubagentsDefinition,
  listSubagentsExecutor,
  resumeSubagentDefinition,
  resumeSubagentExecutor,
  sendMessageToSubagentDefinition,
  sendMessageToSubagentExecutor,
  spawnSubagentDefinition,
  spawnSubagentExecutor,
  stopSubagentDefinition,
  stopSubagentExecutor,
  subagentPromptDoc,
} from './tools/subagent.tool'

// Changeset tools (checkpoint, sync, conflicts)
import {
  detectConflictsDefinition,
  detectConflictsExecutor,
  createCheckpointDefinition,
  createCheckpointExecutor,
  rollbackCheckpointDefinition,
  rollbackCheckpointExecutor,
  changesetPromptDoc,
} from './tools/changeset.tool'

// Cross-workspace conversation search
import {
  searchConversationsDefinition,
  searchConversationsExecutor,
  searchConversationsPromptDoc,
} from './tools/search-conversations.tool'

// OCR tool (on-demand image text recognition)
import { ocrDefinition, ocrExecutor, ocrPromptDoc } from './tools/ocr.tool'

// Web bridge tools (conditional — requires Browser Extension)
import {
  isWebBridgeAvailable,
  webSearchDefinition,
  webSearchExecutor,
  webFetchDefinition,
  webFetchExecutor,
  webBridgePromptDoc,
} from './tools/web-bridge.tool'

// Image generation tool (conditional — requires image gen model in provider cache)
import {
  isImageGenAvailable,
  imageGenDefinition,
  imageGenExecutor,
  imageGenPromptDoc,
} from './tools/image-gen.tool'
import { onModelsUpdated } from './providers/model-store'

// Unified external tool bridge (replaces separate MCP + WebMCP tool pairs)
import {
  searchToolsDefinition,
  searchToolsExecutor,
  callToolDefinition,
  callToolExecutor,
  unifiedExternalToolsPromptDoc,
} from './external-tool-bridge'

const BUILTIN_TOOLS: Array<{ definition: ToolDefinition; executor: ToolExecutor }> = [
  // Unified IO tools (read, write, edit)
  { definition: readDefinition, executor: readExecutor },
  { definition: writeDefinition, executor: writeExecutor },
  { definition: deleteDefinition, executor: deleteExecutor },
  { definition: editDefinition, executor: editExecutor },
  { definition: searchDefinition, executor: searchExecutor },
  // Directory & search
  { definition: lsDefinition, executor: lsExecutor },
  // Execution (unified)
  { definition: pythonDefinition, executor: pythonToolExecutor },
  // Bash shell (just-bash sandbox)
  { definition: bashDefinition, executor: bashToolExecutor },
  // Data
  { definition: analyzeDataDefinition, executor: analyzeDataExecutor },
  // OCR (image text recognition)
  { definition: ocrDefinition, executor: ocrExecutor },
  // Workflow orchestration — DISABLED (workflows unused, saves tool definition tokens)
  // { definition: runWorkflowDefinition, executor: runWorkflowExecutor },
  // Git tools
  { definition: gitStatusDefinition, executor: gitStatusExecutor },
  { definition: gitDiffDefinition, executor: gitDiffExecutor },
  { definition: gitLogDefinition, executor: gitLogExecutor },
  { definition: gitShowDefinition, executor: gitShowExecutor },
  { definition: gitRestoreDefinition, executor: gitRestoreExecutor },
  // Sync native files to OPFS
  { definition: syncToOPFSDefinition, executor: syncToOPFSExecutor },
  // Changeset & sync tools (detect_conflicts always available; checkpoint tools registered dynamically)
  { definition: detectConflictsDefinition, executor: detectConflictsExecutor },
  // Cross-workspace conversation search
  { definition: searchConversationsDefinition, executor: searchConversationsExecutor },
  // Meta tools
  { definition: switchAgentModeDefinition, executor: createSwitchModeExecutor() },
  { definition: askUserQuestionDefinition, executor: askUserQuestionExecutor },
  { definition: spawnSubagentDefinition, executor: spawnSubagentExecutor },
  { definition: batchSpawnDefinition, executor: batchSpawnExecutor },
  { definition: sendMessageToSubagentDefinition, executor: sendMessageToSubagentExecutor },
  { definition: stopSubagentDefinition, executor: stopSubagentExecutor },
  { definition: resumeSubagentDefinition, executor: resumeSubagentExecutor },
  { definition: getSubagentStatusDefinition, executor: getSubagentStatusExecutor },
  { definition: listSubagentsDefinition, executor: listSubagentsExecutor },
]

/**
 * All prompt docs for built-in + skill tools.
 * Used by buildAvailableToolsPrompt() to inject compact tool summaries.
 */
const ALL_PROMPT_DOCS: ToolPromptDoc[] = [
  readPromptDoc,
  writePromptDoc,
  editPromptDoc,
  deletePromptDoc,
  lsPromptDoc,
  searchPromptDoc,
  syncPromptDoc,
  pythonPromptDoc,
  bashPromptDoc,
  analyzeDataPromptDoc,
  ocrPromptDoc,
  gitPromptDoc,
  changesetPromptDoc,
  searchConversationsPromptDoc,
  // workflowPromptDoc,  -- disabled: workflows unused
  subagentPromptDoc,
  switchModePromptDoc,
  askUserQuestionPromptDoc,
  webBridgePromptDoc,
  skillPromptDoc,
  unifiedExternalToolsPromptDoc,
  imageGenPromptDoc,
]

export function getBuiltinToolNames(): string[] {
  return BUILTIN_TOOLS.map((tool) => tool.definition.function.name)
}

export class ToolRegistry {
  private tools = new Map<string, ToolEntry>()

  /** Register a tool */
  register(definition: ToolDefinition, executor: ToolExecutor): void {
    const name = definition.function.name
    if (this.tools.has(name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${name}`)
    }
    this.tools.set(name, { definition, executor })
  }

  /** Unregister a tool */
  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  /** Get all tool definitions (for LLM API), respecting feature flags */
  getToolDefinitions(): ToolDefinition[] {
    return this.filterByFeatureFlags(
      Array.from(this.tools.values()).map((entry) => entry.definition),
    )
  }

  /**
   * Get tool definitions filtered by agent mode and feature flags.
   * In 'plan' mode, only read-only tools are returned.
   * In 'act' mode, all tools are returned.
   */
  getToolDefinitionsForMode(mode: AgentMode): ToolDefinition[] {
    let definitions = Array.from(this.tools.values()).map((entry) => entry.definition)

    // Filter by feature flags first
    definitions = this.filterByFeatureFlags(definitions)

    if (mode === 'act') {
      return definitions
    }

    // Plan mode: filter to read-only tools only
    return definitions.filter(tool => isToolAllowedInMode(tool.function.name, mode))
  }

  /**
   * Build compact tool summary for system prompt injection.
   * Groups prompt docs by category/section, returns a single Markdown string.
   */
  getAvailableToolsDoc(): string {
    const sections = new Map<string, string[]>()

    for (const doc of ALL_PROMPT_DOCS) {
      // Skip web bridge tools if not available
      if (doc.category === 'web' && !isWebBridgeAvailable()) continue
      // External tools doc always shown — search_tools is always useful even with 0 external tools connected
      // Skip image gen tools if image gen model is not available
      if (doc.category === 'file-ops' && doc === imageGenPromptDoc && !isImageGenAvailable()) continue

      const section = doc.section ?? `### ${doc.category.charAt(0).toUpperCase() + doc.category.slice(1)}`
      if (!sections.has(section)) {
        sections.set(section, [])
      }
      sections.get(section)!.push(...doc.lines)
    }

    const parts: string[] = []
    for (const [section, lines] of sections) {
      parts.push(section)
      parts.push(...lines)
      parts.push('')
    }
    return parts.join('\n').trim()
  }

  /** Filter out tools disabled by feature flags (e.g. batch_spawn) */
  private filterByFeatureFlags(definitions: ToolDefinition[]): ToolDefinition[] {
    const { enableBatchSpawn } = useSettingsStore.getState()
    if (!enableBatchSpawn) {
      return definitions.filter(tool => tool.function.name !== 'batch_spawn')
    }
    return definitions
  }

  /**
   * Check if a tool is available in the given mode.
   */
  isToolAvailableInMode(name: string, mode: AgentMode): boolean {
    if (!this.tools.has(name)) return false
    return isToolAllowedInMode(name, mode)
  }

  /** Execute a tool by name with intelligent error handling */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<string> {
    const entry = this.tools.get(name)
    if (!entry) {
      return JSON.stringify({ error: `Unknown tool: ${name}` })
    }

    try {
      // Use auto-retry for transient errors
      return await withAutoRetry(async () => entry.executor(args, context))
    } catch (error) {
      // Format error for user consumption
      const userMessage = formatErrorForUser(error as string | Error)
      return JSON.stringify({ error: userMessage })
    }
  }

  /** Execute a tool without retry (for special cases) */
  async executeNoRetry(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<string> {
    const entry = this.tools.get(name)
    if (!entry) {
      return JSON.stringify({ error: `Unknown tool: ${name}` })
    }

    try {
      return await entry.executor(args, context)
    } catch (error) {
      const userMessage = formatErrorForUser(error as string | Error)
      return JSON.stringify({ error: userMessage })
    }
  }

  /** Check if a tool is registered */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /** Get registered tool count */
  get size(): number {
    return this.tools.size
  }

  /** Register all built-in tools */
  registerBuiltins(): void {
    for (const tool of BUILTIN_TOOLS) {
      this.register(tool.definition, tool.executor)
    }
    // Register unified external tool bridge (search_tools + call_tool)
    // Replaces the old separate MCP + WebMCP tool pairs
    this.register(searchToolsDefinition, searchToolsExecutor)
    this.register(callToolDefinition, callToolExecutor)
    // Conditionally register image generation tool
    this.registerImageGenTool()
  }

  /** Register a WASM plugin as an Agent tool */
  registerPlugin(metadata: PluginMetadata): void {
    const definition = pluginToToolDefinition(metadata)
    const executor = createPluginBridgeExecutor(metadata.id)
    this.register(definition, executor)
  }

  /** Unregister a WASM plugin tool */
  unregisterPlugin(pluginId: string): boolean {
    return this.unregister(`wasm_plugin_${pluginId}`)
  }

  //=============================================================================
  // MCP Tools
  //=============================================================================

  /**
   * Register MCP on-demand tools. The unified external tool bridge (search_tools,
   * call_tool) is registered as builtins in registerBuiltins().
   * This method handles MCP server lifecycle (connect, discover tools).
   * The full tool catalog is injected via system prompt, not registered individually.
   */
  async registerMCPTools(): Promise<number> {
    try {
      const { registerAllMCPTools } = await import('@/mcp')
      return await registerAllMCPTools(this)
    } catch (error) {
      console.error('[ToolRegistry] Failed to register MCP tools:', error)
      return 0
    }
  }

  /**
   * Unregister all MCP tools
   */
  async unregisterMCPTools(): Promise<number> {
    try {
      const { unregisterAllMCPTools } = await import('@/mcp')
      return await unregisterAllMCPTools(undefined)
    } catch (error) {
      console.error('[ToolRegistry] Failed to unregister MCP tools:', error)
      return 0
    }
  }

  //=============================================================================
  // Web Bridge Tools (Browser Extension)
  //=============================================================================

  /**
   * Register web_search and web_fetch tools if the Browser Extension bridge
   * (window.__agentWeb) is detected. Safe to call multiple times.
   */
  registerWebBridgeTools(): boolean {
    if (!isWebBridgeAvailable()) return false
    if (this.has('web_search')) return true // Already registered

    this.register(webSearchDefinition, webSearchExecutor)
    this.register(webFetchDefinition, webFetchExecutor)
    console.log('[ToolRegistry] ✅ Web bridge tools registered (Browser Extension detected)')
    return true
  }

  /**
   * Unregister web bridge tools (e.g. when extension is disconnected).
   */
  unregisterWebBridgeTools(): void {
    this.unregister('web_search')
    this.unregister('web_fetch')
  }

  //=============================================================================
  // Checkpoint Tools (require native directory handle)
  //=============================================================================

  /**
   * Register create_checkpoint and rollback_checkpoint tools.
   * Called when a native directory handle is granted.
   */
  registerCheckpointTools(): void {
    if (this.has('create_checkpoint')) return // Already registered
    this.register(createCheckpointDefinition, createCheckpointExecutor)
    this.register(rollbackCheckpointDefinition, rollbackCheckpointExecutor)
    console.log('[ToolRegistry] ✅ Checkpoint tools registered (native directory handle available)')
  }

  /**
   * Unregister checkpoint tools.
   * Called when the native directory handle is released.
   */
  unregisterCheckpointTools(): void {
    this.unregister('create_checkpoint')
    this.unregister('rollback_checkpoint')
  }

  //=============================================================================
  // Image Generation Tool (conditional — requires model in provider cache)
  //=============================================================================

  /**
   * Register the generate_image tool if the image gen model is available
   * in the current provider's model cache. Safe to call multiple times.
   */
  registerImageGenTool(): boolean {
    if (!isImageGenAvailable()) {
      // If previously registered, unregister it
      if (this.has('generate_image')) {
        this.unregister('generate_image')
        console.log('[ToolRegistry] generate_image tool unregistered (model no longer available)')
      }
      return false
    }
    if (this.has('generate_image')) return true // Already registered

    this.register(imageGenDefinition, imageGenExecutor)
    console.log('[ToolRegistry] ✅ Image generation tool registered')
    return true
  }

  /**
   * Unregister the image generation tool.
   */
  unregisterImageGenTool(): void {
    this.unregister('generate_image')
  }

  //=============================================================================
  // Skill Tools
  //=============================================================================

  /**
   * Register skill tools
   */
  registerSkillTools(): void {
    this.register(readSkillDefinition, readSkillExecutor)
    this.register(readSkillResourceDefinition, readSkillResourceExecutor)
  }

  /**
   * Unregister skill tools
   */
  unregisterSkillTools(): void {
    this.unregister('read_skill')
    this.unregister('read_skill_resource')
  }

  /** Register all currently loaded plugins */
  async registerLoadedPlugins(): Promise<void> {
    try {
      const { getPluginLoader } = await import('@/services/plugin-loader.service')
      const loader = getPluginLoader()
      const plugins = loader.getAllPlugins()
      for (const [, instance] of plugins) {
        if (instance.state === 'Loaded' || instance.state === 'Active') {
          this.registerPlugin(instance.metadata)
        }
      }
    } catch {
      // Plugin loader may not be available
    }
  }
}

/** Singleton instance */
let instance: ToolRegistry | null = null

/** Whether we've set up the model-cache listener for image gen tool */
let imageGenListenerSetup = false

// ─── Tool change notification (for UI reactivity) ─────────────────────────────

const toolChangeListeners = new Set<() => void>()
let toolChangeVersion = 0

/** Subscribe to tool registration/unregistration changes. Returns unsubscribe fn. */
export function onToolsChanged(listener: () => void): () => void {
  toolChangeListeners.add(listener)
  return () => toolChangeListeners.delete(listener)
}

/** Get current tool change version (incremented on each change). Useful as React key/dep. */
export function getToolChangeVersion(): number {
  return toolChangeVersion
}

function notifyToolsChanged(): void {
  toolChangeVersion++
  for (const listener of toolChangeListeners) {
    try { listener() } catch (err) { console.error('[ToolRegistry] Listener error:', err) }
  }
}

/** Ensure the model-cache listener is registered (called once). */
function ensureImageGenListener(): void {
  if (imageGenListenerSetup) return
  imageGenListenerSetup = true

  // Re-check image gen availability when models are cached/updated
  onModelsUpdated(() => {
    if (instance) {
      const had = instance.has('generate_image')
      instance.registerImageGenTool()
      const has = instance.has('generate_image')
      if (had !== has) notifyToolsChanged()
    }
  })

  // Re-check image gen availability when provider changes
  // (e.g. switching from OpenRouter to Codex OAuth should unregister generate_image)
  useSettingsStore.subscribe((state, prev) => {
    if (state.providerType !== prev.providerType) {
      if (instance) {
        const had = instance.has('generate_image')
        instance.registerImageGenTool()
        const has = instance.has('generate_image')
        if (had !== has) notifyToolsChanged()
      }
    }
  })
}

export function getToolRegistry(): ToolRegistry {
  if (!instance) {
    instance = new ToolRegistry()
    instance.registerBuiltins()
    instance.registerSkillTools()
    // Conditionally register web bridge tools (Browser Extension)
    instance.registerWebBridgeTools()
    // Set up listener for model cache updates (triggers image gen tool re-registration)
    ensureImageGenListener()
  } else {
    // Try to register web bridge tools on every access (extension may have been
    // installed after page load). registerWebBridgeTools() is idempotent — it
    // checks both availability and existing registration.
    instance.registerWebBridgeTools()
    // Also re-check image gen tool on every access
    instance.registerImageGenTool()
  }
  return instance
}

/**
 * Build compact tool summary for system prompt injection.
 * Standalone function — does not require a ToolRegistry instance.
 */
export function buildAvailableToolsPrompt(): string {
  // Ensure registry is initialized (which also checks web bridge)
  const registry = getToolRegistry()
  return registry.getAvailableToolsDoc()
}

/**
 * Build a map from tool name → { section, category } for UI grouping.
 * Each entry comes from the tool's ToolPromptDoc.
 */
export function getToolCategoryMap(): Map<string, { section: string; category: string }> {
  const result = new Map<string, { section: string; category: string }>()
  // Map tool names from definitions back to their prompt doc section
  // We derive this from ALL_PROMPT_DOCS + BUILTIN_TOOLS ordering
  const registry = getToolRegistry()
  const names = registry.getToolDefinitions().map((d) => d.function.name)
  for (const doc of ALL_PROMPT_DOCS) {
    const section = doc.section ?? `### ${doc.category.charAt(0).toUpperCase() + doc.category.slice(1)}`
    // Extract tool names from doc lines (e.g. "- `read(path)`" → "read")
    for (const line of doc.lines) {
      const m = line.match(/^- `(\w+)/)
      if (m && names.includes(m[1]!)) {
        result.set(m[1]!, { section, category: doc.category })
      }
    }
  }
  return result
}
