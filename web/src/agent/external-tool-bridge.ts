/**
 * Unified External Tool Bridge
 *
 * 2 unified tools that handle all external tool discovery and execution
 * (MCP page-outside servers + WebMCP page API tools):
 *
 *   1. search_tools — discover tools + get their full schemas in one call
 *   2. call_tool    — execute any external tool (MCP or WebMCP)
 *
 * The full tool catalog is no longer injected into the system prompt.
 * Instead, the LLM uses search_tools to discover tools on demand.
 *
 * Benefits:
 * - 2 tools instead of 4 (simpler mental model for LLM)
 * - Search + schema in one call (saves a round-trip)
 * - Massive token savings: catalog removed from prompt
 */

import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tools/tool-types'
import { toolErrorJson, toolOkJson } from './tools/tool-envelope'
import { getMCPManager } from '@/mcp/mcp-manager'
import { useWebMCPStore } from '@/webmcp/store'
import { getWebMCPBridge } from '@/webmcp/bridge-client'
import { consumeAndSavePluginDownload } from '@/webmcp/plugin-download'

// Zod validation (for WebMCP)
import { z } from 'zod'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'

//=============================================================================
// Types
//=============================================================================

/** Unified tool source */
type ToolSource = 'mcp' | 'webmcp'

/** A unified tool entry from either MCP or WebMCP */
interface UnifiedToolEntry {
  fullName: string
  name: string
  source: ToolSource
  /** MCP: serverId. WebMCP: hostname */
  sourceId: string
  description: string
  inputSchema: Record<string, unknown>
  /** WebMCP specific */
  hostname?: string
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
}

//=============================================================================
// Tool Index — collects all external tools for search
//=============================================================================

/**
 * Collect all available external tools (MCP + WebMCP) into a unified list.
 */
export function collectAllExternalTools(): UnifiedToolEntry[] {
  const tools: UnifiedToolEntry[] = []

  // --- MCP tools ---
  try {
    const manager = getMCPManager()
    const allMCPTools = manager.getAllTools()
    for (const [serverId, serverTools] of allMCPTools) {
      for (const tool of serverTools) {
        tools.push({
          fullName: `${serverId}:${tool.name}`,
          name: tool.name,
          source: 'mcp',
          sourceId: serverId,
          description: tool.description || '',
          inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        })
      }
    }
  } catch {
    // MCP not initialized
  }

  // --- WebMCP tools ---
  try {
    const store = useWebMCPStore.getState()
    const enabledTools = store.getEnabledTools()
    for (const tool of enabledTools) {
      tools.push({
        fullName: tool.fullName,
        name: tool.name,
        source: 'webmcp',
        sourceId: tool.hostname,
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        hostname: tool.hostname,
        annotations: tool.annotations,
      })
    }
  } catch {
    // WebMCP not available
  }

  return tools
}

//=============================================================================
// BM25-based Search Engine
//=============================================================================

/**
 * Tokenize text on whitespace and common separators.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[_:.\/\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0)
}

/**
 * BM25 Search Engine — standard Okapi BM25.
 *
 * Standard BM25 formula:
 *   score(D, Q) = Σ IDF(qi) × (freq(qi, D) × (k1 + 1)) / (freq(qi, D) + k1 × (1 - b + b × |D| / avgdl))
 *
 * where:
 *   freq(qi, D) = term frequency of qi in document D
 *   |D|         = length of document D (in tokens)
 *   avgdl       = average document length across the corpus
 *   IDF(qi)     = log((N - df(qi) + 0.5) / (df(qi) + 0.5) + 1)
 *   N           = total number of documents in the corpus
 *   df(qi)      = number of documents containing qi
 *   k1          = term frequency saturation parameter (1.2)
 *   b           = document length normalization parameter (0.75)
 */

/** BM25 parameters */
const K1 = 1.2
const B = 0.75
const NAME_BOOST = 2.0

/** Pre-computed BM25 index over a corpus of documents */
class BM25Index {
  private docTokenLists: string[][] = []      // tokens per document
  private docLengths: number[] = []            // |D| per document
  private avgDocLen: number = 0                // average document length
  private totalDocs: number = 0                // N: total documents
  private df = new Map<string, number>()       // df(t): how many docs contain term t

