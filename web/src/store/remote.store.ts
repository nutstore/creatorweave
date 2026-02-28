/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Remote Store - Zustand store for remote control session state.
 */

import { create } from 'zustand'
import type { ConnectionState } from '@/remote/ws-client'
import type { SessionRole } from '@/remote/remote-session'
import { RemoteSession } from '@/remote/remote-session'
import type { RemoteMessage, StateSyncMessage, FileEntry } from '@/remote/remote-protocol'
import type { EncryptionState } from '@browser-fs-analyzer/encryption'
import { fileDiscoveryService } from '@/services/file-discovery.service'
import { streamingBus } from '@/streaming-bus'

// 用于保存事件取消订阅函数
let streamingBusUnsubscribers: Array<() => void> = []

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
// Streaming Event Bus Setup
// ============================================================================

/**
 * Setup streaming event listeners that broadcast agent streaming events to remote sessions.
 * Called when a session is created/rejoined as host.
 */
function setupStreamingListeners(session: RemoteSession): void {
  // Cleanup any existing listeners
  streamingBusUnsubscribers.forEach((unsub) => unsub())
  streamingBusUnsubscribers = []

  // Thinking events
  streamingBusUnsubscribers.push(
    streamingBus.on('thinking:start', () => {
      session.broadcastStatus('thinking')
    })
  )

  streamingBusUnsubscribers.push(
    streamingBus.on('thinking:delta', (delta: string) => {
      session.broadcastThinking(delta)
    })
  )

  // Tool call events
  streamingBusUnsubscribers.push(
    streamingBus.on('tool:start', (toolCall: { name: string; args: string; id: string }) => {
      session.broadcastStatus('tool_calling')
      session.broadcastToolCall(toolCall.name, toolCall.args, toolCall.id)
    })
  )

  // Status events
  streamingBusUnsubscribers.push(
    streamingBus.on('complete', () => {
      session.broadcastStatus('idle')
    })
  )

  streamingBusUnsubscribers.push(
    streamingBus.on('error', (_error: string) => {
      session.broadcastStatus('error')
    })
  )

  streamingBusUnsubscribers.push(
    streamingBus.on('status:change', (status: 'idle' | 'thinking' | 'tool_calling' | 'error') => {
      session.broadcastStatus(status)
    })
  )

  console.log('[RemoteStore] Streaming listeners setup complete')
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

  // Encryption state
  encryptionState: EncryptionState
  encryptionError: string | null

  // Remote view (for Remote role)
  remoteMessages: RemoteMessageEntry[]
  remoteAgentStatus: 'idle' | 'thinking' | 'tool_calling' | 'error'
  thinkingText: string

  // Session instance (not serialized)
  session: RemoteSession | null

  // Internal callback hooks for Host to receive remote commands
  _onRemoteMessage: ((content: string, messageId: string) => void) | null
  _onRemoteCancel: (() => void) | null

  // File discovery (for Remote sessions)
  fileTree: FileEntry | null
  recentFiles: FileEntry[]

  // Callbacks for file discovery events
  _onFileSelect: ((path: string) => void) | null

  // Actions
  setRelayUrl: (url: string) => void
  createSession: () => Promise<string>
  joinSession: (sessionId: string) => Promise<void>
  reconnect: (sessionId: string, role: SessionRole, relayUrl: string) => Promise<void>
  closeSession: () => void
  sendMessage: (content: string, messageId: string) => void
  sendCancel: () => void
  clearError: () => void
  syncConversations: (fullSync?: boolean) => Promise<void>

  // File discovery actions
  setFileTree: (tree: FileEntry | null) => void
  setRecentFiles: (files: FileEntry[]) => void
  handleFileSearch: (query: string, limit?: number) => Promise<FileEntry[]>
  pushRecentFilesToRemote: () => void
  buildFileTreeFromCurrentHandle: () => Promise<void>
  refreshFileTree: () => Promise<void>
  getRole: () => SessionRole
}

