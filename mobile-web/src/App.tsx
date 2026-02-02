/**
 * Mobile Web App - Remote control interface for BFOSA
 *
 * - Auto-joins session when URL contains ?session=xxx parameter
 * - Shows input form for manual session ID entry when no session parameter
 * - Saves session to localStorage for auto-reconnect after refresh
 * - E2E encryption using shared encryption package
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { Lock, Unlock, AlertTriangle, Key, RefreshCw, AtSign, X, FileEdit } from 'lucide-react'
import { E2EEncryption, type EncryptionState, isEncryptedEnvelope, type RemoteMessage, type EncryptedEnvelope } from '@browser-fs-analyzer/encryption'
import { FilePicker } from './components/FilePicker'
import { useRemoteStore } from './store/remote.store'
import { DirectoryChangeToast } from '@browser-fs-analyzer/ui'
import type { FileEntry } from './types/remote'

// UUID validation regex (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// ============================================================================
// LocalStorage - Session persistence for auto-reconnect
// ============================================================================

const STORAGE_KEY = 'bfosa-remote-session'
const MAX_SESSION_AGE = 24 * 60 * 60 * 1000 // 24 hours

interface StoredSession {
  sessionId: string
  savedAt: number
}

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

// Types
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

interface MessageEntry {
  role: string
  content: string
  messageId: string
  timestamp: number
}

const RELAY_SERVER_URL = import.meta.env.VITE_RELAY_SERVER_URL || 'ws://localhost:3001'

export function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Wrapper to sync connectionState with remote.store
  const setConnectionStateSync = useCallback((state: ConnectionState) => {
    setConnectionState(state)
    useRemoteStore.getState().setConnectionState(state)
  }, [])
  const [messages, setMessages] = useState<MessageEntry[]>([])
  const [input, setInput] = useState('')
  const [agentStatus, setAgentStatus] = useState<'idle' | 'thinking' | 'tool_calling' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  // Encryption state
  const [encryptionState, setEncryptionState] = useState<EncryptionState>('none')
  const [encryptionError, setEncryptionError] = useState<string | null>(null)

  // File change notifications
  const [fileChanges, setFileChanges] = useState<Array<{
    path: string
    changeType: 'create' | 'modify' | 'delete'
    preview?: string
    timestamp: number
  }>>([])
  const [showFileChanges, setShowFileChanges] = useState(false)

  // File discovery state from Zustand store
  const {
    selectedFiles,
    filePickerOpen,
    setFilePickerOpen,
    toggleFileSelection,
    setSocket,
    hostRootName
  } = useRemoteStore()

  // Directory change toast state
  const [showDirChangeToast, setShowDirChangeToast] = useState(false)
  const [dirChangeName, setDirChangeName] = useState<string | null>(null)

  // File preview expand/collapse state
  const [filesExpanded, setFilesExpanded] = useState(false)

  // Session input form state
  const [sessionInput, setSessionInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [showInputForm, setShowInputForm] = useState(true)

  // WebSocket ref
  const wsRef = useRef<Socket | null>(null)
  const encryptionRef = useRef<E2EEncryption | null>(null)

  // Ref to track current sessionId for closure-safe access
  const sessionIdRef = useRef<string | null>(null)

  // Auto-reconnect state
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const RECONNECT_DELAY = 2000 // 2 seconds

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

  // Trigger reconnection - no limit on attempts, user can manually stop
  const scheduleReconnect = useCallback(() => {
    reconnectAttemptsRef.current++
    const delay = RECONNECT_DELAY * Math.min(reconnectAttemptsRef.current, 5) // Cap at 10 seconds

    console.log(`[Mobile] Scheduling reconnect attempt ${reconnectAttemptsRef.current} in ${delay}ms`)

    setConnectionStateSync('reconnecting')

    reconnectTimeoutRef.current = setTimeout(() => {
      const savedSessionId = sessionIdRef.current
      if (savedSessionId) {
        console.log('[Mobile] Attempting to reconnect...')
        joinSession(savedSessionId)
      }
    }, delay)
  }, []) // Empty deps - we use refs to avoid dependency cycles

  // Reset reconnect attempts when connected successfully
  const resetReconnectState = useCallback(() => {
    reconnectAttemptsRef.current = 0
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  // Validate UUID format
  const isValidUUID = useCallback((id: string): boolean => {
    return UUID_REGEX.test(id)
  }, [])

  // Handle WebSocket messages (defined first to avoid forward reference issues)
  const handleWSMessage = useCallback(async (msg: RemoteMessage | EncryptedEnvelope) => {
    console.log('[WS] Received:', msg)

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
        console.log('[WS] Decrypted:', messageToProcess)
      } catch (e) {
        const errorMsg = `Decryption failed: ${e instanceof Error ? e.message : String(e)}`
        console.error('[WS]', errorMsg)
        setEncryptionError(errorMsg)
        return
      }
    } else {
      messageToProcess = msg
    }

    // Now process the message
    switch (messageToProcess.type) {
      case 'session:joined':
        setConnectionStateSync('connected')
        setError(null) // Clear any errors when session is ready
        resetReconnectState() // Reset reconnect attempts on successful connection
        // Save session to localStorage for auto-reconnect
        const currentSessionId = sessionIdRef.current
        if (currentSessionId) {
          saveSession(currentSessionId)
        }
        break

      case 'session:error':
        setError((messageToProcess as { type: 'session:error'; error: string }).error)
        setConnectionStateSync('disconnected')
        clearSession() // Clear invalid session
        resetReconnectState()
        break

      case 'session:closed':
        const closedMsg = messageToProcess as { type: 'session:closed'; sessionId: string; reason: 'host_disconnected' | 'session_ended' }
        console.log('[Mobile] Session closed by host:', closedMsg.reason)
        // Stop reconnecting and show input form
        resetReconnectState()
        clearSession()
        setConnectionStateSync('disconnected')
        setSessionId(null)
        setShowInputForm(true)
        break

      case 'peer:disconnected':
        console.log('[Mobile] Peer disconnected, scheduling reconnect...')
        // Don't show error immediately, try to reconnect first
        scheduleReconnect()
        break

      case 'agent:message':
        const agentMsg = messageToProcess as { type: 'agent:message'; role: 'user' | 'assistant'; content: string; messageId: string; timestamp: number }
        setMessages((prev) => [...prev, {
          role: agentMsg.role,
          content: agentMsg.content,
          messageId: agentMsg.messageId,
          timestamp: agentMsg.timestamp
        }])
        break

      case 'agent:thinking':
        const thinkingMsg = messageToProcess as { type: 'agent:thinking'; delta: string }
        // Append to last assistant message
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + thinkingMsg.delta }
            ]
          }
          return prev
        })
        break

      case 'agent:status':
        setAgentStatus((messageToProcess as { type: 'agent:status'; status: 'idle' | 'thinking' | 'tool_calling' | 'error' }).status)
        break

      case 'agent:tool_call':
        const toolMsg = messageToProcess as { type: 'agent:tool_call'; toolName: string; args: string; toolCallId: string }
        setMessages((prev) => [...prev, {
          role: 'tool',
          content: `[Tool: ${toolMsg.toolName}](${toolMsg.args})`,
          messageId: toolMsg.toolCallId,
          timestamp: Date.now()
        }])
        break

      case 'sync:state':
        const syncMsg = messageToProcess as { type: 'sync:state'; messages: Array<{ role: string; content: string | null; messageId: string; timestamp: number }>; agentStatus: 'idle' | 'thinking' | 'tool_calling' | 'error' }
        setMessages(syncMsg.messages.map((m: any) => ({
          role: m.role || 'unknown',
          content: m.content || '',
          messageId: m.messageId || '',
          timestamp: m.timestamp || Date.now()
        })))
        setAgentStatus(syncMsg.agentStatus)
        break

      case 'session:create':
      case 'session:join':
        // Key exchange: derive shared key from peer's public key
        const keyExchangeMsg = messageToProcess as { type: 'session:create' | 'session:join'; sessionId: string; publicKey: string }
        if (keyExchangeMsg.publicKey && encryptionRef.current) {
          try {
            await encryptionRef.current.deriveSharedKey(keyExchangeMsg.publicKey)
            // After deriving the shared key, send encryption:ready message
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

      case 'encryption:ready':
        console.log('[Mobile] Received encryption:ready from peer')
        break

      case 'encryption:error':
        const errMsg = messageToProcess as { type: 'encryption:error'; error: string; timestamp: number }
        console.log('[Mobile] Encryption error from peer:', errMsg.error)
        setEncryptionError(`Peer encryption error: ${errMsg.error}`)
        break

      // File discovery messages
      case 'file:search-result': {
        const searchResult = messageToProcess as { type: 'file:search-result'; query: string; results: FileEntry[]; hasMore: boolean }
        console.log('[Mobile] Search results:', searchResult.results.length, 'files')
        const store = useRemoteStore.getState()
        store.setSearchResults(searchResult.results)
        store.setIsSearching(false)
        break
      }

      case 'files:recent': {
        const recentMsg = messageToProcess as { type: 'files:recent'; files: FileEntry[]; trigger: 'modified' | 'accessed' }
        console.log('[Mobile] Recent files updated:', recentMsg.files.length, 'files')
        useRemoteStore.getState().setRecentFiles(recentMsg.files)
        break
      }

      case 'file:change': {
        const fileChangeMsg = messageToProcess as { type: 'file:change'; path: string; changeType: 'create' | 'modify' | 'delete'; preview?: string }
        console.log('[Mobile] File change:', fileChangeMsg.changeType, fileChangeMsg.path)

        // Add to file changes list
        const newChange = {
          path: fileChangeMsg.path,
          changeType: fileChangeMsg.changeType,
          preview: fileChangeMsg.preview,
          timestamp: Date.now(),
        }
        setFileChanges((prev) => [newChange, ...prev].slice(0, 10)) // Keep last 10

        // Show notification
        setShowFileChanges(true)

        // Also show in messages as a system message
        const changeDesc = fileChangeMsg.changeType === 'create' ? '新建' : fileChangeMsg.changeType === 'delete' ? '删除' : '修改'
        setMessages((prev) => [...prev, {
          role: 'system',
          content: `📄 文件已${changeDesc}: ${fileChangeMsg.path}`,
          messageId: `file-change-${Date.now()}`,
          timestamp: Date.now()
        }])
        break
      }

      case 'file:tree-update': {
        const treeUpdateMsg = messageToProcess as { type: 'file:tree-update'; rootName: string | null }

        const store = useRemoteStore.getState()

        // Check if directory actually changed
        const { hostRootName: prevRootName } = store
        const newRootName = treeUpdateMsg.rootName
        const dirChanged = prevRootName !== null && prevRootName !== newRootName

        // Update the file tree in the remote store for local search/future use
        store.setHostRootName(newRootName)
        store.setDirectoryChanged(dirChanged)
        store.setSearchResults([]) // Clear previous search results

        // Show directory change toast
        if (dirChanged) {
          setDirChangeName(newRootName)
          setShowDirChangeToast(true)
          // Auto-hide after 5 seconds (toast handles this, but we track state)
          setTimeout(() => setShowDirChangeToast(false), 5000)
        }
        break
      }
    }
  }, [scheduleReconnect, resetReconnectState])

  // Join a session
  const joinSession = useCallback(async (sessionId: string) => {
    try {
      console.log('[Mobile] Joining session:', sessionId)
      setError(null) // Clear any previous errors
      setEncryptionError(null)
      setConnectionStateSync('connecting')
      setSessionId(sessionId)
      sessionIdRef.current = sessionId // Update ref immediately for closure-safe access

      // Initialize encryption
      const encryption = new E2EEncryption(true) // Enable debug mode
      encryptionRef.current = encryption

      // Subscribe to encryption state changes
      const unsubscribe = encryption.onStateChange((state, error) => {
        console.log('[Mobile] Encryption state:', state, error ?? '')
        setEncryptionState(state)
        setEncryptionError(error ?? null)
      })

      // Generate key pair
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
        // Clear any errors when connected to server
        setError(null)
        // Set socket in store for file discovery
        setSocket(ws)
        // Send join message with public key
        ws.emit('message', {
          type: 'session:join',
          sessionId,
          publicKey
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
        // Unsubscribe from encryption state
        unsubscribe()
        console.log('[WS] Disconnected from server')
        // Only try to reconnect if we have a session ID
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
  }, [handleWSMessage, scheduleReconnect])

  // Parse @file references from input (defined before sendMessage which uses it)
  const parseAtFiles = useCallback((text: string): string[] => {
    const atRegex = /@([a-zA-Z0-9_\-.\/]+)/g
    const matches: string[] = []
    let match: RegExpExecArray | null
    while ((match = atRegex.exec(text)) !== null) {
      matches.push(match[1])
    }
    return matches
  }, [])

  // Handle manual session join from input form
  const handleJoinSession = useCallback(() => {
    const trimmed = sessionInput.trim()
    if (!trimmed) {
      setInputError('请输入会话 ID')
      return
    }
    if (!isValidUUID(trimmed)) {
      setInputError('无效的会话 ID 格式，应为 UUID 格式 (如 xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)')
      return
    }
    setInputError(null)
    setShowInputForm(false)
    joinSession(trimmed)
  }, [sessionInput, isValidUUID, joinSession])

  // Send message to host
  const sendMessage = useCallback(() => {
    if (!input.trim() || !wsRef.current || connectionState !== 'connected') return

    const messageId = `msg-${Date.now()}`
    const content = input.trim()

    // Check for @file references
    const atFiles = parseAtFiles(content)
    if (atFiles.length > 0) {
      // Send file selection messages
      atFiles.forEach((filePath) => {
        wsRef.current?.emit('message', {
          type: 'file:selected',
          path: filePath,
        })
      })
    }

    const message = {
      type: 'remote:send_message',
      content,
      messageId,
      timestamp: Date.now(),
    }

    // Encrypt if encryption is ready
    if (encryptionRef.current && encryptionRef.current.isReady()) {
      encryptionRef.current
        .encrypt(message)
        .then((encrypted) => {
          wsRef.current?.emit('message', encrypted)
        })
        .catch((e) => {
          const errorMsg = `Encryption failed: ${e instanceof Error ? e.message : String(e)}`
          setError(errorMsg)
          setEncryptionError(errorMsg)
        })
    } else {
      setError('Encryption not ready, cannot send message securely')
      setEncryptionError('Encryption not ready')
      return
    }

    // Add to local messages
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content,
        messageId,
        timestamp: Date.now(),
      },
    ])

    setInput('')
  }, [input, connectionState, parseAtFiles, selectedFiles])

  // Disconnect session (manual disconnect by user)
  const disconnectSession = useCallback(() => {
    console.log('[Mobile] Manual disconnect')
    resetReconnectState()
    clearSession()
    setShowInputForm(true)
    setSessionId(null)
    setMessages([])
    setError(null)

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.disconnect()
      wsRef.current = null
    }
  }, [resetReconnectState])

  // Connection state display
  const getConnectionDisplay = () => {
    switch (connectionState) {
      case 'disconnected':
        return { text: '未连接', color: 'bg-gray-500' }
      case 'connecting':
        return { text: '连接中...', color: 'bg-yellow-500' }
      case 'connected':
        return { text: '已连接', color: 'bg-green-500' }
      case 'reconnecting':
        return { text: '重连中...', color: 'bg-yellow-500' }
    }
  }

  // Encryption state display
  const getEncryptionDisplay = () => {
    switch (encryptionState) {
      case 'none':
        return { icon: <Unlock className="w-4 h-4" />, text: '未加密', color: 'text-gray-400' }
      case 'generating':
        return { icon: <Key className="w-4 h-4 animate-pulse" />, text: '生成密钥...', color: 'text-yellow-400' }
      case 'exchanging':
        return { icon: <RefreshCw className="w-4 h-4 animate-spin" />, text: '交换密钥...', color: 'text-yellow-400' }
      case 'ready':
        return { icon: <Lock className="w-4 h-4" />, text: '已加密', color: 'text-green-400' }
      case 'error':
        return { icon: <AlertTriangle className="w-4 h-4" />, text: '加密错误', color: 'text-red-400' }
    }
  }

  // Get session ID from URL or localStorage and auto-join (run once on mount)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const sessionParam = urlParams.get('session')

    if (sessionParam) {
      // URL parameter takes priority
      console.log('[Mobile] Session from URL:', sessionParam)
      setShowInputForm(false)
      joinSession(sessionParam)
    } else {
      // Try to restore from localStorage
      const savedSessionId = loadSession()
      if (savedSessionId) {
        console.log('[Mobile] Restoring session from localStorage:', savedSessionId)
        setShowInputForm(false)
        joinSession(savedSessionId)
      } else {
        console.log('[Mobile] No session found, showing input form')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run only once on mount

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-primary-600 text-white px-4 py-3 shadow-md">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold">BFOSA Remote</h1>
            {hostRootName && (
              <span className="text-xs opacity-70 truncate max-w-[200px]">{hostRootName}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${getConnectionDisplay().color}`} />
            <span className="text-xs opacity-80">{getConnectionDisplay().text}</span>
            {/* Encryption status indicator */}
            <span className={`text-sm ${getEncryptionDisplay().color}`} title={getEncryptionDisplay().text}>
              {getEncryptionDisplay().icon}
            </span>
            {sessionId && connectionState === 'connected' && (
              <button
                onClick={disconnectSession}
                className="text-xs text-white/80 hover:text-white underline"
              >
                断开
              </button>
            )}
          </div>
        </div>
        {/* Encryption error display */}
        {encryptionError && (
          <div className="max-w-lg mx-auto mt-2 bg-red-500/20 text-white px-3 py-1 rounded text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span className="flex-1 truncate">{encryptionError}</span>
            <button
              onClick={() => setEncryptionError(null)}
              className="text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {/* Directory change toast notification */}
      {showDirChangeToast && (
        <DirectoryChangeToast
          hostRootName={dirChangeName}
        />
      )}

      {/* Content */}
      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full p-4">
        {/* Session Input Form - shown when no session parameter in URL */}
        {showInputForm ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-6 shadow-lg w-full">
              {/* Logo/Icon */}
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>

              <h2 className="text-xl font-semibold text-gray-800 text-center mb-2">加入远程会话</h2>
              <p className="text-sm text-gray-500 text-center mb-6">
                输入 PC 端显示的会话 ID
              </p>

              {/* Session ID Input */}
              <div className="mb-4">
                <input
                  type="text"
                  value={sessionInput}
                  onChange={(e) => {
                    setSessionInput(e.target.value)
                    setInputError(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinSession()}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={`w-full px-4 py-3 rounded-xl border text-center font-mono text-sm tracking-wider
                    ${inputError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}
                    focus:border-primary-500 focus:bg-white focus:outline-none transition-colors`}
                />
              </div>

              {/* Error Message */}
              {inputError && (
                <div className="mb-4 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{inputError}</span>
                </div>
              )}

              {/* Helper Text */}
              <p className="text-xs text-gray-400 text-center mb-4">
                会话 ID 格式: UUID (8-4-4-4-12)
              </p>

              {/* Join Button */}
              <button
                onClick={handleJoinSession}
                disabled={!sessionInput.trim()}
                className="w-full bg-primary-600 text-white py-3 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                加入会话
              </button>

              {/* Scan QR Hint */}
              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0h.01M12 12v4M8 20H4m12-4h2M4 16h2" />
                  </svg>
                  或者使用 iOS 相机扫描二维码自动加入
                </p>
              </div>
            </div>
          </div>
        ) : connectionState === 'disconnected' ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-6 shadow-lg w-full text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">未连接</h2>
              <p className="text-sm text-gray-500 mb-4">
                连接已断开
              </p>
              <button
                onClick={() => {
                  setShowInputForm(true)
                  setError(null)
                  clearSession() // Clear saved session when manually returning
                }}
                className="text-primary-600 text-sm font-medium hover:underline"
              >
                返回输入会话 ID
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Connection status */}
            {error && (
              <div className="mb-4 bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm flex items-center justify-between">
                <span>{error}</span>
                <div className="flex gap-2">
                  {error.includes('Connection lost') && sessionIdRef.current && (
                    <button
                      onClick={() => {
                        setError(null)
                        reconnectAttemptsRef.current = 0 // Reset counter
                        joinSession(sessionIdRef.current!)
                      }}
                      className="text-red-800 underline"
                    >
                      重试
                    </button>
                  )}
                  <button
                    onClick={() => setError(null)}
                    className="text-red-800 underline"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-3">
              {messages.length === 0 && connectionState === 'connected' ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  <p>发送消息给 PC 端的 Agent</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.messageId}
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white rounded-br-sm'
                          : msg.role === 'tool'
                            ? 'bg-orange-100 text-gray-800 text-xs rounded-lg'
                            : msg.role === 'system'
                              ? 'bg-blue-100 text-gray-800 text-xs rounded-lg mx-auto'
                              : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'
                      }`}
                    >
                      {msg.role === 'tool' && (
                        <span className="text-xs text-orange-600 block mb-1">Tool Call</span>
                      )}
                      {msg.role === 'system' && (
                        <span className="text-xs text-blue-600 block mb-1">系统通知</span>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      <span className="text-xs opacity-70 mt-1 block">
                        {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Agent status indicator */}
            {agentStatus === 'thinking' && (
              <div className="flex items-center justify-center gap-2 text-sm text-yellow-600 bg-yellow-50 px-4 py-2 rounded-lg mb-4">
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                <span>Agent 思考中...</span>
              </div>
            )}

            {/* File changes notification */}
            {fileChanges.length > 0 && showFileChanges && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-blue-100 border-b border-blue-200">
                  <div className="flex items-center gap-2 text-sm text-blue-700">
                    <FileEdit className="w-4 h-4" />
                    <span className="font-medium">文件变更通知 ({fileChanges.length})</span>
                  </div>
                  <button
                    onClick={() => setShowFileChanges(false)}
                    className="text-blue-600 hover:text-blue-800 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-2 space-y-1 max-h-40 overflow-y-auto">
                  {fileChanges.slice(0, 5).map((change, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-sm px-2 py-1 rounded hover:bg-blue-100"
                    >
                      <span className="mt-0.5">
                        {change.changeType === 'create' && '📄'}
                        {change.changeType === 'modify' && '✏️'}
                        {change.changeType === 'delete' && '🗑️'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs truncate">{change.path}</div>
                        {change.preview && (
                          <div className="text-xs text-gray-500 truncate">{change.preview}</div>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(change.timestamp).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    </div>
                  ))}
                  {fileChanges.length > 5 && (
                    <div className="text-center text-xs text-blue-600 pt-1">
                      还有 {fileChanges.length - 5} 条变更...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Input area with expandable file preview */}
            <div
              className={`border rounded-xl overflow-hidden transition-colors ${
                connectionState !== 'connected'
                  ? 'bg-gray-100 border-gray-200'
                  : 'bg-white border-gray-200'
              }`}
            >
              {/* File preview header - always shown when files exist */}
              {selectedFiles.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <button
                      onClick={() => setFilePickerOpen(true)}
                      className="text-xs text-gray-700 font-medium flex items-center gap-1"
                    >
                      <AtSign className="w-3 h-3" />
                      {selectedFiles.length} 个文件
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => {
                        selectedFiles.forEach(path => toggleFileSelection(path))
                        setFilesExpanded(false)
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      清空
                    </button>
                    {selectedFiles.length > 3 && (
                      <button
                        onClick={() => setFilesExpanded(!filesExpanded)}
                        className="text-xs text-gray-400 hover:text-gray-600 p-1"
                      >
                        {filesExpanded ? '收起' : '展开'}
                      </button>
                    )}
                  </div>

                  {/* File chips - wrapped, shown when expanded or <= 3 files */}
                  {(filesExpanded || selectedFiles.length <= 3) && (
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                      <div className="flex flex-wrap gap-1.5">
                        {(filesExpanded ? selectedFiles : selectedFiles.slice(0, 3)).map((path) => {
                          const name = path.split('/').pop() || path
                          return (
                            <span
                              key={path}
                              className="inline-flex items-center gap-1 bg-white text-blue-700 px-2 py-1 rounded-lg text-xs font-medium border border-gray-200"
                            >
                              <span className="truncate max-w-[120px]">@{name}</span>
                              <button
                                onClick={() => toggleFileSelection(path)}
                                className="hover:text-blue-900 p-0.5 -mr-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          )
                        })}
                        {!filesExpanded && selectedFiles.length > 3 && (
                          <span
                            onClick={() => setFilesExpanded(true)}
                            className="inline-flex items-center bg-gray-200 text-gray-600 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer hover:bg-gray-300"
                          >
                            +{selectedFiles.length - 3} 更多
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Input row */}
              <div className="flex items-center gap-2 px-3 py-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="输入消息..."
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm"
                  disabled={connectionState !== 'connected'}
                />
                <button
                  onClick={() => setFilePickerOpen(true)}
                  className={`p-2 rounded-lg transition-colors ${
                    connectionState !== 'connected'
                      ? 'text-gray-400'
                      : 'text-gray-500 hover:text-primary-600 hover:bg-primary-50'
                  }`}
                  disabled={connectionState !== 'connected'}
                  title="选择文件"
                >
                  <AtSign className="w-4 h-4" />
                </button>
                <button
                  onClick={sendMessage}
                  disabled={(!input.trim() && selectedFiles.length === 0) || connectionState !== 'connected'}
                  className="px-5 py-2 rounded-lg text-sm font-medium transition-colors bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  发送
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* File Picker Modal */}
      <FilePicker
        open={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
      />
    </div>
  )
}
