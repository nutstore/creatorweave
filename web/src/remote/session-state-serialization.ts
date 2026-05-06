/**
 * Session State Serialization
 *
 * Handles saving and restoring complete session state for cross-device continuity.
 * Includes conversation history, agent memory, file state, and UI state.
 */

import type { Conversation, Message, MessageRole } from '@/agent/message-types'
import type { MemoryEntry } from '@/agent/context-memory'

//=============================================================================
// Session State Types
//=============================================================================

export interface SessionState {
  /** Session metadata */
  metadata: SessionMetadata

  /** Conversation history */
  conversations: SerializedConversation[]

  /** File system state */
  files: FileSystemState

  /** Agent memory and context */
  agent: AgentState

  /** UI preferences and layout */
  ui: UIState

  /** Remote session data (if applicable) */
  remote?: RemoteState
}

export interface SessionMetadata {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  deviceId: string
  browserInfo: string
  version: string
}

export interface SerializedConversation {
  id: string
  title: string
  messages: SerializedMessage[]
  createdAt: number
  updatedAt: number
  status: 'idle' | 'pending' | 'streaming' | 'tool_calling' | 'error'
  /** Computed message count */
  messageCount: number
  /** Whether there are more messages (truncated) */
  hasMore: boolean
}

export interface SerializedMessage {
  id: string
  role: Exclude<MessageRole, 'system'>
  content: string | null
  reasoning?: string | null
  toolCalls?: SerializedToolCall[]
  toolResults?: SerializedToolResult[]
  timestamp: number
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface SerializedToolCall {
  id: string
  name: string
  arguments: string
}

export interface SerializedToolResult {
  toolCallId: string
  name: string
  content: string
}

export interface FileSystemState {
  /** Root directory handle name */
  rootName: string | null
  /** Recently accessed files */
  recentFiles: string[]
  /** File handle metadata */
  handles: Record<string, FileHandleMetadata>
  /** Last selected file */
  activeFile: string | null
}

export interface FileHandleMetadata {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: number
}

export interface AgentState {
  /** Memory entries */
  memories: MemoryEntry[]

  /** Session preferences */
  preferences: AgentPreferences

  /** Last tool recommendations */
  recommendedTools: string[]
}

export interface AgentPreferences {
  /** Preferred model */
  model: string
  /** Temperature setting */
  temperature: number
  /** Max iterations */
  maxIterations: number
  /** Auto-enable features */
  autoPrefetch: boolean
  /** Learning mode enabled */
  learningEnabled: boolean
}

export interface UIState {
  /** Theme preference */
  theme: 'light' | 'dark' | 'system'
  /** Layout configuration */
  layout: UILayout
  /** Panel states */
  panels: PanelStates
  /** Command palette history */
  commandHistory: string[]
}

export interface UILayout {
  /** Main layout direction */
  direction: 'horizontal' | 'vertical'
  /** Panel sizes (percentages) */
  sizes: number[]
}

export interface PanelStates {
  sidebar: boolean
  conversation: boolean
  fileTree: boolean
  tools: boolean
  output: boolean
}

export interface RemoteState {
  /** Session ID for remote connection */
  sessionId: string | null
  /** Role: host or remote */
  role: 'host' | 'remote' | null
  /** Encryption enabled */
  encryptionEnabled: boolean
  /** Peer count */
  peerCount: number
}

//=============================================================================
// Serialization Utilities
//=============================================================================

/**
 * Serialize a conversation to JSON-compatible format
 */
export function serializeConversation(conversation: Conversation): SerializedConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map(serializeMessage),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    status: conversation.status,
    messageCount: conversation.messages.length,
    hasMore: false,
  }
}

/**
 * Deserialize a conversation from serialized format
 */
export function deserializeConversation(data: SerializedConversation): Conversation {
  return {
    id: data.id,
    title: data.title,
    messages: data.messages.map(deserializeMessage),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    // Runtime state - set defaults
    status: data.status,
    streamingContent: '',
    streamingReasoning: '',
    isReasoningStreaming: false,
    completedReasoning: null,
    isContentStreaming: false,
    completedContent: null,
    currentToolCall: null,
    activeToolCalls: [],
    streamingToolArgs: '',
    streamingToolArgsByCallId: {},
    error: null,
    // Runtime state
    agentMode: 'act',
  }
}

/**
 * Serialize a message to JSON-compatible format
 */
export function serializeMessage(message: Message): SerializedMessage {
  // Skip system messages
  if (message.role === 'system') {
    return {
      id: message.id,
      role: 'user',
      content: null,
      timestamp: message.timestamp,
    }
  }

  const result: SerializedMessage = {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
  }

  // Add reasoning if present
  if (message.reasoning) {
    result.reasoning = message.reasoning
  }

  // Add tool calls if present (for assistant role)
  if (message.toolCalls && message.toolCalls.length > 0) {
    result.toolCalls = message.toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }))
  }

  // Add tool result info if present (for tool role)
  if (message.role === 'tool' && (message.toolCallId || message.name)) {
    result.toolResults = [
      {
        toolCallId: message.toolCallId || '',
        name: message.name || '',
        content: message.content || '',
      },
    ]
  }

  // Add usage if present
  if (message.usage) {
    result.usage = {
      promptTokens: message.usage.promptTokens,
      completionTokens: message.usage.completionTokens,
      totalTokens: message.usage.totalTokens,
    }
  }

  return result
}

