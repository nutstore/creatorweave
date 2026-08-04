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
// Bash shell tool (just-bash sandbox)
import { bashDefinition, bashToolExecutor, bashPromptDoc } from './tools/bash.tool'

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

// Skill search tool (Skill Store discovery)
import { searchSkillsDefinition, searchSkillsExecutor, searchSkillsPromptDoc } from './tools/skill-search.tool'

// Skill install tool (installs from Skill Store after user consent)
import { installSkillDefinition, installSkillExecutor, installSkillPromptDoc } from './tools/install-skill.tool'

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

// Delegate to another agent persona (one-way handoff)
import {
  delegateToDefinition,
  delegateToExecutor,
  delegateToPromptDoc,
} from './tools/delegate.tool'

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

// Page action tools (conditional — requires Browser Extension + side panel)
import {
  pageSnapshotDefinition,
  pageSnapshotExecutor,
  pageTextContentDefinition,
  pageTextContentExecutor,
  pageFindElementsDefinition,
  pageFindElementsExecutor,
  pageSynthesizeLocatorsDefinition,
  pageSynthesizeLocatorsExecutor,
  pageScreenshotDefinition,
  pageScreenshotExecutor,
  pageReadPromptDoc,
} from './tools/page-read.tool'
import {
  pageClickDefinition,
  pageClickExecutor,
  pageFillDefinition,
  pageFillExecutor,
  pageTypeDefinition,
  pageTypeExecutor,
  pageScrollDefinition,
  pageScrollExecutor,
  pageEvaluateDefinition,
  pageEvaluateExecutor,
  pageWritePromptDoc,
} from './tools/page-write.tool'
import { isPageActionAvailable } from './tools/page-action-bridge'
import { supportsImageInput } from './llm/pi-ai-model-resolver'

