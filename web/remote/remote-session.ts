/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Remote Session Manager - orchestrates Host and Remote roles.
 *
 * Host: creates session, broadcasts Agent events, receives remote commands.
 * Remote: joins session, receives Agent events, sends user messages.
 */

import { WSClient, type ConnectionState, type WSClientCallbacks } from './ws-client'
import {
  E2EEncryption,
  generateSessionId,
  type EncryptionState,
  isEncryptedEnvelope,
  isProtocolMessage,
  mustEncrypt,
} from '@creatorweave/encryption'
import type {
  RemoteMessage,
  WireMessage,
  AgentStatusEvent,
  FileChangeEvent,
  StateSyncMessage,
  FileSearchRequest,
  FileSearchResult,
  FileSelectMessage,
  FileEntry,
  SyncRequestMessage,
  SyncPageRequestMessage,
} from './remote-protocol'

export type SessionRole = 'host' | 'remote' | 'none'

export interface RemoteSessionCallbacks {
  /** Connection state changed */
  onConnectionStateChange?: (state: ConnectionState) => void
  /** Session role established */
  onRoleChange?: (role: SessionRole) => void
  /** Session ID changed */
  onSessionIdChange?: (sessionId: string) => void
  /** Peer joined/left */
  onPeerChange?: (peerCount: number) => void
  /** New peer joined (Host only) - use this to send initial data like file tree */
  onPeerJoined?: () => void
  /** Encryption state changed */
  onEncryptionStateChange?: (state: EncryptionState, error?: string) => void
  /** Received a user message from remote peer (Host only) */
  onRemoteMessage?: (content: string, messageId: string) => void
  /** Received agent cancel from remote peer (Host only) */
  onRemoteCancel?: () => void
  /** Received agent event (Remote only) */
  onAgentEvent?: (event: RemoteMessage) => void
  /** Received state sync (Remote only) */
  onStateSync?: (state: StateSyncMessage) => void
  /** File discovery callbacks (Host only) */
  onFileSearch?: (query: string, limit: number | undefined) => Promise<FileEntry[]>
  onFileSelect?: (path: string) => void
  onFileTreeRequest?: () => void // Remote requests current file tree
  /** Conversation sync callbacks (Host only) */
  onSyncRequest?: (fullSync: boolean, timestamps?: Record<string, number>) => void
  onSyncPageRequest?: (conversationId: string, page: number) => void
  /** Error occurred */
  onError?: (error: string) => void
}

const DEFAULT_RELAY_URL = 'ws://localhost:3001'

export class RemoteSession {
  private client: WSClient
  private encryption = new E2EEncryption(false) // Debug mode off by default
  private encryptionStateUnsubscribe: (() => void) | null = null
  private callbacks: RemoteSessionCallbacks
  private role: SessionRole = 'none'
  private sessionId: string | null = null
  private encryptionEnabled = true
  private lastPublicKey: string | null = null // Save for reconnection

  constructor(relayUrl: string = DEFAULT_RELAY_URL, callbacks: RemoteSessionCallbacks = {}) {
    this.callbacks = callbacks

    // Subscribe to encryption state changes
    this.encryptionStateUnsubscribe = this.encryption.onStateChange((state, error) => {
      console.log('[RemoteSession] Encryption state:', state, error ?? '')
      this.callbacks.onEncryptionStateChange?.(state, error)
    })

    const wsCallbacks: WSClientCallbacks = {
      onStateChange: (state) => {
        this.callbacks.onConnectionStateChange?.(state)
      },
      onMessage: (msg) => {
        this.handleMessage(msg)
      },
      onError: (err) => {
        this.callbacks.onError?.(err)
      },
      onReconnect: () => {
        this.handleReconnect()
      },
    }

    this.client = new WSClient(relayUrl, wsCallbacks)
  }

  /** Get current role */
  getRole(): SessionRole {
    return this.role
  }

  /** Get current session ID */
  getSessionId(): string | null {
    return this.sessionId
  }

  /** Get connection state */
  getConnectionState(): ConnectionState {
    return this.client.getState()
  }

