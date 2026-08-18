import { getWebMCPBridge } from './bridge-client'
import { dedupeDiscoveredInstances } from './catalog-normalizer'
import { useWebMCPStore } from './store'
import type { WebMCPRegisteredTool } from './types'
import { useSettingsStore } from '@/store/settings.store'

const DISCOVERY_TTL_MS = 8000

let lastDiscoveryAt = 0
let discoveryInFlight: Promise<WebMCPRegisteredTool[]> | null = null

function isExtensionContextInvalidatedError(error: unknown): boolean {
  if (typeof error !== 'string') return false
  return error.toLowerCase().includes('extension context invalidated')
}

/**
 * Sync extension-side authorization state into the store mirror.
 * Called after discovery — the tools' hostEnabled/groupEnabled annotations
 * (attached by the extension background) are the source of truth; the web
 * app's localStorage copy is read-only from now on.
 */
function syncAuthorizationFromTools(tools: Array<{ hostname: string; groupKey: string; hostEnabled?: boolean; groupEnabled?: boolean }>): void {
  const enabledByHost: Record<string, boolean> = {}
  const enabledByGroup: Record<string, boolean> = {}
  for (const tool of tools) {
    const host = tool.hostname.trim().toLowerCase()
    if (host && typeof tool.hostEnabled === 'boolean') enabledByHost[host] = tool.hostEnabled
    const group = tool.groupKey.trim()
    if (group && typeof tool.groupEnabled === 'boolean') enabledByGroup[group] = tool.groupEnabled
  }
  useWebMCPStore.getState().setAuthorizationMirror(enabledByHost, enabledByGroup)
}

/**
 * Discover WebMCP tools from browser tabs and cache them in the store.
 * This is called by the agent loop to keep the catalog fresh.
 * Tool registration is handled by the unified external-tool bridge (search_tools/call_tool).
 */
async function discoverAndCacheTools(force = false): Promise<WebMCPRegisteredTool[]> {
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

    const tools = dedupeDiscoveredInstances(response.tools || []).sort((a, b) =>
      a.fullName.localeCompare(b.fullName),
    )
    syncAuthorizationFromTools(tools)
    useWebMCPStore.getState().setDiscoveredTools(tools, response.discoveredAt || Date.now())
    lastDiscoveryAt = Date.now()
    return useWebMCPStore.getState().getAllTools()
  })().finally(() => {
    discoveryInFlight = null
  })

  return discoveryInFlight
}

/** Discover and cache WebMCP tools without registering any tools. */
export async function discoverWebMCPCatalog(force = false): Promise<WebMCPRegisteredTool[]> {
  if (!useSettingsStore.getState().enableWebMCP) {
    useWebMCPStore.getState().clearCatalog()
    return []
  }
  return discoverAndCacheTools(force)
}

/** Refresh WebMCP catalog (force re-discovery). */
export async function refreshWebMCPCatalog(): Promise<WebMCPRegisteredTool[]> {
  return discoverWebMCPCatalog(true)
}

export async function applyWebMCPHostToggle(
  hostname: string,
  enabled: boolean,
): Promise<number> {
  // Write-through to the extension-side authoritative store; the web
  // localStorage copy is only a mirror synced from discovery annotations.
  const bridge = getWebMCPBridge()
  if (bridge?.webMCPSetHostEnabled) {
    const resp = await bridge.webMCPSetHostEnabled({ hostname, enabled })
    if (!resp?.ok) {
      throw new Error(resp?.error || 'Extension rejected the host toggle')
    }
  } else {
    // Old extension without bridge methods: keep local-only behavior so the
    // UI keeps working (catalog filtering) until the extension updates.
    useWebMCPStore.getState().setHostEnabled(hostname, enabled)
  }
  const tools = await discoverAndCacheTools(true)
  return tools.length
}

export async function applyWebMCPGroupToggle(
  groupKey: string,
  enabled: boolean,
): Promise<void> {
  // Write-through to the extension-side authoritative store (same pattern
  // as host toggles).
  const bridge = getWebMCPBridge()
  if (bridge?.webMCPSetGroupEnabled) {
    const resp = await bridge.webMCPSetGroupEnabled({ groupKey, enabled })
    if (!resp?.ok) {
      throw new Error(resp?.error || 'Extension rejected the group toggle')
    }
  } else {
    useWebMCPStore.getState().setGroupEnabled(groupKey, enabled)
  }
}

export async function applyWebMCPGlobalToggle(
  enabled: boolean,
): Promise<number> {
  useSettingsStore.getState().setEnableWebMCP(enabled)
  if (!enabled) {
    useWebMCPStore.getState().clearCatalog()
    return 0
  }
  const tools = await discoverAndCacheTools(true)
  return tools.length
}
