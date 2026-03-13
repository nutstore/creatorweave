/**
 * Plugin API Handler
 * Handles API calls from plugin iframe and delegates to appropriate handlers
 */

import type {
  PluginAPICall,
  AnalysisResult,
  NotifyToastData,
  NotifyConfirmData,
  ExportJSONData,
  ExportCSVData,
  ExportCopyData,
  UIResizeData,
} from './types'

export interface APIHandlerContext {
  analysisData?: AnalysisResult
  showToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void
  showConfirm?: (message: string) => Promise<boolean>
  resizeIframe?: (height: number) => void
  toggleFullscreen?: () => void
  sendResponse?: (id: string, data?: unknown, error?: string) => void
}

/**
 * Handle Plugin API call from iframe
 */
export function handlePluginAPICall(msg: PluginAPICall, context: APIHandlerContext): void {
  const { id, action, data } = msg
  const [category, method] = action.split('.')

  const sendResponse = (responseData?: unknown, error?: string) => {
    context.sendResponse?.(id, responseData, error)
  }

  switch (category) {
    case 'notify':
      handleNotifyAPI(method, data as NotifyToastData & NotifyConfirmData, context, sendResponse)
      break

    case 'data':
      handleDataAPI(method, data, context, sendResponse)
      break

    case 'export':
      handleExportAPI(method, data, context, sendResponse)
      break

    case 'ui':
      handleUIAPI(method, data as UIResizeData, context, sendResponse)
      break

    default:
      sendResponse(undefined, `Unknown API category: ${category}`)
  }
}

/**
 * Handle notify.* API calls
 */
function handleNotifyAPI(
  method: string,
  data: NotifyToastData & NotifyConfirmData,
  context: APIHandlerContext,
  sendResponse: (data?: unknown, error?: string) => void
): void {
  switch (method) {
    case 'toast':
      context.showToast?.(data.message, data.type || 'info')
      sendResponse()
      break

    case 'confirm':
      if (!context.showConfirm) {
        sendResponse(undefined, 'Confirm handler not available')
        return
      }
      context
        .showConfirm(data.message)
        .then((confirmed) => {
          sendResponse({ confirmed })
        })
        .catch(() => {
          sendResponse({ confirmed: false })
        })
      break

    default:
      sendResponse(undefined, `Unknown notify method: ${method}`)
  }
}

/**
 * Handle data.* API calls
 */
function handleDataAPI(
  method: string,
  data: unknown,
  context: APIHandlerContext,
  sendResponse: (data?: unknown, error?: string) => void
): void {
  switch (method) {
    case 'getResult':
      sendResponse(context.analysisData || null)
      break

    case 'getFiles':
      sendResponse(context.analysisData?.files || [])
      break

    case 'set': {
      const { key, value } = data as { key: string; value: unknown }
      try {
        localStorage.setItem(`bfsa_plugin_${key}`, JSON.stringify(value))
        sendResponse()
      } catch (e) {
        sendResponse(undefined, `Storage error: ${e}`)
      }
      break
    }

    case 'get': {
      const { key } = data as { key: string }
      try {
        const value = localStorage.getItem(`bfsa_plugin_${key}`)
        sendResponse(value ? JSON.parse(value) : null)
      } catch {
        sendResponse(null)
      }
      break
    }

    case 'remove': {
      const { key } = data as { key: string }
      localStorage.removeItem(`bfsa_plugin_${key}`)
      sendResponse()
      break
    }

    case 'clear':
      Object.keys(localStorage)
        .filter((k) => k.startsWith('bfsa_plugin_'))
        .forEach((k) => localStorage.removeItem(k))
      sendResponse()
      break

    default:
      sendResponse(undefined, `Unknown data method: ${method}`)
  }
}

/**
 * Handle export.* API calls
 */
function handleExportAPI(
  method: string,
  data: unknown,
  _context: APIHandlerContext,
  sendResponse: (data?: unknown, error?: string) => void
): void {
  switch (method) {
    case 'json': {
      const { filename = 'export.json', data: jsonData } = data as ExportJSONData
      downloadFile(filename, JSON.stringify(jsonData, null, 2), 'application/json')
      sendResponse()
      break
    }

    case 'csv': {
      const { filename = 'export.csv', data: csvData } = data as ExportCSVData
      downloadFile(filename, jsonToCSV(csvData as unknown[]), 'text/csv')
      sendResponse()
      break
    }

    case 'copy': {
      const { text } = data as ExportCopyData
      navigator.clipboard
        .writeText(String(text))
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse(undefined, 'Failed to copy'))
      break
    }

    default:
      sendResponse(undefined, `Unknown export method: ${method}`)
  }
}

/**
 * Handle ui.* API calls
 */
function handleUIAPI(
  method: string,
  data: UIResizeData,
  context: APIHandlerContext,
  sendResponse: (data?: unknown, error?: string) => void
): void {
  switch (method) {
    case 'resize':
      context.resizeIframe?.(data.height)
      sendResponse()
      break

    case 'fullscreen':
      context.toggleFullscreen?.()
      sendResponse()
      break

    default:
      sendResponse(undefined, `Unknown ui method: ${method}`)
  }
}

// =============================================================================
// Helpers
// =============================================================================

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function jsonToCSV(data: unknown[]): string {
  if (!Array.isArray(data) || data.length === 0) return ''
  const headers = Object.keys(data[0] as object)
  const rows = data.map((obj) =>
    headers.map((h) => {
      const val = (obj as Record<string, unknown>)[h]
      // Escape quotes and wrap in quotes
      const strVal = typeof val === 'string' ? val : JSON.stringify(val)
      return `"${String(strVal).replace(/"/g, '""')}"`
    })
  )
  return [headers.join(','), ...rows].join('\n')
}
