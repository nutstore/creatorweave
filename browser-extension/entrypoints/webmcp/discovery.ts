import type { WebMCPApiMode, WebMCPDiscoverResponse, WebMCPDiscoveredTool } from './types'
import { buildWebMCPGroupKey } from './group-key'
import { buildToolsetSignature } from './toolset-signature'
import { buildSafeFullName } from './tool-name'

type RouteEntry = {
  tabId: number
  hostname: string
  groupKey: string
  toolName: string
  fullToolName: string
  toolsetSignature: string
  seenAt: number
}

type DiscoveredTabInfo = {
  tabId: number
  hostname: string
  toolsetSignature: string
  groupKey: string
  toolNames: string[]
  seenAt: number
}

const recentRouteByToolAndGroup = new Map<string, RouteEntry>()
const recentTabsByGroup = new Map<string, DiscoveredTabInfo[]>()

const TAB_SCAN_TIMEOUT_MS = 5000

function buildRouteKey(groupKey: string, fullToolName: string): string {
  return `${groupKey}\u0000${fullToolName}`
}

function rememberGroupTab(info: DiscoveredTabInfo) {
  const existing = recentTabsByGroup.get(info.groupKey) || []
  const next = [
    info,
    ...existing.filter((entry) => entry.tabId !== info.tabId),
  ]
    .sort((a, b) => b.seenAt - a.seenAt)
    .slice(0, 20)
  recentTabsByGroup.set(info.groupKey, next)
}

function rememberRoute(route: RouteEntry) {
  recentRouteByToolAndGroup.set(buildRouteKey(route.groupKey, route.fullToolName), route)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tab scan timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

export function parseHostname(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.hostname || null
  } catch {
    return null
  }
}

function normalizeInputSchema(inputSchema: unknown): Record<string, unknown> {
  if (typeof inputSchema === 'string') {
    try {
      const parsed = JSON.parse(inputSchema)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      return { type: 'object', properties: {} }
    }
  }

  if (inputSchema && typeof inputSchema === 'object') {
    return inputSchema as Record<string, unknown>
  }

  return { type: 'object', properties: {} }
}

function isSupportedTab(tab: chrome.tabs.Tab): tab is chrome.tabs.Tab & { id: number; url: string } {
  return typeof tab.id === 'number' && typeof tab.url === 'string' && !!parseHostname(tab.url)
}

export async function discoverToolsInTab(tabId: number): Promise<{
  ok: boolean
  mode?: WebMCPApiMode
  tools?: Array<{
    name: string
    description?: string
    inputSchema?: unknown
    annotations?: {
      readOnlyHint?: boolean
      untrustedContentHint?: boolean
    }
  }>
  error?: string
}> {
  try {
    const results = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async () => {
          const normalizeSchema = (inputSchema: unknown): Record<string, unknown> => {
            if (typeof inputSchema === 'string') {
              try {
                const parsed = JSON.parse(inputSchema)
                if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
              } catch {
                return { type: 'object', properties: {} }
              }
            }
            if (inputSchema && typeof inputSchema === 'object') {
              return inputSchema as Record<string, unknown>
            }
            return { type: 'object', properties: {} }
          }

          try {
            const modelContext = (navigator as any)?.modelContext
            if (modelContext?.getTools && typeof modelContext.getTools === 'function') {
              const tools = await modelContext.getTools()
              const normalized = Array.isArray(tools)
                ? tools
                    .filter((tool: any) => typeof tool?.name === 'string' && tool.name.trim().length > 0)
                    .map((tool: any) => ({
                      name: String(tool.name),
                      description: typeof tool.description === 'string' ? tool.description : '',
                      inputSchema: normalizeSchema(tool.inputSchema),
                      annotations:
                        tool.annotations && typeof tool.annotations === 'object'
                          ? {
                              readOnlyHint: !!tool.annotations.readOnlyHint,
                              untrustedContentHint: !!tool.annotations.untrustedContentHint,
                            }
                          : undefined,
                    }))
                : []

              return { ok: true, mode: 'modelContext', tools: normalized }
            }

            const modelContextTesting = (navigator as any)?.modelContextTesting
            if (
              modelContextTesting?.listTools &&
              typeof modelContextTesting.listTools === 'function'
            ) {
              const tools = await modelContextTesting.listTools()
              const normalized = Array.isArray(tools)
                ? tools
                    .filter((tool: any) => typeof tool?.name === 'string' && tool.name.trim().length > 0)
                    .map((tool: any) => ({
                      name: String(tool.name),
                      description: typeof tool.description === 'string' ? tool.description : '',
                      inputSchema: normalizeSchema(tool.inputSchema),
                      annotations:
                        tool.annotations && typeof tool.annotations === 'object'
                          ? {
                              readOnlyHint: !!tool.annotations.readOnlyHint,
                              untrustedContentHint: !!tool.annotations.untrustedContentHint,
                            }
                          : undefined,
                    }))
                : []

              return { ok: true, mode: 'modelContextTesting', tools: normalized }
            }

            return { ok: true, tools: [] }
          } catch (error: any) {
            return {
              ok: false,
              error: typeof error?.message === 'string' ? error.message : String(error),
            }
          }
        },
      }),
      TAB_SCAN_TIMEOUT_MS,
    )

    return (results?.[0]?.result as any) || { ok: true, tools: [] }
  } catch (error: any) {
    return { ok: false, error: typeof error?.message === 'string' ? error.message : String(error) }
  }
}

