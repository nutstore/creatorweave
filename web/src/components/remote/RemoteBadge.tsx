/**
 * Remote Badge - status indicator in the header bar.
 *
 * Always shows:
 * - Connection state indicator
 * - Encryption state indicator (🔓/🔒/⚠️)
 * - Session ID (with copy button)
 * - Peer count
 * - Disconnect button
 * - Button to open RemoteControlPanel
 */

import React, { useState, useCallback, useMemo } from 'react'
import { useRemoteStore } from '@/store/remote.store'
import { RemoteControlPanel } from './RemoteControlPanel'
import { QrCode, Lock, Unlock, AlertTriangle, Key, RefreshCw } from 'lucide-react'

const ENCRYPTION_STATE_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; tooltip: string }
> = {
  none: { icon: <Unlock className="h-3 w-3" />, color: 'text-gray-400', tooltip: 'No encryption' },
  generating: {
    icon: <Key className="h-3 w-3 animate-pulse" />,
    color: 'text-yellow-400',
    tooltip: 'Generating keys...',
  },
  exchanging: {
    icon: <RefreshCw className="h-3 w-3 animate-spin" />,
    color: 'text-yellow-400',
    tooltip: 'Exchanging keys...',
  },
  ready: {
    icon: <Lock className="h-3 w-3 text-green-500" />,
    color: 'text-green-500',
    tooltip: 'E2E encrypted',
  },
  error: {
    icon: <AlertTriangle className="h-3 w-3 text-red-500" />,
    color: 'text-red-500',
    tooltip: 'Encryption error',
  },
}

export const RemoteBadge: React.FC = () => {
  const [panelOpen, setPanelOpen] = useState(false)
  const {
    connectionState,
    role,
    sessionId,
    peerCount,
    error,
    encryptionState,
    encryptionError,
    closeSession,
    clearError,
  } = useRemoteStore()

  const isActive = role !== 'none'

  // Derive display state based on WebSocket connection AND peer presence
  const displayState = useMemo(() => {
    // If WebSocket is not connected, show that state
    if (connectionState === 'disconnected') {
      return { label: 'Disconnected', color: 'bg-gray-400' }
    }
    if (connectionState === 'connecting' || connectionState === 'reconnecting') {
      return { label: 'Connecting...', color: 'bg-yellow-400' }
    }

    // WebSocket is connected, check peer status
    if (role === 'host') {
      // Host: only "connected" when there's at least one remote peer
      if (peerCount > 1) {
        return { label: 'Connected', color: 'bg-green-400' }
      }
      return { label: 'Waiting for remote...', color: 'bg-yellow-400' }
    }

    // Remote: connected to relay means ready
    return { label: 'Connected', color: 'bg-green-400' }
  }, [connectionState, role, peerCount])

  const handleCopySessionId = useCallback(() => {
    if (sessionId) {
      navigator.clipboard.writeText(sessionId).catch(() => {
        // Fallback: do nothing
      })
    }
  }, [sessionId])

  // Inactive state - show button to open RemoteControlPanel
  if (!isActive) {
    return (
      <>
        <button
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          title="Open Remote Control"
        >
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          Remote
        </button>
        <RemoteControlPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
      </>
    )
  }

  // Active session view - always show full status
  return (
    <>
      <div className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-sm">
        {/* Connection indicator */}
        <span className={`h-2 w-2 rounded-full ${displayState.color}`} title={displayState.label} />

        {/* Encryption indicator */}
        <span
          className={ENCRYPTION_STATE_CONFIG[encryptionState]?.color}
          title={ENCRYPTION_STATE_CONFIG[encryptionState]?.tooltip}
        >
          {ENCRYPTION_STATE_CONFIG[encryptionState]?.icon}
        </span>

        {/* Role badge */}
        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium uppercase">
          {role}
        </span>

        {/* Session ID */}
        {sessionId && (
          <button
            onClick={handleCopySessionId}
            className="font-mono text-xs text-muted-foreground hover:text-foreground"
            title="Click to copy session ID"
          >
            {sessionId.slice(0, 8)}...
          </button>
        )}

        {/* Peer count - only shown for Host, showing connected Remote count (excluding self) */}
        {role === 'host' && peerCount > 1 && (
          <span className="text-xs text-muted-foreground" title="Connected remote devices">
            {peerCount - 1} Remote{peerCount - 1 !== 1 ? 's' : ''}
          </span>
        )}

        {/* Status text for Host when waiting */}
        {role === 'host' && peerCount <= 1 && connectionState === 'connected' && (
          <span className="text-xs text-muted-foreground">Waiting for remote...</span>
        )}

        {/* Error or Encryption Error */}
        {(error || encryptionError) && (
          <button
            onClick={clearError}
            className="max-w-[120px] truncate text-xs text-destructive"
            title={(error ?? '') || (encryptionError ?? '')}
          >
            {error || encryptionError}
          </button>
        )}

        {/* QR Code button - opens RemoteControlPanel */}
        <button
          onClick={() => setPanelOpen(true)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Show QR Code"
        >
          <QrCode className="h-4 w-4" />
        </button>

        {/* Disconnect */}
        <button
          onClick={closeSession}
          className="ml-auto rounded px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10"
          title="Disconnect"
        >
          Disconnect
        </button>
      </div>

      {/* RemoteControlPanel - dialog for QR code and session management */}
      <RemoteControlPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  )
}
