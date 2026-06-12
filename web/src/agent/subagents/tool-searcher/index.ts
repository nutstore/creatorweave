/**
 * Tool Searcher — single-call semantic tool search.
 *
 * Spawned by search_tools when intent is provided.
 * Uses ONE LLM call (no AgentLoop) to match user intent against all external
 * tool descriptions, with submit_search_results forced as the tool choice.
 * The LLM only needs to pick matching tool names — parameter schemas are
 * attached locally by the bridge (see external-tool-bridge.ts).
 *
 * Why single-call:
 * - Original design used a full AgentLoop with 2-3 LLM roundtrips:
 *   (1) pick candidates → (2) get_tools_schema → (3) submit_search_results.
 * - Step (2) was a local lookup masquerading as an LLM tool call, adding
 *   ~500ms-2s of network latency for zero semantic value.
 * - Single call with forced tool_choice = submit_search_results eliminates
 *   one full roundtrip and produces identical results.
 */

import type { PiAIProvider } from '../../llm/pi-ai-provider'
import { buildToolSearcherSystemPrompt, buildRerankPrompt } from './prompt'
import { submitSearchResultsDefinition, submitRerankedResultsDefinition } from './tools'
import type {
  ToolSearcherInput,
  ToolSearcherResult,
  ToolSearcherResultItem,
  RerankerInput,
  RerankerResult,
  RerankerResultItem,
} from './types'

export {
  type ToolSearcherInput,
  type ToolSearcherResult,
  type ToolSearcherResultItem,
  type RerankerInput,
  type RerankerResult,
  type RerankerResultItem,
} from './types'

/**
 * Run the tool-searcher.
 *
 * Single LLM call with submit_search_results forced as tool choice.
 * Returns structured results, or null if the call failed / LLM didn't
 * produce a valid submission (in which case the caller should fall back
 * to BM25 keyword search).
 */
export async function runToolSearcher(
  input: ToolSearcherInput,
  deps: {
    provider: PiAIProvider
    /** Optional abort signal (passed through from the parent tool executor). */
    signal?: AbortSignal
  }
): Promise<ToolSearcherResult | null> {
  const { query, allToolDescriptionsText } = input
  const { provider, signal } = deps

  // Build system prompt with all tool descriptions
  const systemPrompt = buildToolSearcherSystemPrompt(allToolDescriptionsText)

  try {
    const response = await provider.chat(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        // Force the LLM to call submit_search_results — no free-form text output
        tools: [submitSearchResultsDefinition],
        toolChoice: {
          type: 'function',
          function: { name: 'submit_search_results' },
        },
        // Disable thinking/reasoning — selection is a pattern-matching task, not analysis
        disableThinking: true,
        // Low temperature for deterministic tool selection
        temperature: 0,
        // Generous max tokens, but tight enough to fail fast on runaway completions
        maxTokens: 2000,
      },
      signal
    )

    // Extract the submit_search_results tool call
    const choice = response.choices[0]
    const toolCall = choice?.message?.tool_calls?.find(
      (tc) => tc.function.name === 'submit_search_results'
    )

    if (!toolCall) {
      console.warn('[tool-searcher] LLM did not call submit_search_results')
      return null
    }

    let parsed: { tools?: ToolSearcherResultItem[] }
    try {
      parsed = JSON.parse(toolCall.function.arguments)
    } catch (err) {
      console.warn('[tool-searcher] failed to parse submit_search_results arguments:', err)
      return null
    }

    const tools = Array.isArray(parsed?.tools) ? parsed.tools : []

    // Filter out items missing the required fields — LLM occasionally returns partial entries
    const validTools = tools.filter(
      (t): t is ToolSearcherResultItem =>
        typeof t?.full_tool_name === 'string' &&
        t.full_tool_name.length > 0 &&
        typeof t?.relevance_reason === 'string'
    )

    return { tools: validTools }
  } catch (err) {
    // Network error, provider error, abort, etc. — caller falls back to BM25
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[tool-searcher] aborted')
    } else {
      console.error('[tool-searcher] single-call failed:', err)
    }
    return null
  }
}

//=============================================================================
// Tool Reranker — single-call LLM rerank on BM25 candidates
//=============================================================================

/**
 * Run the Reranker.
 *
 * Used by search_tools when BM25 has retrieved a sufficient candidate set
 * (≥ MIN_RECALL candidates). The LLM re-orders the candidates by semantic
 * relevance to the user's intent and submits the top-K via
 * submit_reranked_results.
 *
 * Returns { tools: [] } (NOT null) when the LLM decided nothing matched —
 * the caller should treat this as "no rerank match" and fall back to BM25.
 * Returns null only on hard failure (network, abort, parse error).
 */
export async function runReranker(
  input: RerankerInput,
  deps: {
    provider: PiAIProvider
    signal?: AbortSignal
  }
): Promise<RerankerResult | null> {
  const { intent, candidates, topK = 5 } = input
  const { provider, signal } = deps

  // Render candidates as structured text for the prompt
  const candidatesText = candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.fullName}\n` +
        `   Source: ${c.source} (${c.sourceId})\n` +
        `   Description: ${c.description || '(no description)'}`
    )
    .join('\n\n')

  const systemPrompt = buildRerankPrompt(intent, candidatesText)

  try {
    const response = await provider.chat(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: intent },
        ],
        // Force the LLM to call submit_reranked_results
        tools: [submitRerankedResultsDefinition],
        toolChoice: {
          type: 'function',
          function: { name: 'submit_reranked_results' },
        },
        // Reranking is pattern matching, not analysis
        disableThinking: true,
        temperature: 0,
        // Small max tokens — top-K is bounded
        maxTokens: 1500,
      },
      signal
    )

    const choice = response.choices[0]
    const toolCall = choice?.message?.tool_calls?.find(
      (tc) => tc.function.name === 'submit_reranked_results'
    )

    if (!toolCall) {
      console.warn('[reranker] LLM did not call submit_reranked_results')
      return null
    }

    let parsed: { tools?: RerankerResultItem[] }
    try {
      parsed = JSON.parse(toolCall.function.arguments)
    } catch (err) {
      console.warn('[reranker] failed to parse submit_reranked_results arguments:', err)
      return null
    }

    const tools = Array.isArray(parsed?.tools) ? parsed.tools : []

    // Filter out items missing required fields
    const validTools = tools.filter(
      (t): t is RerankerResultItem =>
        typeof t?.full_tool_name === 'string' &&
        t.full_tool_name.length > 0 &&
        typeof t?.relevance_reason === 'string'
    )

    // Truncate to topK
    const truncatedTools = validTools.slice(0, Math.min(topK, 5))

    return { tools: truncatedTools }
  } catch (err) {
    // Network error, provider error, abort, etc. — caller falls back to BM25
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[reranker] aborted')
    } else {
      console.error('[reranker] single-call failed:', err)
    }
    return null
  }
}
