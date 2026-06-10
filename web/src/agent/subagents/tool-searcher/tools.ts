/**
 * Tools available to the Tool Searcher specialized agent.
 *
 * - get_tools_schema: Fetch full parameter schemas by tool name list
 * - submit_search_results: Exit tool — submit structured results and terminate
 */

import type { ToolDefinition, ToolExecutor } from '../../tools/tool-types'
import type { ToolSearcherResult } from './types'
import { collectAllExternalTools } from '../../external-tool-bridge'

//=============================================================================
// Tool 1: get_tools_schema
//=============================================================================

export const getToolsSchemaDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_tools_schema',
    description:
      'Get the full parameter schemas for one or more tools by their full names. ' +
      'Returns the complete inputSchema for each requested tool.',
    parameters: {
      type: 'object',
      properties: {
        tool_names: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of full tool names (e.g. ["workspace_jianguoyun_com__message_send_text"]).',
        },
      },
      required: ['tool_names'],
    },
  },
}

export const getToolsSchemaExecutor: ToolExecutor = async (args) => {
  const { tool_names } = args as { tool_names: string[] }

  if (!Array.isArray(tool_names) || tool_names.length === 0) {
    return JSON.stringify({ error: 'tool_names must be a non-empty array of strings' })
  }

  const allTools = collectAllExternalTools()
  const results: Array<{
    full_tool_name: string
    description: string
    input_schema: Record<string, unknown>
  }> = []

  for (const name of tool_names) {
    const tool = allTools.find((t) => t.fullName === name)
    if (tool) {
      results.push({
        full_tool_name: tool.fullName,
        description: tool.description,
        input_schema: tool.inputSchema,
      })
    }
  }

  return JSON.stringify({
    schemas: results,
    not_found: tool_names.filter(
      (name) => !allTools.some((t) => t.fullName === name)
    ),
  })
}

//=============================================================================
// Tool 2: submit_search_results (exit tool)
//=============================================================================

export const submitSearchResultsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_search_results',
    description:
      'Submit the final tool search results. Call this when you have found matching tools ' +
      'and retrieved their schemas via get_tools_schema. This is the ONLY way to return results.',
    parameters: {
      type: 'object',
      properties: {
        tools: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              full_tool_name: {
                type: 'string',
                description: 'The full tool name that matches the query.',
              },
              relevance_reason: {
                type: 'string',
                description:
                  'Brief explanation of why this tool matches the user query.',
              },
              input_schema: {
                type: 'object',
                description:
                  'The complete inputSchema from get_tools_schema.',
              },
              description: {
                type: 'string',
                description: 'The tool description.',
              },
            },
            required: ['full_tool_name', 'relevance_reason', 'input_schema', 'description'],
          },
          description: 'List of matching tools, ranked by relevance (max 5).',
        },
      },
      required: ['tools'],
    },
  },
}

/**
 * Create an executor for submit_search_results that captures the result
 * via the provided callback. The callback is invoked synchronously when
 * the tool is called, storing the structured result for the caller.
 */
export function createSubmitSearchResultsExecutor(
  onResult: (result: ToolSearcherResult) => void
): ToolExecutor {
  return async (args) => {
    const { tools } = args as { tools: ToolSearcherResult['tools'] }

    onResult({ tools: tools || [] })

    return JSON.stringify({
      ok: true,
      message: `Submitted ${tools?.length || 0} tool results.`,
    })
  }
}
