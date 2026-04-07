/**
 * Tool Registry - manages tool registration, lookup, and execution.
 *
 * Integrated with intelligent error handling for better user experience.
 * Supports mode-based tool filtering (Plan vs Act mode).
 */

import type { ToolDefinition, ToolExecutor, ToolEntry, ToolContext } from './tools/tool-types'
import type { PluginMetadata } from '@/types/plugin'
import { formatErrorForUser, withAutoRetry } from './error-handling'
import { isToolAllowedInMode, type AgentMode } from './agent-mode'

// Import unified IO tools
import { readDefinition, readExecutor, writeDefinition, writeExecutor } from './tools/io.tool'
import { deleteDefinition, deleteExecutor } from './tools/delete.tool'
import { editDefinition, editExecutor } from './tools/file-edit.tool'
import { searchDefinition, searchExecutor } from './tools/search.tool'
import { readDirectoryDefinition, readDirectoryExecutor } from './tools/read-directory.tool'
import { executeDefinition, executeExecutor } from './tools/execute.tool'
import { pluginToToolDefinition, createPluginBridgeExecutor } from './tools/wasm-bridge.tool'
import { analyzeDataDefinition, analyzeDataExecutor } from './tools/data-analysis.tool'
import { runWorkflowDefinition, runWorkflowExecutor } from './tools/workflow.tool'

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
} from './tools/git.tool'

// Import skill tools
import {
  generateReadSkillTool,
  readSkillExecutor,
  readSkillResourceDefinition,
  readSkillResourceExecutor,
} from '@/skills/skill-tools'
import { getAllEnabledSkillNames } from '@/skills/skill-storage'

// Switch mode tool
import { switchAgentModeDefinition, createSwitchModeExecutor } from './tools/switch-mode.tool'

const BUILTIN_TOOLS: Array<{ definition: ToolDefinition; executor: ToolExecutor }> = [
  // Unified IO tools (read, write, edit)
  { definition: readDefinition, executor: readExecutor },
  { definition: writeDefinition, executor: writeExecutor },
  { definition: deleteDefinition, executor: deleteExecutor },
  { definition: editDefinition, executor: editExecutor },
  { definition: searchDefinition, executor: searchExecutor },
  // Directory & search
  { definition: readDirectoryDefinition, executor: readDirectoryExecutor },
  // Execution (unified)
  { definition: executeDefinition, executor: executeExecutor },
  // Data
  { definition: analyzeDataDefinition, executor: analyzeDataExecutor },
  // Workflow orchestration
  { definition: runWorkflowDefinition, executor: runWorkflowExecutor },
  // Git tools
  { definition: gitStatusDefinition, executor: gitStatusExecutor },
  { definition: gitDiffDefinition, executor: gitDiffExecutor },
  { definition: gitLogDefinition, executor: gitLogExecutor },
  { definition: gitShowDefinition, executor: gitShowExecutor },
  { definition: gitRestoreDefinition, executor: gitRestoreExecutor },
  // Meta tools
  { definition: switchAgentModeDefinition, executor: createSwitchModeExecutor() },
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

  /** Get all tool definitions (for LLM API) */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((entry) => entry.definition)
  }

  /**
   * Get tool definitions filtered by agent mode.
   * In 'plan' mode, only read-only tools are returned.
   * In 'act' mode, all tools are returned.
   */
  getToolDefinitionsForMode(mode: AgentMode): ToolDefinition[] {
    const allDefinitions = Array.from(this.tools.values()).map((entry) => entry.definition)
    
    if (mode === 'act') {
      return allDefinitions
    }
    
    // Plan mode: filter to read-only tools only
    return allDefinitions.filter(tool => isToolAllowedInMode(tool.function.name, mode))
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
   * Register MCP tools from all connected MCP servers
   */
  async registerMCPTools(): Promise<number> {
    try {
      const { registerAllMCPTools } = await import('@/mcp')
      return await registerAllMCPTools(undefined)
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
  // Skill Tools
  //=============================================================================

  /**
   * Register or update skill tools
   * The read_skill tool has a dynamic enum of enabled skill names
   */
  async registerSkillTools(): Promise<void> {
    // Get current enabled skill names for the enum
    const enabledSkillNames = await getAllEnabledSkillNames()

    // Generate read_skill tool with dynamic enum
    const readSkillDefinition = generateReadSkillTool(enabledSkillNames)

    // Register read_skill (will update if already exists)
    this.register(readSkillDefinition, readSkillExecutor)

    // Register read_skill_resource (static definition)
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
let skillToolsInitPromise: Promise<void> | null = null

export function getToolRegistry(): ToolRegistry {
  if (!instance) {
    instance = new ToolRegistry()
    instance.registerBuiltins()
    // Skill tools will be registered asynchronously
    skillToolsInitPromise = instance.registerSkillTools().catch((err) => {
      console.error('[ToolRegistry] Failed to register skill tools:', err)
    })
  }
  return instance
}

/**
 * Wait for skill tools to be registered
 * Call this if you need to ensure skill tools are available
 */
export async function awaitSkillTools(): Promise<void> {
  if (skillToolsInitPromise) {
    await skillToolsInitPromise
  }
}
