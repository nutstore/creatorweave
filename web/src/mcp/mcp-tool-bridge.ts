/**
 * MCP Tool Bridge
 *
 * Bridges MCP tools to the ToolRegistry system.
 * Converts MCP tool definitions to ToolDefinition format and creates
 * ToolExecutor functions that delegate to MCPManager.
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from '../agent/tools/tool-types'
import type { MCPToolDefinition, MCPServerConfig } from './mcp-types'
import { getMCPManager } from './mcp-manager'

//=============================================================================
// Type Conversions
//=============================================================================

/**
 * Convert MCP JSON Schema to ToolRegistry JSON Schema format
 */
function convertMCPSchemaToToolSchema(mcpSchema: {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}): { type: 'object'; properties: Record<string, unknown>; required?: string[] } {
  const properties: Record<string, unknown> = {}

  // Convert each property to JSONSchemaProperty format
  if (mcpSchema.properties) {
    for (const [key, value] of Object.entries(mcpSchema.properties)) {
      // Keep the property as-is - ToolRegistry accepts this format
      properties[key] = value
    }
  }

  return {
    type: 'object',
    properties,
    required: mcpSchema.required,
  }
}

/**
 * Convert MCP tool definition to ToolRegistry ToolDefinition
 */
export function mcpToolToToolDefinition(
  serverId: string,
  mcpTool: MCPToolDefinition,
  serverConfig?: MCPServerConfig
): ToolDefinition {
  const toolName = `${serverId}:${mcpTool.name}`

  // Build description with server context
  let description = mcpTool.description || `MCP tool from ${serverId}`
  if (serverConfig?.name) {
    description = `[${serverConfig.name}] ${description}`
  }

  return {
    type: 'function',
    function: {
      name: toolName,
      description,
      parameters: convertMCPSchemaToToolSchema(mcpTool.inputSchema) as any,
    },
  }
}

//=============================================================================
// Tool Executor Creation
//=============================================================================

/**
 * Create a ToolExecutor for an MCP tool
 */
