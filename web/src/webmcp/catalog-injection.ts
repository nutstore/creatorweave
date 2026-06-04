/**
 * WebMCP Catalog Injection - Builds the <available_webmcp> system prompt block
 *
 * Generates a lightweight XML block listing all discovered WebMCP tools
 * (name + one-line description only, no inputSchema).
 * The LLM uses this catalog to identify target tools, then calls
 * webmcp_get_tool_schema to fetch full parameter definitions on demand.
 *
 * This is the WebMCP equivalent of skills/skill-injection.ts.
 */

import { useWebMCPStore } from './store'
import { useSettingsStore } from '@/store/settings.store'
import type { WebMCPDiscoveredTool, WebMCPHostCatalog } from './types'

//=============================================================================
// Types
//=============================================================================

export interface CatalogInjectionOptions {
  /** Max number of tool entries per host (prevents oversized blocks) */
  maxToolsPerHost?: number
  /** Max total tool entries across all hosts */
  maxTotalTools?: number
}

//=============================================================================
// Catalog Block Generation
//=============================================================================

const DEFAULT_MAX_TOOLS_PER_HOST = 100
const DEFAULT_MAX_TOTAL_TOOLS = 300

/**
 * Build the <available_webmcp> XML block for system prompt injection.
 * Returns an empty string if WebMCP is disabled or no tools are discovered.
 */
export function buildAvailableWebMCPBlock(options?: CatalogInjectionOptions): string {
  if (!useSettingsStore.getState().enableWebMCP) return ''

  const store = useWebMCPStore.getState()
  const enabledTools = store.getEnabledTools()

  if (enabledTools.length === 0) return ''

  const maxPerHost = options?.maxToolsPerHost ?? DEFAULT_MAX_TOOLS_PER_HOST
  const maxTotal = options?.maxTotalTools ?? DEFAULT_MAX_TOTAL_TOOLS

  // Group by hostname
  const hosts = groupByHost(enabledTools)

  let totalTools = 0
  let serversBlock = ''
  let truncated = false

  for (const [hostname, catalog] of hosts) {
    if (totalTools >= maxTotal) {
      truncated = true
      break
    }

    const tools = catalog.tools
    const displayTools = tools.slice(0, Math.min(maxPerHost, maxTotal - totalTools))
    const remaining = tools.length - displayTools.length

    serversBlock += formatServerBlock(hostname, catalog, displayTools, remaining)
    totalTools += displayTools.length

    if (remaining > 0) truncated = true
  }

  if (!serversBlock) return ''

  return `<available_webmcp>

## Active WebMCP Servers

${serversBlock}
${truncated ? `\n> Showing ${totalTools} of ${enabledTools.length} tools. Use webmcp_get_tool_schema to get the full parameter schema of any tool listed above.\n` : ''}
</available_webmcp>`
}

//=============================================================================
// Helpers
//=============================================================================

function groupByHost(tools: WebMCPDiscoveredTool[]): Map<string, WebMCPHostCatalog> {
  const grouped = new Map<string, WebMCPHostCatalog>()

  for (const tool of tools) {
    const existing = grouped.get(tool.hostname)
    if (!existing) {
      grouped.set(tool.hostname, {
        hostname: tool.hostname,
        tools: [tool],
        lastDiscoveredAt: tool.discoveredAt,
        tabs: [{
          tabId: tool.tabId,
          title: tool.tabTitle || '',
          url: tool.tabUrl || '',
          lastSeenAt: tool.discoveredAt,
        }],
      })
      continue
    }

    existing.tools.push(tool)
    existing.lastDiscoveredAt = Math.max(existing.lastDiscoveredAt, tool.discoveredAt)

    const tab = existing.tabs.find(t => t.tabId === tool.tabId)
    if (tab) {
      tab.lastSeenAt = Math.max(tab.lastSeenAt, tool.discoveredAt)
      if (!tab.title && tool.tabTitle) tab.title = tool.tabTitle
      if (!tab.url && tool.tabUrl) tab.url = tool.tabUrl
    } else {
      existing.tabs.push({
        tabId: tool.tabId,
        title: tool.tabTitle || '',
        url: tool.tabUrl || '',
        lastSeenAt: tool.discoveredAt,
      })
    }
  }

  // Sort tools within each host by fullName
  for (const catalog of grouped.values()) {
    catalog.tools.sort((a, b) => a.fullName.localeCompare(b.fullName))
  }

  return grouped
}

function formatServerBlock(
  hostname: string,
  catalog: WebMCPHostCatalog,
  tools: WebMCPDiscoveredTool[],
  remaining: number
): string {
  const tabTitle = catalog.tabs[0]?.title || hostname
  const totalCount = catalog.tools.length

  let block = `<server hostname="${hostname}" title="${escapeXml(tabTitle)}" tools="${totalCount}">\n`

  for (const tool of tools) {
    const desc = escapeXml(tool.description?.trim() || 'No description available.')
    block += `\n<tool name="${escapeXml(tool.fullName)}">\n${desc}\n</tool>\n`
  }

  if (remaining > 0) {
    block += `\n<!-- ... ${remaining} more tool(s) omitted for brevity -->\n`
  }

  block += `\n</server>\n\n`
  return block
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
