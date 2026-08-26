/**
 * Plugin UI Components Index
 *
 * Exports all plugin-related UI components
 */

// Main components
export { PluginManager } from './PluginManager'
export { PluginUpload } from './PluginUpload'
export { PluginCard } from './PluginCard'
export { PluginList } from './PluginList'
export { PluginExecutor } from './PluginExecutor'
export { PluginResults } from './PluginResults'
export { PluginFooter } from './PluginFooter'

// Plugin HTML Renderer (modular Plugin API)
export { PluginHTMLRenderer } from './PluginHTMLRenderer'
export type { PluginHTMLResult } from './api/types'

// Plugin API modules
export { handlePluginAPICall } from './api/PluginAPIHandler'
export { generatePluginAPIScript } from './api/PluginAPIScript'
export type { AnalysisResult, FileInfo } from './api/types'

// Plugin UI components
export { PluginDialog } from './ui/PluginDialog'
export { showToast, closeToast, closeAllToasts } from './ui/PluginToast'
export type { ToastType, ToastMessage } from './ui/PluginToast'
