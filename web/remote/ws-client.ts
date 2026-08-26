/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WebSocket Client - Socket.IO based client for relay server connection.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat ping/pong to detect stale connections
 * - Event-based message dispatching
 * - Graceful close and cleanup
 */

import { io, Socket } from 'socket.io-client'
import type { RemoteMessage } from './remote-protocol'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface WSClientCallbacks {
  onStateChange?: (state: ConnectionState) => void
  onMessage?: (message: RemoteMessage) => void
  onError?: (error: string) => void
  onReconnect?: () => void // Called when successfully reconnected after disconnect
}

/** Reconnection configuration */
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const RECONNECT_MAX_ATTEMPTS = 10
const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 10_000

export class WSClient {
  private socket: Socket | null = null
  private serverUrl: string
  private callbacks: WSClientCallbacks
  private state: ConnectionState = 'disconnected'
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null
  private intentionallyClosed = false

  constructor(url: string, callbacks: WSClientCallbacks) {
    this.serverUrl = url
    this.callbacks = callbacks
  }

  /** Get current connection state */
  getState(): ConnectionState {
    return this.state
  }

  /** Connect to the relay server */
  connect(): void {
    if (this.socket && this.socket.connected) {
      return
    }

    this.intentionallyClosed = false
    this.setState('connecting')

    try {
      // Normalize and convert URL for Socket.IO
      // - ws:// → http://
      // - wss:// → https://
      // - No protocol → assume ws://
      let normalizedUrl = this.serverUrl.trim()
      if (!normalizedUrl.startsWith('ws://') && !normalizedUrl.startsWith('wss://')) {
        normalizedUrl = 'ws://' + normalizedUrl
      }
      const httpUrl = normalizedUrl.replace('ws://', 'http://').replace('wss://', 'https://')

      this.socket = io(httpUrl, {
        transports: ['websocket', 'polling'],
        reconnection: false, // We handle reconnection ourselves
        timeout: 10000,
      })

      this.setupSocketHandlers()
    } catch (e) {
      this.callbacks.onError?.(`Connection failed: ${e instanceof Error ? e.message : String(e)}`)
      this.scheduleReconnect()
    }
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return

    this.socket.on('connect', () => {
      this.handleOpen()
    })

    this.socket.on('disconnect', () => {
      this.handleClose()
    })

    this.socket.on('error', () => {
      this.handleError()
    })

    this.socket.on('message', (data: any) => {
      this.handleMessage(data)
    })
  }

  /** Send a message through the Socket.IO connection */
  send(message: any): boolean {
    if (!this.socket || !this.socket.connected) {
      return false
    }

    try {
      this.socket.emit('message', message)
      return true
    } catch {
      return false
    }
  }

  /** Gracefully close the connection */
  close(): void {
    this.intentionallyClosed = true
    this.cleanup()
    this.setState('disconnected')
  }

  /** Update the server URL (for reconnection to a different server) */
  setUrl(url: string): void {
    this.serverUrl = url
  }

  // ---- Private ----

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state
      this.callbacks.onStateChange?.(state)
    }
  }

  private handleOpen(): void {
    const wasReconnecting = this.reconnectAttempt > 0
    this.reconnectAttempt = 0
    this.setState('connected')
    this.startHeartbeat()

    // Notify callbacks if this was a reconnection
    if (wasReconnecting) {
      this.callbacks.onReconnect?.()
    }
  }

  private handleClose(): void {
    this.stopHeartbeat()

    if (this.intentionallyClosed) {
      this.setState('disconnected')
    } else {
      this.scheduleReconnect()
    }
  }

  private handleError(): void {
    this.callbacks.onError?.('Socket.IO error')
  }

  private handleMessage(data: any): void {
    // Reset heartbeat timeout on any received message
    this.clearHeartbeatTimeout()

    // Handle pong internally
    if (data.type === 'pong') {
      return
    }

    // Socket.IO automatically deserializes JSON
    this.callbacks.onMessage?.(data as RemoteMessage)
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed) return
    if (this.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      this.callbacks.onError?.('Max reconnection attempts reached')
      this.setState('disconnected')
      return
    }

    this.setState('reconnecting')

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS
    )
    const jitter = Math.random() * baseDelay * 0.3
    const delay = baseDelay + jitter

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++
      this.connect()
    }, delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.send({ type: 'ping', timestamp: Date.now() })

        // Set timeout for pong response
        this.heartbeatTimeout = setTimeout(() => {
          // No pong received — connection is stale
          this.socket?.disconnect()
        }, HEARTBEAT_TIMEOUT_MS)
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.clearHeartbeatTimeout()
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  private cleanup(): void {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }
}
