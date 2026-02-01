/**
 * Remote Control Panel - Dialog for creating session and showing QR code.
 *
 * Auto-closes when remote peer connects AFTER panel is opened.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { useRemoteStore } from '@/store/remote.store'

interface RemoteControlPanelProps {
  open: boolean
  onClose: () => void
}

export const RemoteControlPanel: React.FC<RemoteControlPanelProps> = ({ open, onClose }) => {
  const [relayUrl, setRelayUrl] = useState(useRemoteStore.getState().relayUrl)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const {
    connectionState,
    role,
    sessionId,
    peerCount,
    createSession,
    setRelayUrl: storeSetRelayUrl,
  } = useRemoteStore()

  const isActive = role !== 'none'
  const hasSession = isActive && sessionId

  // Track remote connection state when panel opens
  const remoteConnectedWhenOpenedRef = useRef(false)

  // Reset tracking when panel opens
  useEffect(() => {
    if (open) {
      console.log('[RemoteControlPanel] Panel opened, peerCount:', peerCount)
      remoteConnectedWhenOpenedRef.current = peerCount > 1
    }
  }, [open, peerCount])

  // Auto-close when remote connects AFTER panel is opened
  // Only close when:
  // 1. Panel is open
  // 2. We are the host
  // 3. Remote was NOT connected when panel opened
  // 4. Remote is now connected (peerCount > 1)
  // 5. Connection is stable (not just connecting)
  useEffect(() => {
    if (
      open &&
      role === 'host' &&
      !remoteConnectedWhenOpenedRef.current &&
      peerCount > 1 &&
      connectionState === 'connected'
    ) {
      console.log('[RemoteControlPanel] Remote connected after panel opened, closing...')
      onClose()
    }
  }, [role, peerCount, connectionState, open, onClose])

  const handleCreate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      storeSetRelayUrl(relayUrl)
      await createSession()
      // Don't close - show QR code for scanning
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session')
    } finally {
      setLoading(false)
    }
  }, [relayUrl, createSession, storeSetRelayUrl])

  const handleCopySessionId = useCallback(async () => {
    if (sessionId) {
      try {
        await navigator.clipboard.writeText(sessionId)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // Ignore clipboard errors
      }
    }
  }, [sessionId])

  if (!open) return null

  const handleBackdropClick = (_e: React.MouseEvent) => {
    // Don't close when clicking backdrop if session is active
    if (isActive) return
    onClose()
  }

  // Generate join URL for QR code
  // Points to Relay Server's /join endpoint which redirects to mobile-web
  const joinUrl = hasSession
    ? relayUrl.replace('ws://', 'http://').replace('wss://', 'https://') + `/join/${sessionId}`
    : null

  // Also show direct mobile-web URL as fallback
  const mobileUrl = hasSession ? `${window.location.origin}/?session=${sessionId}` : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button (X) - only closes dialog, doesn't disconnect */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          title="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h2 className="mb-4 text-lg font-semibold text-gray-900">Remote Control</h2>

        {/* Relay URL */}
        <label className="mb-1 block text-sm font-medium text-gray-600">Relay Server</label>
        <input
          type="text"
          value={relayUrl}
          onChange={(e) => setRelayUrl(e.target.value)}
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          placeholder="ws://localhost:3001"
          disabled={isActive}
        />

        {/* QR Code display */}
        {hasSession ? (
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Scan with mobile to connect
            </label>
            <p className="mb-2 text-xs text-gray-500">Scan QR code or open link on mobile device</p>

            {/* QR Code */}
            <div className="flex justify-center rounded-lg border border-gray-200 bg-white p-4">
              <QRCodeCanvas value={joinUrl!} size={200} level="M" includeMargin={false} />
            </div>

            {/* Session ID with copy button */}
            <div className="mt-3 flex items-center justify-center gap-2">
              <code className="font-mono text-sm text-gray-600">{sessionId}</code>
              <button
                onClick={handleCopySessionId}
                className="rounded px-2 py-1 text-xs text-primary-600 hover:bg-primary-50"
                title="Copy session ID"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* URLs for reference */}
            <div className="mt-2 space-y-1">
              <a
                href={joinUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="block break-all text-center text-xs text-primary-600 underline hover:text-primary-700"
              >
                {joinUrl}
              </a>
              <a
                href={mobileUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="block break-all text-center text-xs text-gray-400 hover:text-gray-600"
              >
                Direct: {mobileUrl}
              </a>
            </div>
          </div>
        ) : (
          <div className="mb-4 py-8 text-center text-sm text-gray-500">
            Click &quot;Create Session&quot; to generate QR code
          </div>
        )}

        {/* Error display */}
        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {/* Connection status (when active) */}
        {isActive && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-md bg-gray-50 px-3 py-2">
            <span
              className={`h-2 w-2 rounded-full ${
                connectionState === 'connected' ? 'bg-green-500' : 'bg-yellow-500'
              }`}
            />
            <span className="text-sm text-gray-700">
              {connectionState === 'connected' ? 'Connected' : 'Connecting...'}
            </span>
            {peerCount > 0 && (
              <span className="text-xs text-gray-500">
                ({peerCount} peer{peerCount !== 1 ? 's' : ''})
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {isActive ? (
            <button
              onClick={() => {
                useRemoteStore.getState().closeSession()
                onClose()
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Disconnect
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Session'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
