import { getWebMCPBridge } from './bridge-client'
import { useWebMCPStore } from './store'
import type { WebMCPDiscoveredTool } from './types'
import { useSettingsStore } from '@/store/settings.store'

const DISCOVERY_TTL_MS = 8000

let lastDiscoveryAt = 0
let discoveryInFlight: Promise<WebMCPDiscoveredTool[]> | null = null

function isExtensionContextInvalidatedError(error: unknown): boolean {
  if (typeof error !== 'string') return false
  return error.toLowerCase().includes('extension context invalidated')
}

function dedupeTools(tools: WebMCPDiscoveredTool[]): WebMCPDiscoveredTool[] {
  const deduped = new Map<string, WebMCPDiscoveredTool>()

  for (const tool of tools) {
    const existing = deduped.get(tool.fullName)
    if (!existing) {
      deduped.set(tool.fullName, tool)
      continue
    }

    if (tool.discoveredAt > existing.discoveredAt) {
      deduped.set(tool.fullName, tool)
    }
  }

  return Array.from(deduped.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/**
 * Discover WebMCP tools from browser tabs and cache them in the store.
 * This is called by the agent loop to keep the catalog fresh.
 * Tool registration is handled by the unified external-tool bridge (search_tools/call_tool).
 */
async function discoverAndCacheTools(force = false): Promise<WebMCPDiscoveredTool[]> {
  const now = Date.now()
  const store = useWebMCPStore.getState()
  const cached = store.getAllTools()
  if (!force && cached.length > 0 && now - lastDiscoveryAt < DISCOVERY_TTL_MS) {
    return cached
  }

  if (discoveryInFlight) return discoveryInFlight

  discoveryInFlight = (async () => {
    const bridge = getWebMCPBridge()
    if (!bridge) {
      useWebMCPStore.getState().clearCatalog()
      lastDiscoveryAt = 0
      return []
    }

    const response = await bridge.webMCPDiscover({ force })
    if (!response.ok) {
      console.warn('[WebMCP] Discovery failed:', response.error || 'unknown error')
      if (isExtensionContextInvalidatedError(response.error)) {
        useWebMCPStore.getState().clearCatalog()
        lastDiscoveryAt = 0
        return []
      }
      return useWebMCPStore.getState().getAllTools()
    }

    const tools = dedupeTools(response.tools || [])
    useWebMCPStore.getState().setCatalog(tools, response.discoveredAt || Date.now())
    lastDiscoveryAt = Date.now()
    return tools
  })().finally(() => {
    discoveryInFlight = null
  })

  return discoveryInFlight
}

/** Discover and cache WebMCP tools without registering any tools. */
export async function discoverWebMCPCatalog(force = false): Promise<WebMCPDiscoveredTool[]> {
  if (!useSettingsStore.getState().enableWebMCP) {
    useWebMCPStore.getState().clearCatalog()
    return []
  }
  return discoverAndCacheTools(force)
}

/** Refresh WebMCP catalog (force re-discovery). */
export async function refreshWebMCPCatalog(): Promise<WebMCPDiscoveredTool[]> {
  return discoverWebMCPCatalog(true)
}

export async function applyWebMCPHostToggle(
  hostname: string,
  _enabled: boolean,
): Promise<void> {
  useWebMCPStore.getState().setHostEnabled(hostname, _enabled)
  await discoverAndCacheTools(true)
}

export async function applyWebMCPGlobalToggle(
  enabled: boolean,
): Promise<void> {
  useSettingsStore.getState().setEnableWebMCP(enabled)
  if (!enabled) {
    useWebMCPStore.getState().clearCatalog()
  } else {
    await discoverAndCacheTools(true)
  }
}