  /**
   * Build the index from an array of text documents.
   * Computes df, document lengths, and avgDocLen.
   */  build(documents: string[]): void {
    this.totalDocs = documents.length
    this.docTokenLists = documents.map(d => tokenize(d))
    this.docLengths = this.docTokenLists.map(tokens => tokens.length)
    this.avgDocLen = this.docLengths.reduce((a, b) => a + b, 0) / (this.totalDocs || 1)

    // Compute df: for each term, count how many documents contain it
    this.df = new Map()
    for (const tokens of this.docTokenLists) {
      const uniqueTerms = new Set(tokens)
      for (const term of uniqueTerms) {
        this.df.set(term, (this.df.get(term) || 0) + 1)
      }
    }
  }

  /**
   * Standard BM25 IDF:
   *   IDF(t) = log((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
   *
   * - Rare term (df ≈ 1): IDF ≈ log(N + 0.5 / 1.5) → high
   * - Common term (df ≈ N): IDF ≈ log(1.5 / (N + 0.5) + 1) → low
   */
  private idf(term: string): number {
    const dfVal = this.df.get(term) || 0
    return Math.log((this.totalDocs - dfVal + 0.5) / (dfVal + 0.5) + 1)
  }

  /**
   * Standard BM25 term score:
   *   (freq × (k1 + 1)) / (freq + k1 × (1 - b + b × |D| / avgdl))
   */
  private tfNorm(freq: number, docLen: number): number {
    return (freq * (K1 + 1)) / (freq + K1 * (1 - B + B * docLen / this.avgDocLen))
  }

  /**
   * Score a single document against a query.
   * Returns BM25 score + name-match boost.
   */
  score(docIndex: number, queryTokens: string[], nameText: string): number {
    const docTokens = this.docTokenLists[docIndex]!
    const docLen = this.docLengths[docIndex]!
    const queryTokenSet = new Set(queryTokens)

    // Compute term frequency for this document
    const tf = new Map<string, number>()
    for (const token of docTokens) {
      tf.set(token, (tf.get(token) || 0) + 1)
    }

    // BM25 core: Σ IDF(qi) × TF_norm(qi)
    let score = 0
    for (const qt of queryTokenSet) {
      const freq = tf.get(qt) || 0
      if (freq === 0) continue
      score += this.idf(qt) * this.tfNorm(freq, docLen)
    }

    // Boost for matches in the tool name (first line of search text)
    const nameTokens = new Set(tokenize(nameText))
    for (const qt of queryTokenSet) {
      if (nameTokens.has(qt)) {
        score += NAME_BOOST
      }
    }

    return score
  }
}

//=============================================================================
// Phase 1+ Adaptive Routing Helpers
//=============================================================================

/**
 * Tuning knobs for the adaptive three-level routing:
 *
 * - Level 1 (pure BM25):  no rerank, no LLM call
 * - Level 2 (BM25 + LLM rerank): requires English query AND ≥ MIN_RECALL candidates
 * - Level 3 (full LLM semantic): fallback for CJK or BM25-poor queries
 */
const MIN_RECALL = 5             // Min BM25 candidates to attempt rerank path
const RERANK_TOP_N = 20          // Candidates fed into LLM reranker
const FALLBACK_TOP_K = 5         // Best-effort candidates when nothing matches
const MAX_SEARCH_RESULTS = 10    // Cap on returned results (matches BM25 path)

// Top-1 confidence short-circuit: skip LLM rerank when BM25 top-1 is
// clearly dominant. Both conditions must hold:
//   - top1Score >= TOP1_CONFIDENCE_SCORE (absolute confidence)
//   - top1Score - top2Score >= TOP1_TOP2_GAP (relative dominance)
//
// Backed by observed BM25 score distribution (12-query test, 2026-06-12):
//   - precise name match: top1=13-16, gap>5
//   - fuzzy match:        top1=4-8,  gap<1
//   - unrelated:          top1=0
//
// Tuning philosophy: prefer false negatives (let it rerank unnecessarily)
// over false positives (skip rerank and return wrong tool).
const TOP1_CONFIDENCE_SCORE = 8.0
const TOP1_TOP2_GAP = 4.0

