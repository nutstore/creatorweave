/**
 * MCP Tool Bridge
 *
 * Bridges page-outside MCP services to the ToolRegistry using on-demand mode.
 *
 * Only 2 persistent tools are registered:
 *   1. mcp_get_tool_schema — get full parameter schema for MCP tools
 *   2. mcp_call            — execute an MCP tool by serverId:toolName
 *
 * The lightweight tool catalog is injected into the system prompt via
 * <available_mcp_services>. The LLM reads the catalog, fetches full
 * schema on demand via mcp_get_tool_schema, then calls mcp_call.
 *
 * This is the same pattern as WebMCP's on-demand mode.
 */

import type { ToolDefinition, ToolExecutor } from '../agent/tools/tool-types'
import { getMCPManager } from './mcp-manager'
import { ON_DEMAND_MCP_TOOLS } from './mcp-ondemand-bridge'

//=============================================================================
// Types (preserved for backward compat)
//=============================================================================

// MCPToolDefinition import kept for downstream consumers
export type { MCPToolDefinition } from './mcp-types'
import type { MCPToolDefinition, MCPServerConfig } from './mcp-types'

//=============================================================================
// Backward-compat conversions (used by tests / external consumers)
//=============================================================================

/**
 * Convert MCP tool definition to ToolRegistry ToolDefinition
 * @deprecated Only kept for backward compatibility. On-demand mode does not need this.
 */
export function mcpToolToToolDefinition(
  serverId: string,
  mcpTool: MCPToolDefinition,
  serverConfig?: MCPServerConfig
): ToolDefinition {
  const toolName = `${serverId}:${mcpTool.name}`

  let description = mcpTool.description || `MCP tool from ${serverId}`
  if (serverConfig?.name) {
    description = `[${serverConfig.name}] ${description}`
  }

  return {
    type: 'function',
    function: {
      name: toolName,
      description,
      parameters: mcpTool.inputSchema as unknown as ToolDefinition['function']['parameters'],
    },
  }
}

/**
 * Create a ToolExecutor for an MCP tool
 * @deprecated Only kept for backward compatibility. Use mcp_call instead.
 */
export function createMCPToolExecutor(serverId: string, toolName: string): ToolExecutor {
  return async (args: Record<string, unknown>, _context): Promise<string> => {
    const manager = getMCPManager()
    try {
      const result = await manager.executeTool(serverId, toolName, args)
      if (typeof result === 'string') return result
      return JSON.stringify(result, null, 2)
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

//=============================================================================
// On-Demand Registration
//==============================================================================

// Track which on-demand tools are registered
const registeredOnDemandToolNames = new Set<string>()

type RegistryLike = {
  register(definition: ToolDefinition, executor: ToolExecutor): void
  unregister(name: string): boolean
  has?(name: string): boolean
}

async function resolveRegistry(registry?: RegistryLike): Promise<RegistryLike> {
  if (registry) return registry
  const { getToolRegistry } = await import('../agent/tool-registry')
  return getToolRegistry()
}

/**
 * Register the 2 on-demand MCP tools (mcp_get_tool_schema + mcp_call).
 *
 * This replaces the old registerAllMCPTools which used to register
 * every MCP tool individually.
 */
export async function registerAllMCPTools(registry?: RegistryLike): Promise<number> {
  const resolvedRegistry = await resolveRegistry(registry)

  // Ensure MCP manager is initialized
  const manager = getMCPManager()
  try {
    await manager.initialize()
  } catch {
    // May already be initialized
  }

  // Register the 2 persistent on-demand tools
  let registered = 0
  for (const tool of ON_DEMAND_MCP_TOOLS) {
    const name = tool.definition.function.name
    if (!registeredOnDemandToolNames.has(name)) {
      // Idempotent: skip if already registered
      if (resolvedRegistry.has?.(name)) {
        registeredOnDemandToolNames.add(name)
        continue
      }
      resolvedRegistry.register(tool.definition, tool.executor)
      registeredOnDemandToolNames.add(name)
    }
    registered++
  }

  return registered
}

/**
 * Unregister all MCP on-demand tools.
 */
export async function unregisterAllMCPTools(registry?: RegistryLike): Promise<number> {
  const resolvedRegistry = await resolveRegistry(registry)
  let removed = 0
  for (const name of Array.from(registeredOnDemandToolNames)) {
    if (resolvedRegistry.unregister(name)) {
      removed++
    }
    registeredOnDemandToolNames.delete(name)
  }
  return removed
}

/**
 * Sync MCP on-demand tools to the ToolRegistry.
 *
 * This is the main entry point for keeping MCP tools in sync.
 * In on-demand mode, this always registers the same 2 tools.
 */
export async function syncMCPTools(registry?: RegistryLike): Promise<{
  registered: number
  unregistered: number
}> {
  const registered = await registerAllMCPTools(registry)
  return { registered, unregistered: 0 }
}

/**
 * Register all tools from a single MCP server to the ToolRegistry
 * @deprecated Only kept for backward compatibility. On-demand mode does not register per-server tools.
 */
export async function registerServerTools(
  _serverId: string,
  _tools: MCPToolDefinition[],
  _serverConfig?: MCPServerConfig,
  _registry?: RegistryLike
): Promise<void> {
  // No-op in on-demand mode
}

/**
 * Unregister all tools from an MCP server
 * @deprecated Only kept for backward compatibility. On-demand mode does not register per-server tools.
 */
export async function unregisterServerTools(
  _serverId: string,
  _toolNames: string[],
  _registry?: RegistryLike
): Promise<void> {
  // No-op in on-demand mode
}
