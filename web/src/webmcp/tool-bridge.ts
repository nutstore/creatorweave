import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from '@/agent/tools/tool-types'
import { toolErrorJson, toolOkJson } from '@/agent/tools/tool-envelope'
import { getWebMCPBridge } from './bridge-client'
import { useWebMCPStore } from './store'
import type { WebMCPDiscoveredTool } from './types'
import { consumeAndSavePluginDownload } from './plugin-download'

//=============================================================================
// On-Demand Mode: Two persistent tools for on-demand schema loading + execution
//=============================================================================

/**
 * Tool 1: webmcp_get_tool_schema
 *
 * Fetches the full parameter schema for one or more WebMCP tools by exact name.
 * The LLM identifies target tools from <available_webmcp> and uses this to
 * get the complete inputSchema before calling webmcp_call.
 */
export const webMCPGetToolSchemaDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'webmcp_get_tool_schema',
    description:
      'Get the full parameter schema of one or more WebMCP tools by their exact full names. ' +
      'Use this before calling webmcp_call to get the complete input schema. ' +
      'Tool names are listed in <available_webmcp>.',
    parameters: {
      type: 'object',
      properties: {
        full_tool_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'One or more exact full tool names from <available_webmcp>',
        },
      },
      required: ['full_tool_names'],
    },
  },
}

export const webMCPGetToolSchemaExecutor: ToolExecutor = async (args) => {
  // Defensive: LLM may send a single string instead of array
  let names = (args as { full_tool_names: string[] | string }).full_tool_names
  if (typeof names === 'string') names = [names]
  const store = useWebMCPStore.getState()
  const enabledTools = store.getEnabledTools()

  // Build a Map for O(1) lookup
  const toolMap = new Map(enabledTools.map(t => [t.fullName, t]))

  const results: Array<{
    fullName: string
    name: string
    hostname: string
    description: string
    inputSchema: Record<string, unknown>
    annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
  }> = []
  const notFound: string[] = []

  for (const name of names) {
    const tool = toolMap.get(name)
    if (!tool) {
      notFound.push(name)
      continue
    }
    results.push({
      fullName: tool.fullName,
      name: tool.name,
      hostname: tool.hostname,
      description: tool.description || '',
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      annotations: tool.annotations,
    })
  }

  if (results.length === 0) {
    return toolErrorJson(
      'webmcp_get_tool_schema',
      'TOOL_NOT_FOUND',
      `Tool(s) not found: ${notFound.join(', ')}. Check <available_webmcp> for available tools.`
    )
  }

  const response: Record<string, unknown> = { tools: results }
  if (notFound.length > 0) {
    response.notFound = notFound
    response.warning = `Some tools were not found: ${notFound.join(', ')}`
  }

  return toolOkJson('webmcp_get_tool_schema', response)
}

/**
 * Tool 2: webmcp_call
 *
 * Executes a WebMCP tool by its full name with the provided arguments.
 * Reuses the same bridge invocation + plugin-download logic as the legacy
 * per-tool executors, but accepts full_tool_name as a parameter.
 */
export const webMCPToolCallDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'webmcp_call',
    description:
      'Execute a WebMCP tool with the provided arguments. ' +
      'Use webmcp_get_tool_schema first to get the full parameter schema.',
    parameters: {
      type: 'object',
      properties: {
        full_tool_name: {
          type: 'string',
          description: 'The full tool name from <available_webmcp> (e.g., "workspace_jianguoyun_com__fetch_ticket_messages")',
        },
        args: {
          type: 'object',
          description: "Arguments matching the tool's input schema. Use the schema returned by webmcp_get_tool_schema.",
        },
      },
      required: ['full_tool_name'],
    },
  },
}

