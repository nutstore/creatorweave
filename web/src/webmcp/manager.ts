import { getWebMCPBridge } from './bridge-client'
import {
  ON_DEMAND_WEBMCP_TOOLS,
} from './tool-bridge'
import { useWebMCPStore } from './store'
import type { WebMCPDiscoveredTool } from './types'
import { useSettingsStore } from '@/store/settings.store'

type RegistryLike = {
  register: (definition: import('@/agent/tools/tool-types').ToolDefinition, executor: import('@/agent/tools/tool-types').ToolExecutor) => void
  unregister: (name: string) => boolean
}

const DISCOVERY_TTL_MS = 8000

// Track which tools are registered (for cleanup)
const registeredWebMCPToolNames = new Set<string>()
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

async function resolveRegistry(registry?: RegistryLike): Promise<RegistryLike> {
  if (registry) return registry
  const { getToolRegistry } = await import('@/agent/tool-registry')
  return getToolRegistry()
}

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

/**
 * On-demand mode: register only 2 persistent tools (webmcp_get_tool_schema + webmcp_call).
 * The catalog data stays in the store for webmcp_get_tool_schema to query at runtime.
 */
function syncOnDemandTools(registry: RegistryLike): number {
  for (const tool of ON_DEMAND_WEBMCP_TOOLS) {
    const name = tool.definition.function.name
    if (!registeredWebMCPToolNames.has(name)) {
      // Idempotent: skip if already registered (e.g. by registerBuiltins)
      if (registry.has(name)) {
        registeredWebMCPToolNames.add(name)
        continue
      }
      registry.register(tool.definition, tool.executor)
      registeredWebMCPToolNames.add(name)
    }
  }
  return ON_DEMAND_WEBMCP_TOOLS.length
}

// Legacy: full-registration mode preserved for future fallback.
// Uncomment syncFromCatalog and its imports when needed.
// async function syncFromCatalog(registry: RegistryLike): Promise<number> { ... }

export async function syncWebMCPTools(options: {
  registry?: RegistryLike
  forceDiscovery?: boolean
} = {}): Promise<number> {
  const registry = await resolveRegistry(options.registry)
  if (!useSettingsStore.getState().enableWebMCP) {
    await unregisterAllWebMCPTools(registry)
    return 0
  }
  await discoverAndCacheTools(!!options.forceDiscovery)

  // On-demand mode: register 2 persistent tools only
  // Catalog data stays in store for webmcp_get_tool_schema to query
  return syncOnDemandTools(registry)
}

export async function refreshWebMCPTools(registry?: RegistryLike): Promise<number> {
  return syncWebMCPTools({ registry, forceDiscovery: true })
}

export async function applyWebMCPHostToggle(
  hostname: string,
  enabled: boolean,
  registry?: RegistryLike
): Promise<number> {
  useWebMCPStore.getState().setHostEnabled(hostname, enabled)
  const resolvedRegistry = await resolveRegistry(registry)
  if (!useSettingsStore.getState().enableWebMCP) {
    await unregisterAllWebMCPTools(resolvedRegistry)
    return 0
  }
  // In on-demand mode, host toggle only affects the catalog (store).
  // The 2 persistent tools stay registered regardless.
  // Refresh catalog data only.
  await discoverAndCacheTools(true)
  return syncOnDemandTools(resolvedRegistry)
}

export async function applyWebMCPGlobalToggle(
  enabled: boolean,
  registry?: RegistryLike
): Promise<number> {
  useSettingsStore.getState().setEnableWebMCP(enabled)
  const resolvedRegistry = await resolveRegistry(registry)
  if (!enabled) {
    await unregisterAllWebMCPTools(resolvedRegistry)
    return 0
  }
  return syncWebMCPTools({ registry: resolvedRegistry, forceDiscovery: true })
}

export async function unregisterAllWebMCPTools(registry?: RegistryLike): Promise<number> {
  const resolvedRegistry = await resolveRegistry(registry)
  let removed = 0
  for (const name of Array.from(registeredWebMCPToolNames)) {
    if (resolvedRegistry.unregister(name)) {
      removed++
    }
    registeredWebMCPToolNames.delete(name)
  }
  return removed
}

export function getRegisteredWebMCPToolNames(): string[] {
  return Array.from(registeredWebMCPToolNames)
}
