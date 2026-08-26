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
// Conversation sync (Host → Remote)
// ============================================================================

export interface ConversationSyncMessage {
  type: 'sync:conversations'
  conversations: Array<{
    id: string
    title: string
    messages: Array<{
      role: string
      content: string | null
      messageId: string
      timestamp: number
    }>
    createdAt: number
    updatedAt: number
    status: 'idle' | 'pending' | 'streaming' | 'tool_calling' | 'error'
    hasMore: boolean
    messageCount: number
  }>
  activeConversationId: string | null
  hostRootName: string | null
}

export interface SyncRequestMessage {
  type: 'sync:request'
  fullSync: boolean
  conversationTimestamps?: Record<string, number>
}

export interface SyncPageRequestMessage {
  type: 'sync:page:request'
  conversationId: string
  page: number
}

export interface SyncPageResponseMessage {
  type: 'sync:page:response'
  conversationId: string
  page: number
  totalPages: number
  messages: Array<{
    role: string
    content: string | null
    messageId: string
    timestamp: number
  }>
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
// File Discovery Messages (Remote ←→ Host)
// ============================================================================

/** File entry shared between Host and Remote */
export interface FileEntry {
  path: string // Full path
  name: string // File/directory name
  type: 'file' | 'directory'
  extension?: string
  size?: number
  modified?: number
  children?: FileEntry[] // Child entries for directories
}

/** Remote requests file search */
export interface FileSearchRequest {
  type: 'file:search'
  query: string
  limit?: number // Default 50
}

/** Host returns search results */
export interface FileSearchResult {
  type: 'file:search-result'
  query: string
  results: FileEntry[]
  hasMore: boolean
}

/** Host pushes recent files to Remote */
export interface RecentFilesMessage {
  type: 'files:recent'
  files: FileEntry[]
  trigger: 'modified' | 'accessed'
}

/** Remote selects a file for @reference */
export interface FileSelectMessage {
  type: 'file:selected'
  path: string
}

/** Host pushes file tree update to Remote (only rootName, Remote doesn't need full tree) */
export interface FileTreeUpdateMessage {
  type: 'file:tree-update'
  /** Root directory name for display */
  rootName: string | null
}

/** Host responds to Remote's file tree request */
export interface FileTreeResponseMessage {
  type: 'file:tree-response'
  /** Root directory name for display */
  rootName: string | null
}

/** Remote requests current file tree from Host */
export interface FileTreeRequestMessage {
  type: 'file:tree-request'
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
  | ConversationSyncMessage
  | SyncRequestMessage
  | SyncPageRequestMessage
  | SyncPageResponseMessage
  | PingMessage
  | PongMessage
  | EncryptionReadyMessage
  | EncryptionErrorMessage
  | FileSearchRequest
  | FileSearchResult
  | RecentFilesMessage
  | FileSelectMessage
  | FileTreeUpdateMessage
  | FileTreeResponseMessage
  | FileTreeRequestMessage

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