  /**
   * Create a new session as Host.
   * Returns the session ID to share with remote peers.
   */
  async createSession(): Promise<string> {
    console.log('[RemoteSession] createSession: Starting...')
    this.sessionId = generateSessionId()
    this.role = 'host'
    console.log('[RemoteSession] Generated sessionId:', this.sessionId, 'role:', this.role)

    this.callbacks.onRoleChange?.(this.role)
    this.callbacks.onSessionIdChange?.(this.sessionId)

    // Generate encryption key pair
    console.log('[RemoteSession] Generating encryption key pair...')
    const publicKey = await this.encryption.generateKeyPair()
    this.lastPublicKey = publicKey // Save for reconnection
    console.log('[RemoteSession] Key pair generated')

    // Connect to relay
    this.client.connect()

    // Wait for connection, then send create message
    await this.waitForConnection()

    this.client.send({
      type: 'session:create',
      sessionId: this.sessionId,
      publicKey,
    })

    return this.sessionId
  }

  /**
   * Join an existing session as Remote.
   */
  async joinSession(sessionId: string): Promise<void> {
    this.sessionId = sessionId
    this.role = 'remote'
    this.callbacks.onRoleChange?.(this.role)
    this.callbacks.onSessionIdChange?.(sessionId)

    // Generate encryption key pair
    const publicKey = await this.encryption.generateKeyPair()
    this.lastPublicKey = publicKey // Save for reconnection

    // Connect to relay
    this.client.connect()

    // Wait for connection, then send join message
    await this.waitForConnection()

    this.client.send({
      type: 'session:join',
      sessionId,
      publicKey,
    })
  }

  /**
   * Reconnect as Host using an existing sessionId.
   * This allows reconnection after page reload or temporary disconnect.
   */
  async reconnectAsHost(sessionId: string): Promise<void> {
    console.log('[RemoteSession] Reconnecting as host with sessionId:', sessionId)
    this.sessionId = sessionId
    this.role = 'host'
    this.callbacks.onRoleChange?.(this.role)
    this.callbacks.onSessionIdChange?.(this.sessionId)

    // Generate new encryption key pair
    const publicKey = await this.encryption.generateKeyPair()
    this.lastPublicKey = publicKey

    // Connect to relay
    this.client.connect()

    // Wait for connection, then send create message with existing sessionId
    await this.waitForConnection()

    this.client.send({
      type: 'session:create',
      sessionId: this.sessionId,
      publicKey,
    })
  }

  /**
   * Handle automatic reconnection after connection loss.
   * Resends the session join/create message with saved session info.
   */
  private async handleReconnect(): Promise<void> {
    console.log(
      '[RemoteSession] Handling reconnection, role:',
      this.role,
      'sessionId:',
      this.sessionId
    )

    if (!this.sessionId || !this.lastPublicKey) {
      console.log('[RemoteSession] No session info saved, skipping reconnect')
      return
    }

    // Regenerate key pair for security (new connection, new keys)
    const publicKey = await this.encryption.generateKeyPair()
    this.lastPublicKey = publicKey

    // Resend session message based on role
    if (this.role === 'host') {
      console.log('[RemoteSession] Resending session:create after reconnect')
      this.client.send({
        type: 'session:create',
        sessionId: this.sessionId,
        publicKey,
      })
    } else if (this.role === 'remote') {
      console.log('[RemoteSession] Resending session:join after reconnect')
      this.client.send({
        type: 'session:join',
        sessionId: this.sessionId,
        publicKey,
      })
    }
  }

  /** Close the session */
  close(): void {
    if (this.sessionId) {
      this.client.send({
        type: 'session:close',
        sessionId: this.sessionId,
      })
    }
    this.client.close()
    this.encryptionStateUnsubscribe?.()
    this.encryption.reset()
    this.role = 'none'
    this.sessionId = null
    this.callbacks.onRoleChange?.(this.role)
  }

  /** Update relay server URL */
  setRelayUrl(url: string): void {
    this.client.setUrl(url)
  }

  /** Toggle encryption */
  setEncryption(enabled: boolean): void {
    this.encryptionEnabled = enabled
  }

  // ---- Host: broadcast Agent events ----