/**
 * Detect CJK (Chinese/Japanese/Korean) characters in a string.
 *
 * BM25's tokenize() splits on whitespace and lowercases; it has zero Chinese
 * tokenization. We use this to detect when BM25 is guaranteed to fail and
 * we should skip directly to full LLM semantic search.
 *
 * Range covers CJK Unified Ideographs + Compatibility Ideographs.
 */
function hasCJK(text: string): boolean {
  if (!text) return false
  // CJK Unified Ideographs (4E00-9FFF) + Extension A (3400-4DBF) + Compat (F900-FAFF)
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text)
}

/**
 * Pure BM25 keyword search.
 *
 * Returns scored candidates sorted by BM25 score (descending). Empty array
 * if query is empty or no candidates have score > 0.
 *
 * Used by:
 * - Level 1 (no intent): returned directly
 * - Level 2 rerank: as candidate set for LLM reranker
 * - Fallback (status: no_match): as best-effort candidates
 */
function runBm25Search(
  allTools: UnifiedToolEntry[],
  query: string,
  n: number
): Array<{ tool: UnifiedToolEntry; score: number }> {
  if (!query.trim()) return []

  const searchItems = allTools.map(tool => ({
    tool,
    searchText: `${tool.fullName} ${tool.description} ${tool.sourceId}`,
    nameText: tool.fullName,
  }))

  const index = new BM25Index()
  index.build(searchItems.map(item => item.searchText))

  const queryTokens = tokenize(query)
  const scored = searchItems
    .map((item, i) => ({
      tool: item.tool,
      score: index.score(i, queryTokens, item.nameText),
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)

  return scored
}

/**
 * Format BM25 scored candidates into the standard search_tools response shape.
 *
 * Used by Path A (no intent) and Path A2 (short-circuit) — both are pure
 * BM25 with no LLM step. The LLM-aware paths (Path B rerank, Path C semantic,
 * Fallback) build their own response directly via toolOkJson because they
 * need to merge LLM output with catalog lookups.
 *
 * Always returns status: 'ok'. The no_match / failure case lives in the
 * Fallback path at the bottom of the executor.
 */
function formatBm25Results(
  scored: Array<{ tool: UnifiedToolEntry; score: number }>,
  limit: number,
  searchDurationMs?: number,
  extraFields: Record<string, unknown> = {}
) {
  const results = scored.slice(0, Math.min(limit, MAX_SEARCH_RESULTS)).map(s => ({
    fullName: s.tool.fullName,
    source: s.tool.source,
    sourceId: s.tool.sourceId,
    description: s.tool.description.slice(0, 300),
    inputSchema: s.tool.inputSchema,
    score: Math.round(s.score * 1000) / 1000,  // Round to 3 decimals for readability
  }))

  return toolOkJson('search_tools', {
    status: 'ok',
    results,
    total: results.length,
    searchMode: 'keyword',
    searchDurationMs: searchDurationMs !== undefined ? Math.round(searchDurationMs) : undefined,
    // Schema consistency: bm25Top1 == results[0].fullName for both Path A
    // and Path A2 (no LLM step in either). Path B / Path C / Fallback set
    // bm25Top1 explicitly in their own responses.
    bm25Top1: scored[0]?.tool.fullName ?? null,
    ...extraFields,
  })
}

//=============================================================================
// LLM-result enrichment
//=============================================================================

/** Shape that Path B (rerank) and Path C (semantic) expect from the LLM. */
interface LlmToolPick {
  full_tool_name: string
  relevance_reason: string
  /** Optional — Path C's searcher echoes it from the prompt; Path B's reranker does not. */
  description?: string
}

/** Enriched tool row attached to the search_tools response. */
interface EnrichedToolRow {
  fullName: string
  source: string
  sourceId: string
  description: string
  inputSchema: Record<string, unknown>
  relevanceReason: string
}

/**
 * Enrich LLM-picked tool names with authoritative source / schema / description
 * from the local tool catalog.
 *
 * Shared by Path B (rerank) and Path C (semantic). The LLM only picks
 * names + reasons — schemas and source info come from us.
 *
 * `description` on the pick is optional and only used as a last-resort
 * fallback when the catalog has no entry for the name.
 */
function enrichWithCatalog(
  picks: LlmToolPick[],
  allTools: UnifiedToolEntry[],
  limit: number
): { results: EnrichedToolRow[]; notFound: string[] } {
  const toolCatalog = new Map(allTools.map(t => [t.fullName, t]))
  const notFound: string[] = []
  const results: EnrichedToolRow[] = picks
    .slice(0, Math.min(limit, MAX_SEARCH_RESULTS))
    .map(t => {
      const catalogEntry = toolCatalog.get(t.full_tool_name)
      if (!catalogEntry) {
        // LLM invented a name we don't know about — flag for debugging
        notFound.push(t.full_tool_name)
      }
      return {
        fullName: t.full_tool_name,
        source: catalogEntry?.source || 'unknown',
        sourceId: catalogEntry?.sourceId || '',
        description: (catalogEntry?.description || t.description || '').slice(0, 300),
        inputSchema: catalogEntry?.inputSchema || {},
        relevanceReason: t.relevance_reason,
      }
    })
  return { results, notFound }
}

//=============================================================================
// Tool 1: search_tools (search + schema in one call)
//=============================================================================

export const searchToolsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_tools',
    description:
      'Search for external tools (MCP and WebMCP). Returns matching tools with their full parameter schemas, ready to call. ' +
      'No need to call a separate schema tool — just search, pick, and call.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Space-separated keywords for fast BM25 search ' +
            '(e.g. "figma node", "send email", "ticket message"). ' +
            'Use this when you know the tool name or relevant keywords.',
        },
        intent: {
          type: 'string',
          description:
            'Natural language description of the task you want to accomplish, including relevant context from the conversation. ' +
            '(e.g. "The user is working on a Figma design file and wants to export a specific layer as PNG"). ' +
            'When provided, semantic search (LLM-powered) is used — slower but understands synonyms, paraphrases, and cross-language queries. ' +
            'Prefer this when you are unsure which tool to use or when keyword search returned poor results.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (max 10). Default: 5.',
        },
      },
      // At least one of query or intent must be provided
    },
  },
}

