/**
 * Remote Store - Zustand store for remote control session state.
 */

import { create } from 'zustand'
import type { ConnectionState } from '@/remote/ws-client'
import type { SessionRole } from '@/remote/remote-session'
import { RemoteSession } from '@/remote/remote-session'
import type { RemoteMessage, StateSyncMessage } from '@/remote/remote-protocol'

type RemoteMessageEntry = { role: string; content: string | null; messageId: string }

// ============================================================================
// LocalStorage Keys
// ============================================================================

const STORAGE_KEY = 'bfs-remote-session'

interface StoredSession {
  sessionId: string
  role: SessionRole
  relayUrl: string
  savedAt: number
}

function saveSessionToStorage(sessionId: string, role: SessionRole, relayUrl: string): void {
  try {
    const data: StoredSession = {
      sessionId,
      role,
      relayUrl,
      savedAt: Date.now(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    console.log('[RemoteStore] Session saved to localStorage:', data)
  } catch (e) {
    console.warn('[RemoteStore] Failed to save session to localStorage:', e)
  }
}

function loadSessionFromStorage(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as StoredSession

    // Check if session is too old (24 hours)
    const MAX_AGE = 24 * 60 * 60 * 1000
    if (Date.now() - data.savedAt > MAX_AGE) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }

    return data
  } catch (e) {
    console.warn('[RemoteStore] Failed to load session from localStorage:', e)
    return null
  }
}

function clearSessionFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    console.log('[RemoteStore] Session cleared from localStorage')
  } catch (e) {
    console.warn('[RemoteStore] Failed to clear session from localStorage:', e)
  }
}

// ============================================================================
// Store Interface
// ============================================================================

interface RemoteState {
  // Connection
  connectionState: ConnectionState
  role: SessionRole
  sessionId: string | null
  peerCount: number
  relayUrl: string
  error: string | null

  // Track if remote has ever connected (for auto-close panel behavior)
  remoteHasConnected: boolean

  // Remote view (for Remote role)
  remoteMessages: RemoteMessageEntry[]
  remoteAgentStatus: 'idle' | 'thinking' | 'tool_calling' | 'error'
  thinkingText: string

  // Session instance (not serialized)
  session: RemoteSession | null

  // Internal callback hooks for Host to receive remote commands
  _onRemoteMessage: ((content: string, messageId: string) => void) | null
  _onRemoteCancel: (() => void) | null

  // Actions
  setRelayUrl: (url: string) => void
  createSession: () => Promise<string>
  joinSession: (sessionId: string) => Promise<void>
  reconnect: (sessionId: string, role: SessionRole, relayUrl: string) => Promise<void>
  closeSession: () => void
  sendMessage: (content: string, messageId: string) => void
  sendCancel: () => void
  clearError: () => void
}

