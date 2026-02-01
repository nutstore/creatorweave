/**
 * Remote Control Protocol - message types for Host ↔ Server ↔ Remote communication.
 *
 * All messages are JSON-serialized and optionally E2E encrypted.
 *
 * Flow:
 *   Browser A (Host)  ──WebSocket──▶  Relay Server  ◀──WebSocket──  Browser B (Remote)
 */

// ============================================================================
// Session lifecycle
// ============================================================================

export interface SessionCreateMessage {
  type: 'session:create'
  sessionId: string
  /** Public key for E2E key exchange (base64) */
  publicKey: string
}

export interface SessionJoinMessage {
  type: 'session:join'
  sessionId: string
  /** Public key for E2E key exchange (base64) */
  publicKey: string
}

export interface SessionJoinedMessage {
  type: 'session:joined'
  sessionId: string
  /** Number of peers currently connected */
  peerCount: number
}

export interface SessionErrorMessage {
  type: 'session:error'
  error: string
}

export interface SessionCloseMessage {
  type: 'session:close'
  sessionId: string
}

export interface SessionClosedMessage {
  type: 'session:closed'
  sessionId: string
  /** Reason for closure (e.g., 'host_disconnected', 'session_ended') */
  reason: 'host_disconnected' | 'session_ended'
}

export interface PeerDisconnectedMessage {
  type: 'peer:disconnected'
  sessionId: string
}

// ============================================================================
// Agent events (Host → Remote)
// ============================================================================

export interface AgentMessageEvent {
  type: 'agent:message'
  /** User or assistant message content */
  role: 'user' | 'assistant'
  content: string
  messageId: string
  timestamp: number
}

export interface AgentThinkingEvent {
  type: 'agent:thinking'
  /** Streaming content delta */
  delta: string
}

export interface AgentToolCallEvent {
  type: 'agent:tool_call'
  toolName: string
  args: string
  toolCallId: string
}

export interface AgentToolResultEvent {
  type: 'agent:tool_result'
  toolCallId: string
  result: string
}

export interface AgentStatusEvent {
  type: 'agent:status'
  status: 'idle' | 'thinking' | 'tool_calling' | 'error'
}

// ============================================================================
// File change events (Host → Remote)
// ============================================================================

export interface FileChangeEvent {
  type: 'file:change'
  path: string
  changeType: 'create' | 'modify' | 'delete'
  /** Optional preview of the change (truncated for large files) */
  preview?: string
}

// ============================================================================
// Remote commands (Remote → Host)
// ============================================================================

export interface RemoteSendMessage {
  type: 'remote:send_message'
  content: string
  messageId: string
  timestamp: number
}

export interface RemoteCancelMessage {
  type: 'remote:cancel'
}

// ============================================================================
// State sync (Host → Remote on join)
// ============================================================================

export interface StateSyncMessage {
  type: 'sync:state'
  /** Recent conversation messages (last N) */
  messages: Array<{
    role: string
    content: string | null
    messageId: string
    timestamp: number
  }>
  /** Current agent status */
  agentStatus: 'idle' | 'thinking' | 'tool_calling' | 'error'
}

// ============================================================================
// Heartbeat
// ============================================================================

export interface PingMessage {
  type: 'ping'
  timestamp: number
}

export interface PongMessage {
  type: 'pong'
  timestamp: number
}

// ============================================================================
// Encryption state (Bidirectional)
// ============================================================================

/** Indicates encryption is ready (sent after key exchange completes) */
export interface EncryptionReadyMessage {
  type: 'encryption:ready'
  encrypted: true // This message itself is encrypted to verify the channel
  timestamp: number
}

/** Indicates encryption error */
export interface EncryptionErrorMessage {
  type: 'encryption:error'
  error: string
  timestamp: number
}

// ============================================================================
// Union type
// ============================================================================

export type RemoteMessage =
  | SessionCreateMessage
  | SessionJoinMessage
  | SessionJoinedMessage
  | SessionErrorMessage
  | SessionCloseMessage
  | SessionClosedMessage
  | PeerDisconnectedMessage
  | AgentMessageEvent
  | AgentThinkingEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentStatusEvent
  | FileChangeEvent
  | RemoteSendMessage
  | RemoteCancelMessage
  | StateSyncMessage
  | PingMessage
  | PongMessage
  | EncryptionReadyMessage
  | EncryptionErrorMessage

/** Envelope wrapping encrypted messages */
export interface EncryptedEnvelope {
  encrypted: true
  /** Base64-encoded ciphertext */
  data: string
  /** Base64-encoded IV/nonce */
  iv: string
}

/** Wire format: either plain message or encrypted envelope */
export type WireMessage = RemoteMessage | EncryptedEnvelope

/** Type guard for encrypted envelope */
export function isEncryptedEnvelope(msg: unknown): msg is EncryptedEnvelope {
  return typeof msg === 'object' && msg !== null && (msg as EncryptedEnvelope).encrypted === true
}