export const searchToolsExecutor: ToolExecutor = async (args, context) => {
  const { query = '', intent = '', limit = 5 } = args as {
    query?: string
    intent?: string
    limit?: number
  }

  if (!query.trim() && !intent.trim()) {
    return toolOkJson('search_tools', {
      results: [],
      total: 0,
      message: 'At least one of query or intent must be provided.',
    })
  }

  const allTools = collectAllExternalTools()

  if (allTools.length === 0) {
    return toolOkJson('search_tools', {
      results: [],
      total: 0,
      message: 'No external tools available. Connect an MCP server or open a WebMCP-enabled page.',
    })
  }

  // ===========================================================================
  // Phase 1+ Adaptive Three-Level Routing
  // ===========================================================================
  //
  //   Path A (no intent):       BM25 only                          (~3ms, no LLM)
  //   Path B (intent, BM25 OK): BM25 top-N → LLM rerank            (~7-15s, small LLM call)
  //   Path C (intent, CJK or):  full LLM semantic over all tools   (~30-44s, big LLM call)
  //   Fallback (all failed):    BM25 best-effort + status:no_match (~3ms, no LLM)
  //
  // Path B is the new optimization: BM25 narrows 137 → ~20 candidates,
  // LLM reranks the small set. Backed by Paper 2 "From BM25 to Corrective RAG"
  // showing hybrid+rerank is the largest single-stage improvement for retrieval.
  // ===========================================================================

  // Step 1: BM25 retrieval is always run (~1-2ms). Used by Path A, Path B candidates,
  // and the fallback best-effort list. Timing starts here so Path A and Path A2
  // both report the actual BM25 cost in searchDurationMs.
  const routeStart = performance.now()
  const bm25Candidates = runBm25Search(allTools, query, RERANK_TOP_N)

  // ── Path A: no intent → pure BM25, return immediately ──
  if (!intent?.trim()) {
    return formatBm25Results(bm25Candidates, limit, performance.now() - routeStart, {
      query,
    })
  }

  // ── Path A2: BM25 top-1 high-confidence short-circuit ──
  //
  // When BM25 top-1 is clearly dominant (high absolute score AND large gap
  // to top-2), trust the lexical match and skip LLM rerank entirely.
  // Avoids 8-33s LLM call when BM25 is already certain.
  //
  // Both conditions required:
  //   - top1Score >= 8.0  (filters out fuzzy matches scoring 4-8)
  //   - top1Score - top2Score >= 4.0  (filters out queries where top-2 is close)
  //
  // See TOP1_CONFIDENCE_SCORE / TOP1_TOP2_GAP for the empirical basis.
  if (bm25Candidates.length >= 2) {
    const top1Score = bm25Candidates[0].score
    const top2Score = bm25Candidates[1].score
    if (
      top1Score >= TOP1_CONFIDENCE_SCORE &&
      top1Score - top2Score >= TOP1_TOP2_GAP
    ) {
      return formatBm25Results(bm25Candidates, limit, performance.now() - routeStart, {
        query,
        intent,
        shortCircuited: 'top1_confidence',
        bm25Top1Score: Math.round(top1Score * 1000) / 1000,
        // The gap that actually triggered A2. Logged for offline threshold
        // tuning (TOP1_CONFIDENCE_SCORE / TOP1_TOP2_GAP).
        // Note: we cannot know "would rerank have overridden?" without
        // actually calling rerank — that's why this metric doesn't exist.
        top1Top2Gap: Math.round((top1Score - top2Score) * 1000) / 1000,
      })
    }
  }

  // ── Path B & C require an LLM provider. If missing, skip directly to Fallback. ──
  //
  // Single hoisted check (vs checking inside each path) prevents the double
  // "no provider" warn that the old per-path structure produced.
  const provider = context.provider
  if (!provider) {
    console.warn('[search_tools] no provider in ToolContext, skipping rerank and semantic paths')
  } else {
    // ── Path B: BM25 sufficient AND no CJK → BM25 + LLM rerank ──
    //
    // Skip when:
    //   - Query contains CJK chars (BM25 has no Chinese tokenization)
    //   - BM25 returned fewer than MIN_RECALL candidates (lexical match is poor)
    if (!hasCJK(query) && bm25Candidates.length >= MIN_RECALL) {
      const rerankStart = performance.now()
      try {
        const { runReranker } = await import('./subagents/tool-searcher')

        // Adapt BM25 candidates to RerankCandidate shape (include BM25 score for context)
        const rerankCandidates = bm25Candidates.map(c => ({
          fullName: c.tool.fullName,
          description: c.tool.description,
          source: c.tool.source,
          sourceId: c.tool.sourceId,
          bm25Score: c.score,
        }))

        const result = await runReranker(
          { intent, candidates: rerankCandidates, topK: limit },
          { provider, signal: context.abortSignal }
        )

        if (result && result.tools.length > 0) {
          const { results: enriched, notFound } = enrichWithCatalog(result.tools, allTools, limit)

          if (notFound.length > 0) {
            console.warn('[search_tools] rerank results included unknown tool names:', notFound)
          }

          // Instrumentation: did the rerank change the top-1 from what BM25
          // originally said? Useful for offline analysis of rerank accuracy.
          //   - High override rate  → BM25 is missing signals, rerank adds value
          //   - Zero override rate  → rerank is rubber-stamping, maybe redundant
          // bm25Top1 is the BM25 top-1 full name (null if no candidates).
          // The rerank top-1 is results[0].fullName in the response.
          const bm25Top1 = bm25Candidates[0]?.tool.fullName ?? null
          const rerankTop1 = enriched[0]?.fullName ?? null
          const rerankOverrodeTop1 =
            bm25Top1 !== null && rerankTop1 !== null && bm25Top1 !== rerankTop1

          return toolOkJson('search_tools', {
            status: 'ok',
            results: enriched,
            total: enriched.length,
            query,
            intent,
            searchMode: 'bm25_rerank',
            searchDurationMs: Math.round(performance.now() - rerankStart),
            bm25Top1,
            rerankOverrodeTop1,
          })
        }

        // Rerank returned no results — fall through to Path C
      } catch (error) {
        console.error('[search_tools] Rerank failed, falling back to semantic:', error)
      }
    }

    // ── Path C: full LLM semantic search (CJK query or BM25 insufficient) ──
    const semanticStart = performance.now()
    try {
      const { runToolSearcher } = await import('./subagents/tool-searcher')

      const descLines = allTools
        .map(t => `## ${t.fullName}\n${t.description || '(no description)'}\nSource: ${t.source} (${t.sourceId})`)
        .join('\n\n')

      const result = await runToolSearcher(
        { query: intent, allToolDescriptionsText: descLines },
        { provider, signal: context.abortSignal }
      )

      if (result && result.tools.length > 0) {
        const { results: enriched, notFound } = enrichWithCatalog(result.tools, allTools, limit)

        if (notFound.length > 0) {
          console.warn('[search_tools] semantic results included unknown tool names:', notFound)
        }

        // Mirror Path B instrumentation: did semantic pick something different
        // from BM25's top-1? High override rate means BM25 recall is poor for
        // CJK / low-recall queries — useful for tuning MIN_RECALL.
        // Unlike Path B, semantic sees ALL tools (~137), not just BM25 top-20,
        // so an override here can come from outside BM25's candidate set.
        const cBm25Top1 = bm25Candidates[0]?.tool.fullName ?? null
        const cSemanticTop1 = enriched[0]?.fullName ?? null
        const semanticOverrodeBm25 =
          cBm25Top1 !== null && cSemanticTop1 !== null && cBm25Top1 !== cSemanticTop1

        return toolOkJson('search_tools', {
          status: 'ok',
          results: enriched,
          total: enriched.length,
          query,
          intent,
          searchMode: 'semantic',
          searchDurationMs: Math.round(performance.now() - semanticStart),
          bm25Top1: cBm25Top1,
          semanticOverrodeBm25,
        })
      }

      // Semantic returned no results — fall through to Fallback
    } catch (error) {
      console.error('[search_tools] Semantic search failed, falling back to BM25 best-effort:', error)
    }
  }

  // ── Fallback: BM25 best-effort when all LLM paths failed ──
  //
  // Returns BM25 top-K with explicit `status: no_match` so the calling agent
  // sees this is a failure (not a legitimate empty result) and avoids
  // hallucinating tool names.
  const fallback = bm25Candidates.slice(0, Math.min(FALLBACK_TOP_K, limit))
  return toolOkJson('search_tools', {
    status: 'no_match',
    results: fallback.map(c => ({
      fullName: c.tool.fullName,
      source: c.tool.source,
      sourceId: c.tool.sourceId,
      description: c.tool.description.slice(0, 300),
      inputSchema: c.tool.inputSchema,
      score: Math.round(c.score * 1000) / 1000,  // Round to 3 decimals for readability
    })),
    total: fallback.length,
    query,
    intent,
    searchMode: 'fallback',
    // Schema consistency: every path reports bm25Top1.
    // In Fallback this equals results[0].fullName (no LLM step happened).
    bm25Top1: fallback[0]?.tool.fullName ?? null,
    message: 'No tools matched after semantic search. Showing top lexical candidates as best-effort.',
    suggestion: 'Try different keywords or check the tool documentation.',
  })
}