export const useRemoteStore = create<RemoteState>()((set, get) => ({
  connectionState: 'disconnected',
  role: 'none',
  sessionId: null,
  peerCount: 0,
  relayUrl: 'ws://localhost:3001',
  error: null,
  remoteHasConnected: false, // Track if remote has ever connected
  remoteMessages: [],
  remoteAgentStatus: 'idle',
  thinkingText: '',
  session: null,
  _onRemoteMessage: null,
  _onRemoteCancel: null,

  setRelayUrl: (url) => {
    set({ relayUrl: url })
    const session = get().session
    if (session) {
      session.setRelayUrl(url)
    }
  },

  createSession: async () => {
    const { relayUrl } = get()
    console.log('[RemoteStore] Creating session with relayUrl:', relayUrl)

    const session = new RemoteSession(relayUrl, {
      onConnectionStateChange: (state) => {
        console.log('[RemoteStore] Connection state:', state)
        set({ connectionState: state })
      },
      onRoleChange: (role) => {
        console.log('[RemoteStore] Role changed to:', role)
        set({ role })
        // Save session when role is established
        const sessionId = get().sessionId
        if (sessionId && role !== 'none') {
          saveSessionToStorage(sessionId, role, relayUrl)
        }
      },
      onSessionIdChange: (sessionId) => {
        console.log('[RemoteStore] SessionId changed to:', sessionId)
        set({ sessionId })
      },
      onPeerChange: (peerCount) => {
        set({ peerCount })
        // Track if remote has connected (peerCount > 1 means host + remote)
        // Only set to true when transitioning from disconnected to connected
        // Never auto-reset to false - this allows proper panel auto-close behavior
        if (peerCount > 1 && !get().remoteHasConnected) {
          set({ remoteHasConnected: true })
        }
      },
      onError: (error) => {
        console.log('[RemoteStore] Error:', error)
        set({ error })
      },
      onRemoteMessage: (content, messageId) => {
        const store = get()
        store._onRemoteMessage?.(content, messageId)
      },
      onRemoteCancel: () => {
        const store = get()
        store._onRemoteCancel?.()
      },
    })

    set({ session })

    const sessionId = await session.createSession()
    console.log('[RemoteStore] Session created with ID:', sessionId)
    // sessionId 已经通过 onSessionIdChange 回调设置，这里再次设置以确保一致性
    set({ sessionId })

    // Save session to localStorage for auto-reconnect
    saveSessionToStorage(sessionId, 'host', get().relayUrl)

    return sessionId
  },

  joinSession: async (sessionId) => {
    const { relayUrl } = get()
    const session = new RemoteSession(relayUrl, {
      onConnectionStateChange: (state) => set({ connectionState: state }),
      onRoleChange: (role) => {
        set({ role })
        // Save session when role is established
        if (role !== 'none') {
          saveSessionToStorage(sessionId, role, relayUrl)
        }
      },
      onPeerChange: (peerCount) => set({ peerCount }),
      onError: (error) => set({ error }),
      onAgentEvent: (event: RemoteMessage) => {
        handleRemoteAgentEvent(event, set, get)
      },
      onStateSync: (state: StateSyncMessage) => {
        set({
          remoteMessages: state.messages,
          remoteAgentStatus: state.agentStatus,
        })
      },
    })

    set({ session, sessionId })
    await session.joinSession(sessionId)
  },

  reconnect: async (sessionId, role, relayUrl) => {
    console.log('[RemoteStore] Reconnecting to session:', sessionId, 'as', role)

    const session = new RemoteSession(relayUrl, {
      onConnectionStateChange: (state) => {
        console.log('[RemoteStore] Reconnection state:', state)
        set({ connectionState: state })
      },
      onRoleChange: (r) => set({ role: r }),
      onSessionIdChange: (id) => set({ sessionId: id }),
      onPeerChange: (peerCount) => {
        set({ peerCount })
        // Track if remote has connected (peerCount > 1 means host + remote)
        // Only set to true when transitioning from disconnected to connected
        // Never auto-reset to false - this allows proper panel auto-close behavior
        if (peerCount > 1 && !get().remoteHasConnected) {
          set({ remoteHasConnected: true })
        }
      },
      onError: (error) => {
        console.log('[RemoteStore] Reconnection error:', error)
        set({ error })
      },
      onRemoteMessage: (content, messageId) => {
        const store = get()
        store._onRemoteMessage?.(content, messageId)
      },
      onRemoteCancel: () => {
        const store = get()
        store._onRemoteCancel?.()
      },
      onAgentEvent: (event: RemoteMessage) => {
        handleRemoteAgentEvent(event, set, get)
      },
      onStateSync: (state: StateSyncMessage) => {
        set({
          remoteMessages: state.messages,
          remoteAgentStatus: state.agentStatus,
        })
      },
    })

    set({ session, sessionId, relayUrl })

    // Rejoin the session using the appropriate method
    if (role === 'host') {
      await session.reconnectAsHost(sessionId)
    } else {
      await session.joinSession(sessionId)
    }
  },

  closeSession: () => {
    const { session } = get()
    if (session) {
      session.close()
    }
    clearSessionFromStorage()
    set({
      session: null,
      sessionId: null,
      role: 'none',
      connectionState: 'disconnected',
      peerCount: 0,
      remoteHasConnected: false, // Reset remote connection tracking
      remoteMessages: [],
      remoteAgentStatus: 'idle',
      thinkingText: '',
      error: null,
    })
  },

  sendMessage: (content, messageId) => {
    const { session } = get()
    if (session) {
      session.sendRemoteMessage(content, messageId)
    }
  },

  sendCancel: () => {
    const { session } = get()
    if (session) {
      session.sendRemoteCancel()
    }
  },

  clearError: () => set({ error: null }),
}))

// ============================================================================
// Auto-reconnect on load
// ============================================================================

/** Attempt to reconnect to a previously saved session */
export function attemptReconnect(): boolean {
  const stored = loadSessionFromStorage()
  if (!stored) {
    console.log('[RemoteStore] No saved session found')
    return false
  }

  console.log('[RemoteStore] Found saved session, attempting reconnect...')
  const store = useRemoteStore.getState()

  // Set initial state
  useRemoteStore.setState({
    sessionId: stored.sessionId,
    role: stored.role,
    relayUrl: stored.relayUrl,
    connectionState: 'connecting',
    peerCount: 0, // Reset peer count, will be updated when session:joined arrives
  })

  // Attempt reconnection
  store.reconnect(stored.sessionId, stored.role, stored.relayUrl).catch((err) => {
    console.error('[RemoteStore] Auto-reconnect failed:', err)
    // Clear stored session on failure
    clearSessionFromStorage()
    useRemoteStore.setState({
      connectionState: 'disconnected',
      role: 'none',
      sessionId: null,
    })
  })

  return true
}

/** Register callbacks for Host mode (called by AgentPanel) */
export function registerRemoteCallbacks(
  onMessage: (content: string, messageId: string) => void,
  onCancel: () => void
): void {
  useRemoteStore.setState({
    _onRemoteMessage: onMessage,
    _onRemoteCancel: onCancel,
  })
}

/** Handle incoming agent events on the Remote side */
function handleRemoteAgentEvent(
  event: RemoteMessage,
  set: (partial: Partial<RemoteState>) => void,
  get: () => RemoteState
): void {
  switch (event.type) {
    case 'agent:message':
      set({
        remoteMessages: [
          ...get().remoteMessages,
          { role: event.role, content: event.content, messageId: event.messageId },
        ],
        thinkingText: '',
      })
      break

    case 'agent:thinking':
      set({
        thinkingText: get().thinkingText + event.delta,
      })
      break

    case 'agent:status':
      set({ remoteAgentStatus: event.status })
      if (event.status === 'idle') {
        set({ thinkingText: '' })
      }
      break

    case 'agent:tool_call':
      set({
        remoteMessages: [
          ...get().remoteMessages,
          {
            role: 'tool_call',
            content: `Tool: ${event.toolName}(${event.args})`,
            messageId: event.toolCallId,
          },
        ],
      })
      break

    case 'agent:tool_result':
      // Tool results are typically followed by an agent message
      break

    case 'file:change':
      set({
        remoteMessages: [
          ...get().remoteMessages,
          {
            role: 'system',
            content: `File ${event.changeType}: ${event.path}`,
            messageId: `file-${Date.now()}`,
          },
        ],
      })
      break

    default:
      break
  }
}
