/**
 * Plugin API Types
 */

// =============================================================================
// Plugin HTML Result
// =============================================================================

export interface PluginHTMLResult {
  render_type: 'html'
  content: string
  height?: number
  title?: string
}

// =============================================================================
// API Message Types
// =============================================================================

export interface PluginAPICall {
  type: 'plugin-api-call'
  id: string
  action: string // e.g., 'ui.toast', 'data.getResult'
  data: unknown
}

export interface PluginAPIResponse {
  type: 'plugin-api-response'
  id: string
  data?: unknown
  error?: string
}

export interface PluginReadyMessage {
  type: 'plugin-api-ready'
  version: string
}

// =============================================================================
// API Categories
// =============================================================================

// Notify API
export interface NotifyToastData {
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
}

export interface NotifyConfirmData {
  message: string
  title?: string
  confirmText?: string
  cancelText?: string
}

// Data API
export interface AnalysisResult {
  fileCount: number
  totalSize: number
  averageSize: number
  folderCount: number
  duration: number
  files?: FileInfo[]
  pluginResults?: PluginResultEntry[]
}

export interface FileInfo {
  path: string
  name: string
  size: number
  extension?: string
  mimeType?: string
}

export interface PluginResultEntry {
  pluginId?: string
  pluginName?: string
  summary?: string
  metrics?: unknown
}

// Export API
export interface ExportJSONData {
  data: unknown
  filename?: string
}

export interface ExportCSVData {
  data: unknown[]
  filename?: string
}

export interface ExportCopyData {
  text: string
}

// UI API
export interface UIResizeData {
  height: number
}

// Storage API
export interface StorageSetData {
  key: string
  value: unknown
}

export interface StorageGetData {
  key: string
}

// =============================================================================
// Renderer Props
// =============================================================================

export interface PluginHTMLRendererProps {
  result: PluginHTMLResult
  onAction?: (action: string, data: unknown) => void
  analysisData?: AnalysisResult
}

// =============================================================================
// API Handler Result
// =============================================================================

export interface APIHandlerResult {
  success: boolean
  data?: unknown
  error?: string
}