//=============================================================================
// Tool 2: call_tool
//=============================================================================

export const callToolDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'call_tool',
    description:
      'Execute an external tool (MCP or WebMCP) with the provided arguments. ' +
      'Use search_tools first to discover tools and get their parameter schemas.',
    parameters: {
      type: 'object',
      properties: {
        full_tool_name: {
          type: 'string',
          description:
            'The full tool name returned by search_tools ' +
            '(e.g. "openpencil:get_node" or "workspace_jianguoyun_com__fetch_ticket_messages").',
        },
        args: {
          type: 'object',
          description:
            "Arguments matching the tool's inputSchema returned by search_tools.",
        },
      },
      required: ['full_tool_name'],
    },
  },
}

export const callToolExecutor: ToolExecutor = async (args, context) => {
  const { full_tool_name, args: toolArgs } = args as {
    full_tool_name: string
    args?: Record<string, unknown>
  }

  const allTools = collectAllExternalTools()
  const tool = allTools.find(t => t.fullName === full_tool_name)

  if (!tool) {
    return toolErrorJson(
      'call_tool',
      'TOOL_NOT_FOUND',
      `Tool "${full_tool_name}" not found. Use search_tools to discover available tools.`,
      { retryable: true }
    )
  }

  if (tool.source === 'mcp') {
    return executeMCPTool(tool, toolArgs || {})
  } else {
    return executeWebMCPTool(tool, toolArgs || {}, context as unknown as Record<string, unknown>)
  }
}

