# Remote Session Architecture

## Overview

Remote Session enables secure, end-to-end encrypted remote control of CreatorWeave from a mobile device. The architecture consists of three main components:

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│     Host        │         │   Relay Server  │         │     Remote      │
│  (Desktop Web)  │         │   (Node.js)     │         │  (Mobile Web)   │
├─────────────────┤         ├─────────────────┤         ├─────────────────┤
│ • Vite Dev      │◄───────►│ • Socket.IO     │◄───────►│ • Socket.IO     │
│ • React + TS    │  WebSocket│ • Express      │  WebSocket│ • React + TS    │
│ • E2EEncryption │         │ • Room Mgmt     │         │ • E2EEncryption │
└─────────────────┘         └─────────────────┘         └─────────────────┘
       :3000                       :3001                       :3002
```

## Components

### 1. Host (Desktop Web)

**Location**: `web/` | **Port**: 3000

The host runs the main CreatorWeave application and can create remote sessions that mobile devices can join.

**Key Files**:
- `src/remote/remote-session.ts` - Core session management
- `src/remote/remote-protocol.ts` - Message protocol definitions
- `src/store/remote.store.ts` - Zustand store for remote state
- `src/components/remote/RemoteBadge.tsx` - Status indicator UI
- `src/components/remote/RemoteControlPanel.tsx` - QR code and session management

### 2. Relay Server

**Location**: `relay-server/` | **Port**: 3001

Simple WebSocket relay server using Socket.IO for message passing between host and remote.

**Key Files**:
- `src/index.ts` - Express server with Socket.IO

**Features**:
- Room-based message routing (by sessionId)
- No message storage or processing
- Minimal latency overhead

### 3. Remote (Mobile Web)

**Location**: `mobile-web/` | **Port**: 3002

Simplified mobile interface for remote control.

**Key Files**:
- `src/App.tsx` - Mobile app with session join UI

**Features**:
- QR code scanning support (via URL parameter)
- Session ID input for manual joining
- LocalStorage session persistence for auto-reconnect

## E2E Encryption

### Package Structure

```
packages/encryption/
├── src/
│   └── index.ts          # E2EEncryption class
├── package.json
└── tsconfig.json
```

### Cryptography

**Algorithms**:
- **Key Exchange**: ECDH P-256 (Elliptic Curve Diffie-Hellman)
- **Encryption**: AES-GCM 256-bit (Galois/Counter Mode)
- **Key Derivation**: HKDF (HMAC-based Key Derivation)

### Encryption Flow

```
Host                          Remote
  │                              │
  │ 1. Generate ECDH Key Pair    │
  │    (publicKey, privateKey)   │
  │                              │
  │ 2. Send publicKey ──────────►│
  │                              │
  │                              │ 3. Generate ECDH Key Pair
  │                              │
  │ ◄──────── Send publicKey     │
  │                              │
  │ 4. Derive Shared Secret      │ 4. Derive Shared Secret
  │    ECDH(remotePublicKey)     │    ECDH(hostPublicKey)
  │                              │
  │ 5. Derive AES Key (HKDF)     │ 5. Derive AES Key (HKDF)
  │                              │
  │ 6. Send encryption:ready ──►│
  │                              │
  │ ═════ ENCRYPTED ════════════│
  │                              │
  │ 7. All messages encrypted    │ 7. All messages encrypted
  │    with AES-GCM              │    with AES-GCM
```

### Message Protocol

#### Plain Messages (before encryption)

```typescript
type RemoteMessage =
  | SessionCreateMessage
  | SessionJoinMessage
  | SessionJoinedMessage
  | AgentMessageEvent
  | FileChangeEvent
  | EncryptionReadyMessage
  | ...
```

#### Encrypted Envelope

```typescript
interface EncryptedEnvelope {
  encrypted: true
  data: string    // Base64-encoded ciphertext
  iv: string      // Base64-encoded IV/nonce
}

