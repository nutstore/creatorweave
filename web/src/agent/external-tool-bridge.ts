/**
 * Unified External Tool Bridge
 *
 * 2 unified tools that replace the old 4 (mcp_get_tool_schema, mcp_call,
 * webmcp_get_tool_schema, webmcp_call):
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
// Tool 1: search_tools (search + schema in one call)
//=============================================================================

export const searchToolsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_tools',
    description:
      'Search for external tools (MCP and WebMCP) by keyword. ' +
      'Returns matching tools with their full parameter schemas, ready to call. ' +
      'No need to call a separate schema tool — just search, pick, and call.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search query — keywords describing what you need ' +
            '(e.g. "weather", "ticket message", "figma node", "send email"). ' +
            'Supports multi-word queries for better results.',
        },
        source: {
          type: 'string',
          enum: ['all', 'mcp', 'webmcp'],
          description:
            'Filter by tool source. "mcp" = page-outside MCP servers, "webmcp" = page API tools. Default: "all".',
        },
        use_subagent: {
          type: 'boolean',
          description:
            'When true, use an LLM-powered subagent for semantic search instead of BM25 keyword matching. ' +
            'Use this when BM25 results are poor or when the query is in a different language than the tool descriptions. ' +
            'Default: false (BM25, faster).',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (max 10). Default: 5.',
        },
      },
      required: ['query'],
    },
  },
}

export const searchToolsExecutor: ToolExecutor = async (args, context) => {
  const { query, source: sourceFilter = 'all', use_subagent = false, limit = 5 } = args as {
    query: string
    source?: 'all' | 'mcp' | 'webmcp'
    use_subagent?: boolean
    limit?: number
  }

  const allTools = collectAllExternalTools()

  if (allTools.length === 0) {
    return toolOkJson('search_tools', {
      results: [],
      total: 0,
      message: 'No external tools available. Connect an MCP server or open a WebMCP-enabled page.',
    })
  }

  // ── Subagent semantic search path ──
  if (use_subagent) {
    try {
      const { runToolSearcher } = await import('./subagents/tool-searcher')

      // Build the descriptions text for the subagent prompt
      const descLines = allTools
        .filter(t => sourceFilter === 'all' || t.source === sourceFilter)
        .map(t => `## ${t.fullName}\n${t.description || '(no description)'}\nSource: ${t.source} (${t.sourceId})`)
        .join('\n\n')

      // Use the main agent's provider directly (passed via ToolContext)
      const provider = context.provider

      if (!provider) {
        console.warn('[search_tools] use_subagent=true but no provider in ToolContext, falling back to BM25')
      } else {

        const result = await runToolSearcher(
          { query, allToolDescriptionsText: descLines },
          { provider }
        )

        if (result && result.tools.length > 0) {
          // Look up source info from the tool catalog (not from subagent)
          const toolCatalog = new Map(allTools.map(t => [t.fullName, t]))
          return toolOkJson('search_tools', {
            results: result.tools.slice(0, Math.min(limit, 10)).map(t => {
              const catalogEntry = toolCatalog.get(t.full_tool_name)
              return {
                fullName: t.full_tool_name,
                source: catalogEntry?.source || 'webmcp',
                sourceId: catalogEntry?.sourceId || '',
                description: t.description.slice(0, 300),
                inputSchema: t.input_schema,
                relevanceReason: t.relevance_reason,
              }
            }),
            total: result.tools.length,
            query,
            searchMode: 'subagent',
          })
        }

        // Subagent returned no results — fall through to BM25
      }
    } catch (error) {
      console.error('[search_tools] Subagent search failed, falling back to BM25:', error)
    }
  }

  // ── BM25 keyword search path (default) ──

  // Filter by source
  let filtered = allTools
  if (sourceFilter !== 'all') {
    filtered = allTools.filter(t => t.source === sourceFilter)
  }

  // Build search texts and BM25 index
  const searchItems = filtered.map(tool => ({
    tool,
    searchText: `${tool.fullName} ${tool.description} ${tool.sourceId}`,
    nameText: tool.fullName,
  }))

  const index = new BM25Index()
  index.build(searchItems.map(item => item.searchText))

  // Score and rank
  const queryTokens = tokenize(query)
  const scored = searchItems
    .map((item, i) => ({
      tool: item.tool,
      score: index.score(i, queryTokens, item.nameText),
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(limit, 10))

  // Return full tool info including inputSchema — no second call needed
  const results = scored.map(s => ({
    fullName: s.tool.fullName,
    source: s.tool.source,
    sourceId: s.tool.sourceId,
    description: s.tool.description.slice(0, 300),
    inputSchema: s.tool.inputSchema,
  }))

  return toolOkJson('search_tools', {
    results,
    total: results.length,
    query,
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
    return executeWebMCPTool(tool, toolArgs || {}, context)
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
    '- `search_tools(query, source?, limit?)` — Search external tools by keyword. Returns matching tools with full parameter schemas. Use this to discover and inspect tools.',
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
