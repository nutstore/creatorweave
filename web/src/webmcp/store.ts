import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WebMCPDiscoveredTool, WebMCPHostCatalog } from './types'

interface WebMCPState {
  enabledByHost: Record<string, boolean>
  catalogByHost: Record<string, WebMCPHostCatalog>
  lastScanAt: number | null

  setHostEnabled: (hostname: string, enabled: boolean) => void
  isHostEnabled: (hostname: string) => boolean
  setCatalog: (tools: WebMCPDiscoveredTool[], scannedAt: number) => void
  clearCatalog: () => void
  getAllTools: () => WebMCPDiscoveredTool[]
  getEnabledTools: () => WebMCPDiscoveredTool[]
  getPreferredTabIdForHost: (hostname: string) => number | undefined
}

function groupByHost(tools: WebMCPDiscoveredTool[]): Record<string, WebMCPHostCatalog> {
  const grouped = new Map<string, WebMCPHostCatalog>()

  for (const tool of tools) {
    const existing = grouped.get(tool.hostname)
    if (!existing) {
      grouped.set(tool.hostname, {
        hostname: tool.hostname,
        tools: [tool],
        lastDiscoveredAt: tool.discoveredAt,
        tabs: [
          {
            tabId: tool.tabId,
            title: tool.tabTitle || '',
            url: tool.tabUrl || '',
            lastSeenAt: tool.discoveredAt,
          },
        ],
      })
      continue
    }

    existing.tools.push(tool)
    existing.lastDiscoveredAt = Math.max(existing.lastDiscoveredAt, tool.discoveredAt)

    const tab = existing.tabs.find((t) => t.tabId === tool.tabId)
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

  const result: Record<string, WebMCPHostCatalog> = {}
  for (const [host, catalog] of grouped) {
    catalog.tools.sort((a, b) => a.fullName.localeCompare(b.fullName))
    catalog.tabs.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    result[host] = catalog
  }

  return result
}

export const useWebMCPStore = create<WebMCPState>()(
  persist(
    (set, get) => ({
      enabledByHost: {},
      catalogByHost: {},
      lastScanAt: null,

      setHostEnabled: (hostname, enabled) => {
        const normalized = hostname.trim().toLowerCase()
        if (!normalized) return
        set((state) => ({
          enabledByHost: { ...state.enabledByHost, [normalized]: enabled },
        }))
      },

      isHostEnabled: (hostname) => {
        const normalized = hostname.trim().toLowerCase()
        if (!normalized) return false
        const value = get().enabledByHost[normalized]
        return value !== false
      },

      setCatalog: (tools, scannedAt) => {
        set({
          catalogByHost: groupByHost(tools),
          lastScanAt: scannedAt,
        })
      },

      clearCatalog: () => set({ catalogByHost: {}, lastScanAt: null }),

      getAllTools: () => {
        const grouped = get().catalogByHost
        return Object.values(grouped).flatMap((host) => host.tools)
      },

      getEnabledTools: () => {
        const state = get()
        return state
          .getAllTools()
          .filter((tool) => state.isHostEnabled(tool.hostname))
      },

      getPreferredTabIdForHost: (hostname) => {
        const host = get().catalogByHost[hostname]
        if (!host || host.tabs.length === 0) return undefined
        return host.tabs[0].tabId
      },
    }),
    {
      name: 'creatorweave-webmcp-store',
      partialize: (state) => ({
        enabledByHost: state.enabledByHost,
      }),
    }
  )
)

