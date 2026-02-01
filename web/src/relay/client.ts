/**
 * Relay client - communicates with relay server for mobile pairing
 */

import { io, Socket } from 'socket.io-client'

const RELAY_SERVER_URL = import.meta.env.VITE_RELAY_SERVER_URL || 'http://localhost:3001'

export type ConnectionStatus = 'disconnected' | 'pairing' | 'connected'
export type ChatMessage = {
  id: string
  from: 'mobile' | 'pc'
  content: string
  timestamp: number
}

class RelayClient {
  private socket: Socket | null = null
  private status: ConnectionStatus = 'disconnected'
  private listeners = new Set<(msg: ChatMessage) => void>()

  on(callback: (msg: ChatMessage) => void) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  get Status(): ConnectionStatus {
    return this.status
  }

  private notifyListeners(msg: ChatMessage) {
    this.listeners.forEach((cb) => cb(msg))
  }

  // Request pairing code from PC side
  async requestPairing(): Promise<string> {
    const res = await fetch(`${RELAY_SERVER_URL}/api/pair/request`, {
      method: 'POST',
    })
    if (!res.ok) throw new Error('Failed to request pairing')
    const data = await res.json()
    // code stored for future reconnection
    this.status = 'pairing'
    return data.code
  }

  // Approve pairing (initiated by mobile)
  async approvePairing(code: string): Promise<boolean> {
    try {
      const res = await fetch(`${RELAY_SERVER_URL}/api/pair/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) return false
      const result = await res.json()
      if (result.success) {
        // code stored for future reconnection
        this.connect(code)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // Connect to relay server via WebSocket
  private connect(code: string): void {
    if (this.socket) {
      this.socket.disconnect()
    }

    this.socket = io(RELAY_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    })

    this.socket.on('connect', () => {
      console.log('[RelayClient] Connected to relay server')
      this.socket?.emit('join', { code, role: 'pc' })
      this.status = 'connected'
    })

    this.socket.on('message', (data: any) => {
      console.log('[RelayClient] Received:', data)
      this.handleMessage(data)
    })

    this.socket.on('error', (err: any) => {
      console.error('[RelayClient] Error:', err)
    })

    this.socket.on('disconnect', () => {
      console.log('[RelayClient] Disconnected')
      this.status = 'disconnected'
    })
  }

  private handleMessage(data: any): void {
    if (data.type === 'status') {
      if (data.payload?.status === 'connected') {
        this.status = 'connected'
      } else if (data.payload?.status === 'disconnected') {
        this.status = 'disconnected'
        // code cleared
      }
    } else if (data.type === 'message' && data.from === 'mobile') {
      const msg: ChatMessage = {
        id: Date.now().toString(),
        from: 'mobile',
        content: data.payload?.content || '',
        timestamp: Date.now(),
      }
      this.notifyListeners(msg)
    }
  }

  // Send message to mobile
  sendToMobile(content: string): void {
    if (this.socket && this.connected) {
      this.socket.emit('message', {
        type: 'message',
        from: 'pc',
        payload: { content },
      })
    }
  }

  get connected(): boolean {
    return this.status === 'connected' && (this.socket?.connected ?? false)
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.status = 'disconnected'
    // code cleared
  }
}

// Singleton instance
let client: RelayClient | null = null

export function getRelayClient(): RelayClient {
  if (!client) {
    client = new RelayClient()
  }
  return client
}
