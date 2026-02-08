/**
 * Relay Server - Full Remote Protocol Support
 *
 * Features:
 * - E2E encryption key exchange (public key relay)
 * - Session management (host + remote)
 * - Message relay (bidirectional, encrypted)
 * - Cross-device session sync (upload/download)
 * - Ping/pong heartbeat
 * - Reconnection support
 * - Peer state tracking
 */

import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'

// Import session sync routes
import sessionSyncRoutes from './routes/session-sync.js'

// ============================================================================
// Types (from remote-protocol.ts)
// ============================================================================

interface SessionCreateMessage {
  type: 'session:create'
  sessionId: string
  publicKey: string
}

interface SessionJoinMessage {
  type: 'session:join'
  sessionId: string
  publicKey: string
}

interface SessionJoinedMessage {
  type: 'session:joined'
  sessionId: string
  peerCount: number
}

interface SessionErrorMessage {
  type: 'session:error'
  error: string
}

interface PeerDisconnectedMessage {
  type: 'peer:disconnected'
  sessionId: string
}

interface SessionClosedMessage {
  type: 'session:closed'
  sessionId: string
  reason: 'host_disconnected' | 'session_ended'
}

interface PingMessage {
  type: 'ping'
  timestamp: number
}

type RemoteMessage = SessionCreateMessage | SessionJoinMessage | SessionJoinedMessage |
  SessionErrorMessage | PeerDisconnectedMessage | SessionClosedMessage | PingMessage |
  { type: string, [key: string]: any }

// ============================================================================
// Session Management
// ============================================================================

interface Peer {
  socket: any
  publicKey: string
  role: 'host' | 'remote'
}

interface Session {
  sessionId: string
  host: Peer | null
  remote: Peer | null
  createdAt: number
  lastActiveAt: number  // Last activity timestamp for timeout
}

// ============================================================================
// Config
// ============================================================================

const PORT = process.env.PORT || '3001'
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000 // 24 hours

// ============================================================================
// State
// ============================================================================

const sessions = new Map<string, Session>()
const socketToSession = new Map<any, string>() // socket -> sessionId

// ============================================================================
// Express App
// ============================================================================

const app = express()
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: sessions.size,
    timestamp: new Date().toISOString()
  })
})

// Session Sync API routes
app.use('/api', sessionSyncRoutes)

// Join session - redirect to mobile-web
const MOBILE_WEB_URL = process.env.MOBILE_WEB_URL || 'http://localhost:3002'

app.get('/join/:sessionId', (req, res) => {
  const { sessionId } = req.params

  // Validate sessionId format (basic check)
  if (!sessionId || sessionId.length > 100) {
    return res.status(400).send('Invalid session ID')
  }

  // Check if session exists
  const session = getSession(sessionId)
  if (!session) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Session Not Found</title>
        <style>
          body { font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
          .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          h2 { color: #e53e3e; margin: 0 0 1rem 0; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>会话不存在</h2>
          <p>Session not found. Please check the QR code and try again.</p>
        </div>
      </body>
      </html>
    `)
  }

  // Redirect to mobile-web
  const redirectUrl = `${MOBILE_WEB_URL}?session=${sessionId}`

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="0;url=${redirectUrl}">
        <title>加入遥控会话</title>
        <style>
          body { font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .container { text-align: center; padding: 2.5rem; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
          h2 { margin: 0 0 0.5rem 0; color: #1a202c; }
          p { color: #718096; margin-bottom: 1.5rem; }
          .spinner { border: 3px solid #e2e8f0; border-top: 3px solid #667eea; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          a { color: #667eea; text-decoration: none; font-weight: 500; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>正在跳转到遥控页面...</h2>
          <div class="spinner"></div>
          <p>如果没有自动跳转，<a href="${redirectUrl}">请点击这里</a></p>
        </div>
        <script>
          window.location.href = '${redirectUrl}';
        </script>
      </body>
    </html>
  `)
})

// ============================================================================
// WebSocket Server
// ============================================================================

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
})

// ============================================================================
// Session Helpers
// ============================================================================

function getSession(sessionId: string): Session | null {
  return sessions.get(sessionId) || null
}

function createSession(sessionId: string): Session {
  const session: Session = {
    sessionId,
    host: null,
    remote: null,
    createdAt: Date.now(),
    lastActiveAt: Date.now()
  }
  sessions.set(sessionId, session)
  return session
}

function updateActivity(session: Session): void {
  session.lastActiveAt = Date.now()
}

function cleanupSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    // Notify peers that session is closed (before peer:disconnected)
    const closedMsg: SessionClosedMessage = {
      type: 'session:closed',
      sessionId,
      reason: 'session_ended'
    }
    sendToPeer(session.host, closedMsg)
    sendToPeer(session.remote, closedMsg)

    // Then notify peer disconnection
    const msg: PeerDisconnectedMessage = {
      type: 'peer:disconnected',
      sessionId
    }
    sendToPeer(session.host, msg)
    sendToPeer(session.remote, msg)

    // Close sockets
    session.host?.socket.disconnect()
    session.remote?.socket.disconnect()

    // Cleanup mappings
    if (session.host) socketToSession.delete(session.host.socket)
    if (session.remote) socketToSession.delete(session.remote.socket)
  }
  sessions.delete(sessionId)
}