export const useRemoteStore = create<RemoteState>()((set, get) => ({
  connectionState: 'disconnected',
  role: 'none',
  sessionId: null,
  peerCount: 0,
  relayUrl: 'ws://localhost:3001',
  error: null,
  remoteHasConnected: false, // Track if remote has ever connected
  encryptionState: 'none',
  encryptionError: null,
  remoteMessages: [],
  remoteAgentStatus: 'idle',
  thinkingText: '',
  session: null,
  _onRemoteMessage: null,
  _onRemoteCancel: null,

  // File discovery state
  fileTree: null,
  recentFiles: [],
  _onFileSelect: null,

  setRelayUrl: (url) => {
    set({ relayUrl: url })
    const session = get().session
    if (session) {
      session.setRelayUrl(url)
    }
  },

  createSession: async () => {
    const { relayUrl, session: existingSession } = get()
    console.log('[RemoteStore] Creating session with relayUrl:', relayUrl)

    // Close existing session if any
    if (existingSession) {
      console.log('[RemoteStore] Closing existing session before creating new one')
      existingSession.close()
    }

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
      onEncryptionStateChange: (state, error) => {
        console.log('[RemoteStore] Encryption state:', state, error ?? '')
        set({ encryptionState: state, encryptionError: error })
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
      // File discovery callbacks (for Host role)
      onFileSearch: (query, limit) => {
        return get().handleFileSearch(query, limit)
      },
      onFileSelect: (path) => {
        const store = get()
        store._onFileSelect?.(path)
      },
      onFileTreeRequest: async () => {
        // Remote requested file tree - send response (not broadcast update)
        const store = get()
        console.log(
          '[RemoteStore] file:tree-request received, fileTree:',
          store.fileTree ? 'exists' : 'null'
        )

        // Import agent.store to get directory name
        const agentModule = (await import('./agent.store')) as any
        const useAgentStore = agentModule.useAgentStore

        // If no file tree, build it first and wait
        if (!store.fileTree) {
          await store.buildFileTreeFromCurrentHandle()
          // Get updated store after build
          const updatedStore = get()
          // Always send a response, even if tree is null (no directory opened)
          const rootName = useAgentStore?.getState?.()?.directoryName
          store.session?.sendFileTreeResponse(updatedStore.fileTree, rootName || null)
          return
        }

        // Send the response with current file tree
        const rootName = useAgentStore?.getState?.()?.directoryName
        store.session?.sendFileTreeResponse(store.fileTree, rootName || null)
      },
      onPeerJoined: async () => {
        // Broadcast file tree to newly joined remote
        const store = get()
        if (store.fileTree) {
          const { useAgentStore } = await import('./agent.store')
          const rootName = useAgentStore.getState().directoryName
          store.session?.broadcastFileTreeUpdate(store.fileTree, rootName || null)
        }
        // Sync conversations to newly joined remote
        store.syncConversations()
      },
      // Conversation sync callbacks
      onSyncRequest: async (fullSync) => {
        console.log('[RemoteStore] Sync request received, fullSync:', fullSync)
        get().syncConversations(fullSync)
      },
      onSyncPageRequest: async (conversationId, page) => {
        console.log('[RemoteStore] Page request:', conversationId, 'page:', page)
        const { session } = get()
        if (!session) return

        const { useConversationStore } = await import('./conversation.store')
        const conv = useConversationStore
          .getState()
          .conversations.find((c) => c.id === conversationId)
        if (!conv) {
          console.warn('[RemoteStore] Conversation not found:', conversationId)
          return
        }

        const PAGE_SIZE = 100
        const startIdx = (page - 1) * PAGE_SIZE
        const endIdx = startIdx + PAGE_SIZE
        const messages = conv.messages.slice(startIdx, endIdx).map((msg) => ({
          ...msg,
          content: msg.content?.includes('data:image') ? '[图片]' : msg.content,
        }))

        const totalPages = Math.ceil(conv.messages.length / PAGE_SIZE)

        session.send({
          type: 'sync:page:response',
          conversationId,
          page,
          totalPages,
          messages,
        } as any)
      },
    })

    set({ session })
    // Setup streaming bus listeners to broadcast events to remote sessions
    setupStreamingListeners(session)

    const sessionId = await session.createSession()
    console.log('[RemoteStore] Session created with ID:', sessionId)
    // sessionId 已经通过 onSessionIdChange 回调设置，这里再次设置以确保一致性
    set({ sessionId })

    // Save session to localStorage for auto-reconnect
    saveSessionToStorage(sessionId, 'host', get().relayUrl)

    // Build file tree for file discovery (async, don't wait)
    const store = get()
    store.buildFileTreeFromCurrentHandle()

    return sessionId
  },

  joinSession: async (sessionId) => {
    const { relayUrl, session: existingSession } = get()

    // Close existing session if any
    if (existingSession) {
      console.log('[RemoteStore] Closing existing session before join')
      existingSession.close()
    }

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
      onEncryptionStateChange: (state, error) =>
        set({ encryptionState: state, encryptionError: error }),
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

    // Close existing session if any
    const { session: existingSession } = get()
    if (existingSession) {
      console.log('[RemoteStore] Closing existing session before reconnect')
      existingSession.close()
    }

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
      onEncryptionStateChange: (state, error) =>
        set({ encryptionState: state, encryptionError: error }),
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
      // File discovery callbacks (for Host role)
      onFileSearch: (query, limit) => {
        return get().handleFileSearch(query, limit)
      },
      onFileSelect: (path) => {
        const store = get()
        store._onFileSelect?.(path)
      },
      onFileTreeRequest: async () => {
        // Remote requested file tree - send response (not broadcast update)
        const store = get()
        console.log(
          '[RemoteStore] file:tree-request received, fileTree:',
          store.fileTree ? 'exists' : 'null'
        )

        // Import agent.store to get directory name
        const agentModule = (await import('./agent.store')) as any
        const useAgentStore = agentModule.useAgentStore

        // If no file tree, build it first and wait
        if (!store.fileTree) {
          await store.buildFileTreeFromCurrentHandle()
          // Get updated store after build
          const updatedStore = get()
          // Always send a response, even if tree is null (no directory opened)
          const rootName = useAgentStore?.getState?.()?.directoryName
          store.session?.sendFileTreeResponse(updatedStore.fileTree, rootName || null)
          return
        }

        // Send the response with current file tree
        const rootName = useAgentStore?.getState?.()?.directoryName
        store.session?.sendFileTreeResponse(store.fileTree, rootName || null)
      },
      onPeerJoined: async () => {
        // Broadcast file tree to newly joined remote
        const store = get()
        if (store.fileTree) {
          const { useAgentStore } = await import('./agent.store')
          const rootName = useAgentStore.getState().directoryName
          store.session?.broadcastFileTreeUpdate(store.fileTree, rootName || null)
        }
        // Sync conversations to newly joined remote
        store.syncConversations()
      },
      // Conversation sync callbacks
      onSyncRequest: async (fullSync) => {
        console.log('[RemoteStore] Sync request received, fullSync:', fullSync)
        get().syncConversations(fullSync)
      },
      onSyncPageRequest: async (conversationId, page) => {
        console.log('[RemoteStore] Page request:', conversationId, 'page:', page)
        const { session } = get()
        if (!session) return

        const { useConversationStore } = await import('./conversation.store')
        const conv = useConversationStore
          .getState()
          .conversations.find((c) => c.id === conversationId)
        if (!conv) {
          console.warn('[RemoteStore] Conversation not found:', conversationId)
          return
        }

        const PAGE_SIZE = 100
        const startIdx = (page - 1) * PAGE_SIZE
        const endIdx = startIdx + PAGE_SIZE
        const messages = conv.messages.slice(startIdx, endIdx).map((msg) => ({
          ...msg,
          content: msg.content?.includes('data:image') ? '[图片]' : msg.content,
        }))

        const totalPages = Math.ceil(conv.messages.length / PAGE_SIZE)

        session.send({
          type: 'sync:page:response',
          conversationId,
          page,
          totalPages,
          messages,
        } as any)
      },
    })

    set({ session, sessionId, relayUrl })
    // Setup streaming bus listeners to broadcast events to remote sessions
    setupStreamingListeners(session)

    // Rejoin the session using the appropriate method
    if (role === 'host') {
      await session.reconnectAsHost(sessionId)
      // Rebuild file tree after reconnecting as host
      const store = get()
      store.buildFileTreeFromCurrentHandle()
    } else {
      await session.joinSession(sessionId)
    }
  },

  closeSession: () => {
    const { session } = get()
    if (session) {
      session.close()
    }
    // Cleanup streaming listeners
    streamingBusUnsubscribers.forEach((unsub) => unsub())
    streamingBusUnsubscribers = []
    clearSessionFromStorage()
    set({
      session: null,
      sessionId: null,
      role: 'none',
      connectionState: 'disconnected',
      peerCount: 0,
      remoteHasConnected: false, // Reset remote connection tracking
      encryptionState: 'none',
      encryptionError: null,
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

  clearError: () => set({ error: null, encryptionError: null }),

  // ========================================================================
  // File Discovery Actions
  // ========================================================================

  setFileTree: async (tree) => {
    set({ fileTree: tree })
    // Update file discovery service with new tree
    if (tree) {
      const flatTree = await fileDiscoveryService.convertFileTreeToFlat(tree)
      console.log('[RemoteStore] File tree updated:', flatTree.length, 'files')
    }
  },

  setRecentFiles: (files) => {
    set({ recentFiles: files })
  },

  handleFileSearch: async (query, limit = 50) => {
    let { fileTree } = get()
    console.log('[RemoteStore] File search:', query, 'fileTree:', fileTree)

    // If no file tree, try to build it first
    if (!fileTree) {
      console.log('[RemoteStore] No file tree, attempting to build...')
      await get().buildFileTreeFromCurrentHandle()
      fileTree = get().fileTree
      console.log('[RemoteStore] After build, fileTree:', fileTree)
    }

    if (!fileTree) {
      console.warn(
        '[RemoteStore] File search requested but no file tree available (no directory handle)'
      )
      return []
    }

    const results = await fileDiscoveryService.search(query, [fileTree], { limit })
    console.log('[RemoteStore] Search results:', results.length, 'files')
    return results
  },

  /**
   * Build file tree from the agent store's directory handle
   * This should be called after creating a remote session as host
   */
  buildFileTreeFromCurrentHandle: async () => {
    const { useAgentStore } = await import('./agent.store')
    const dirHandle = useAgentStore.getState().directoryHandle
    if (!dirHandle) {
      console.warn('[RemoteStore] No directory handle available to build file tree')
      return
    }

    try {
      // Import traversal service
      const { traverseDirectory } = await import('../services/traversal.service')

      // Collect all file metadata
      const allFiles: Array<{
        name: string
        size: number
        type: 'file' | 'directory'
        lastModified: number
        path: string
      }> = []

      for await (const file of traverseDirectory(dirHandle)) {
        allFiles.push(file)
      }

      console.log('[RemoteStore] Collected', allFiles.length, 'entries for file tree')

      // Build hierarchical tree
      const tree = await fileDiscoveryService.buildFileTreeFromMetadata(allFiles)

      if (tree) {
        get().setFileTree(tree)
        console.log('[RemoteStore] File tree built successfully')

        // Broadcast to remotes if this is a host session
        const store = get()
        if (store.session && store.getRole() === 'host') {
          const rootName = useAgentStore.getState().directoryName
          store.session.broadcastFileTreeUpdate(tree, rootName || null)
          console.log('[RemoteStore] File tree broadcasted to remotes')
        }
      }
    } catch (error) {
      console.error('[RemoteStore] Failed to build file tree:', error)
    }
  },

  pushRecentFilesToRemote: () => {
    const { session } = get()
    if (!session) return

    const recentFiles = fileDiscoveryService.getRecentFiles()
    if (recentFiles.length === 0) return

    const message: {
      type: 'files:recent'
      files: FileEntry[]
      trigger: 'modified' | 'accessed'
    } = {
      type: 'files:recent',
      files: recentFiles,
      trigger: 'accessed',
    }

    session.send(message)
    console.log('[RemoteStore] Pushed recent files to remote:', recentFiles.length)
  },

  /**
   * Refresh file tree and broadcast update to connected remotes.
   * Called when the Host switches to a different directory.
   */
  refreshFileTree: async () => {
    console.log('[RemoteStore] Refreshing file tree...')
    await get().buildFileTreeFromCurrentHandle()

    // Broadcast the updated file tree to all connected remotes
    const { session, fileTree } = get()
    const { useAgentStore } = await import('./agent.store')
    const rootName = useAgentStore.getState().directoryName

    if (session) {
      session.broadcastFileTreeUpdate(fileTree, rootName || null)
      console.log('[RemoteStore] File tree update broadcasted to remotes')
    }
  },

  /**
   * Get the current session role.
   */
  getRole: () => {
    return get().role
  },

  /**
   * Sync conversations to remote peers (Host only).
   * @param _fullSync Whether to do a full sync (currently unused, reserved for future)
   */
  syncConversations: async (_fullSync = true) => {
    const { session, role } = get()
    if (role !== 'host' || !session) {
      console.warn('[RemoteStore] syncConversations: not a host or no session')
      return
    }

    // Dynamically import conversation.store
    const { useConversationStore } = await import('./conversation.store')
    const { conversations, activeConversationId } = useConversationStore.getState()

    // Dynamically import agent.store to get directory name
    const agentModule = await import('./agent.store')
    const hostRootName = agentModule.useAgentStore.getState().directoryName

    const PAGE_SIZE = 100
    const MAX_CONVERSATIONS = 20

    // Take the most recent 20 conversations, ordered by creation time
    const syncConversations = conversations.slice(0, MAX_CONVERSATIONS).map((conv) => {
      // Filter image content
      const messages = conv.messages.slice(0, PAGE_SIZE).map((msg) => ({
        ...msg,
        content: msg.content?.includes('data:image') ? '[图片]' : msg.content,
      }))

      return {
        id: conv.id,
        title: conv.title,
        messages,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        status: conv.status || 'idle',
        hasMore: conv.messages.length > PAGE_SIZE,
        messageCount: conv.messages.length,
      }
    })

    const syncMsg = {
      type: 'sync:conversations',
      conversations: syncConversations,
      activeConversationId,
      hostRootName,
    }

    session.send(syncMsg as any)
    console.log('[RemoteStore] Synced', syncConversations.length, 'conversations')
  },
}))

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find a file entry by path in the file tree
 * @ts-expect-error - used internally for recursive search
 */
function _findFileByPath(node: FileEntry | null, path: string): FileEntry | null {
  if (!node) return null
  if (node.path === path) return node

  if (node.type === 'directory' && node.children) {
    for (const child of node.children) {
      const found = _findFileByPath(child, path)
      if (found) return found
    }
  }

  return null
}

// Export for internal use (reserved for future file search functionality)
export { _findFileByPath as findFileByPath }

// ============================================================================
// Auto-reconnect on load
// ============================================================================

// Flag to prevent multiple reconnect attempts (e.g., from React StrictMode double-render)
let reconnectAttempted = false

/** Attempt to reconnect to a previously saved session */
export function attemptReconnect(): boolean {
  // Guard against multiple calls (e.g., from React StrictMode)
  if (reconnectAttempted) {
    console.log('[RemoteStore] Reconnect already attempted, skipping')
    return false
  }
  reconnectAttempted = true

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

/** Register callbacks for Host mode (called by WorkspaceLayout) */
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
