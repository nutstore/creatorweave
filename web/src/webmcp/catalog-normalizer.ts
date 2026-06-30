import type {
  WebMCPDiscoveredTool,
  WebMCPHostCatalog,
  WebMCPRegisteredTool,
  WebMCPTabInstance,
} from './types'

export interface WebMCPPreferredTabState {
  preferredTabByGroup: Record<string, number>
  preferredTabByTool: Record<string, number>
}

function buildToolRouteKey(groupKey: string, fullName: string): string {
  return `${groupKey}__${fullName}`
}

function createDisplayName(index: number): string {
  return `Tool Group ${index}`
}

export function dedupeDiscoveredInstances(
  tools: WebMCPDiscoveredTool[],
): WebMCPDiscoveredTool[] {
  const deduped = new Map<string, WebMCPDiscoveredTool>()

  for (const tool of tools) {
    const key = `${tool.groupKey}__${tool.fullName}__${tool.tabId}`
    const existing = deduped.get(key)
    if (!existing || tool.discoveredAt > existing.discoveredAt) {
      deduped.set(key, tool)
    }
  }

  return Array.from(deduped.values())
}

export function buildTabs(tools: WebMCPDiscoveredTool[]): WebMCPTabInstance[] {
  const tabs = new Map<number, WebMCPTabInstance>()

  for (const tool of tools) {
    const existing = tabs.get(tool.tabId)
    if (existing) {
      existing.lastSeenAt = Math.max(existing.lastSeenAt, tool.discoveredAt)
      if (!existing.title && tool.tabTitle) existing.title = tool.tabTitle
      if (!existing.url && tool.tabUrl) existing.url = tool.tabUrl
      continue
    }

    tabs.set(tool.tabId, {
      tabId: tool.tabId,
      title: tool.tabTitle || '',
      url: tool.tabUrl || '',
      lastSeenAt: tool.discoveredAt,
    })
  }

  return Array.from(tabs.values()).sort((a, b) => {
    if (b.lastSeenAt !== a.lastSeenAt) return b.lastSeenAt - a.lastSeenAt
    return a.tabId - b.tabId
  })
}

function pickRepresentativeInstance(
  instances: WebMCPDiscoveredTool[],
  tabs: WebMCPTabInstance[],
  preferredState: WebMCPPreferredTabState,
): WebMCPDiscoveredTool {
  const preferredToolTabId =
    preferredState.preferredTabByTool[buildToolRouteKey(instances[0]!.groupKey, instances[0]!.fullName)]
  if (typeof preferredToolTabId === 'number') {
    const preferred = instances.find((instance) => instance.tabId === preferredToolTabId)
    if (preferred) return preferred
  }

  const preferredGroupTabId = preferredState.preferredTabByGroup[instances[0]!.groupKey]
  if (typeof preferredGroupTabId === 'number') {
    const preferred = instances.find((instance) => instance.tabId === preferredGroupTabId)
    if (preferred) return preferred
  }

  const firstTabId = tabs[0]?.tabId
  if (typeof firstTabId === 'number') {
    const preferred = instances.find((instance) => instance.tabId === firstTabId)
    if (preferred) return preferred
  }

  return [...instances].sort((a, b) => {
    if (b.discoveredAt !== a.discoveredAt) return b.discoveredAt - a.discoveredAt
    return a.tabId - b.tabId
  })[0]!
}

function buildRegisteredTools(
  tools: WebMCPDiscoveredTool[],
  tabs: WebMCPTabInstance[],
  preferredState: WebMCPPreferredTabState,
): WebMCPRegisteredTool[] {
  const grouped = new Map<string, WebMCPDiscoveredTool[]>()

  for (const tool of tools) {
    const key = `${tool.groupKey}__${tool.fullName}`
    const existing = grouped.get(key)
    if (existing) {
      existing.push(tool)
    } else {
      grouped.set(key, [tool])
    }
  }

  return Array.from(grouped.values())
    .map((instances) => {
      const representative = pickRepresentativeInstance(instances, tabs, preferredState)
      return {
        name: representative.name,
        description: representative.description,
        inputSchema: representative.inputSchema,
        annotations: representative.annotations,
        hostname: representative.hostname,
        groupKey: representative.groupKey,
        toolsetSignature: representative.toolsetSignature,
        fullName: representative.fullName,
        apiMode: representative.apiMode,
        representativeTabId: representative.tabId,
        representativeTabTitle: representative.tabTitle,
        representativeTabUrl: representative.tabUrl,
        discoveredAt: Math.max(...instances.map((instance) => instance.discoveredAt)),
      }
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export function buildHostCatalog(
  tools: WebMCPDiscoveredTool[],
  preferredState: WebMCPPreferredTabState,
): Record<string, WebMCPHostCatalog> {
  const hostMap = new Map<
    string,
    {
      hostname: string
      lastDiscoveredAt: number
      groups: Map<
        string,
        {
          groupKey: string
          hostname: string
          toolsetSignature: string
          lastDiscoveredAt: number
          instances: WebMCPDiscoveredTool[]
        }
      >
    }
  >()

  for (const tool of tools) {
    let hostEntry = hostMap.get(tool.hostname)
    if (!hostEntry) {
      hostEntry = {
        hostname: tool.hostname,
        lastDiscoveredAt: tool.discoveredAt,
        groups: new Map(),
      }
      hostMap.set(tool.hostname, hostEntry)
    }

    hostEntry.lastDiscoveredAt = Math.max(hostEntry.lastDiscoveredAt, tool.discoveredAt)

    let groupEntry = hostEntry.groups.get(tool.groupKey)
    if (!groupEntry) {
      groupEntry = {
        groupKey: tool.groupKey,
        hostname: tool.hostname,
        toolsetSignature: tool.toolsetSignature,
        lastDiscoveredAt: tool.discoveredAt,
        instances: [],
      }
      hostEntry.groups.set(tool.groupKey, groupEntry)
    }

    groupEntry.lastDiscoveredAt = Math.max(groupEntry.lastDiscoveredAt, tool.discoveredAt)
    groupEntry.instances.push(tool)
  }

  const result: Record<string, WebMCPHostCatalog> = {}
  for (const [hostname, hostEntry] of hostMap) {
    const groups = Array.from(hostEntry.groups.values())
      .map((group) => {
        const tabs = buildTabs(group.instances)
        return {
          groupKey: group.groupKey,
          hostname: group.hostname,
          toolsetSignature: group.toolsetSignature,
          displayName: '',
          registeredTools: buildRegisteredTools(group.instances, tabs, preferredState),
          tabs,
          lastDiscoveredAt: group.lastDiscoveredAt,
        }
      })
      .sort((a, b) => b.lastDiscoveredAt - a.lastDiscoveredAt)
      .map((group, index) => ({
        ...group,
        displayName: createDisplayName(index + 1),
      }))

    result[hostname] = {
      hostname,
      groups,
      lastDiscoveredAt: hostEntry.lastDiscoveredAt,
    }
  }

  return result
}
