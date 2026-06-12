/**
 * Single tool definition exposed to the Tool Searcher specialized agent.
 *
 * - submit_search_results: exit tool — returns structured results with
 *   matching tool names. Parameter schemas are NOT part of the structured
 *   output — the bridge looks them up locally from the tool catalog.
 *
 * No executor is needed: this tool is invoked by the LLM, not by an
 * AgentLoop. The LLM provider's response contains the tool_call arguments
 * directly; the bridge reads `tool_calls[].function.arguments`.
 */

import type { ToolDefinition } from '../../tools/tool-types'

//=============================================================================
// Tool: submit_search_results
//=============================================================================

export const submitSearchResultsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_search_results',
    description:
      'Submit the final tool search results. Call this when you have identified ' +
      'the matching tools. The parameter schemas will be attached automatically ' +
      'from the local catalog — you do NOT need to include them.',
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
                description:
                  'The full tool name (e.g. "workspace_jianguoyun_com__message_send_text"). ' +
                  'Must match a name from the Available Tools list exactly.',
              },
              relevance_reason: {
                type: 'string',
                description:
                  'Brief explanation of why this tool matches the user query.',
              },
              description: {
                type: 'string',
                description: 'The tool description.',
              },
            },
            required: ['full_tool_name', 'relevance_reason', 'description'],
          },
          description: 'List of matching tools, ranked by relevance (max 5).',
        },
      },
      required: ['tools'],
    },
  },
}

//=============================================================================
// Tool: submit_reranked_results
//=============================================================================

/**
 * Exit tool for the Reranker specialized agent (Phase 1+ adaptive routing).
 *
 * The reranker receives a small candidate set (~20 tools retrieved by BM25)
 * and reorders them by semantic relevance to the user's intent. It calls
 * submit_reranked_results to commit the final ranked list.
 */
export const submitRerankedResultsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_reranked_results',
    description:
      'Submit the final reranked tool list. Call this when you have re-ranked ' +
      'the candidate tools by relevance to the user intent. The parameter schemas ' +
      'will be attached automatically from the local catalog — you do NOT need ' +
      'to include them.',
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
                description:
                  'The full tool name (must match a name from the Candidates list exactly).',
              },
              relevance_reason: {
                type: 'string',
                description:
                  'Brief explanation of why this tool matches the user intent.',
              },
            },
            required: ['full_tool_name', 'relevance_reason'],
          },
          description:
            'Reranked list of tools, most relevant first. ' +
            'Exclude any candidates that do not match the intent at all.',
        },
      },
      required: ['tools'],
    },
  },
}
