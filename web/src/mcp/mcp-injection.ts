/**
 * MCP Injection - Builds the MCP services system prompt block
 *
 * Generates a lightweight XML block listing connected page-outside MCP
 * services and their tools (name + description only, no inputSchema).
 *
 * The LLM reads this catalog, calls mcp_get_tool_schema to get full
 * parameter definitions on demand, then calls mcp_call to execute.
 *
 * This follows the same on-demand pattern as WebMCP's <available_webmcp>.
 */

import { getMCPManager } from './mcp-manager'

//=============================================================================
// Types
//=============================================================================

/**
 * Context for MCP system prompt generation
 */
export interface MCPInjectionContext {
  /** Filter by server type */
  serverType?: 'builtin' | 'user' | 'project'
}

//=============================================================================
// Catalog Block Generation
//=============================================================================

/**
 * Build the <available_mcp_services> XML block for system prompt injection.
 *
 * Lists only connected MCP servers with their tool names and one-line
 * descriptions. The LLM uses mcp_get_tool_schema to fetch full inputSchema
 * on demand before calling mcp_call.
 *
 * Returns an empty string if no servers are connected.
 */
export function buildAvailableMCPServicesBlock(
  context?: MCPInjectionContext
): string {
  const manager = getMCPManager()

  // Ensure manager is initialized
  try {
    manager.initialize()
  } catch {
    // May already be initialized
  }

  const connected = manager.getConnectedServers()

  if (connected.length === 0) {
    return ''
  }

  let serversBlock = ''

  for (const server of connected) {
    if (context?.serverType && server.type !== context.serverType) continue

    const status = manager.getConnectionStatus(server.id)
    const tools = status?.tools || []

    serversBlock += `<server id="${escapeXml(server.id)}" name="${escapeXml(server.name)}">\n`

    if (server.description) {
      serversBlock += `  <description>${escapeXml(server.description)}</description>\n`
    }

    if (tools.length > 0) {
      for (const tool of tools) {
        const desc = tool.description?.trim() || 'No description available.'
        serversBlock += `  <tool name="${escapeXml(server.id)}:${escapeXml(tool.name)}">${escapeXml(desc)}</tool>\n`
      }
    } else {
      serversBlock += `  <!-- no tools discovered -->\n`
    }

    serversBlock += `</server>\n\n`
  }

  if (!serversBlock) return ''

  return (
    `<available_mcp_services>\n` +
    `\n` +
    `## Page-Outside MCP Services\n\n` +
    `These MCP services are connected via the browser extension bridge.\n` +
    `To call a tool, first use mcp_get_tool_schema to get the full parameter schema, then use mcp_call.\n\n` +
    serversBlock +
    `</available_mcp_services>\n`
  )
}

//=============================================================================
// Utility Functions
//=============================================================================

/**
 * Get a summary of all MCP services (for debugging/logging)
 */
export function getMCPServicesSummary(): {
  total: number
  enabled: number
  connected: number
  byType: Record<string, number>
} {
  const manager = getMCPManager()
  const servers = manager.getAllServers()

  const summary = {
    total: servers.length,
    enabled: servers.filter((s) => s.enabled).length,
    connected: manager.getConnectedServers().length,
    byType: {} as Record<string, number>,
  }

  for (const server of servers) {
    const type = server.type || 'unknown'
    summary.byType[type] = (summary.byType[type] || 0) + 1
  }

  return summary
}

/**
 * Check if any MCP services are available and connected
 */
export function hasConnectedMCPServices(): boolean {
  const manager = getMCPManager()
  return manager.getConnectedServers().length > 0
}

/**
 * Get all MCP tool names (for debugging/validation)
 */
export function getAllMCPToolNames(): string[] {
  const manager = getMCPManager()
  const allTools = manager.getAllTools()
  const names: string[] = []

  for (const [serverId, tools] of allTools) {
    for (const tool of tools) {
      names.push(`${serverId}:${tool.name}`)
    }
  }

  return names.sort()
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
