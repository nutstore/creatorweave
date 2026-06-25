import {
  discoverToolsInTab,
  getRecentRoute,
  getRecentTabsForGroup,
  getTabGroupInfo,
  parseHostname,
  rememberSuccessfulInvocation,
} from './discovery'
import { buildSafeFullName } from './tool-name'
import type {
  WebMCPInvokeRequest,
  WebMCPInvokeResponse,
  WebMCPPluginDownloadPlan,
} from './types'

function randomTransferId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function unwrapPluginDownloadPayload(result: unknown): Record<string, unknown> | null {
  if (!result) return null

  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return null
    }
    return null
  }

  if (typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, unknown>
  }

  return null
}

function parsePluginDownloadPlan(result: unknown): WebMCPPluginDownloadPlan | null {
  const obj = unwrapPluginDownloadPayload(result)
  if (!obj) {
    return null
  }

  const pluginDownload = obj.plugin_download
  const downloadUrl = obj.download_url
  const savePath = obj.save_path
  const fileNameRaw = obj.fileName ?? obj.file_name
  if (pluginDownload !== true) return null
  if (typeof downloadUrl !== 'string' || downloadUrl.trim().length === 0) return null
  if (typeof fileNameRaw !== 'string' || fileNameRaw.trim().length === 0) return null

  const normalizedSavePath =
    typeof savePath === 'string' && savePath.trim().length > 0 ? savePath.trim() : '/'

  return {
    transferId: randomTransferId(),
    downloadUrl: downloadUrl.trim(),
    savePath: normalizedSavePath,
    fileName: fileNameRaw.trim(),
    originalResult: { ...obj },
  }
}

async function tabMatchesGroup(tabId: number, groupKey: string, hostname: string): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url) return false
    if (parseHostname(tab.url) !== hostname) return false
    const info = await getTabGroupInfo(tabId)
    return info?.groupKey === groupKey
  } catch {
    return false
  }
}

async function pickTargetTabId(
  groupKey: string,
  hostname: string,
  request: WebMCPInvokeRequest,
): Promise<number | null> {
  if (
    typeof request.preferredTabId === 'number' &&
    (await tabMatchesGroup(request.preferredTabId, groupKey, hostname))
  ) {
    return request.preferredTabId
  }

  const recentByTool = getRecentRoute(groupKey, request.fullToolName)
  if (recentByTool && (await tabMatchesGroup(recentByTool.tabId, groupKey, hostname))) {
    return recentByTool.tabId
  }

  for (const recentTab of getRecentTabsForGroup(groupKey)) {
    if (await tabMatchesGroup(recentTab.tabId, groupKey, hostname)) {
      return recentTab.tabId
    }
  }

  const tabs = await chrome.tabs.query({})
  const matched = tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number; url: string } => {
      return typeof tab.id === 'number' && typeof tab.url === 'string'
    })
    .filter((tab) => parseHostname(tab.url) === hostname)

  if (matched.length === 0) return null

  const sorted = matched.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
  for (const tab of sorted) {
    if (await tabMatchesGroup(tab.id, groupKey, hostname)) return tab.id
  }

  return null
}

async function resolveRouteFromTabs(
  request: WebMCPInvokeRequest,
): Promise<{
  tabId: number
  hostname: string
  groupKey: string
  toolName: string
  fullToolName: string
  toolsetSignature: string
} | null> {
  const candidateTabIds = [
    ...getRecentTabsForGroup(request.groupKey).map((entry) => entry.tabId),
  ]

  if (typeof request.preferredTabId === 'number' && !candidateTabIds.includes(request.preferredTabId)) {
    candidateTabIds.unshift(request.preferredTabId)
  }

  const allTabs = await chrome.tabs.query({})
  const additionalTabIds = allTabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number; url: string } => {
      return typeof tab.id === 'number' && typeof tab.url === 'string'
    })
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
    .map((tab) => tab.id)

  for (const tabId of additionalTabIds) {
    if (!candidateTabIds.includes(tabId)) candidateTabIds.push(tabId)
  }

  for (const tabId of candidateTabIds) {
    const groupInfo = await getTabGroupInfo(tabId)
    if (!groupInfo || groupInfo.groupKey !== request.groupKey) continue
    const result = await discoverToolsInTab(tabId)
    if (!result.ok || !result.tools) continue
    const matched = result.tools.find((tool) => {
      return buildSafeFullName(groupInfo.hostname, String(tool.name)) === request.fullToolName
    })
    if (!matched) continue
    return {
      tabId,
      hostname: groupInfo.hostname,
      groupKey: groupInfo.groupKey,
      toolName: String(matched.name),
      fullToolName: request.fullToolName,
      toolsetSignature: groupInfo.toolsetSignature,
    }
  }

  return null
}

export async function invokeWebMCPTool(
  request: WebMCPInvokeRequest
): Promise<WebMCPInvokeResponse> {
  let route = getRecentRoute(request.groupKey || '', request.fullToolName || '')
  if (!route) {
    const resolved = await resolveRouteFromTabs(request)
    if (resolved) {
      rememberSuccessfulInvocation(resolved)
      route = { ...resolved, seenAt: Date.now() }
    }
  }

  if (!route) {
    return {
      ok: false,
      hostname: '',
      toolName: '',
      fullToolName: request.fullToolName || '',
      errorCode: 'INVALID_TOOL_NAME',
      error: 'No route cache entry for tool and group — try re-discovering WebMCP tools',
    }
  }

  const { hostname, toolName, groupKey } = route
  const tabId = await pickTargetTabId(groupKey, hostname, request)
  if (tabId === null) {
    return {
      ok: false,
      hostname,
      toolName,
      fullToolName: request.fullToolName,
      errorCode: 'TOOL_TARGET_NOT_FOUND',
      error: `No open tab found for WebMCP group: ${groupKey}`,
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

    rememberSuccessfulInvocation({
      tabId,
      hostname,
      groupKey,
      toolName,
      fullToolName: request.fullToolName,
      toolsetSignature: route.toolsetSignature,
    })

    const plan = parsePluginDownloadPlan(result.result)
    return {
      ok: true,
      hostname,
      toolName,
      fullToolName: request.fullToolName,
      tabId,
      apiMode: result.apiMode,
      result: result.result,
      ...(plan ? { pluginDownloadPlan: plan } : {}),
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
