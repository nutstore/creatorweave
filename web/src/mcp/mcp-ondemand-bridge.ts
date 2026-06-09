/**
 * MCP On-Demand Bridge
 *
 * Provides 2 persistent tools for page-outside MCP services,
 * following the same pattern as WebMCP's on-demand mode:
 *
 *   1. mcp_get_tool_schema — get full parameter schema for MCP tools
 *   2. mcp_call            — execute an MCP tool by serverId:toolName
 *
 * The tool catalog (name + description only) is injected into the system
 * prompt via <available_mcp_services>. The LLM reads the catalog,
 * calls mcp_get_tool_schema to get full inputSchema on demand,
 * then calls mcp_call to execute.
 */

import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from '@/agent/tools/tool-types'
import { toolErrorJson, toolOkJson } from '@/agent/tools/tool-envelope'
import { getMCPManager } from './mcp-manager'
import type { MCPToolDefinition } from './mcp-types'

//=============================================================================
// Tool 1: mcp_get_tool_schema
//=============================================================================

export const mcpGetToolSchemaDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'mcp_get_tool_schema',
    description:
      'Get the full parameter schema of one or more page-outside MCP tools by their exact full names. ' +
      'Use this before calling mcp_call to get the complete input schema. ' +
      'Tool names are listed in <available_mcp_services>.',
    parameters: {
      type: 'object',
      properties: {
        full_tool_names: {
          type: 'array',
          items: { type: 'string' },
          description:
            'One or more exact full tool names from <available_mcp_services> (e.g. ["figma:get_file"])',
        },
      },
      required: ['full_tool_names'],
    },
  },
}

export const mcpGetToolSchemaExecutor: ToolExecutor = async (args) => {
  // Defensive: LLM may send a single string instead of array
  let names = (args as { full_tool_names: string[] | string }).full_tool_names
  if (typeof names === 'string') names = [names]

  const manager = getMCPManager()
  const allTools = manager.getAllTools()

  // Build a Map for O(1) lookup: "serverId:toolName" -> { serverId, tool }
  const toolMap = new Map<string, { serverId: string; tool: MCPToolDefinition }>()
  for (const [serverId, tools] of allTools) {
    for (const tool of tools) {
      toolMap.set(`${serverId}:${tool.name}`, { serverId, tool })
    }
  }

  const results: Array<{
    fullName: string
    name: string
    serverId: string
    description: string
    inputSchema: Record<string, unknown>
  }> = []
  const notFound: string[] = []

  for (const name of names) {
    const entry = toolMap.get(name)
    if (!entry) {
      notFound.push(name)
      continue
    }
    results.push({
      fullName: name,
      name: entry.tool.name,
      serverId: entry.serverId,
      description: entry.tool.description || '',
      inputSchema: entry.tool.inputSchema || { type: 'object', properties: {} },
    })
  }

  if (results.length === 0) {
    return toolErrorJson(
      'mcp_get_tool_schema',
      'TOOL_NOT_FOUND',
      `MCP tool(s) not found: ${notFound.join(', ')}. Check <available_mcp_services> for available tools.`
    )
  }

  const response: Record<string, unknown> = { tools: results }
  if (notFound.length > 0) {
    response.notFound = notFound
    response.warning = `Some tools were not found: ${notFound.join(', ')}`
  }

  return toolOkJson('mcp_get_tool_schema', response)
}

//=============================================================================
// Tool 2: mcp_call
//=============================================================================

export const mcpToolCallDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'mcp_call',
    description:
      'Execute a page-outside MCP tool with the provided arguments. ' +
      'Use mcp_get_tool_schema first to get the full parameter schema.',
    parameters: {
      type: 'object',
      properties: {
        full_tool_name: {
          type: 'string',
          description:
            'The full tool name from <available_mcp_services> (e.g., "figma:get_file")',
        },
        args: {
          type: 'object',
          description:
            "Arguments matching the tool's input schema. Use the schema returned by mcp_get_tool_schema.",
        },
      },
      required: ['full_tool_name'],
    },
  },
}

