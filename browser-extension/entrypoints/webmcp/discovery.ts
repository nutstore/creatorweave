import type { WebMCPApiMode, WebMCPDiscoverResponse, WebMCPDiscoveredTool } from './types'
import { buildSafeFullName } from './tool-name'

type RouteEntry = {
  tabId: number
  hostname: string
  toolName: string
  seenAt: number
}

const recentRouteByToolName = new Map<string, RouteEntry>()

const TAB_SCAN_TIMEOUT_MS = 5000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tab scan timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

function parseHostname(url: string): string | null {
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

async function discoverToolsInTab(tabId: number): Promise<{
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

export function getRecentRoute(fullToolName: string): RouteEntry | null {
  return recentRouteByToolName.get(fullToolName) || null
}

export function getRecentRouteForHostname(hostname: string): RouteEntry | null {
  let latest: RouteEntry | null = null
  for (const route of recentRouteByToolName.values()) {
    if (route.hostname !== hostname) continue
    if (!latest || route.seenAt > latest.seenAt) latest = route
  }
  return latest
}

export async function discoverWebMCPToolsInCurrentWindow(windowId?: number): Promise<WebMCPDiscoverResponse> {
  try {
    const queryOpts: chrome.tabs.QueryInfo = windowId
      ? { windowId }
      : { currentWindow: true };
    const tabs = await chrome.tabs.query(queryOpts)
    const validTabs = tabs.filter(isSupportedTab)
    const discoveredAt = Date.now()

    const tools: WebMCPDiscoveredTool[] = []
    const discoveredTabs = new Set<number>()

    // Scan all tabs in parallel — each tab has its own 5s timeout
    const scanResults = await Promise.allSettled(
      validTabs.map(async (tab) => {
        const hostname = parseHostname(tab.url)
        if (!hostname) return null
        const result = await discoverToolsInTab(tab.id)
        return { tab, hostname, result }
      })
    )

    for (const settled of scanResults) {
      if (settled.status !== 'fulfilled') continue
      const entry = settled.value
      if (!entry) continue
      const { tab, hostname, result } = entry
      if (!result.ok || !result.tools || result.tools.length === 0) continue

      discoveredTabs.add(tab.id)
      for (const tool of result.tools) {
        const fullName = buildSafeFullName(hostname, tool.name)
        recentRouteByToolName.set(fullName, {
          tabId: tab.id,
          hostname,
          toolName: tool.name,
          seenAt: discoveredAt,
        })

        tools.push({
          name: tool.name,
          description: tool.description || '',
          inputSchema: normalizeInputSchema(tool.inputSchema),
          annotations: tool.annotations,
          hostname,
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
