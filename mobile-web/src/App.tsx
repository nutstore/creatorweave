/**
 * Mobile Web App - Remote control interface for CreatorWeave
 *
 * - Auto-joins session when URL contains ?session=xxx parameter
 * - Shows input form for manual session ID entry when no session parameter
 * - Saves session to localStorage for auto-reconnect after refresh
 * - E2E encryption using shared encryption package
 * - New navigation structure with MainLayout
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import { E2EEncryption, type EncryptionState, isEncryptedEnvelope, type RemoteMessage, type EncryptedEnvelope } from '@creatorweave/encryption'
import { FilePicker } from './components/FilePicker'
import { useRemoteStore } from './store/remote.store'
import { useConversationStore, type Conversation, type Message } from './store/conversation.store'
import type { FileEntry } from './types/remote'
import { ConnectionContext, type ConnectionContextValue, type ConnectionState, useConnection } from './contexts/ConnectionContext'

// Pages
import { ConversationListPage } from './pages/ConversationListPage'
import { ConversationDetail } from '@creatorweave/conversation'
import { SessionInputPage } from './pages/SessionInputPage'
import { SettingsPage } from './pages/SettingsPage'

// Components
import { MainLayout } from './components/MainLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { NavigateToAppropriate } from './components/NavigateToAppropriate'
import { ChatInput } from './components/ChatInput'
import { RefreshCw } from 'lucide-react'

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'bfosa-remote-session'
const MAX_SESSION_AGE = 24 * 60 * 60 * 1000 // 24 hours
const RELAY_SERVER_URL = import.meta.env.VITE_RELAY_SERVER_URL || 'ws://localhost:3001'

// ============================================================================
// Types
// ============================================================================

interface StoredSession {
  sessionId: string
  savedAt: number
}

// ============================================================================
// LocalStorage Utilities
// ============================================================================

function saveSession(sessionId: string): void {
  try {
    const data: StoredSession = { sessionId, savedAt: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    console.log('[Mobile] Session saved to localStorage')
  } catch (e) {
    console.warn('[Mobile] Failed to save session:', e)
  }
}

function loadSession(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as StoredSession

    // Check if session is too old
    if (Date.now() - data.savedAt > MAX_SESSION_AGE) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }

    return data.sessionId
  } catch (e) {
    console.warn('[Mobile] Failed to load session:', e)
    return null
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    console.log('[Mobile] Session cleared from localStorage')
  } catch (e) {
    console.warn('[Mobile] Failed to clear session:', e)
  }
}

// ============================================================================
// App Connection Provider
// ============================================================================

interface AppConnectionProviderProps {
  children: React.ReactNode
}

function ConnectionProvider({ children }: AppConnectionProviderProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [encryptionState, setEncryptionState] = useState<EncryptionState>('none')
  const [encryptionError, setEncryptionError] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<'idle' | 'thinking' | 'tool_calling' | 'error'>('idle')

  // WebSocket refs
  const wsRef = useRef<Socket | null>(null)
  const encryptionRef = useRef<E2EEncryption | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  // Auto-reconnect state
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const RECONNECT_DELAY = 2000

  // Ref to store joinSession function for breaking circular dependency
  const joinSessionRef = useRef<(sessionId: string) => Promise<void>>(() => Promise.resolve())

  // Store integration
  const { setSocket, setHostRootName } = useRemoteStore()

  // Clear reconnect timeout on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  // Update ref when sessionId changes
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Sync connection state with store
  useEffect(() => {
    useRemoteStore.getState().setConnectionState(connectionState)
  }, [connectionState])

  // Sync encryption state with store
  useEffect(() => {
    useRemoteStore.getState().setEncryptionState(encryptionState)
  }, [encryptionState])

  // Sync session ID with store
  useEffect(() => {
    if (sessionId) {
      useRemoteStore.getState().setSessionId(sessionId)
    }
  }, [sessionId])

  // Sync agent status with window
  useEffect(() => {
    ;(window as any).agentStatus = agentStatus
  }, [agentStatus])

  const setConnectionStateSync = useCallback((state: ConnectionState) => {
    setConnectionState(state)
    useRemoteStore.getState().setConnectionState(state)
  }, [])

  // 完整的取消连接函数 - 断开 WebSocket 并清理状态
  const cancelConnection = useCallback(() => {
    console.log('[Mobile] Canceling connection')

    // 清理重连 timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    // 重置重连状态
    reconnectAttemptsRef.current = 0
    useRemoteStore.getState().cancelReconnect()

    // 断开 WebSocket
    if (wsRef.current) {
      wsRef.current.disconnect()
      wsRef.current = null
    }

    // 清理 session
    clearSession()
    setSessionId(null)
    setError(null)
    setConnectionStateSync('disconnected')

    // 清理 window 上的引用
    ;(window as any).remoteSocket = null
    ;(window as any).encryptionRef = null
  }, [setConnectionStateSync])

  // 暴露到 window 供组件调用（保留用于其他非组件调用）
  useEffect(() => {
    ;(window as any).cancelConnection = cancelConnection
    return () => {
      ;(window as any).cancelConnection = undefined
    }
  }, [cancelConnection])

  const resetReconnectState = useCallback(() => {
    reconnectAttemptsRef.current = 0
    useRemoteStore.getState().resetReconnect()
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    const store = useRemoteStore.getState()
    reconnectAttemptsRef.current++
    store.incrementReconnectAttempt()

    // 超过最大重连次数，停止重连
    if (reconnectAttemptsRef.current > store.reconnectMaxAttempts) {
      console.log('[Mobile] Max reconnect attempts reached, giving up')
      setError('连接失败，请重试或检查 PC 端是否在线')
      setConnectionStateSync('disconnected')
      return
    }

    const delay = RECONNECT_DELAY * reconnectAttemptsRef.current

    console.log(`[Mobile] Scheduling reconnect attempt ${reconnectAttemptsRef.current}/${store.reconnectMaxAttempts} in ${delay}ms`)
    setConnectionStateSync('reconnecting')

    reconnectTimeoutRef.current = setTimeout(() => {
      const savedSessionId = sessionIdRef.current
      if (savedSessionId) {
        console.log('[Mobile] Attempting to reconnect...')
        // Use ref to break circular dependency
        joinSessionRef.current(savedSessionId)
      }
    }, delay)
  }, [setConnectionStateSync, setError, resetReconnectState])

  // Handle WebSocket messages
  const handleWSMessage = useCallback(async (msg: RemoteMessage | EncryptedEnvelope) => {
    // Decrypt if encrypted
    let messageToProcess: RemoteMessage
    if (isEncryptedEnvelope(msg)) {
      if (!encryptionRef.current || !encryptionRef.current.isReady()) {
        console.error('[WS] Received encrypted message but encryption not ready')
        setEncryptionError('Received encrypted message but encryption not ready')
        return
      }
      try {
        const decrypted = await encryptionRef.current.decrypt(msg)
        messageToProcess = decrypted
      } catch (e) {
        const errorMsg = `Decryption failed: ${e instanceof Error ? e.message : String(e)}`
        console.error('[WS]', errorMsg)
        setEncryptionError(errorMsg)
        return
      }
    } else {
      messageToProcess = msg
    }

    // Process message
    switch (messageToProcess.type) {
      case 'session:joined':
        console.log('[Mobile] Received session:joined, setting connection to connected')
        setConnectionStateSync('connected')
        setError(null)
        resetReconnectState()
        const currentSessionId = sessionIdRef.current
        if (currentSessionId) {
          saveSession(currentSessionId)
        }
        break

      case 'session:error':
        setError((messageToProcess as { type: 'session:error'; error: string }).error)
        setConnectionStateSync('disconnected')
        clearSession()
        resetReconnectState()
        break

      case 'session:closed':
        console.log('[Mobile] Session closed by host')
        resetReconnectState()
        clearSession()
        setConnectionStateSync('disconnected')
        setSessionId(null)
        break

      case 'peer:disconnected':
        console.log('[Mobile] Peer disconnected, scheduling reconnect...')
        scheduleReconnect()
        break

      case 'agent:message':
        const agentMsg = messageToProcess as {
          type: 'agent:message'
          role: 'user' | 'assistant'
          content: string
          messageId: string
          timestamp: number
        }
        // Clear thinking when final message arrives
        useConversationStore.getState().clearThinking()
        const { activeConversationId } = useConversationStore.getState()
        if (activeConversationId) {
          useConversationStore.getState().addMessage(activeConversationId, {
            role: agentMsg.role,
            content: agentMsg.content,
            messageId: agentMsg.messageId,
            timestamp: agentMsg.timestamp,
          })
        }
        break

      case 'agent:thinking': {
        const thinkingMsg = messageToProcess as {
          type: 'agent:thinking'
          delta: string
        }
        useConversationStore.getState().appendThinking(thinkingMsg.delta)
        // Sync with window for ConversationDetailPage
        ;(window as any).agentThinking = useConversationStore.getState().thinkingContent
        break
      }

      case 'agent:tool_call': {
        const toolMsg = messageToProcess as {
          type: 'agent:tool_call'
          toolName: string
          args: string
          toolCallId: string
        }
        useConversationStore.getState().addToolCall({
          toolName: toolMsg.toolName,
          args: toolMsg.args,
          toolCallId: toolMsg.toolCallId,
        })
        break
      }

      case 'agent:status': {
        const statusMsg = messageToProcess as {
          type: 'agent:status'
          status: 'idle' | 'thinking' | 'tool_calling' | 'error'
        }
        setAgentStatus(statusMsg.status)
        // Sync with local state for ConversationDetailPageWithInput
        ;(window as any).agentStatus = statusMsg.status
        // Clear thinking when status becomes idle
        if (statusMsg.status === 'idle') {
          useConversationStore.getState().clearThinking()
          ;(window as any).agentThinking = ''
        }
        break
      }

      case 'sync:conversations': {
        const syncMsg = messageToProcess as {
          type: 'sync:conversations'
          conversations: Conversation[]
          activeConversationId: string | null
          hostRootName: string | null
        }
        useConversationStore.getState().setConversations(syncMsg.conversations)
        if (syncMsg.activeConversationId) {
          useConversationStore.getState().setActiveConversation(syncMsg.activeConversationId)
        }
        if (syncMsg.hostRootName) {
          setHostRootName(syncMsg.hostRootName)
        }
        console.log('[Mobile] Received', syncMsg.conversations.length, 'conversations')
        break
      }

      case 'sync:page:response': {
        const pageMsg = messageToProcess as {
          type: 'sync:page:response'
          conversationId: string
          page: number
          totalPages: number
          messages: Message[]
        }
        useConversationStore.getState().updateConversationMessages(
          pageMsg.conversationId,
          pageMsg.page,
          pageMsg.messages,
          pageMsg.totalPages
        )
        break
      }

      case 'session:create':
      case 'session:join': {
        const keyExchangeMsg = messageToProcess as {
          type: 'session:create' | 'session:join'
          sessionId: string
          publicKey: string
        }
        if (keyExchangeMsg.publicKey && encryptionRef.current) {
          try {
            await encryptionRef.current.deriveSharedKey(keyExchangeMsg.publicKey)
            if (encryptionRef.current.isReady()) {
              const readyMsg = await encryptionRef.current.encrypt({
                type: 'encryption:ready',
                encrypted: true,
                timestamp: Date.now(),
              })
              wsRef.current?.emit('message', readyMsg)
            }
          } catch (e) {
            const errorMsg = `Key exchange failed: ${e instanceof Error ? e.message : String(e)}`
            setError(errorMsg)
            setEncryptionError(errorMsg)
          }
        }
        break
      }

      case 'encryption:ready':
        console.log('[Mobile] Received encryption:ready from peer')
        break

      case 'encryption:error': {
        const errMsg = messageToProcess as { type: 'encryption:error'; error: string; timestamp: number }
        console.log('[Mobile] Encryption error from peer:', errMsg.error)
        setEncryptionError(`Peer encryption error: ${errMsg.error}`)
        break
      }

      case 'file:search-result': {
        const searchResult = messageToProcess as {
          type: 'file:search-result'
          query: string
          results: FileEntry[]
          hasMore: boolean
        }
        useRemoteStore.getState().setSearchResults(searchResult.results)
        useRemoteStore.getState().setIsSearching(false)
        break
      }

      case 'files:recent': {
        const recentMsg = messageToProcess as {
          type: 'files:recent'
          files: FileEntry[]
          trigger: 'modified' | 'accessed'
        }
        useRemoteStore.getState().setRecentFiles(recentMsg.files)
        break
      }

      case 'file:tree-update': {
        // Host 主动切换目录 - 显示警告
        const treeUpdateMsg = messageToProcess as { type: 'file:tree-update'; rootName: string | null }
        const store = useRemoteStore.getState()
        store.setHostRootName(treeUpdateMsg.rootName)
        store.setDirectoryChanged(true)
        store.setSearchResults([])
        break
      }

      case 'file:tree-response': {
        // 响应 Remote 的查询请求 - 不显示警告
        const treeResponseMsg = messageToProcess as { type: 'file:tree-response'; rootName: string | null }
        const store = useRemoteStore.getState()
        store.setHostRootName(treeResponseMsg.rootName)
        // 不设置 directoryChanged，静默更新
        break
      }
    }
  }, [scheduleReconnect, resetReconnectState, setConnectionStateSync, setHostRootName])

  // Join session
  const joinSession = useCallback(async (sessionIdToJoin: string) => {
    try {
      console.log('[Mobile] Joining session:', sessionIdToJoin)
      setError(null)
      setEncryptionError(null)
      setConnectionStateSync('connecting')
      setSessionId(sessionIdToJoin)
      sessionIdRef.current = sessionIdToJoin

      // Initialize encryption
      const encryption = new E2EEncryption(true)
      encryptionRef.current = encryption

      const unsubscribe = encryption.onStateChange((state, error) => {
        console.log('[Mobile] Encryption state:', state, error ?? '')
        setEncryptionState(state)
        setEncryptionError(error ?? null)
      })

      // Generate key pair and save the public key string
      const publicKey = await encryption.generateKeyPair()

      // Connect WebSocket
      if (wsRef.current) {
        wsRef.current.disconnect()
      }

      const ws = io(RELAY_SERVER_URL.replace('ws://', 'http://').replace('wss://', 'https://'), {
        transports: ['websocket', 'polling']
      })

      ws.on('connect', () => {
        console.log('[WS] Connected to relay server')
        setError(null)
        setSocket(ws)
        wsRef.current = ws
        ;(window as any).remoteSocket = ws
        ;(window as any).encryptionRef = encryptionRef.current
        ws.emit('message', {
          type: 'session:join',
          sessionId: sessionIdToJoin,
          publicKey,  // Use the saved public key string
        })
      })

      ws.on('message', (data: any) => {
        handleWSMessage(data)
      })

      ws.on('error', (err: any) => {
        console.error('[WS] Error:', err)
        setError('Connection error')
      })

      ws.on('disconnect', () => {
        unsubscribe()
        console.log('[WS] Disconnected from server')
        if (sessionIdRef.current) {
          setConnectionStateSync('reconnecting')
          scheduleReconnect()
        }
      })

      wsRef.current = ws
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session')
      setConnectionStateSync('disconnected')
    }
  }, [handleWSMessage, scheduleReconnect, setConnectionStateSync, setSocket])

  // Context value - must be after joinSession definition
  const contextValue: ConnectionContextValue = useMemo(() => ({
    connectionState,
    error,
    encryptionError,
    joinSession,
    cancelConnection,
  }), [connectionState, error, encryptionError, joinSession, cancelConnection])

  // Update joinSessionRef when joinSession changes
  useEffect(() => {
    joinSessionRef.current = joinSession
  }, [joinSession])

  // Auto-join on mount (only once)
  const hasAttemptedJoinRef = useRef(false)

  useEffect(() => {
    // Skip if already attempted
    if (hasAttemptedJoinRef.current) return
    hasAttemptedJoinRef.current = true

    const urlParams = new URLSearchParams(window.location.search)
    const sessionParam = urlParams.get('session')

    if (sessionParam) {
      console.log('[Mobile] Session from URL:', sessionParam)
      joinSessionRef.current(sessionParam)
    } else {
      const savedSessionId = loadSession()
      if (savedSessionId) {
        console.log('[Mobile] Restoring session from localStorage:', savedSessionId)
        joinSessionRef.current(savedSessionId)
      }
    }
  }, []) // Run only once on mount

  return (
    <ConnectionContext.Provider value={contextValue}>
      {children}
    </ConnectionContext.Provider>
  )
}

// 需要使用 ConnectionContext 的组件
function AppContentWithConnection() {
  const { connectionState } = useConnection()
  const { filePickerOpen, setFilePickerOpen } = useRemoteStore()

  // Send message
  const sendMessage = useCallback((content: string) => {
    const ws = (window as any).remoteSocket as Socket | null

    if (!ws) {
      console.error('[Mobile] Cannot send: remoteSocket is null')
      return
    }

    const messageId = `msg-${Date.now()}`
    const message = {
      type: 'remote:send_message',
      content,
      messageId,
      timestamp: Date.now(),
    }

    // Check for @file references
    const atRegex = /@([a-zA-Z0-9_\-.\/]+)/g
    const atFiles: string[] = []
    let match: RegExpExecArray | null
    while ((match = atRegex.exec(content)) !== null) {
      atFiles.push(match[1])
    }

    if (atFiles.length > 0) {
      atFiles.forEach((filePath) => {
        ws?.emit('message', {
          type: 'file:selected',
          path: filePath,
        })
      })
    }

    // Send encrypted message
    const encryptionRef = (window as any).encryptionRef
    if (!encryptionRef) {
      console.error('[Mobile] Cannot send: encryptionRef is null')
      return
    }

    encryptionRef.encrypt(message).then((encrypted: any) => {
      ws?.emit('message', encrypted)
    }).catch((e: any) => {
      console.error('[Mobile] Encryption failed:', e)
    })
  }, [])

  // Stop generation
  const stopGeneration = useCallback(() => {
    const ws = (window as any).remoteSocket as Socket | null
    ws?.emit('message', {
      type: 'agent:stop',
      timestamp: Date.now(),
    })
  }, [])

  return (
    <>
      <Routes>
        {/* Input page - no auth required */}
        <Route
          path="/input"
          element={<SessionInputPage />}
        />

        {/* Protected routes with MainLayout */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout
                actions={[
                  {
                    icon: RefreshCw,
                    onClick: () => {
                      const ws = (window as any).remoteSocket as Socket | null
                      ws?.emit('message', { type: 'sync:request', fullSync: true })
                    },
                    title: '刷新',
                    show: connectionState === 'connected',
                  },
                ]}
              />
            </ProtectedRoute>
          }
        >
          <Route path="/chats" element={<ConversationListPage />} />
          <Route
            path="/chats/:id"
            element={
              <ConversationDetailPageWithInput
                sendMessage={sendMessage}
                onStop={stopGeneration}
              />
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Root redirect */}
        <Route path="/*" element={<NavigateToAppropriate />} />
      </Routes>

      {/* File Picker Modal */}
      <FilePicker open={filePickerOpen} onClose={() => setFilePickerOpen(false)} />
    </>
  )
}