function sendToPeer(peer: Peer | null, message: any): void {
  if (peer && peer.socket && peer.socket.connected) {
    peer.socket.emit('message', message)
  }
}

function broadcastToSession(session: Session, message: any, excludePeer?: Peer): void {
  if (session.host !== excludePeer) {
    sendToPeer(session.host, message)
  }
  if (session.remote !== excludePeer) {
    sendToPeer(session.remote, message)
  }
}

// ============================================================================
// WebSocket Handler
// ============================================================================

io.on('connection', (socket) => {
  console.log(`[WS] Connected: ${socket.id}`)

  // Handle all message types
  socket.on('message', async (rawMessage: any) => {
    try {
      const data = rawMessage as RemoteMessage
      console.log(`[WS] ${socket.id}:`, data.type)

      switch (data.type) {
        case 'session:create':
          await handleSessionCreate(socket, data as SessionCreateMessage)
          break

        case 'session:join':
          await handleSessionJoin(socket, data as SessionJoinMessage)
          break

        case 'session:close':
          handleSessionClose(socket, data)
          break

        case 'ping':
          // Pong back
          socket.emit('message', {
            type: 'pong',
            timestamp: (data as PingMessage).timestamp
          })
          break

        default:
          // Relay all other messages to the session
          handleRelayMessage(socket, data)
          break
      }
    } catch (err) {
      console.error(`[WS] Error handling message from ${socket.id}:`, err)
      const errorMsg: SessionErrorMessage = {
        type: 'session:error',
        error: err instanceof Error ? err.message : 'Unknown error'
      }
      socket.emit('message', errorMsg)
    }
  })

  socket.on('disconnect', () => {
    console.log(`[WS] Disconnected: ${socket.id}`)
    handleDisconnect(socket)
  })

  socket.on('error', (err) => {
    console.error(`[WS] Socket error: ${socket.id}:`, err)
  })
})

// ============================================================================
// Message Handlers
// ============================================================================

async function handleSessionCreate(socket: any, msg: SessionCreateMessage): Promise<void> {
  const { sessionId, publicKey } = msg

  // Create or get existing session
  let session = getSession(sessionId)
  if (!session) {
    session = createSession(sessionId)
  }

  // Check if host already exists
  let isReconnect = false
  if (session.host) {
    // Check if the existing socket is still connected
    const existingSocketActive = session.host.socket && !session.host.socket.disconnected

    if (existingSocketActive) {
      // Host socket is still active - this is a page refresh/reconnect
      // Replace the old socket with the new one (old socket will be cleaned up on disconnect)
      console.log(`[WS] Host refreshing/reconnecting to session ${sessionId}, replacing socket`)
      socketToSession.delete(session.host.socket)
      isReconnect = true
    } else {
      // Existing socket is disconnected, allow normal reconnect
      console.log(`[WS] Host reconnecting to session ${sessionId} (old socket disconnected)`)
      socketToSession.delete(session.host.socket)
      isReconnect = true
    }
  }

  // Add (or reconnect) host to session
  session.host = { socket, publicKey, role: 'host' }
  socketToSession.set(socket, sessionId)
  updateActivity(session)

  // If remote is already present, perform key exchange
  if (session.remote) {
    // Exchange public keys between host and remote
    exchangePublicKeys(session)
    // Notify both that session is ready
    notifySessionReady(session)

    // If this was a reconnect (refresh), ensure the new host socket gets the session:joined message
    // This is needed because the old socket may have already received it, but the new one hasn't
    if (isReconnect) {
      const peerCount = (session.host ? 1 : 0) + (session.remote ? 1 : 0)
      const msg: SessionJoinedMessage = {
        type: 'session:joined',
        sessionId: session.sessionId,
        peerCount
      }
      sendToPeer(session.host, msg)
      console.log(`[WS] Sent session:joined to reconnected host, peerCount: ${peerCount}`)
    }
  } else {
    // No remote peer, notify host that only they are connected
    const msg: SessionJoinedMessage = {
      type: 'session:joined',
      sessionId: session.sessionId,
      peerCount: 1 // Only host
    }
    sendToPeer(session.host, msg)
  }
}