//=============================================================================
// MCP Execution
//=============================================================================

async function executeMCPTool(
  tool: UnifiedToolEntry,
  toolArgs: Record<string, unknown>
): Promise<string> {
  const serverId = tool.sourceId
  const toolName = tool.name

  const manager = getMCPManager()
  const allTools = manager.getAllTools()
  const serverTools = allTools.get(serverId)

  if (!serverTools) {
    return toolErrorJson(
      'call_tool',
      'SERVER_NOT_FOUND',
      `MCP server "${serverId}" is not connected. Available servers: ${Array.from(allTools.keys()).join(', ') || '(none)'}.`,
      { retryable: true }
    )
  }

  const toolDef = serverTools.find(t => t.name === toolName)
  if (!toolDef) {
    return toolErrorJson(
      'call_tool',
      'TOOL_NOT_FOUND',
      `MCP tool "${tool.fullName}" not found on server ${serverId}.`,
      { retryable: true }
    )
  }

  try {
    const result = await manager.executeTool(serverId, toolName, toolArgs)

    if (typeof result === 'string') {
      return toolOkJson('call_tool', { text: result, fullToolName: tool.fullName })
    }

    if (result && typeof result === 'object') {
      const mcpResult = result as {
        content?: Array<{ type: string; text?: string }>
        isError?: boolean
      }

      if (mcpResult.isError) {
        const errorContent = Array.isArray(mcpResult.content)
          ? mcpResult.content
              .filter(item => item.type === 'text' && item.text)
              .map(item => item.text)
              .join('\n')
          : undefined
        return toolErrorJson(
          'call_tool',
          'MCP_TOOL_ERROR',
          errorContent || 'Unknown MCP tool error',
          { retryable: true, details: { fullToolName: tool.fullName } }
        )
      }

      if (Array.isArray(mcpResult.content)) {
        const textParts = mcpResult.content
          .filter(item => item.type === 'text' && item.text)
          .map(item => item.text)

        if (textParts.length > 0) {
          return toolOkJson('call_tool', {
            text: textParts.join('\n\n'),
            fullToolName: tool.fullName,
          })
        }
      }

      return toolOkJson('call_tool', { result, fullToolName: tool.fullName })
    }

    return toolOkJson('call_tool', { result, fullToolName: tool.fullName })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return toolErrorJson('call_tool', 'MCP_EXECUTION_FAILED', message, {
      retryable: true,
      details: { fullToolName: tool.fullName },
    })
  }
}

