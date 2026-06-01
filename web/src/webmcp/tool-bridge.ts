import type { ToolDefinition, ToolExecutor } from '@/agent/tools/tool-types'
import { toolErrorJson, toolOkJson } from '@/agent/tools/tool-envelope'
import { getWebMCPBridge } from './bridge-client'
import { useWebMCPStore } from './store'
import type { WebMCPDiscoveredTool } from './types'
import { consumeAndSavePluginDownload } from './plugin-download'

function ensureObjectSchema(schema: Record<string, unknown>): ToolDefinition['function']['parameters'] {
  const type = schema.type
  if (type === 'object') {
    return schema as ToolDefinition['function']['parameters']
  }

  return {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Raw input payload for the underlying tool',
      },
    },
    required: ['input'],
  } as ToolDefinition['function']['parameters']
}

export function webMCPToolToToolDefinition(tool: WebMCPDiscoveredTool): ToolDefinition {
  const description = tool.description?.trim()
    ? `[WebMCP ${tool.hostname}] ${tool.description}`
    : `[WebMCP ${tool.hostname}] Tool discovered from active browser tab`

  return {
    type: 'function',
    function: {
      name: tool.fullName,
      description,
      parameters: ensureObjectSchema(tool.inputSchema || { type: 'object', properties: {} }),
    },
  }
}

export function createWebMCPToolExecutor(fullToolName: string, hostname?: string): ToolExecutor {
  return async (args, context) => {
    const bridge = getWebMCPBridge()
    if (!bridge) {
      return toolErrorJson(
        fullToolName,
        'WEBMCP_BRIDGE_UNAVAILABLE',
        'Browser extension WebMCP bridge is unavailable'
      )
    }

    // Use the original hostname passed from the tool object (not parsed from
    // the normalized fullName) to look up the preferred tab.
    const preferredTabId = hostname
      ? useWebMCPStore.getState().getPreferredTabIdForHost(hostname)
      : undefined

    try {
      const response = await bridge.webMCPInvoke({
        fullToolName,
        args,
        preferredTabId,
      })

      if (!response.ok) {
        return toolErrorJson(
          fullToolName,
          response.errorCode || 'WEBMCP_INVOKE_FAILED',
          response.error || 'WebMCP tool invocation failed',
          {
            retryable: true,
            details: {
              tabId: response.tabId,
              hostname: response.hostname,
              apiMode: response.apiMode,
            },
          }
        )
      }

      if (response.pluginDownloadPlan) {
        try {
          const saveResult = await consumeAndSavePluginDownload(
            bridge,
            response.pluginDownloadPlan,
            context
          )

          const finalizeResp = await bridge.webMCPPluginDownloadFinalize({
            transferId: response.pluginDownloadPlan.transferId,
            savedPath: saveResult.savedPath,
          })
          if (!finalizeResp?.ok) {
            return toolErrorJson(
              fullToolName,
              'WEBMCP_PLUGIN_DOWNLOAD_FINALIZE_FAILED',
              finalizeResp?.error || 'Plugin download finalize failed',
              { retryable: true }
            )
          }

          // Keep AssetsPopover in sync after plugin files are written to OPFS assets.
          try {
            const { useAssetInventoryStore } = await import('@/store/asset-inventory.store')
            useAssetInventoryStore.getState().refresh().catch(() => {})
          } catch {
            // Non-critical: refresh failure should not block tool success.
          }

          return toolOkJson(fullToolName, {
            result: saveResult.patchedResult,
            hostname: response.hostname,
            tabId: response.tabId,
            apiMode: response.apiMode,
            pluginDownload: {
              transferId: response.pluginDownloadPlan.transferId,
              savedPath: `vfs://assets/${saveResult.savedPath}`,
              fileName: saveResult.fileName,
              size: saveResult.size,
              mimeType: saveResult.mimeType,
            },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return toolErrorJson(
            fullToolName,
            'WEBMCP_PLUGIN_DOWNLOAD_FAILED',
            message,
            { retryable: true }
          )
        }
      }

      return toolOkJson(fullToolName, {
        result: response.result,
        hostname: response.hostname,
        tabId: response.tabId,
        apiMode: response.apiMode,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return toolErrorJson(fullToolName, 'WEBMCP_INVOKE_FAILED', message, { retryable: true })
    }
  }
}
