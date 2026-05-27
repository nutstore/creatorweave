import { getRecentRoute, getRecentRouteForHostname } from './discovery'
import type { WebMCPInvokeRequest, WebMCPInvokeResponse } from './types'

function parseHostname(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.hostname || null
  } catch {
    return null
  }
}

async function tabMatchesHostname(tabId: number, hostname: string): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url) return false
    return parseHostname(tab.url) === hostname
  } catch {
    return false
  }
}

async function pickTargetTabId(hostname: string, request: WebMCPInvokeRequest): Promise<number | null> {
  if (
    typeof request.preferredTabId === 'number' &&
    (await tabMatchesHostname(request.preferredTabId, hostname))
  ) {
    return request.preferredTabId
  }

  const recentByTool = getRecentRoute(request.fullToolName)
  if (recentByTool && (await tabMatchesHostname(recentByTool.tabId, hostname))) {
    return recentByTool.tabId
  }

  const recentByHost = getRecentRouteForHostname(hostname)
  if (recentByHost && (await tabMatchesHostname(recentByHost.tabId, hostname))) {
    return recentByHost.tabId
  }

  // Fallback: query all tabs (avoid currentWindow which is unreliable in Service Worker)
  const tabs = await chrome.tabs.query({})
  const matched = tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number; url: string } => {
      return typeof tab.id === 'number' && typeof tab.url === 'string'
    })
    .filter((tab) => parseHostname(tab.url) === hostname)

  if (matched.length === 0) return null

  // Fallback to the most recently visited candidate if no route cache exists.
  const sorted = matched.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
  return sorted[0]?.id ?? null
}

export async function invokeWebMCPTool(
  request: WebMCPInvokeRequest
): Promise<WebMCPInvokeResponse> {
  // Route cache is the source of truth: it holds the original (un-normalized)
  // hostname and toolName from discovery time.
  const route = getRecentRoute(request.fullToolName || '')
  if (!route) {
    return {
      ok: false,
      hostname: '',
      toolName: '',
      fullToolName: request.fullToolName || '',
      errorCode: 'INVALID_TOOL_NAME',
      error: 'No route cache entry for tool — try re-discovering WebMCP tools',
    }
  }

  const { hostname, toolName } = route
  const tabId = await pickTargetTabId(hostname, request)
  if (tabId === null) {
    return {
      ok: false,
      hostname,
      toolName,
      fullToolName: request.fullToolName,
      errorCode: 'TOOL_TARGET_NOT_FOUND',
      error: `No open tab found for hostname: ${hostname}`,
    }
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [toolName, request.args || {}],
      func: async (toolNameFromArgs: string, argsFromBridge: Record<string, unknown>) => {
        const serializeResult = (value: unknown): unknown => {
          if (value === null || value === undefined) return value
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return value
          }
          try {
            return JSON.parse(JSON.stringify(value))
          } catch {
            return String(value)
          }
        }

        try {
          const inputJson = JSON.stringify(argsFromBridge || {})
          const modelContext = (navigator as any)?.modelContext
          if (
            modelContext?.getTools &&
            typeof modelContext.getTools === 'function' &&
            modelContext?.executeTool &&
            typeof modelContext.executeTool === 'function'
          ) {
            const tools = await modelContext.getTools()
            const targetTool = Array.isArray(tools)
              ? tools.find((tool: any) => tool?.name === toolNameFromArgs)
              : null

            if (!targetTool) {
              return {
                ok: false,
                errorCode: 'TOOL_NOT_FOUND',
                error: `Tool not found in tab: ${toolNameFromArgs}`,
              }
            }

            const result = await modelContext.executeTool(targetTool, inputJson)
            return {
              ok: true,
              apiMode: 'modelContext',
              result: serializeResult(result),
            }
          }

          const modelContextTesting = (navigator as any)?.modelContextTesting
          if (
            modelContextTesting?.listTools &&
            typeof modelContextTesting.listTools === 'function' &&
            modelContextTesting?.executeTool &&
            typeof modelContextTesting.executeTool === 'function'
          ) {
            const tools = await modelContextTesting.listTools()
            const hasTool = Array.isArray(tools)
              ? tools.some((tool: any) => tool?.name === toolNameFromArgs)
              : false
            if (!hasTool) {
              return {
                ok: false,
                errorCode: 'TOOL_NOT_FOUND',
                error: `Tool not found in tab: ${toolNameFromArgs}`,
              }
            }

            const result = await modelContextTesting.executeTool(toolNameFromArgs, inputJson)
            return {
              ok: true,
              apiMode: 'modelContextTesting',
              result: serializeResult(result),
            }
          }

          return {
            ok: false,
            errorCode: 'WEBMCP_UNAVAILABLE',
            error: 'WebMCP APIs are not available in this tab',
          }
        } catch (error: any) {
          return {
            ok: false,
            errorCode: 'INVOKE_FAILED',
            error: typeof error?.message === 'string' ? error.message : String(error),
          }
        }
      },
    })

    const result = (results?.[0]?.result as any) || {}
    if (!result.ok) {
      return {
        ok: false,
        hostname,
        toolName,
        fullToolName: request.fullToolName,
        tabId,
        apiMode: result.apiMode,
        errorCode: result.errorCode || 'INVOKE_FAILED',
        error: result.error || 'Tool execution failed',
      }
    }

    return {
      ok: true,
      hostname,
      toolName,
      fullToolName: request.fullToolName,
      tabId,
      apiMode: result.apiMode,
      result: result.result,
    }
  } catch (error: any) {
    return {
      ok: false,
      hostname,
      toolName,
      fullToolName: request.fullToolName,
      tabId,
      errorCode: 'INVOKE_FAILED',
      error: typeof error?.message === 'string' ? error.message : String(error),
    }
  }
}

