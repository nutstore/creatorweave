/**
 * PluginHTMLRenderer - Simplified
 *
 * Renders plugin-provided HTML content in an isolated iframe.
 * Uses modular architecture for better maintainability.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'

// Types
import type { PluginHTMLRendererProps } from './api/types'

// Modules
import { generateBFSAAPIScript } from './api/BFSAAPIScript'
import { handleBFSAAPICall, type APIHandlerContext } from './api/BFSAAPIHandler'
import { IFRAME_STYLES } from './styles/iframe-styles'
import { PluginDialog } from './ui/PluginDialog'
import { showToast, type ToastType } from './ui/PluginToast'

export function PluginHTMLRenderer({ result, onAction, analysisData }: PluginHTMLRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(result.height || 400)
  const [isReady, setIsReady] = useState(false)

  // Dialog state
  const [dialog, setDialog] = useState<{
    isOpen: boolean
    message: string
    type: 'confirm' | 'alert' | 'info'
    onResult: (result: boolean | null) => void
  }>({ isOpen: false, message: '', type: 'info', onResult: () => {} })

  // =============================================================================
  // Show toast notification (now using sonner)
  // =============================================================================

  const handleShowToast = useCallback((message: string, type: ToastType) => {
    showToast(message, type)
  }, [])

  // =============================================================================
  // Show confirmation dialog
  // =============================================================================

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({
        isOpen: true,
        message,
        type: 'confirm',
        onResult: (result) => resolve(result === true),
      })
    })
  }, [])

  // =============================================================================
  // Resize iframe
  // =============================================================================

  const resizeIframe = useCallback((newHeight: number) => {
    setHeight(newHeight)
  }, [])

  // =============================================================================
  // Toggle fullscreen
  // =============================================================================

  const toggleFullscreen = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      iframe.requestFullscreen()
    }
  }, [])

  // =============================================================================
  // Send response to iframe
  // =============================================================================

  const sendResponse = useCallback((id: string, data?: unknown, error?: string) => {
    const iframe = iframeRef.current
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        {
          type: 'bfsa-api-response',
          id,
          data,
          error,
        },
        '*'
      )
    }
  }, [])

  // =============================================================================
  // Build API context for handler
  // =============================================================================

  const apiContext: APIHandlerContext = useMemo(
    () => ({
      analysisData,
      showToast: handleShowToast,
      showConfirm,
      resizeIframe,
      toggleFullscreen,
      sendResponse,
    }),
    [analysisData, handleShowToast, showConfirm, resizeIframe, toggleFullscreen, sendResponse]
  )

  // =============================================================================
  // Handle messages from iframe
  // =============================================================================

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify source
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        const msg = event.data

        switch (msg.type) {
          case 'bfsa-api-ready':
            setIsReady(true)
            console.log('[BFSA] Plugin API ready')
            break

          case 'bfsa-api-call':
            handleBFSAAPICall(msg, apiContext)
            break

          default:
            // Forward to parent
            onAction?.(msg.type, msg.data)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onAction, apiContext])

  // =============================================================================
  // Build the complete iframe HTML
  // =============================================================================

  const buildIframeHTML = (): string => {
    const userHTML = result.content
    const bodyMatch = userHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const headMatch = userHTML.match(/<head[^>]*>([\s\S]*?)<\/head>/i)

    const bodyContent = bodyMatch ? bodyMatch[1] : userHTML
    const userStyles = headMatch ? headMatch[1] : ''

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>${IFRAME_STYLES}</style>
          <style>${userStyles}</style>
          <script>${generateBFSAAPIScript()}</script>
        </head>
        <body>${bodyContent}</body>
      </html>
    `
  }

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50">
      {/* Header bar */}
      {result.title && (
        <div className="flex items-center justify-between rounded-t-lg border-b border-gray-200 bg-white px-4 py-2">
          <span className="text-sm font-medium text-gray-700">{result.title}</span>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full transition-colors ${
                isReady ? 'bg-green-500' : 'bg-yellow-500'
              }`}
            />
            <span className="text-xs text-gray-500">{isReady ? 'Ready' : 'Loading...'}</span>
          </div>
        </div>
      )}

      {/* Iframe */}
      <iframe
        ref={iframeRef}
        srcDoc={buildIframeHTML()}
        sandbox="allow-scripts allow-same-origin"
        className="w-full bg-white"
        style={{ height: `${height}px`, minHeight: '200px' }}
        title="Plugin Output"
      />

      {/* Footer with controls */}
      <div className="flex items-center justify-between rounded-b-lg border-t border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">BFSA API v2.0</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const iframe = iframeRef.current
              iframe?.contentWindow?.location.reload() // Force reload
            }}
            className="text-xs text-gray-500 transition-colors hover:text-gray-700"
          >
            Refresh
          </button>
          <button
            onClick={() => {
              const iframe = iframeRef.current
              if (iframe) {
                setHeight(result.height || 400)
              }
            }}
            className="text-xs text-gray-500 transition-colors hover:text-gray-700"
          >
            Reset Size
          </button>
        </div>
      </div>

      {/* Dialog */}
      <PluginDialog
        isOpen={dialog.isOpen}
        message={dialog.message}
        type={dialog.type}
        onClose={(result) => {
          setDialog((prev) => ({ ...prev, isOpen: false }))
          dialog.onResult(result)
        }}
      />

    </div>
  )
}
