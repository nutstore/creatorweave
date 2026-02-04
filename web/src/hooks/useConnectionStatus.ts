/**
 * useConnectionStatus - Extract connection status color logic
 *
 * Returns visual indicator colors based on connection state, role, and peer count
 * This logic is extracted as a separate hook for improved testability
 */

import type { ConnectionState } from '@/remote/ws-client'
import type { SessionRole } from '@/remote/remote-session'
import { useRemoteStore } from '@/store/remote.store'

/**
 * Connection status dot color
 */
export type ConnectionDotColor = 'bg-gray-400' | 'bg-yellow-400' | 'bg-green-400'

/**
 * Calculate the dot color for connection status
 *
 * @param params - Connection status parameters
 * @returns Corresponding Tailwind CSS color class name
 */
export function getConnectionDotColor(params: {
  isActive: boolean
  connectionState: ConnectionState
  role: SessionRole
  peerCount: number
}): ConnectionDotColor {
  const { isActive, connectionState, role, peerCount } = params

  // Inactive state: gray
  if (!isActive) return 'bg-gray-400'

  // Disconnected: gray
  if (connectionState === 'disconnected') return 'bg-gray-400'

  // Connecting/reconnecting: yellow
  if (connectionState === 'connecting' || connectionState === 'reconnecting') {
    return 'bg-yellow-400'
  }

  // Host: only truly connected when there are peers (host + at least one remote)
  if (role === 'host') {
    return peerCount > 1 ? 'bg-green-400' : 'bg-yellow-400'
  }

  // Remote: considered ready when connected to relay
  return 'bg-green-400'
}

/**
 * Check if connected (used for showing QR button)
 *
 * @param connectionState - Current connection state
 * @returns Whether connected
 */
export function isConnected(connectionState: ConnectionState): boolean {
  return connectionState === 'connected'
}

/**
 * Hook version: Get state from remote store and calculate connection indicator
 *
 * Usage example:
 * ```tsx
 * const { connectionDotColor, isConnected, isReady } = useConnectionStatus()
 * ```
 */
export function useConnectionStatus() {
  const isActive = useRemoteStore((s) => s.role !== 'none')
  const connectionState = useRemoteStore((s) => s.connectionState)
  const role = useRemoteStore((s) => s.role)
  const peerCount = useRemoteStore((s) => s.peerCount)

  // Validate peerCount is non-negative (defensive programming)
  const safePeerCount = Math.max(0, peerCount)

  const connectionDotColor = getConnectionDotColor({
    isActive,
    connectionState,
    role,
    peerCount: safePeerCount,
  })

  return {
    connectionDotColor,
    isConnected: isConnected(connectionState),
    isReady: connectionState === 'connected',
  }
}
