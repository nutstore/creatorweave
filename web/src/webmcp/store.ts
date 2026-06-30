import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { buildHostCatalog } from './catalog-normalizer'
import type {
  WebMCPDiscoveredTool,
  WebMCPHostCatalog,
  WebMCPRegisteredTool,
  WebMCPToolGroupCatalog,
} from './types'

type ToolRouteMap = Record<string, number>

interface WebMCPState {
  enabledByHost: Record<string, boolean>
  enabledByGroup: Record<string, boolean>
  catalogByHost: Record<string, WebMCPHostCatalog>
  discoveredTools: WebMCPDiscoveredTool[]
  preferredTabByGroup: Record<string, number>
  preferredTabByTool: ToolRouteMap
  lastScanAt: number | null

  setHostEnabled: (hostname: string, enabled: boolean) => void
  setGroupEnabled: (groupKey: string, enabled: boolean) => void
  isHostEnabled: (hostname: string) => boolean
  isGroupEnabled: (groupKey: string) => boolean
  setDiscoveredTools: (tools: WebMCPDiscoveredTool[], scannedAt: number) => void
  clearCatalog: () => void
  getAllTools: () => WebMCPRegisteredTool[]
  getEnabledTools: () => WebMCPRegisteredTool[]
  getEnabledGroups: () => WebMCPToolGroupCatalog[]
  getGroupByKey: (groupKey: string) => WebMCPToolGroupCatalog | undefined
  getPreferredTabIdForGroup: (groupKey: string) => number | undefined
  getPreferredTabIdForTool: (groupKey: string, fullName: string) => number | undefined
  recordToolInvocation: (groupKey: string, fullName: string, tabId: number) => void
}

function buildToolRouteKey(groupKey: string, fullName: string): string {
  return `${groupKey}__${fullName}`
}

function rebuildCatalog(state: Pick<
  WebMCPState,
  'discoveredTools' | 'preferredTabByGroup' | 'preferredTabByTool'
>): Record<string, WebMCPHostCatalog> {
  return buildHostCatalog(state.discoveredTools, {
    preferredTabByGroup: state.preferredTabByGroup,
    preferredTabByTool: state.preferredTabByTool,
  })
}

export const useWebMCPStore = create<WebMCPState>()(
  persist(
    (set, get) => ({
      enabledByHost: {},
      enabledByGroup: {},
      catalogByHost: {},
      discoveredTools: [],
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

      setDiscoveredTools: (tools, scannedAt) => {
        set((state) => ({
          discoveredTools: tools,
          catalogByHost: buildHostCatalog(tools, {
            preferredTabByGroup: state.preferredTabByGroup,
            preferredTabByTool: state.preferredTabByTool,
          }),
          lastScanAt: scannedAt,
        }))
      },

      clearCatalog: () => set({
        catalogByHost: {},
        discoveredTools: [],
        lastScanAt: null,
      }),

      getAllTools: () =>
        Object.values(get().catalogByHost).flatMap((host) =>
          host.groups.flatMap((group) => group.registeredTools),
        ),

      getEnabledGroups: () => {
        const state = get()
        return Object.values(state.catalogByHost)
          .filter((host) => state.isHostEnabled(host.hostname))
          .flatMap((host) => host.groups.filter((group) => state.isGroupEnabled(group.groupKey)))
      },

      getEnabledTools: () => get().getEnabledGroups().flatMap((group) => group.registeredTools),

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
        set((state) => {
          const nextState = {
            preferredTabByGroup: { ...state.preferredTabByGroup, [groupKey]: tabId },
            preferredTabByTool: { ...state.preferredTabByTool, [routeKey]: tabId },
          }

          return {
            ...nextState,
            catalogByHost: rebuildCatalog({
              discoveredTools: state.discoveredTools,
              preferredTabByGroup: nextState.preferredTabByGroup,
              preferredTabByTool: nextState.preferredTabByTool,
            }),
          }
        })
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