//=============================================================================
// WebMCP Execution
//=============================================================================

async function executeWebMCPTool(
  tool: UnifiedToolEntry,
  toolArgs: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<string> {
  const bridge = getWebMCPBridge()
  if (!bridge) {
    return toolErrorJson(
      'call_tool',
      'WEBMCP_BRIDGE_UNAVAILABLE',
      'Browser extension WebMCP bridge is unavailable'
    )
  }

  const store = useWebMCPStore.getState()
  const enabledTools = store.getEnabledTools()
  const toolMap = new Map(enabledTools.map(t => [t.fullName, t]))
  const toolInfo = toolMap.get(tool.fullName)

  if (!toolInfo) {
    return toolErrorJson(
      'call_tool',
      'TOOL_NOT_FOUND',
      `WebMCP tool "${tool.fullName}" is no longer available. ` +
      `The browser tab may have been closed — ask the user to reopen the page.`,
      { retryable: true }
    )
  }

  const validationError = validateToolArgs(tool.fullName, toolArgs, toolInfo.inputSchema)
  if (validationError) return validationError

  const hostname = toolInfo.hostname
  const preferredTabId = hostname
    ? store.getPreferredTabIdForHost(hostname)
    : undefined

  try {
    const response = await bridge.webMCPInvoke({
      fullToolName: tool.fullName,
      args: toolArgs,
      preferredTabId,
    })

    if (!response.ok) {
      return toolErrorJson(
        'call_tool',
        response.errorCode || 'WEBMCP_INVOKE_FAILED',
        response.error || 'WebMCP tool invocation failed',
        {
          retryable: true,
          details: {
            fullToolName: tool.fullName,
            tabId: response.tabId,
            hostname: response.hostname,
          },
        }
      )
    }

    // Handle plugin download
    if (response.pluginDownloadPlan) {
      if (!bridge.webMCPPluginDownloadStream || !bridge.webMCPPluginDownloadFinalize) {
        return toolErrorJson(
          'call_tool',
          'WEBMCP_PLUGIN_DOWNLOAD_UNSUPPORTED',
          'Plugin download is not supported by this browser extension version.',
          { retryable: false }
        )
      }
      try {
        const saveResult = await consumeAndSavePluginDownload(
          bridge,
          response.pluginDownloadPlan,
          context as any
        )

        const finalizeResp = await bridge.webMCPPluginDownloadFinalize({
          transferId: response.pluginDownloadPlan.transferId,
          savedPath: saveResult.savedPath,
        })
        if (!finalizeResp?.ok) {
          return toolErrorJson(
            'call_tool',
            'WEBMCP_PLUGIN_DOWNLOAD_FINALIZE_FAILED',
            finalizeResp?.error || 'Plugin download finalize failed',
            { retryable: true }
          )
        }

        try {
          const { useAssetInventoryStore } = await import('@/store/asset-inventory.store')
          useAssetInventoryStore.getState().refresh().catch(() => {})
        } catch {}

        return toolOkJson('call_tool', {
          result: saveResult.patchedResult,
          fullToolName: tool.fullName,
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
        return toolErrorJson('call_tool', 'WEBMCP_PLUGIN_DOWNLOAD_FAILED', message, {
          retryable: true,
        })
      }
    }

    return toolOkJson('call_tool', {
      result: response.result,
      fullToolName: tool.fullName,
      hostname: response.hostname,
      tabId: response.tabId,
      apiMode: response.apiMode,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return toolErrorJson('call_tool', 'WEBMCP_INVOKE_FAILED', message, { retryable: true })
  }
}

//=============================================================================
// Zod Validation
//=============================================================================

function validateToolArgs(
  fullToolName: string,
  args: Record<string, unknown>,
  inputSchema: Record<string, unknown>
): string | null {
  try {
    const zodSchema = convertJsonSchemaToZod(inputSchema)
    zodSchema.parse(args)
    return null
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => {
        const path = issue.path.join('.') || '(root)'
        return `  - "${path}": ${issue.message}`
      }).join('\n')

      return toolErrorJson(
        'call_tool',
        'SCHEMA_VALIDATION_FAILED',
        `Invalid arguments for "${fullToolName}":\n${issues}\n\nCheck the inputSchema from search_tools.`,
        { retryable: false }
      )
    }
    return null
  }
}

//=============================================================================
// Exports
//=============================================================================

//=============================================================================
// Prompt Doc + Summary
//=============================================================================

/** Prompt doc for unified external tools */
export const unifiedExternalToolsPromptDoc: ToolPromptDoc = {
  category: 'external-tools',
  section: '### External Tools (MCP + WebMCP)',
  lines: [
    '- `search_tools(query?, intent?, limit?)` — Search external tools. query: keywords (BM25, fast). intent: task description (semantic, smarter). At least one required. Prefer intent when unsure which tool to use.',
    '- `call_tool(full_tool_name, args)` — Execute an external tool. Use the fullName and inputSchema from search_tools results.',
  ],
}

/**
 * Build a compact summary of available external tools for the system prompt.
 * Only lists service names and tool counts — the LLM uses search_tools for details.
 */
export function buildCompactExternalToolsSummary(): string {
  const tools = collectAllExternalTools()

  if (tools.length === 0) return ''

  const mcpTools = tools.filter(t => t.source === 'mcp')
  const webmcpTools = tools.filter(t => t.source === 'webmcp')

  const lines: string[] = []

  if (mcpTools.length > 0) {
    const servers = new Map<string, number>()
    for (const t of mcpTools) {
      servers.set(t.sourceId, (servers.get(t.sourceId) || 0) + 1)
    }
    lines.push(`**MCP Servers** (${mcpTools.length} tools):`)
    for (const [serverId, count] of servers) {
      lines.push(`  - ${serverId}: ${count} tools`)
    }
  }

  if (webmcpTools.length > 0) {
    const hosts = new Map<string, number>()
    for (const t of webmcpTools) {
      hosts.set(t.sourceId, (hosts.get(t.sourceId) || 0) + 1)
    }
    lines.push(`**WebMCP Pages** (${webmcpTools.length} tools):`)
    for (const [hostname, count] of hosts) {
      lines.push(`  - ${hostname}: ${count} tools`)
    }
  }

  return lines.join('\n')
}