// Image generation tool (conditional — requires image gen model in provider cache)
import {
  isImageGenAvailable,
  imageGenDefinition,
  imageGenExecutor,
  imageGenPromptDoc,
} from './tools/image-gen.tool'
// Schedule management tool
import {
  manageScheduleDefinition,
  manageScheduleExecutor,
  schedulePromptDoc,
} from './tools/schedule.tool'
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
  // OCR (image text recognition)
  { definition: ocrDefinition, executor: ocrExecutor },
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
  { definition: delegateToDefinition, executor: delegateToExecutor },
  { definition: spawnSubagentDefinition, executor: spawnSubagentExecutor },
  { definition: batchSpawnDefinition, executor: batchSpawnExecutor },
  { definition: sendMessageToSubagentDefinition, executor: sendMessageToSubagentExecutor },
  { definition: stopSubagentDefinition, executor: stopSubagentExecutor },
  { definition: resumeSubagentDefinition, executor: resumeSubagentExecutor },
  { definition: getSubagentStatusDefinition, executor: getSubagentStatusExecutor },
  { definition: listSubagentsDefinition, executor: listSubagentsExecutor },
  // Schedule management
  { definition: manageScheduleDefinition, executor: manageScheduleExecutor },
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
  ocrPromptDoc,
  gitPromptDoc,
  changesetPromptDoc,
  searchConversationsPromptDoc,
  subagentPromptDoc,
  switchModePromptDoc,
  askUserQuestionPromptDoc,
  delegateToPromptDoc,
  webBridgePromptDoc,
  skillPromptDoc,
  searchSkillsPromptDoc,
  installSkillPromptDoc,
  unifiedExternalToolsPromptDoc,
  imageGenPromptDoc,
  schedulePromptDoc,
  // Page action tools (only rendered when available — see getAvailableToolsDoc)
  pageReadPromptDoc,
  pageWritePromptDoc,
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
      // Skip page action tools if not available (extension + side panel)
      if (doc.category === 'page' && !isPageActionAvailable()) continue
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
    const { enableBatchSpawn, enableSchedules } = useSettingsStore.getState()
    return definitions.filter(tool => {
      if (!enableBatchSpawn && tool.function.name === 'batch_spawn') return false
      if (!enableSchedules && tool.function.name === 'schedule') return false
      return true
    })
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
  // Page Action Tools (Browser Extension + side panel)
  //=============================================================================

  /**
   * Register page_snapshot / page_text_content / page_find_elements /
   * page_synthesize_locators (read) and page_click / page_fill / page_type /
   * page_scroll / page_evaluate (write) tools.
   *
   * All page-action tools are registered together (read + write). Mode-based
   * filtering is handled by getToolDefinitionsForMode() via TOOL_MODE_CLASSIFICATION:
   *   - Plan mode: only read tools (snapshot/text/find/synthesize) are visible to the LLM
   *   - Act mode: all tools (including click/fill/type/scroll/evaluate) are visible
   *
   * Per-call authorization (URL blacklist + session YOLO) is enforced inside
   * each write tool's executor via page-action-auth.resolveWriteAuthorization.
   *
   * Safe to call multiple times.
   */
  registerPageActionTools(): boolean {
    if (!isPageActionAvailable()) return false
    if (this.has('page_snapshot')) {
      // Already registered, but still re-check screenshot (model may have changed)
      this.registerPageScreenshotTool()
      return true
    }

    this.register(pageSnapshotDefinition, pageSnapshotExecutor)
    this.register(pageTextContentDefinition, pageTextContentExecutor)
    this.register(pageFindElementsDefinition, pageFindElementsExecutor)
    this.register(pageSynthesizeLocatorsDefinition, pageSynthesizeLocatorsExecutor)

    // Screenshot: conditional on vision support — re-evaluated on model change
    this.registerPageScreenshotTool()

    this.register(pageClickDefinition, pageClickExecutor)
    this.register(pageFillDefinition, pageFillExecutor)
    this.register(pageTypeDefinition, pageTypeExecutor)
    this.register(pageScrollDefinition, pageScrollExecutor)
    this.register(pageEvaluateDefinition, pageEvaluateExecutor)

    console.log('[ToolRegistry] ✅ Page action tools registered (Browser Extension + side panel; mode-filtered)')
    return true
  }

  /**
   * Conditionally register/unregister page_screenshot based on whether the
   * current model supports vision input. Called on initial registration AND
   * whenever the model changes (via the settings subscribe listener).
   */
  registerPageScreenshotTool(): void {
    const shouldHave = isPageActionAvailable() && this.isVisionModelAvailable()
    const has = this.has('page_screenshot')
    if (shouldHave && !has) {
      this.register(pageScreenshotDefinition, pageScreenshotExecutor)
      console.log('[ToolRegistry] ✅ page_screenshot registered (vision model detected)')
    } else if (!shouldHave && has) {
      this.unregister('page_screenshot')
      console.log('[ToolRegistry] page_screenshot unregistered (model does not support vision)')
    }
  }

  /**
   * Check if the current model supports image input (vision).
   * Uses the OpenRouter modality snapshot via supportsImageInput().
   */
  private isVisionModelAvailable(): boolean {
    try {
      const { modelName } = useSettingsStore.getState()
      if (!modelName) return false
      return supportsImageInput(modelName)
    } catch {
      return false
    }
  }

  /**
   * Unregister page action tools (e.g. when leaving side-panel mode
   * or when feature flags are toggled off).
   */
  unregisterPageActionTools(): void {
    this.unregister('page_snapshot')
    this.unregister('page_text_content')
    this.unregister('page_find_elements')
    this.unregister('page_synthesize_locators')
    this.unregister('page_click')
    this.unregister('page_fill')
    this.unregister('page_type')
    this.unregister('page_scroll')
    this.unregister('page_evaluate')
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
    this.register(searchSkillsDefinition, searchSkillsExecutor)
    this.register(installSkillDefinition, installSkillExecutor)
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

  // Re-check page_screenshot when the model name changes
  // (vision support depends on the specific model)
  useSettingsStore.subscribe((state, prev) => {
    if (state.modelName !== prev.modelName) {
      if (instance) {
        const had = instance.has('page_screenshot')
        instance.registerPageScreenshotTool()
        const has = instance.has('page_screenshot')
        if (had !== has) notifyToolsChanged()
      }
    }
  })

  // Also re-check when models are cached/updated (modalities may load late)
  onModelsUpdated(() => {
    if (instance) {
      const had = instance.has('page_screenshot')
      instance.registerPageScreenshotTool()
      const has = instance.has('page_screenshot')
      if (had !== has) notifyToolsChanged()
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
    // Conditionally register page action tools (Browser Extension + side panel)
    instance.registerPageActionTools()
    // Set up listener for model cache updates (triggers image gen tool re-registration)
    ensureImageGenListener()
  } else {
    // Try to register web bridge tools on every access (extension may have been
    // installed after page load). registerWebBridgeTools() is idempotent — it
    // checks both availability and existing registration.
    instance.registerWebBridgeTools()
    // Also try page action tools (side-panel mode may have just become active)
    instance.registerPageActionTools()
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