export function createMCPToolExecutor(serverId: string, toolName: string): ToolExecutor {
  return async (args: Record<string, unknown>, _context: ToolContext): Promise<string> => {
    const manager = getMCPManager()

    try {
      const result = await manager.executeTool(serverId, toolName, args)

      // Format the result for the LLM
      if (typeof result === 'string') {
        return result
      }

      // Handle MCP tool call result format
      if (result && typeof result === 'object') {
        const mcpResult = result as {
          content?: Array<{ type: string; text?: string }>
          isError?: boolean
        }

        if (mcpResult.isError) {
          return JSON.stringify({ error: 'MCP tool returned an error', result })
        }

        if (Array.isArray(mcpResult.content)) {
          // Extract text content from MCP result
          const textParts = mcpResult.content
            .filter((item) => item.type === 'text' && item.text)
            .map((item) => item.text)

          if (textParts.length === 1) {
            return textParts[0]!
          } else if (textParts.length > 1) {
            return textParts.join('\n\n')
          }
        }

        // Default to JSON stringify
        return JSON.stringify(result)
      }

      return JSON.stringify(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return JSON.stringify({
        error: `MCP tool execution failed: ${errorMessage}`,
        serverId,
        toolName,
      })
    }
  }
}

//=============================================================================
// Batch Registration
//=============================================================================

/**
 * Register all tools from an MCP server to the ToolRegistry
 */
export function registerServerTools(
  serverId: string,
  tools: MCPToolDefinition[],
  serverConfig?: MCPServerConfig,
  registry?: { register(definition: ToolDefinition, executor: ToolExecutor): void }
): void {
  // Lazy import to avoid circular dependency
  const reg =
    registry ||
    (() => {
      const { getToolRegistry } = require('../agent/tool-registry')
      return getToolRegistry()
    })()

  for (const tool of tools) {
    const definition = mcpToolToToolDefinition(serverId, tool, serverConfig)
    const executor = createMCPToolExecutor(serverId, tool.name)
    reg.register(definition, executor)

    console.log(`[MCPToolBridge] Registered tool: ${definition.function.name}`)
  }
}

/**
 * Unregister all tools from an MCP server
 */
export function unregisterServerTools(
  serverId: string,
  toolNames: string[],
  registry?: { unregister(name: string): boolean }
): void {
  // Lazy import to avoid circular dependency
  const reg =
    registry ||
    (() => {
      const { getToolRegistry } = require('../agent/tool-registry')
      return getToolRegistry()
    })()

  for (const toolName of toolNames) {
    const fullToolName = `${serverId}:${toolName}`
    reg.unregister(fullToolName)
    console.log(`[MCPToolBridge] Unregistered tool: ${fullToolName}`)
  }
}

//=============================================================================
// MCP Manager Integration
//=============================================================================

/**
 * Register all available MCP tools from the MCPManager to the ToolRegistry
 *
 * This function:
 * 1. Gets all connected servers from MCPManager
 * 2. Discovers tools from each server (or uses cached tools)
 * 3. Registers each tool with the ToolRegistry
 */
export async function registerAllMCPTools(registry?: {
  register(definition: ToolDefinition, executor: ToolExecutor): void
}): Promise<number> {
  const manager = getMCPManager()

  // Get all connected servers with their tools
  const allTools = manager.getAllTools()
  const allServers = manager.getAllServers()

  let totalRegistered = 0

  for (const [serverId, tools] of allTools) {
    const serverConfig = allServers.find((s) => s.id === serverId)

    // Register each tool
    for (const tool of tools) {
      const definition = mcpToolToToolDefinition(serverId, tool, serverConfig)
      const executor = createMCPToolExecutor(serverId, tool.name)

      if (registry) {
        registry.register(definition, executor)
      } else {
        const { getToolRegistry } = require('../agent/tool-registry')
        getToolRegistry().register(definition, executor)
      }

      totalRegistered++
    }
  }

  console.log(`[MCPToolBridge] Registered ${totalRegistered} MCP tools`)

  return totalRegistered
}

/**
 * Unregister all MCP tools from the ToolRegistry
 */
export function unregisterAllMCPTools(registry?: { unregister(name: string): boolean }): number {
  const manager = getMCPManager()
  const allTools = manager.getAllTools()

  let totalUnregistered = 0

  for (const [serverId, tools] of allTools) {
    for (const tool of tools) {
      const fullToolName = `${serverId}:${tool.name}`

      if (registry) {
        registry.unregister(fullToolName)
      } else {
        const { getToolRegistry } = require('../agent/tool-registry')
        getToolRegistry().unregister(fullToolName)
      }

      totalUnregistered++
    }
  }

  console.log(`[MCPToolBridge] Unregistered ${totalUnregistered} MCP tools`)

  return totalUnregistered
}

/**
 * Sync MCP tools to the ToolRegistry
 *
 * This is the main entry point for keeping MCP tools in sync.
 * Call this when:
 * - Application starts
 * - MCP servers are added/removed
 * - Server connection status changes
 */
export async function syncMCPTools(registry?: {
  register(definition: ToolDefinition, executor: ToolExecutor): void
  unregister(name: string): boolean
  getToolDefinitions?(): ToolDefinition[]
}): Promise<{ registered: number; unregistered: number }> {
  const manager = getMCPManager()

  // Get all tool names that should be registered
  const allTools = manager.getAllTools()
  const expectedToolNames = new Set<string>()

  for (const [serverId, tools] of allTools) {
    for (const tool of tools) {
      expectedToolNames.add(`${serverId}:${tool.name}`)
    }
  }

  // Get current MCP tool names from registry
  // We track this by checking for tools with the ":" separator (our naming convention)
  const currentToolNames = new Set<string>()

  const reg =
    registry ||
    (() => {
      const { getToolRegistry } = require('../agent/tool-registry')
      return getToolRegistry()
    })()

  for (const definition of reg.getToolDefinitions?.() || []) {
    const name = definition.function.name
    if (name.includes(':')) {
      currentToolNames.add(name)
    }
  }

  // Unregister tools that are no longer expected
  for (const name of currentToolNames) {
    if (!expectedToolNames.has(name)) {
      reg.unregister(name)
    }
  }

  // Register all expected tools
  const registered = await registerAllMCPTools(reg)

  // Calculate unregistered
  const unregistered = currentToolNames.size - expectedToolNames.size

  return { registered, unregistered: Math.max(0, unregistered) }
}