export default function App() {
  return (
    <ConnectionProvider>
      <BrowserRouter>
        <AppContentWithConnection />
      </BrowserRouter>
    </ConnectionProvider>
  )
}

// Wrapper for conversation detail with input
function ConversationDetailPageWithInput({
  sendMessage,
  onStop,
}: {
  sendMessage: (content: string) => void
  onStop: () => void
}) {
  const { id } = useParams<{ id: string }>()
  const { conversations, setActiveConversation, thinkingContent, toolCalls } = useConversationStore()
  const { setFilePickerOpen } = useRemoteStore()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [agentStatus, setAgentStatus] = useState<'idle' | 'thinking' | 'tool_calling' | 'error'>('idle')

  // Sync agent status from window
  useEffect(() => {
    const updateAgentStatus = () => {
      if ((window as any).agentStatus) {
        setAgentStatus((window as any).agentStatus)
      }
    }
    updateAgentStatus()
    // Set up interval to poll for status updates
    const interval = setInterval(updateAgentStatus, 200)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!id) return
    const conv = conversations.find((c) => c.id === id)
    if (conv) {
      setConversation(conv)
      setActiveConversation(id)
    } else {
      // Request sync
      ;(window as any).remoteSocket?.emit('message', {
        type: 'sync:request',
        fullSync: true,
      })
    }
  }, [id, conversations, setActiveConversation])

  const handleLoadMore = () => {
    if (!conversation || !conversation.hasMore) return
    const nextPage = (conversation.currentPage || 1) + 1
    ;(window as any).remoteSocket?.emit('message', {
      type: 'sync:page:request',
      conversationId: conversation.id,
      page: nextPage,
    })
  }

  const handleSend = (content: string) => {
    sendMessage(content)
    // Add to active conversation
    if (conversation) {
      useConversationStore.getState().addMessage(conversation.id, {
        role: 'user',
        content,
        messageId: `msg-${Date.now()}`,
        timestamp: Date.now(),
      })
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ConversationDetail
        conversation={conversation}
        status={agentStatus === 'thinking' || agentStatus === 'tool_calling' ? 'pending' : 'idle'}
        onLoadMore={conversation?.hasMore ? handleLoadMore : undefined}
        thinkingContent={thinkingContent}
        toolCalls={toolCalls}
        className="flex-1 overflow-hidden"
      />
      <ChatInput
        onSend={handleSend}
        onStop={onStop}
        isRunning={agentStatus === 'thinking' || agentStatus === 'tool_calling'}
        onSelectFile={() => setFilePickerOpen(true)}
        selectedFileCount={0}
      />
    </div>
  )
}