/**
 * Deserialize a message from serialized format
 */
export function deserializeMessage(data: SerializedMessage): Message {
  const result: Message = {
    id: data.id,
    role: data.role,
    content: data.content,
    timestamp: data.timestamp,
  }

  // Add reasoning if present
  if (data.reasoning) {
    result.reasoning = data.reasoning
  }

  // Add tool calls if present
  if (data.toolCalls && data.toolCalls.length > 0) {
    result.toolCalls = data.toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    }))
  }

  // Add tool result info if present (for tool role messages)
  if (data.toolResults && data.toolResults.length > 0) {
    result.toolCallId = data.toolResults[0].toolCallId
    result.name = data.toolResults[0].name
  }

  // Add usage if present
  if (data.usage) {
    result.usage = {
      promptTokens: data.usage.promptTokens,
      completionTokens: data.usage.completionTokens,
      totalTokens: data.usage.totalTokens,
    }
  }

  return result
}

//=============================================================================
// Session State Manager
//=============================================================================

export interface SessionStateManagerOptions {
  /** Maximum number of conversations to keep */
  maxConversations?: number
  /** Maximum number of messages per conversation */
  maxMessagesPerConversation?: number
  /** Include file handles (can be large) */
  includeFileHandles?: boolean
  /** Include memory entries */
  includeMemories?: boolean
}

const DEFAULT_OPTIONS: Required<SessionStateManagerOptions> = {
  maxConversations: 50,
  maxMessagesPerConversation: 100,
  includeFileHandles: false,
  includeMemories: true,
}

/**
 * Session State Manager
 *
 * Handles creating, saving, loading, and managing session states.
 */
export class SessionStateManager {
  private options: Required<SessionStateManagerOptions>
  private storageKey = 'app-session'

