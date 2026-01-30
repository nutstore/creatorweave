/**
 * Tool Registry - manages tool registration, lookup, and execution.
 */

import type { ToolDefinition, ToolExecutor, ToolEntry, ToolContext } from './tools/tool-types'

// Import built-in tools
import { fileReadDefinition, fileReadExecutor } from './tools/file-read.tool'
import { fileWriteDefinition, fileWriteExecutor } from './tools/file-write.tool'
import { fileEditDefinition, fileEditExecutor } from './tools/file-edit.tool'
import { globDefinition, globExecutor } from './tools/glob.tool'
import { grepDefinition, grepExecutor } from './tools/grep.tool'
import { listFilesDefinition, listFilesExecutor } from './tools/list-files.tool'

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

  /** Execute a tool by name */
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
      return await entry.executor(args, context)
    } catch (error) {
      return JSON.stringify({
        error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      })
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
    this.register(globDefinition, globExecutor)
    this.register(grepDefinition, grepExecutor)
    this.register(listFilesDefinition, listFilesExecutor)
  }
}

/** Singleton instance */
let instance: ToolRegistry | null = null

export function getToolRegistry(): ToolRegistry {
  if (!instance) {
    instance = new ToolRegistry()
    instance.registerBuiltins()
  }
  return instance
}