async function handleSessionJoin(socket: any, msg: SessionJoinMessage): Promise<void> {
  const { sessionId, publicKey } = msg
  console.log(`[WS] handleSessionJoin: sessionId=${sessionId}`)

  // Get existing session (host must create first)
  const session = getSession(sessionId)
  if (!session) {
    console.log(`[WS] Session not found: ${sessionId}`)
    const errorMsg: SessionErrorMessage = {
      type: 'session:error',
      error: 'Session not found'
    }
    socket.emit('message', errorMsg)
    console.log(`[WS] Sent error message to client`)
    return
  }

  // Check if remote already exists
  let isReconnect = false
  if (session.remote) {
    // Check if the existing socket is still connected
    const existingSocketActive = session.remote.socket && !session.remote.socket.disconnected

    if (existingSocketActive) {
      // Remote socket is still active - this is a page refresh/reconnect
      // Replace the old socket with the new one (old socket will be cleaned up on disconnect)
      console.log(`[WS] Remote refreshing/reconnecting to session ${sessionId}, replacing socket`)
      socketToSession.delete(session.remote.socket)
      isReconnect = true
    } else {
      // Existing socket is disconnected, allow normal reconnect
      console.log(`[WS] Remote reconnecting to session ${sessionId} (old socket disconnected)`)
      socketToSession.delete(session.remote.socket)
      isReconnect = true
    }
  }

  // Add (or reconnect) remote to session
  session.remote = { socket, publicKey, role: 'remote' }
  socketToSession.set(socket, sessionId)
  updateActivity(session)

  // If host is present, perform key exchange
  if (session.host) {
    exchangePublicKeys(session)
    notifySessionReady(session)

    // If this was a reconnect (refresh), ensure the new remote socket gets the session:joined message
    if (isReconnect) {
      const peerCount = (session.host ? 1 : 0) + (session.remote ? 1 : 0)
      const msg: SessionJoinedMessage = {
        type: 'session:joined',
        sessionId: session.sessionId,
        peerCount
      }
      sendToPeer(session.remote, msg)
      console.log(`[WS] Sent session:joined to reconnected remote, peerCount: ${peerCount}`)
    }
  }
}

function handleSessionClose(socket: any, msg: any): void {
  const sessionId = socketToSession.get(socket)
  if (sessionId) {
    cleanupSession(sessionId)
  }
}

function handleDisconnect(socket: any): void {
  const sessionId = socketToSession.get(socket)
  if (!sessionId) return

  const session = getSession(sessionId)
  if (!session) return

  // Remove the disconnected peer (but keep publicKey for reconnection validation)
  if (session.host?.socket === socket) {
    session.host = null
  } else if (session.remote?.socket === socket) {
    session.remote = null
  }

  socketToSession.delete(socket)

  // Update last activity time - session stays alive for reconnection
  updateActivity(session)

  // Notify the other peer
  const msg: PeerDisconnectedMessage = {
    type: 'peer:disconnected',
    sessionId
  }
  sendToPeer(session.host, msg)
  sendToPeer(session.remote, msg)

  // Don't delete session here - it will be cleaned up by timeout only
}

function handleRelayMessage(socket: any, msg: any): void {
  const sessionId = socketToSession.get(socket)
  if (!sessionId) {
    console.warn(`[WS] No session found for socket ${socket.id}`)
    return
  }

  const session = getSession(sessionId)
  if (!session) return

  // Determine sender and relay to recipient
  const sender = session.host?.socket === socket ? session.host : session.remote
  const recipient = session.host?.socket === socket ? session.remote : session.host

  if (!recipient) {
    console.warn(`[WS] No recipient to relay to`)
    return
  }

  // Relay message
  sendToPeer(recipient, msg)
}

// ============================================================================
// Key Exchange
// ============================================================================

function exchangePublicKeys(session: Session): void {
  if (!session.host || !session.remote) return

  // Send host's public key to remote
  const hostKeyMsg: SessionCreateMessage = {
    type: 'session:create',
    sessionId: session.sessionId,
    publicKey: session.host.publicKey
  }
  sendToPeer(session.remote, hostKeyMsg)

  // Send remote's public key to host
  const remoteKeyMsg: SessionJoinMessage = {
    type: 'session:join',
    sessionId: session.sessionId,
    publicKey: session.remote.publicKey
  }
  sendToPeer(session.host, remoteKeyMsg)
}

function notifySessionReady(session: Session): void {
  const peerCount = (session.host ? 1 : 0) + (session.remote ? 1 : 0)
  const msg: SessionJoinedMessage = {
    type: 'session:joined',
    sessionId: session.sessionId,
    peerCount
  }
  broadcastToSession(session, msg)
}

// ============================================================================
// Cleanup
// ============================================================================

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now()
  for (const [sessionId, session] of sessions) {
    // Use lastActiveAt instead of createdAt for timeout
    // This allows sessions to persist even after both peers disconnect
    if (now - session.lastActiveAt > SESSION_TIMEOUT_MS) {
      cleanupSession(sessionId)
    }
  }
}, 60 * 1000)

// ============================================================================
// Start Server
// ============================================================================

const PORT_NUM = parseInt(PORT, 10)
httpServer.listen(PORT_NUM, () => {
  console.log(`[Relay Server] Running on http://localhost:${PORT_NUM}`)
  console.log(`[Relay Server] Health check: http://localhost:${PORT_NUM}/health`)
})
