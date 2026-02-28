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

type WrappedResult = {
  result?: unknown
  _meta?: {
    elicitation?: unknown
  }
}

type BinaryElicitationMeta = {
  mode: 'binary'
  [key: string]: unknown
}

function unwrapResult(result: unknown): WrappedResult {
  if (!result || typeof result !== 'object') {
    return {}
  }
  const parsed = result as WrappedResult
  const actual = parsed.result
  return actual && typeof actual === 'object' ? (actual as WrappedResult) : parsed
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
      parameters: convertMCPSchemaToToolSchema(
        mcpTool.inputSchema
      ) as unknown as ToolDefinition['function']['parameters'],
    },
  }
}

//=============================================================================
// Tool Executor Creation
//=============================================================================

/**
 * SEP-1306: Check if a tool result contains binary elicitation
 */
function hasBinaryElicitation(result: unknown): result is WrappedResult {
  const actualResult = unwrapResult(result)
  return (actualResult._meta?.elicitation as BinaryElicitationMeta | undefined)?.mode === 'binary'
}

/**
 * Create a ToolExecutor for an MCP tool
 *
 * Supports:
 * - MCP Tasks: automatically handles long-running operations
 * - SEP-1306: binary mode elicitation for file uploads
 */
export function createMCPToolExecutor(serverId: string, toolName: string): ToolExecutor {
  return async (args: Record<string, unknown>, _context: ToolContext): Promise<string> => {
    const manager = getMCPManager()

    // Optional progress callback for MCP Tasks
    const onProgress = (status: string, message?: string) => {
      console.log(
        `[MCPToolExecutor] ${serverId}:${toolName} - ${status}${message ? ': ' + message : ''}`
      )
    }

    try {
      const result = await manager.executeTool(serverId, toolName, args, onProgress)

      // SEP-1306: Check for binary elicitation
      if (hasBinaryElicitation(result)) {
        const actualResult = unwrapResult(result)
        const elicitation = actualResult._meta?.elicitation
        const elicitationPayload =
          elicitation && typeof elicitation === 'object'
            ? (elicitation as Record<string, unknown>)
            : {}

        // Return special response that signals the UI to handle file upload
        // Include full elicitation data for the handler
        return JSON.stringify(
          {
            _elicitation: {
              ...elicitationPayload, // Include requestedSchema, uploadEndpoints, etc.
              toolName: `${serverId}:${toolName}`,
              args,
              serverId,
            },
          },
          null,
          2
        )
      }

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
export async function registerServerTools(
  serverId: string,
  tools: MCPToolDefinition[],
  serverConfig?: MCPServerConfig,
  registry?: { register(definition: ToolDefinition, executor: ToolExecutor): void }
): Promise<void> {
  // Lazy import to avoid circular dependency
  const reg =
    registry ||
    (async () => {
      const { getToolRegistry } = await import('../agent/tool-registry')
      return getToolRegistry()
    })()

  // Await the registry if it's a promise
  const resolvedReg = await reg

  for (const tool of tools) {
    const definition = mcpToolToToolDefinition(serverId, tool, serverConfig)
    const executor = createMCPToolExecutor(serverId, tool.name)
    resolvedReg.register(definition, executor)

    console.log(`[MCPToolBridge] Registered tool: ${definition.function.name}`)
  }
}

/**
 * Unregister all tools from an MCP server
 */
export async function unregisterServerTools(
  serverId: string,
  toolNames: string[],
  registry?: { unregister(name: string): boolean }
): Promise<void> {
  // Lazy import to avoid circular dependency
  const reg =
    registry ||
    (async () => {
      const { getToolRegistry } = await import('../agent/tool-registry')
      return getToolRegistry()
    })()

  // Await the registry if it's a promise
  const resolvedReg = await reg

  for (const toolName of toolNames) {
    const fullToolName = `${serverId}:${toolName}`
    resolvedReg.unregister(fullToolName)
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
 * 1. Initializes MCP manager
 * 2. Connects to all enabled MCP servers
 * 3. Discovers tools from each server
 * 4. Registers each tool with the ToolRegistry
 */
export async function registerAllMCPTools(registry?: {
  register(definition: ToolDefinition, executor: ToolExecutor): void
}): Promise<number> {
  const manager = getMCPManager()

  // Initialize manager (loads servers from storage)
  await manager.initialize()

  // Get all enabled servers
  const enabledServers = manager.getEnabledServers()
  console.log(
    `[MCPToolBridge] Found ${enabledServers.length} enabled servers`,
    enabledServers.map((s) => ({ id: s.id, name: s.name, url: s.url }))
  )

  let totalRegistered = 0

  for (const server of enabledServers) {
    try {
      console.log(`[MCPToolBridge] Connecting to ${server.id} at ${server.url}...`)

      // Connect to server (this also auto-discovers tools)
      await manager.connect(server.id)

      // Get the discovered tools
      const status = manager.getConnectionStatus(server.id)
      const tools = status?.tools

      console.log(`[MCPToolBridge] Connection status for ${server.id}:`, {
        state: status?.state,
        toolsCount: tools?.length || 0,
        toolNames: tools?.map((t) => t.name) || [],
      })

      if (!tools || tools.length === 0) {
        console.warn(`[MCPToolBridge] No tools discovered for ${server.id}`)
        continue
      }

      // Get the ToolRegistry instance
      const { getToolRegistry } = await import('../agent/tool-registry')
      const toolReg = registry || getToolRegistry()

      // Register each tool
      for (const tool of tools) {
        const toolName = `${server.id}:${tool.name}`
        const definition = mcpToolToToolDefinition(server.id, tool, server)
        const executor = createMCPToolExecutor(server.id, tool.name)

        toolReg.register(definition, executor)
        totalRegistered++

        console.log(`[MCPToolBridge] ✓ Registered tool: ${toolName}`)
      }

      console.log(`[MCPToolBridge] Registered ${tools.length} tools from ${server.id}`)
    } catch (error) {
      console.error(`[MCPToolBridge] Failed to register tools from ${server.id}:`, error)
      // Continue with other servers even if one fails
    }
  }

  console.log(`[MCPToolBridge] Registered ${totalRegistered} MCP tools total`)

  // Verify registration
  const { getToolRegistry } = await import('../agent/tool-registry')
  const allTools = getToolRegistry().getToolDefinitions()
  const mcpTools = allTools.filter((t) => t.function.name.includes(':'))
  console.log(
    `[MCPToolBridge] ToolRegistry now has ${mcpTools.length} MCP tools:`,
    mcpTools.map((t) => t.function.name)
  )

  return totalRegistered
}

/**
 * Unregister all MCP tools from the ToolRegistry
 */
export async function unregisterAllMCPTools(registry?: {
  unregister(name: string): boolean
}): Promise<number> {
  const manager = getMCPManager()
  const allTools = manager.getAllTools()

  let totalUnregistered = 0

  for (const [serverId, tools] of allTools) {
    for (const tool of tools) {
      const fullToolName = `${serverId}:${tool.name}`

      if (registry) {
        registry.unregister(fullToolName)
      } else {
        const { getToolRegistry } = await import('../agent/tool-registry')
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

  const { getToolRegistry } = await import('../agent/tool-registry')
  const reg = registry || getToolRegistry()

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