type WireMessage = RemoteMessage | EncryptedEnvelope
```

### Encryption States

| State | Description | Icon |
|-------|-------------|------|
| `none` | No encryption initialized | 🔓 Unlock |
| `generating` | Generating ECDH key pair | 🔑 Key (pulse) |
| `exchanging` | Exchanging public keys | 🔄 RefreshCw (spin) |
| `ready` | Shared key derived, ready to encrypt | 🔒 Lock |
| `error` | Encryption failed | ⚠️ AlertTriangle |

## Message Types

### Session Management

```typescript
// Create or join a session
interface SessionCreateMessage {
  type: 'session:create'
  sessionId: string      // UUID v4
  role: 'host'
}

interface SessionJoinMessage {
  type: 'session:join'
  sessionId: string
  role: 'remote'
}

interface SessionJoinedMessage {
  type: 'session:joined'
  sessionId: string
  role: 'host' | 'remote'
  peerId: string
}
```

### Encryption

```typescript
// Send public key
interface PublicKeyMessage {
  type: 'encryption:public-key'
  publicKey: string     // JWK format
}

// Confirm key exchange complete
interface EncryptionReadyMessage {
  type: 'encryption:ready'
}

interface EncryptionErrorMessage {
  type: 'encryption:error'
  error: string
  timestamp: number
}
```

### Agent Messages

```typescript
// Remote sends agent request
interface RemoteSendMessage {
  type: 'remote:send'
  content: string
  messageId: string
}

// Host streams agent response
interface AgentMessageEvent {
  type: 'agent:message'
  content: string
  messageId: string
  timestamp: number
}
```

## Development

### Starting All Services

```bash
# Terminal 1: Host
cd web && pnpm run dev

# Terminal 2: Relay Server
cd relay-server && PORT=3001 pnpm run dev

# Terminal 3: Remote (Mobile Web)
cd mobile-web && pnpm run dev --port 3002
```

Or use the background service start:

```bash
# Start all three services in background
make dev-all
```

### URLs

| Service | URL |
|---------|-----|
| Host | http://localhost:3000 |
| Relay | http://localhost:3001 |
| Remote | http://localhost:3002 |

### Joining a Session

**Method 1: QR Code**
1. Host creates session via RemoteControlPanel
2. Scan QR code with mobile device
3. Mobile web app automatically joins

**Method 2: URL Parameter**
```
http://localhost:3002/?session=xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
```

**Method 3: Manual Input**
1. Open mobile web app
2. Enter session ID manually
3. Click "Join Session"

## Security Considerations

### What is Encrypted

**Encrypted**:
- Agent conversation content
- File change notifications
- Any sensitive user data

**Not Encrypted**:
- Session management messages (create, join, joined)
- Encryption handshake (public keys)
- Ping/Pong for connection health

### Key Derivation

```typescript
// HKDF with SHA-256
const sharedKey = await crypto.subtle.deriveKey(
  {
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(), // Empty salt
    info: new TextEncoder().encode('bfosa-e2e-encryption')
  },
  sharedSecret,  // From ECDH
  { name: 'AES-GCM', length: 256 },
  true,          // extractable
  ['encrypt', 'decrypt']
)
```

### Replay Protection

Each encrypted message includes a unique IV (nonce) preventing replay attacks.

### Forward Secrecy

Ephemeral ECDH keys provide forward secrecy - compromising long-term keys doesn't decrypt past sessions.

## Troubleshooting

### Common Issues

**Issue**: "Encryption not ready" errors
- **Cause**: Sending encrypted messages before key exchange completes
- **Fix**: Wait for `encryption:ready` message before sending encrypted data

**Issue**: Remote can't connect
- **Cause**: Relay server not running or wrong port
- **Fix**: Check relay server is running on port 3001

**Issue**: QR code not working
- **Cause**: Session ID not properly encoded
- **Fix**: Ensure sessionId is valid UUID v4 format

## Future Enhancements

- [ ] Multiple remote support (many remotes per host)
- [ ] Message acknowledgment and retry
- [ ] File transfer capability
- [ ] Audio/video streaming
- [ ] Persistent session storage
