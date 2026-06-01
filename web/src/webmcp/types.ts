import type { ToolDefinition } from '@/agent/tools/tool-types'

export type WebMCPApiMode = 'modelContext' | 'modelContextTesting'

export interface WebMCPDiscoveredTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
  hostname: string
  fullName: string
  tabId: number
  tabTitle?: string
  tabUrl?: string
  discoveredAt: number
  apiMode: WebMCPApiMode
}

export interface WebMCPDiscoverResponse {
  ok: boolean
  tools: WebMCPDiscoveredTool[]
  scannedTabs: number
  discoveredTabs: number
  discoveredAt: number
  error?: string
}

export interface WebMCPInvokeRequest {
  fullToolName: string
  args?: Record<string, unknown>
  preferredTabId?: number
}

export interface WebMCPPluginDownloadPlan {
  transferId: string
  downloadUrl: string
  savePath: string
  fileName: string
  originalResult: Record<string, unknown>
}

export interface WebMCPPluginDownloadStartFrame {
  type: 'start'
  transferId: string
  fileName: string
  mimeType: string
  totalChunks: number
  totalChars: number
  savePath: string
}

export interface WebMCPPluginDownloadChunkFrame {
  type: 'chunk'
  transferId: string
  index: number
  data: string
}

export interface WebMCPPluginDownloadEndFrame {
  type: 'end'
  transferId: string
}

export interface WebMCPPluginDownloadErrorFrame {
  type: 'error'
  transferId: string
  errorCode: string
  message: string
}

export type WebMCPPluginDownloadFrame =
  | WebMCPPluginDownloadStartFrame
  | WebMCPPluginDownloadChunkFrame
  | WebMCPPluginDownloadEndFrame
  | WebMCPPluginDownloadErrorFrame

export interface WebMCPInvokeResponse {
  ok: boolean
  hostname: string
  toolName: string
  fullToolName: string
  tabId?: number
  apiMode?: WebMCPApiMode
  result?: unknown
  pluginDownloadPlan?: WebMCPPluginDownloadPlan
  errorCode?: string
  error?: string
}

export interface WebMCPHostCatalog {
  hostname: string
  tools: WebMCPDiscoveredTool[]
  lastDiscoveredAt: number
  tabs: Array<{ tabId: number; title: string; url: string; lastSeenAt: number }>
}

export interface WebMCPBridge {
  ready: boolean
  webMCPDiscover: (options?: { force?: boolean }) => Promise<WebMCPDiscoverResponse>
  webMCPInvoke: (payload: WebMCPInvokeRequest) => Promise<WebMCPInvokeResponse>
  webMCPPluginDownloadStream: (payload: {
    transferId: string
    downloadUrl: string
    savePath: string
    fileName: string
  }) => AsyncIterable<WebMCPPluginDownloadFrame> & { cancel: () => void }
  webMCPPluginDownloadFinalize: (payload: {
    transferId: string
    savedPath: string
  }) => Promise<{ ok: boolean; transferId?: string; error?: string }>
}

export interface WebMCPRegisteredTool {
  definition: ToolDefinition
  hostname: string
  fullName: string
}
