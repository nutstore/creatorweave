import { getWebMCPBridge } from './bridge-client'
import { createWebMCPToolExecutor, webMCPToolToToolDefinition } from './tool-bridge'
import { useWebMCPStore } from './store'
import type { WebMCPDiscoveredTool } from './types'
import { useSettingsStore } from '@/store/settings.store'

type RegistryLike = {
  register: (definition: import('@/agent/tools/tool-types').ToolDefinition, executor: import('@/agent/tools/tool-types').ToolExecutor) => void
  unregister: (name: string) => boolean
}

const DISCOVERY_TTL_MS = 8000
const registeredWebMCPToolNames = new Set<string>()
const registeredWebMCPToolSignatures = new Map<string, string>()
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

function stableSerialize(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map((item) => normalize(item))
    }
    if (!input || typeof input !== 'object') {
      return input
    }
    const obj = input as Record<string, unknown>
    const sortedKeys = Object.keys(obj).sort()
    const next: Record<string, unknown> = {}
    for (const key of sortedKeys) {
      next[key] = normalize(obj[key])
    }
    return next
  }
  return JSON.stringify(normalize(value))
}

function buildToolSignature(tool: WebMCPDiscoveredTool): string {
  return stableSerialize({
    description: tool.description || '',
    inputSchema: tool.inputSchema || {},
    annotations: tool.annotations || {},
    apiMode: tool.apiMode || 'modelContext',
  })
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

async function syncFromCatalog(registry: RegistryLike): Promise<number> {
  const store = useWebMCPStore.getState()
  const enabledTools = dedupeTools(store.getEnabledTools())
  const enabledNames = new Set(enabledTools.map((tool) => tool.fullName))

  for (const name of Array.from(registeredWebMCPToolNames)) {
    if (enabledNames.has(name)) continue
    registry.unregister(name)
    registeredWebMCPToolNames.delete(name)
    registeredWebMCPToolSignatures.delete(name)
  }

  for (const tool of enabledTools) {
    const signature = buildToolSignature(tool)
    const previousSignature = registeredWebMCPToolSignatures.get(tool.fullName)
    const isAlreadyRegistered = registeredWebMCPToolNames.has(tool.fullName)

    // No-op when tool already exists with the same schema/metadata.
    if (isAlreadyRegistered && previousSignature === signature) {
      continue
    }

    // Re-register only when new or changed.
    if (isAlreadyRegistered) {
      registry.unregister(tool.fullName)
    }

    const definition = webMCPToolToToolDefinition(tool)
    const executor = createWebMCPToolExecutor(tool.fullName)
    registry.register(definition, executor)
    registeredWebMCPToolNames.add(tool.fullName)
    registeredWebMCPToolSignatures.set(tool.fullName, signature)
  }

  return enabledTools.length
}

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
  return syncFromCatalog(registry)
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
  return syncFromCatalog(resolvedRegistry)
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
    registeredWebMCPToolSignatures.delete(name)
  }
  return removed
}

export function getRegisteredWebMCPToolNames(): string[] {
  return Array.from(registeredWebMCPToolNames)
}
