import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  WebMCPDiscoveredTool,
  WebMCPHostCatalog,
  WebMCPToolGroupCatalog,
  WebMCPTabInstance,
} from './types'

type ToolRouteMap = Record<string, number>

interface WebMCPState {
  enabledByHost: Record<string, boolean>
  enabledByGroup: Record<string, boolean>
  catalogByHost: Record<string, WebMCPHostCatalog>
  preferredTabByGroup: Record<string, number>
  preferredTabByTool: ToolRouteMap
  lastScanAt: number | null

  setHostEnabled: (hostname: string, enabled: boolean) => void
  setGroupEnabled: (groupKey: string, enabled: boolean) => void
  isHostEnabled: (hostname: string) => boolean
  isGroupEnabled: (groupKey: string) => boolean
  setCatalog: (tools: WebMCPDiscoveredTool[], scannedAt: number) => void
  clearCatalog: () => void
  getAllTools: () => WebMCPDiscoveredTool[]
  getEnabledTools: () => WebMCPDiscoveredTool[]
  getEnabledGroups: () => WebMCPToolGroupCatalog[]
  getGroupByKey: (groupKey: string) => WebMCPToolGroupCatalog | undefined
  getPreferredTabIdForGroup: (groupKey: string) => number | undefined
  getPreferredTabIdForTool: (groupKey: string, fullName: string) => number | undefined
  recordToolInvocation: (groupKey: string, fullName: string, tabId: number) => void
}

function buildToolRouteKey(groupKey: string, fullName: string): string {
  return `${groupKey}__${fullName}`
}

function createDisplayName(index: number): string {
  return `Tool Group ${index}`
}

function buildTabs(tools: WebMCPDiscoveredTool[]): WebMCPTabInstance[] {
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
  return Array.from(tabs.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

function groupByHost(tools: WebMCPDiscoveredTool[]): Record<string, WebMCPHostCatalog> {
  const hostMap = new Map<
    string,
    {
      hostname: string
      lastDiscoveredAt: number
      groups: Map<string, WebMCPToolGroupCatalog>
    }
  >()

  for (const tool of tools) {
    let hostEntry = hostMap.get(tool.hostname)
    if (!hostEntry) {
      hostEntry = {
        hostname: tool.hostname,
        lastDiscoveredAt: tool.discoveredAt,
        groups: new Map<string, WebMCPToolGroupCatalog>(),
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
        displayName: '',
        tools: [],
        tabs: [],
        lastDiscoveredAt: tool.discoveredAt,
      }
      hostEntry.groups.set(tool.groupKey, groupEntry)
    }

    groupEntry.lastDiscoveredAt = Math.max(groupEntry.lastDiscoveredAt, tool.discoveredAt)
    groupEntry.tools.push(tool)
  }

  const result: Record<string, WebMCPHostCatalog> = {}
  for (const [hostname, hostEntry] of hostMap) {
    const groups = Array.from(hostEntry.groups.values())
      .map((group) => ({
        ...group,
        tools: group.tools.sort((a, b) => a.fullName.localeCompare(b.fullName)),
        tabs: buildTabs(group.tools),
      }))
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

export const useWebMCPStore = create<WebMCPState>()(
  persist(
    (set, get) => ({
      enabledByHost: {},
      enabledByGroup: {},
      catalogByHost: {},
      preferredTabByGroup: {},
      preferredTabByTool: {},
      lastScanAt: null,

      setHostEnabled: (hostname, enabled) => {
        const normalized = hostname.trim().toLowerCase()
        if (!normalized) return
        set((state) => ({
          enabledByHost: { ...state.enabledByHost, [normalized]: enabled },
        }))
      },

      setGroupEnabled: (groupKey, enabled) => {
        const normalized = groupKey.trim()
        if (!normalized) return
        set((state) => ({
          enabledByGroup: { ...state.enabledByGroup, [normalized]: enabled },
        }))
      },

      isHostEnabled: (hostname) => {
        const normalized = hostname.trim().toLowerCase()
        if (!normalized) return false
        const value = get().enabledByHost[normalized]
        return value !== false
      },

      isGroupEnabled: (groupKey) => {
        const normalized = groupKey.trim()
        if (!normalized) return false
        const value = get().enabledByGroup[normalized]
        return value !== false
      },

      setCatalog: (tools, scannedAt) => {
        set({
          catalogByHost: groupByHost(tools),
          lastScanAt: scannedAt,
        })
      },

      clearCatalog: () => set({ catalogByHost: {}, lastScanAt: null }),

      getAllTools: () => Object.values(get().catalogByHost).flatMap((host) => host.groups.flatMap((group) => group.tools)),

      getEnabledGroups: () => {
        const state = get()
        return Object.values(state.catalogByHost)
          .filter((host) => state.isHostEnabled(host.hostname))
          .flatMap((host) => host.groups.filter((group) => state.isGroupEnabled(group.groupKey)))
      },

      getEnabledTools: () => get().getEnabledGroups().flatMap((group) => group.tools),

      getGroupByKey: (groupKey) => {
        const state = get()
        for (const host of Object.values(state.catalogByHost)) {
          const group = host.groups.find((entry) => entry.groupKey === groupKey)
          if (group) return group
        }
        return undefined
      },

      getPreferredTabIdForGroup: (groupKey) => {
        const state = get()
        const remembered = state.preferredTabByGroup[groupKey]
        if (typeof remembered === 'number') return remembered
        const group = state.getGroupByKey(groupKey)
        return group?.tabs[0]?.tabId
      },

      getPreferredTabIdForTool: (groupKey, fullName) => {
        const state = get()
        const routeKey = buildToolRouteKey(groupKey, fullName)
        const remembered = state.preferredTabByTool[routeKey]
        if (typeof remembered === 'number') return remembered
        return state.getPreferredTabIdForGroup(groupKey)
      },

      recordToolInvocation: (groupKey, fullName, tabId) => {
        const routeKey = buildToolRouteKey(groupKey, fullName)
        set((state) => ({
          preferredTabByGroup: { ...state.preferredTabByGroup, [groupKey]: tabId },
          preferredTabByTool: { ...state.preferredTabByTool, [routeKey]: tabId },
        }))
      },
    }),
    {
      name: 'creatorweave-webmcp-store',
      partialize: (state) => ({
        enabledByHost: state.enabledByHost,
        enabledByGroup: state.enabledByGroup,
        preferredTabByGroup: state.preferredTabByGroup,
        preferredTabByTool: state.preferredTabByTool,
      }),
    }
  )
)
