/**
 * MCP Injection - Builds the MCP services system prompt block
 *
 * This module generates the XML block that lists available MCP services
 * and their tools for use in the Agent system prompt.
 */

import { getMCPManager } from './mcp-manager'
import type { MCPToolDefinition } from './mcp-types'

//=============================================================================
// Types
//=============================================================================

/**
 * Context for MCP system prompt generation
 */
export interface MCPInjectionContext {
  /** Include tool details (default: true) */
  includeTools?: boolean
  /** Include resources (default: false) */
  includeResources?: boolean
  /** Filter by server type */
  serverType?: 'builtin' | 'user' | 'project'
}

/**
 * Formatted MCP service for display
 */
export interface FormattedMCPService {
  id: string
  name: string
  description?: string
  url: string
  transport: string
  status: 'connected' | 'disconnected' | 'error'
  tools: MCPToolDefinition[]
}

//=============================================================================
// MCP Services Block Generation
//=============================================================================

/**
 * Build the <mcp_system> XML block for system prompt
 *
 * This generates a block similar to the skills_system block, listing
 * all available MCP services and their tools.
 */
export async function buildAvailableMCPServicesBlock(
  context?: MCPInjectionContext
): Promise<string> {
  const manager = getMCPManager()

  // Ensure manager is initialized
  // (It should be initialized on app startup, but check just in case)
  try {
    await (manager as any).initialize?.()
  } catch {
    // May already be initialized
  }

  // Get all server configurations
  let servers = manager.getAllServers()

  // Filter by enabled and type if specified
  servers = servers.filter((s) => s.enabled)
  if (context?.serverType) {
    servers = servers.filter((s) => s.type === context.serverType)
  }

  if (servers.length === 0) {
    return ''
  }

  // Get connection statuses and format services
  const formattedServices: FormattedMCPService[] = []

  for (const server of servers) {
    const status = manager.getConnectionStatus(server.id)
    const tools = status?.tools || []

    formattedServices.push({
      id: server.id,
      name: server.name,
      description: server.description,
      url: server.url,
      transport: server.transport,
      status:
        status?.state === 'connected'
          ? 'connected'
          : status?.state === 'error'
            ? 'error'
            : 'disconnected',
      tools: context?.includeTools !== false ? tools : [],
    })
  }

  // Only show connected services by default
  const connectedServices = formattedServices.filter((s) => s.status === 'connected')

  if (connectedServices.length === 0) {
    // No connected services - return empty or show message
    return ''
  }

  // Generate the XML block
  return generateMCPServicesXML(connectedServices)
}

/**
 * Generate the MCP services XML block
 */
function generateMCPServicesXML(services: FormattedMCPService[]): string {
  let block = '<mcp_system priority="1">\n\n'
  block += '## Available MCP Services\n\n'

  block += '<usage>\n'
  block += 'The following MCP services are available and their tools are registered for use.\n\n'
  block += 'To call an MCP tool, simply invoke it by name. The tool name format is:\n'
  block += '  `<serverId>:<toolName>`\n\n'

  // Add examples from first few services
  const examples: string[] = []
  for (const service of services.slice(0, 2)) {
    if (service.tools.length > 0) {
      const tool = service.tools[0]
      examples.push(
        `- Call: \`${service.id}:${tool.name}\` to ${tool.description || 'use the tool'}`
      )
    }
  }

  if (examples.length > 0) {
    block += 'Example:\n'
    block += examples.join('\n')
    block += '\n'
  }

  block += '</usage>\n\n'
  block += '<available_mcp_services>\n\n'

  // List each service and its tools
  for (const service of services) {
    block += formatMCPService(service)
  }

  block += '</available_mcp_services>\n\n'
  block += '</mcp_system>\n'

  return block
}

/**
 * Format a single MCP service for display
 */
function formatMCPService(service: FormattedMCPService): string {
  let output = `#### ${service.name} (${service.id})\n`
  output += `**Status**: Connected\n`

  if (service.description) {
    output += `**Description**: ${service.description}\n`
  }

  output += `**URL**: ${service.url}\n`
  output += `**Transport**: ${service.transport}\n`

  if (service.tools.length > 0) {
    output += `**Tools**:\n`
    for (const tool of service.tools) {
      output += `- \`${service.id}:${tool.name}\``
      if (tool.description) {
        output += ` - ${tool.description}`
      }
      output += '\n'
    }
  } else {
    output += '**Tools**: (no tools discovered)\n'
  }

  output += '\n'
  return output
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

  // Count by type
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