  /** Broadcast an agent message event */
  broadcastAgentMessage(role: 'user' | 'assistant', content: string, messageId: string): void {
    this.sendSecure({
      type: 'agent:message',
      role,
      content,
      messageId,
      timestamp: Date.now(),
    })
  }

  /** Broadcast streaming thinking delta */
  broadcastThinking(delta: string): void {
    this.sendSecure({ type: 'agent:thinking', delta })
  }

  /** Broadcast tool call start */
  broadcastToolCall(toolName: string, args: string, toolCallId: string): void {
    this.sendSecure({ type: 'agent:tool_call', toolName, args, toolCallId })
  }

  /** Broadcast tool call result */
  broadcastToolResult(toolCallId: string, result: string): void {
    this.sendSecure({ type: 'agent:tool_result', toolCallId, result })
  }

  /** Broadcast agent status change */
  broadcastStatus(status: AgentStatusEvent['status']): void {
    this.sendSecure({ type: 'agent:status', status })
  }

  /** Broadcast file change */
  broadcastFileChange(
    path: string,
    changeType: FileChangeEvent['changeType'],
    preview?: string
  ): void {
    this.sendSecure({ type: 'file:change', path, changeType, preview })
  }

  /** Broadcast file tree update to all remotes (only rootName, Remote doesn't need full tree) */
  broadcastFileTreeUpdate(
    _fileTree: import('@/remote/remote-protocol').FileEntry | null,
    rootName: string | null
  ): void {
    this.sendSecure({
      type: 'file:tree-update',
      rootName,
    })
  }

  /** Send file tree response to remote (answer to file:tree-request) */
  sendFileTreeResponse(
    _fileTree: import('@/remote/remote-protocol').FileEntry | null,
    rootName: string | null
  ): void {
    this.sendSecure({
      type: 'file:tree-response',
      rootName,
    })
  }

  /** Send full state sync to newly joined remote */
  sendStateSync(state: StateSyncMessage): void {
    this.sendSecure(state)
  }

  // ---- Remote: send commands ----

  /** Send a user message from remote to host */
  sendRemoteMessage(content: string, messageId: string): void {
    this.sendSecure({
      type: 'remote:send_message',
      content,
      messageId,
      timestamp: Date.now(),
    })
  }

  /** Send cancel command from remote to host */
  sendRemoteCancel(): void {
    this.sendSecure({ type: 'remote:cancel' })
  }

  /** Send an unencrypted message (for file discovery, etc.) */
  send(message: RemoteMessage): void {
    this.client.send(message)
  }

  // ---- Private ----

  private async sendSecure(message: RemoteMessage): Promise<void> {
    console.log('[RemoteSession] Sending message:', message.type, message)

    // Protocol messages are sent unencrypted
    if (isProtocolMessage(message)) {
      this.client.send(message)
      return
    }

    // Messages that MUST be encrypted
    if (mustEncrypt(message.type) && this.encryptionEnabled) {
      if (!this.encryption.isReady()) {
        const error = `Cannot send "${message.type}": encryption not ready`
        this.callbacks.onError?.(error)
        throw new Error(error)
      }

      try {
        const wireMessage = await this.encryption.encrypt(message)
        this.client.send(wireMessage)
        return
      } catch (e) {
        const error = `Encryption failed for "${message.type}": ${e instanceof Error ? e.message : String(e)}`
        this.callbacks.onError?.(error)
        throw new Error(error)
      }
    }

    // Other messages sent as-is
    this.client.send(message)
  }

