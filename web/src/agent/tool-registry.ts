/**
 * Tool Registry - manages tool registration, lookup, and execution.
 *
 * Integrated with intelligent error handling for better user experience.
 */

import type { ToolDefinition, ToolExecutor, ToolEntry, ToolContext } from './tools/tool-types'
import type { PluginMetadata } from '@/types/plugin'
import { formatErrorForUser, withAutoRetry } from './error-handling'

// Import built-in tools
import { fileReadDefinition, fileReadExecutor } from './tools/file-read.tool'
import { fileWriteDefinition, fileWriteExecutor } from './tools/file-write.tool'
import { fileEditDefinition, fileEditExecutor } from './tools/file-edit.tool'
import { fileBatchWriteDefinition, fileBatchWriteExecutor } from './tools/file-batch.tool'
import { fileSyncDefinition, fileSyncExecutor } from './tools/file-sync.tool'
import { globDefinition, globExecutor } from './tools/glob.tool'
import { grepDefinition, grepExecutor } from './tools/grep.tool'
import { listFilesDefinition, listFilesExecutor } from './tools/list-files.tool'
import { pythonCodeDefinition, pythonCodeExecutor } from './tools/python.tool'
import { javascriptCodeDefinition, javascriptCodeExecutor } from './tools/javascript-execution.tool'
import {
  extractSymbolsDefinition,
  extractSymbolsExecutor,
  findReferencesDefinition,
  findReferencesExecutor,
  goToDefinitionDefinition,
  goToDefinitionExecutor,
} from './tools/code-intelligence.tool'
import { pluginToToolDefinition, createPluginBridgeExecutor } from './tools/wasm-bridge.tool'
import {
  batchEditDefinition,
  batchEditExecutor,
  advancedSearchDefinition,
  advancedSearchExecutor,
  fileBatchReadDefinition,
  fileBatchReadExecutor,
} from './tools/batch-operations.tool'
import {
  analyzeDataDefinition,
  analyzeDataExecutor,
  generateChartDefinition,
  generateChartExecutor,
  filterDataDefinition,
  filterDataExecutor,
  aggregateDataDefinition,
  aggregateDataExecutor,
} from './tools/data-analysis.tool'

// Import code review tools
import {
  code_review,
  code_review_executor,
  batch_code_review,
  batch_code_review_executor,
} from './tools/code-review.tool'

// Import skill tools
import {
  generateReadSkillTool,
  readSkillExecutor,
  readSkillResourceDefinition,
  readSkillResourceExecutor,
} from '@/skills/skill-tools'
import { getAllEnabledSkillNames } from '@/skills/skill-storage'

// Import test generation tool
import { test_generation, test_generation_executor } from './tools/test-generation.tool'

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
    this.register(fileReadDefinition, fileReadExecutor)
    this.register(fileWriteDefinition, fileWriteExecutor)
    this.register(fileEditDefinition, fileEditExecutor)
    this.register(fileBatchWriteDefinition, fileBatchWriteExecutor)
    this.register(fileSyncDefinition, fileSyncExecutor)
    this.register(globDefinition, globExecutor)
    this.register(grepDefinition, grepExecutor)
    this.register(listFilesDefinition, listFilesExecutor)
    this.register(pythonCodeDefinition, pythonCodeExecutor)
    this.register(javascriptCodeDefinition, javascriptCodeExecutor)
    // Code intelligence tools
    this.register(extractSymbolsDefinition, extractSymbolsExecutor)
    this.register(findReferencesDefinition, findReferencesExecutor)
    this.register(goToDefinitionDefinition, goToDefinitionExecutor)
    // Batch operations tools
    this.register(batchEditDefinition, batchEditExecutor)
    this.register(advancedSearchDefinition, advancedSearchExecutor)
    this.register(fileBatchReadDefinition, fileBatchReadExecutor)
    // Data analysis tools
    this.register(analyzeDataDefinition, analyzeDataExecutor)
    this.register(generateChartDefinition, generateChartExecutor)
    this.register(filterDataDefinition, filterDataExecutor)
    this.register(aggregateDataDefinition, aggregateDataExecutor)
    // Code review tools
    this.register(code_review, code_review_executor)
    this.register(batch_code_review, batch_code_review_executor)
    // Test generation tool
    this.register(test_generation, test_generation_executor)
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