export const mcpToolCallExecutor: ToolExecutor = async (args, _context) => {
  const { full_tool_name, args: toolArgs } = args as {
    full_tool_name: string
    args?: Record<string, unknown>
  }

  // Parse "serverId:toolName"
  const colonIndex = full_tool_name.indexOf(':')
  if (colonIndex < 1 || colonIndex === full_tool_name.length - 1) {
    return toolErrorJson(
      'mcp_call',
      'INVALID_TOOL_NAME',
      `Invalid MCP tool name format: "${full_tool_name}". Expected "serverId:toolName".`
    )
  }

  const serverId = full_tool_name.substring(0, colonIndex)
  const toolName = full_tool_name.substring(colonIndex + 1)

  // Verify the tool exists
  const manager = getMCPManager()
  const allTools = manager.getAllTools()
  const serverTools = allTools.get(serverId)
  if (!serverTools) {
    return toolErrorJson(
      'mcp_call',
      'SERVER_NOT_FOUND',
      `MCP server "${serverId}" is not connected. Available servers: ${Array.from(allTools.keys()).join(', ') || '(none)'}.`,
      { retryable: true }
    )
  }

  const toolDef = serverTools.find((t) => t.name === toolName)
  if (!toolDef) {
    return toolErrorJson(
      'mcp_call',
      'TOOL_NOT_FOUND',
      `MCP tool "${full_tool_name}" not found. Available tools on ${serverId}: ${serverTools.map((t) => t.name).join(', ')}.`,
      { retryable: true }
    )
  }

  try {
    const result = await manager.executeTool(serverId, toolName, toolArgs || {})

    // Format the result for the LLM
    if (typeof result === 'string') {
      return toolOkJson('mcp_call', { text: result, fullToolName: full_tool_name })
    }

    if (result && typeof result === 'object') {
      const mcpResult = result as {
        content?: Array<{ type: string; text?: string }>
        isError?: boolean
      }

      if (mcpResult.isError) {
        const errorContent = Array.isArray(mcpResult.content)
          ? mcpResult.content
              .filter((item) => item.type === 'text' && item.text)
              .map((item) => item.text)
              .join('\n')
          : undefined
        return toolErrorJson(
          'mcp_call',
          'MCP_TOOL_ERROR',
          errorContent || 'Unknown MCP tool error',
          { retryable: true, details: { fullToolName: full_tool_name } }
        )
      }

      if (Array.isArray(mcpResult.content)) {
        const textParts = mcpResult.content
          .filter((item) => item.type === 'text' && item.text)
          .map((item) => item.text)

        if (textParts.length > 0) {
          return toolOkJson('mcp_call', {
            text: textParts.join('\n\n'),
            fullToolName: full_tool_name,
          })
        }
      }

      return toolOkJson('mcp_call', { result, fullToolName: full_tool_name })
    }

    return toolOkJson('mcp_call', { result, fullToolName: full_tool_name })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return toolErrorJson('mcp_call', 'MCP_EXECUTION_FAILED', message, {
      retryable: true,
      details: { fullToolName: full_tool_name },
    })
  }
}

//=============================================================================
// On-Demand Tool Set
//=============================================================================

/**
 * The 2 persistent on-demand tools for page-outside MCP services.
 */
export const ON_DEMAND_MCP_TOOLS: Array<{
  definition: ToolDefinition
  executor: ToolExecutor
}> = [
  { definition: mcpGetToolSchemaDefinition, executor: mcpGetToolSchemaExecutor },
  { definition: mcpToolCallDefinition, executor: mcpToolCallExecutor },
]

/** Prompt doc for on-demand MCP tools */
export const mcpOnDemandPromptDoc: ToolPromptDoc = {
  category: 'mcp',
  section: '### MCP Tools (On-Demand)',
  lines: [
    '- `mcp_get_tool_schema(full_tool_names)` — Get the full parameter schema for MCP tools listed in <available_mcp_services>. Call this before mcp_call.',
    '- `mcp_call(full_tool_name, args)` — Execute a page-outside MCP tool with arguments matching the schema returned by mcp_get_tool_schema.',
  ],
}
