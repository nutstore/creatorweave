/**
 * Tool Searcher — a specialized agent for semantic tool search.
 *
 * Spawned by search_tools when use_subagent=true.
 * Uses an LLM to match user intent against all external tool descriptions,
 * then returns structured results with full parameter schemas.
 *
 * Uses AgentLoop with skipEnhancements=true so the system prompt is passed
 * through as-is (no skills injection, MCP summaries, tool docs, or prefetch).
 *
 * Flow:
 *   1. System prompt contains all tool descriptions
 *   2. LLM matches tools semantically
 *   3. LLM calls get_tools_schema for matched tools
 *   4. LLM calls submit_search_results to return structured output
 *   5. Loop terminates after submit_search_results is called
 */

import type { PiAIProvider } from '../../llm/pi-ai-provider'
import { AgentLoop } from '../../agent-loop'
import { ContextManager } from '../../context-manager'
import { ToolRegistry } from '../../tool-registry'
import type { Message } from '../../message-types'
import { buildToolSearcherSystemPrompt } from './prompt'
import {
  getToolsSchemaDefinition,
  getToolsSchemaExecutor,
  submitSearchResultsDefinition,
  createSubmitSearchResultsExecutor,
} from './tools'
import type { ToolSearcherInput, ToolSearcherResult } from './types'

export { type ToolSearcherInput, type ToolSearcherResult, type ToolSearcherResultItem } from './types'

const MAX_TURNS = 5

/**
 * Run the tool-searcher agent.
 *
 * Creates a lightweight AgentLoop with skipEnhancements=true and a
 * minimal ToolRegistry containing only get_tools_schema and
 * submit_search_results.
 *
 * @returns Structured tool search results, or null if the agent failed.
 */
export async function runToolSearcher(
  input: ToolSearcherInput,
  deps: {
    provider: PiAIProvider
  }
): Promise<ToolSearcherResult | null> {
  const { query } = input
  const { provider } = deps

  // Build system prompt with all tool descriptions
  const systemPrompt = buildToolSearcherSystemPrompt(input.allToolDescriptionsText)

  // Capture result via closure
  let capturedResult: ToolSearcherResult | null = null

  // Build a minimal tool registry with only the searcher's tools
  const toolRegistry = new ToolRegistry()
  toolRegistry.register(getToolsSchemaDefinition, getToolsSchemaExecutor)
  toolRegistry.register(
    submitSearchResultsDefinition,
    createSubmitSearchResultsExecutor((result) => {
      capturedResult = result
    })
  )

  // Create a minimal context manager
  const contextManager = new ContextManager({
    maxContextTokens: provider.maxContextTokens,
    systemPrompt,
  })

  // Build the AgentLoop with skipEnhancements=true
  const agentLoop = new AgentLoop({
    provider,
    toolRegistry,
    contextManager,
    toolContext: {
      directoryHandle: null,
      agentMode: 'act',
      readFileState: new Map(),
    },
    systemPrompt,
    maxIterations: MAX_TURNS,
    skipEnhancements: true,
  })

  // Build initial user message
  const userMessage: Message = {
    id: `tool-searcher-${Date.now()}`,
    role: 'user',
    content: query,
    timestamp: Date.now(),
  }

  // Run the agent loop
  try {
    await agentLoop.run([userMessage], {
      onToolCallComplete: (toolCall, result) => {
        // Detect submit_search_results — capture result and cancel loop
        if (toolCall.function.name === 'submit_search_results' && capturedResult) {
          agentLoop.cancel()
        }
      },
    })
  } catch {
    // Loop may throw on cancel — that's fine, we have the result
  }

  return capturedResult
}
