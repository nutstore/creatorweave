/**
 * Types for the Tool Searcher specialized agent.
 *
 * This agent is spawned by search_tools (when intent is provided) to perform
 * semantic tool matching across all external tool descriptions using a single
 * LLM call. The LLM only needs to pick matching tool names — parameter
 * schemas are looked up locally by the bridge (see external-tool-bridge.ts).
 */

/** A single tool result returned by the tool-searcher agent */
export interface ToolSearcherResultItem {
  /** Full tool name (e.g. "workspace_jianguoyun_com__message_send_text") */
  full_tool_name: string
  /** Why this tool was selected (for the main agent's understanding) */
  relevance_reason: string
  /** Tool description (echoed from the prompt; authoritative copy lives in catalog) */
  description: string
}

/** Final structured result from the tool-searcher agent */
export interface ToolSearcherResult {
  tools: ToolSearcherResultItem[]
}

/** Input to the tool-searcher agent */
export interface ToolSearcherInput {
  /** The user's search query / intent */
  query: string
  /** Pre-formatted text of all tool names + descriptions */
  allToolDescriptionsText: string
}

//=============================================================================
// Reranker types (Phase 1+: BM25 top-N → LLM rerank)
//=============================================================================

/** A candidate tool for the reranker (subset of UnifiedToolEntry) */
export interface RerankCandidate {
  /** Full tool name */
  fullName: string
  /** Tool description */
  description: string
  /** Source type for context */
  source: 'mcp' | 'webmcp'
  /** Source ID (serverId or hostname) */
  sourceId: string
  /** Original BM25 score (for prompt context) */
  bm25Score: number
}

/** Single reranked tool */
export interface RerankerResultItem {
  full_tool_name: string
  relevance_reason: string
}

/** Final result from the reranker */
export interface RerankerResult {
  tools: RerankerResultItem[]
}

/** Input to the reranker */
export interface RerankerInput {
  /** The user's intent (LLM-readable description of what they want to accomplish) */
  intent: string
  /** BM25-retrieved candidate tools to rerank */
  candidates: RerankCandidate[]
  /** Max tools to return (default 5) */
  topK?: number
}
