export type WebMCPApiMode = 'modelContext' | 'modelContextTesting'

export interface WebMCPToolMeta {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
}

export interface WebMCPDiscoveredTool extends WebMCPToolMeta {
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

