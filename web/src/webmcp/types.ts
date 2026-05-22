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

export interface WebMCPInvokeResponse {
  ok: boolean
  hostname: string
  toolName: string
  fullToolName: string
  tabId?: number
  apiMode?: WebMCPApiMode
  result?: unknown
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
}

export interface WebMCPRegisteredTool {
  definition: ToolDefinition
  hostname: string
  fullName: string
}