  private async handleMessage(raw: WireMessage): Promise<void> {
    console.log('[RemoteSession] Received message:', raw)
    let message: RemoteMessage

    // Decrypt if needed
    if (isEncryptedEnvelope(raw)) {
      if (!this.encryption.isReady()) {
        this.callbacks.onError?.('Received encrypted message but encryption not ready')
        return
      }
      try {
        message = (await this.encryption.decrypt(raw)) as RemoteMessage
      } catch (e) {
        this.callbacks.onError?.(
          `Failed to decrypt message: ${e instanceof Error ? e.message : String(e)}`
        )
        return
      }
    } else {
      message = raw as RemoteMessage
    }

    switch (message.type) {
      // Session lifecycle
      case 'session:joined':
        this.callbacks.onPeerChange?.(message.peerCount)
        // Notify Host that a new peer joined (for sending initial data)
        this.callbacks.onPeerJoined?.()
        break

      case 'session:error':
        this.callbacks.onError?.(message.error)
        break

      case 'peer:disconnected':
        this.callbacks.onPeerChange?.(0)
        break

      case 'session:create':
      case 'session:join':
        // Key exchange: derive shared key from peer's public key
        if (message.publicKey) {
          try {
            await this.encryption.deriveSharedKey(message.publicKey)
            // After deriving the shared key, send encryption:ready message
            if (this.encryption.isReady()) {
              try {
                const readyMsg = await this.encryption.encrypt({
                  type: 'encryption:ready',
                  encrypted: true,
                  timestamp: Date.now(),
                })
                this.client.send(readyMsg)
              } catch (e) {
                this.callbacks.onError?.(`Failed to send encryption:ready: ${e}`)
              }
            }
          } catch (e) {
            this.callbacks.onError?.(
              `Key exchange failed: ${e instanceof Error ? e.message : String(e)}`
            )
          }
        }
        break

      case 'encryption:ready':
        console.log('[RemoteSession] Received encryption:ready from peer')
        break

      case 'encryption:error':
        this.callbacks.onError?.(`Encryption error from peer: ${(message as any).error}`)
        break

      // Remote commands (received by Host)
      case 'remote:send_message':
        this.callbacks.onRemoteMessage?.(message.content, message.messageId)
        break

      case 'remote:cancel':
        this.callbacks.onRemoteCancel?.()
        break

      // Agent events (received by Remote)
      case 'agent:message':
      case 'agent:thinking':
      case 'agent:tool_call':
      case 'agent:tool_result':
      case 'agent:status':
      case 'file:change':
        this.callbacks.onAgentEvent?.(message)
        break

      // State sync (received by Remote)
      case 'sync:state':
        this.callbacks.onStateSync?.(message)
        break

      // File discovery messages
      case 'file:search': {
        const searchMsg = message as FileSearchRequest
        // Use async/await for file search
        this.callbacks
          .onFileSearch?.(searchMsg.query, searchMsg.limit)
          .then((results) => {
            const response: FileSearchResult = {
              type: 'file:search-result',
              query: searchMsg.query,
              results: results ?? [],
              hasMore: false,
            }
            this.client.send(response)
          })
          .catch((err) => {
            console.error('[RemoteSession] File search error:', err)
            // Send empty results on error
            const response: FileSearchResult = {
              type: 'file:search-result',
              query: searchMsg.query,
              results: [],
              hasMore: false,
            }
            this.client.send(response)
          })
        break
      }

      case 'file:selected': {
        const selectMsg = message as FileSelectMessage
        this.callbacks.onFileSelect?.(selectMsg.path)
        break
      }

      case 'file:tree-request': {
        // Remote requests current file tree
        this.callbacks.onFileTreeRequest?.()
        break
      }

      // Conversation sync (received by Host)
      case 'sync:request': {
        const syncReq = message as SyncRequestMessage
        this.callbacks.onSyncRequest?.(syncReq.fullSync, syncReq.conversationTimestamps)
        break
      }

      case 'sync:page:request': {
        const pageReq = message as SyncPageRequestMessage
        this.callbacks.onSyncPageRequest?.(pageReq.conversationId, pageReq.page)
        break
      }

      case 'files:recent':
        // Host receives this but doesn't need to handle (it sends these)
        console.log('[RemoteSession] Received files:recent (no action needed on Host)')
        break

      default:
        break
    }
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.client.getState() === 'connected') {
        resolve()
        return
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, 10_000)

      const checkInterval = setInterval(() => {
        if (this.client.getState() === 'connected') {
          clearTimeout(timeout)
          clearInterval(checkInterval)
          resolve()
        } else if (this.client.getState() === 'disconnected') {
          clearTimeout(timeout)
          clearInterval(checkInterval)
          reject(new Error('Connection failed'))
        }
      }, 100)
    })
  }
}