  constructor(options: SessionStateManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  //===========================================================================
  // Session Creation
  //===========================================================================

  /**
   * Create a new empty session state
   */
  createSessionState(sessionId: string, name: string = 'Untitled Session'): SessionState {
    return {
      metadata: {
        id: sessionId,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deviceId: this.getDeviceId(),
        browserInfo: navigator.userAgent,
        version: '0.3.0', // Phase 5 version
      },
      conversations: [],
      files: {
        rootName: null,
        recentFiles: [],
        handles: {},
        activeFile: null,
      },
      agent: {
        memories: [],
        preferences: {
          model: 'glm-4.7',
          temperature: 0.7,
          maxIterations: 20,
          autoPrefetch: true,
          learningEnabled: true,
        },
        recommendedTools: [],
      },
      ui: {
        theme: 'system',
        layout: {
          direction: 'horizontal',
          sizes: [20, 50, 30],
        },
        panels: {
          sidebar: true,
          conversation: true,
          fileTree: true,
          tools: true,
          output: false,
        },
        commandHistory: [],
      },
    }
  }

  /**
   * Create session state from current application state
   */
  async createFromCurrentState(
    conversations: Conversation[],
    memories: MemoryEntry[],
    files: FileSystemState,
    ui: UIState
  ): Promise<SessionState> {
    const sessionId = this.generateSessionId()

    const serializedConversations = conversations
      .slice(-this.options.maxConversations)
      .map((conv) => this.truncateConversation(serializeConversation(conv)))

    return {
      metadata: {
        id: sessionId,
        name: this.generateSessionName(conversations),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deviceId: this.getDeviceId(),
        browserInfo: navigator.userAgent,
        version: '0.3.0',
      },
      conversations: serializedConversations,
      files,
      agent: {
        memories: this.options.includeMemories ? memories.slice(-100) : [],
        preferences: {
          model: 'glm-4.7',
          temperature: 0.7,
          maxIterations: 20,
          autoPrefetch: true,
          learningEnabled: true,
        },
        recommendedTools: [],
      },
      ui,
    }
  }

  //===========================================================================
  // Serialization
  //===========================================================================

  /**
   * Serialize session state to JSON string
   */
  serialize(state: SessionState): string {
    return JSON.stringify(state, null, 2)
  }

  /**
   * Deserialize session state from JSON string
   */
  deserialize(data: string): SessionState | null {
    try {
      const state = JSON.parse(data) as SessionState

      // Validate required fields
      if (!state.metadata?.id || !state.metadata?.version) {
        console.warn('[SessionStateManager] Invalid session state: missing required fields')
        return null
      }

      // Validate version compatibility
      const [major] = state.metadata.version.split('.').map(Number)
      if (major !== 0) {
        console.warn(`[SessionStateManager] Unknown version: ${state.metadata.version}`)
      }

      return state
    } catch (error) {
      console.error('[SessionStateManager] Failed to deserialize session:', error)
      return null
    }
  }

  //===========================================================================
  // Local Storage
  //===========================================================================

  /**
   * Save session state to localStorage
   */
  async saveToStorage(state: SessionState): Promise<void> {
    try {
      const serialized = this.serialize(state)
      localStorage.setItem(this.storageKey, serialized)

      // Also save to IndexedDB for larger states
      await this.saveToIndexedDB(state)

      console.log(`[SessionStateManager] Saved session: ${state.metadata.id}`)
    } catch (error) {
      console.error('[SessionStateManager] Failed to save session:', error)
      throw error
    }
  }

  /**
   * Load session state from localStorage
   */
  async loadFromStorage(): Promise<SessionState | null> {
    try {
      // Try IndexedDB first for larger states
      const idbState = await this.loadFromIndexedDB()
      if (idbState) {
        return idbState
      }

      // Fall back to localStorage
      const data = localStorage.getItem(this.storageKey)
      if (data) {
        return this.deserialize(data)
      }

      return null
    } catch (error) {
      console.error('[SessionStateManager] Failed to load session:', error)
      return null
    }
  }

  /**
   * Save to IndexedDB for larger session states
   */
  private async saveToIndexedDB(state: SessionState): Promise<void> {
    const db = await this.openIndexedDB()
    if (!db) return

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readwrite')
      const store = transaction.objectStore('sessions')

      const request = store.put({
        id: state.metadata.id,
        ...state,
        savedAt: Date.now(),
      })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Load from IndexedDB
   */
  private async loadFromIndexedDB(): Promise<SessionState | null> {
    const db = await this.openIndexedDB()
    if (!db) return null

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readonly')
      const store = transaction.objectStore('sessions')
      const request = store.get(this.storageKey)

      request.onsuccess = () => {
        const result = request.result
        if (result) {
          const { ...state } = result
          resolve(state as SessionState)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  private openIndexedDB(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open('AppSessions', 1)

        request.onerror = () => resolve(null)
        request.onsuccess = () => {
          const db = request.result
          if (db.version === 1) {
            if (!db.objectStoreNames.contains('sessions')) {
              db.createObjectStore('sessions', { keyPath: 'id' })
            }
          }
          resolve(db)
        }

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'id' })
          }
        }
      } catch {
        resolve(null)
      }
    })
  }

  //===========================================================================
  // Session List Management
  //===========================================================================

  /**
   * Get list of all saved sessions (metadata only)
   */
  async getSessionList(): Promise<SessionMetadata[]> {
    const db = await this.openIndexedDB()
    if (!db) return []

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readonly')
      const store = transaction.objectStore('sessions')
      const request = store.getAll()

      request.onsuccess = () => {
        const results = request.result || []
        resolve(
          results
            .map(({ ...metadata }) => metadata as SessionMetadata)
            .sort((a, b) => b.updatedAt - a.updatedAt)
        )
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Delete a saved session
   */
  async deleteSession(sessionId: string): Promise<void> {
    localStorage.removeItem(this.storageKey)

    const db = await this.openIndexedDB()
    if (!db) return

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readwrite')
      const store = transaction.objectStore('sessions')
      const request = store.delete(sessionId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  //===========================================================================
  // Utility Methods
  //===========================================================================

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    return `session-${timestamp}-${random}`
  }

  /**
   * Generate a session name from conversations
   */
  private generateSessionName(conversations: Conversation[]): string {
    if (conversations.length === 0) {
      return 'Untitled Session'
    }

    // Use the first message of the first conversation as title
    const firstConv = conversations[0]
    const firstMessage = firstConv.messages.find((m) => m.role === 'user')

    if (firstMessage && typeof firstMessage.content === 'string') {
      // Truncate to 50 characters
      const text = firstMessage.content.trim().substring(0, 50)
      return text || 'Untitled Session'
    }

    return 'Untitled Session'
  }

  /**
   * Truncate conversation to max messages
   */
  private truncateConversation(conv: SerializedConversation): SerializedConversation {
    if (conv.messages.length <= this.options.maxMessagesPerConversation) {
      return conv
    }

    // Keep the first and last messages, truncate middle
    const firstMessages = conv.messages.slice(0, 3)
    const lastMessages = conv.messages.slice(-this.options.maxMessagesPerConversation + 3)

    return {
      ...conv,
      messages: [...firstMessages, ...lastMessages],
      hasMore: true,
    }
  }

  /**
   * Get device ID (anonymous)
   */
  private getDeviceId(): string {
    let deviceId = localStorage.getItem('device-id')
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      localStorage.setItem('device-id', deviceId)
    }
    return deviceId
  }
}

//=============================================================================
// Singleton Instance
//=============================================================================

let managerInstance: SessionStateManager | null = null

export function getSessionStateManager(options?: SessionStateManagerOptions): SessionStateManager {
  if (!managerInstance) {
    managerInstance = new SessionStateManager(options)
  }
  return managerInstance
}

/**
 * Reset the singleton instance (mainly for testing)
 */
export function resetSessionStateManager(): void {
  managerInstance = null
}