export const webMCPToolCallExecutor: ToolExecutor = async (args, context) => {
  const { full_tool_name, args: toolArgs } = args as {
    full_tool_name: string
    args?: Record<string, unknown>
  }

  const bridge = getWebMCPBridge()
  if (!bridge) {
    return toolErrorJson(
      'webmcp_call',
      'WEBMCP_BRIDGE_UNAVAILABLE',
      'Browser extension WebMCP bridge is unavailable'
    )
  }

  // Look up tool from catalog for hostname + schema validation
  const store = useWebMCPStore.getState()
  const enabledTools = store.getEnabledTools()
  const toolMap = new Map(enabledTools.map(t => [t.fullName, t]))
  const toolInfo = toolMap.get(full_tool_name)

  if (!toolInfo) {
    return toolErrorJson(
      'webmcp_call',
      'TOOL_NOT_FOUND',
      `WebMCP tool "${full_tool_name}" is no longer available. ` +
      `The browser tab that provided this tool may have been closed, suspended, or navigated away. ` +
      `Please tell the user: the page needs to be reopened in the browser before this action can be performed.`,
      { retryable: true }
    )
  }

  // Validate args against the tool's inputSchema
  const validationError = validateToolArgs(full_tool_name, toolArgs || {}, toolInfo.inputSchema)
  if (validationError) {
    return validationError
  }
  const hostname = toolInfo.hostname
  const preferredTabId = hostname
    ? store.getPreferredTabIdForHost(hostname)
    : undefined

  try {
    const response = await bridge.webMCPInvoke({
      fullToolName: full_tool_name,
      args: toolArgs || {},
      preferredTabId,
    })

    if (!response.ok) {
      return toolErrorJson(
        'webmcp_call',
        response.errorCode || 'WEBMCP_INVOKE_FAILED',
        response.error || 'WebMCP tool invocation failed',
        {
          retryable: true,
          details: {
            fullToolName: full_tool_name,
            tabId: response.tabId,
            hostname: response.hostname,
            apiMode: response.apiMode,
          },
        }
      )
    }

    if (response.pluginDownloadPlan) {
      if (!bridge.webMCPPluginDownloadStream || !bridge.webMCPPluginDownloadFinalize) {
        return toolErrorJson(
          'webmcp_call',
          'WEBMCP_PLUGIN_DOWNLOAD_UNSUPPORTED',
          'Plugin download is not supported by this version of the browser extension. Please update the extension.',
          { retryable: false }
        )
      }
      try {
        const saveResult = await consumeAndSavePluginDownload(
          bridge,
          response.pluginDownloadPlan,
          context
        )

        const finalizeResp = await bridge.webMCPPluginDownloadFinalize({
          transferId: response.pluginDownloadPlan.transferId,
          savedPath: saveResult.savedPath,
        })
        if (!finalizeResp?.ok) {
          return toolErrorJson(
            'webmcp_call',
            'WEBMCP_PLUGIN_DOWNLOAD_FINALIZE_FAILED',
            finalizeResp?.error || 'Plugin download finalize failed',
            { retryable: true }
          )
        }

        // Keep AssetsPopover in sync
        try {
          const { useAssetInventoryStore } = await import('@/store/asset-inventory.store')
          useAssetInventoryStore.getState().refresh().catch(() => {})
        } catch {}

        return toolOkJson('webmcp_call', {
          result: saveResult.patchedResult,
          fullToolName: full_tool_name,
          hostname: response.hostname,
          tabId: response.tabId,
          apiMode: response.apiMode,
          pluginDownload: {
            transferId: response.pluginDownloadPlan.transferId,
            savedPath: `vfs://assets/${saveResult.savedPath}`,
            fileName: saveResult.fileName,
            size: saveResult.size,
            mimeType: saveResult.mimeType,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return toolErrorJson(
          'webmcp_call',
          'WEBMCP_PLUGIN_DOWNLOAD_FAILED',
          message,
          { retryable: true }
        )
      }
    }

    return toolOkJson('webmcp_call', {
      result: response.result,
      fullToolName: full_tool_name,
      hostname: response.hostname,
      tabId: response.tabId,
      apiMode: response.apiMode,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return toolErrorJson('webmcp_call', 'WEBMCP_INVOKE_FAILED', message, { retryable: true })
  }
}

//=============================================================================
// Schema Validation (Zod)
//=============================================================================

import { z } from 'zod'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'

/**
 * Validate tool call arguments against the tool's inputSchema using Zod.
 * Converts JSON Schema → Zod schema at runtime, then parses args.
 * Returns a toolErrorJson string if validation fails, or null if valid.
 */
function validateToolArgs(
  fullToolName: string,
  args: Record<string, unknown>,
  inputSchema: Record<string, unknown>
): string | null {
  try {
    const zodSchema = convertJsonSchemaToZod(inputSchema)
    zodSchema.parse(args)
    return null // valid
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => {
        const path = issue.path.join('.') || '(root)'
        return `  - "${path}": ${issue.message}`
      }).join('\n')

      return toolErrorJson(
        'webmcp_call',
        'SCHEMA_VALIDATION_FAILED',
        `Invalid arguments for "${fullToolName}":\n${issues}\n\nUse webmcp_get_tool_schema to get the full parameter schema.`,
        { retryable: false }
      )
    }
    // Non-Zod error (e.g. unsupported schema construct) — let it through
    return null
  }
}

/**
 * On-demand tool definitions and executors as a convenient array.
 */
export const ON_DEMAND_WEBMCP_TOOLS: Array<{
  definition: ToolDefinition
  executor: ToolExecutor
}> = [
  { definition: webMCPGetToolSchemaDefinition, executor: webMCPGetToolSchemaExecutor },
  { definition: webMCPToolCallDefinition, executor: webMCPToolCallExecutor },
]

/** Prompt doc for on-demand WebMCP tools */
export const webMCPPromptDoc: ToolPromptDoc = {
  category: 'webmcp',
  section: '### WebMCP Tools (On-Demand)',
  lines: [
    '- `webmcp_get_tool_schema(full_tool_names)` — Get the full parameter schema for WebMCP tools listed in <available_webmcp>. Call this before webmcp_call.',
    '- `webmcp_call(full_tool_name, args)` — Execute a WebMCP tool with arguments matching the schema returned by webmcp_get_tool_schema.',
  ],
}