export function getRecentRoute(groupKey: string, fullToolName: string): RouteEntry | null {
  return recentRouteByToolAndGroup.get(buildRouteKey(groupKey, fullToolName)) || null
}

export function getRecentTabsForGroup(groupKey: string): DiscoveredTabInfo[] {
  return recentTabsByGroup.get(groupKey) || []
}

export function rememberSuccessfulInvocation(route: {
  tabId: number
  hostname: string
  groupKey: string
  toolName: string
  fullToolName: string
  toolsetSignature: string
}): void {
  const seenAt = Date.now()
  rememberRoute({ ...route, seenAt })
  rememberGroupTab({
    tabId: route.tabId,
    hostname: route.hostname,
    toolsetSignature: route.toolsetSignature,
    groupKey: route.groupKey,
    toolNames: [route.toolName],
    seenAt,
  })
}

export async function getTabGroupInfo(tabId: number): Promise<DiscoveredTabInfo | null> {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!isSupportedTab(tab)) return null
    const hostname = parseHostname(tab.url)
    if (!hostname) return null
    const result = await discoverToolsInTab(tabId)
    if (!result.ok || !result.tools || result.tools.length === 0) return null
    const normalizedTools = result.tools.map((tool) => ({
      name: String(tool.name),
      inputSchema: normalizeInputSchema(tool.inputSchema),
    }))
    const toolsetSignature = buildToolsetSignature(normalizedTools)
    return {
      tabId,
      hostname,
      toolsetSignature,
      groupKey: buildWebMCPGroupKey(hostname, toolsetSignature),
      toolNames: normalizedTools.map((tool) => tool.name),
      seenAt: Date.now(),
    }
  } catch {
    return null
  }
}

export async function discoverWebMCPToolsInCurrentWindow(windowId?: number): Promise<WebMCPDiscoverResponse> {
  try {
    const queryOpts: chrome.tabs.QueryInfo = windowId ? { windowId } : { currentWindow: true }
    const tabs = await chrome.tabs.query(queryOpts)
    const validTabs = tabs.filter(isSupportedTab)
    const discoveredAt = Date.now()

    const tools: WebMCPDiscoveredTool[] = []
    const discoveredTabs = new Set<number>()

    const scanResults = await Promise.allSettled(
      validTabs.map(async (tab) => {
        const hostname = parseHostname(tab.url)
        if (!hostname) return null
        const result = await discoverToolsInTab(tab.id)
        return { tab, hostname, result }
      }),
    )

    for (const settled of scanResults) {
      if (settled.status !== 'fulfilled') continue
      const entry = settled.value
      if (!entry) continue
      const { tab, hostname, result } = entry
      if (!result.ok || !result.tools || result.tools.length === 0) continue

      const normalizedTools = result.tools.map((tool) => ({
        name: String(tool.name),
        description: tool.description || '',
        inputSchema: normalizeInputSchema(tool.inputSchema),
        annotations: tool.annotations,
      }))
      const toolsetSignature = buildToolsetSignature(normalizedTools)
      const groupKey = buildWebMCPGroupKey(hostname, toolsetSignature)

      discoveredTabs.add(tab.id)
      rememberGroupTab({
        tabId: tab.id,
        hostname,
        toolsetSignature,
        groupKey,
        toolNames: normalizedTools.map((tool) => tool.name),
        seenAt: discoveredAt,
      })

      for (const tool of normalizedTools) {
        const fullName = buildSafeFullName(hostname, tool.name)
        rememberRoute({
          tabId: tab.id,
          hostname,
          groupKey,
          toolName: tool.name,
          fullToolName: fullName,
          toolsetSignature,
          seenAt: discoveredAt,
        })

        tools.push({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          hostname,
          groupKey,
          toolsetSignature,
          fullName,
          tabId: tab.id,
          tabTitle: tab.title || '',
          tabUrl: tab.url,
          discoveredAt,
          apiMode: result.mode || 'modelContext',
        })
      }
    }

    return {
      ok: true,
      tools,
      scannedTabs: validTabs.length,
      discoveredTabs: discoveredTabs.size,
      discoveredAt,
    }
  } catch (error: any) {
    return {
      ok: false,
      tools: [],
      scannedTabs: 0,
      discoveredTabs: 0,
      discoveredAt: Date.now(),
      error: typeof error?.message === 'string' ? error.message : String(error),
    }
  }
}
