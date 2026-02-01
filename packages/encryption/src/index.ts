/**
 * E2E Encryption - Web Crypto API based encryption for remote sessions.
 *
 * Uses:
 * - ECDH P-256 for key exchange
 * - AES-GCM 256-bit for message encryption
 * - HKDF for key derivation from shared secret
 *
 * Flow:
 * 1. Both peers generate ECDH key pairs
 * 2. Exchange public keys via relay server (unencrypted)
 * 3. Derive shared AES key from ECDH shared secret
 * 4. All subsequent messages are AES-GCM encrypted
 */

// ============================================================================
// Types
// ============================================================================

/** Key pair for ECDH exchange */
export interface KeyPair {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

/** Encrypted message envelope */
export interface EncryptedEnvelope {
  encrypted: true
  data: string  // base64 ciphertext
  iv: string    // base64 IV
}

/** Union type for wire messages */
export type WireMessage = RemoteMessage | EncryptedEnvelope

/** Base message type (re-exported for convenience) */
export interface RemoteMessage {
  type: string
  [key: string]: any
}

/** Encryption state */
export type EncryptionState =
  | 'none'          // Not initialized
  | 'generating'    // Generating key pair
  | 'exchanging'    // Exchanging public keys
  | 'ready'         // Shared key derived, ready to encrypt
  | 'error'         // Error occurred

/** Encryption state callback */
export type EncryptionStateChange = (state: EncryptionState, error?: string) => void

// ============================================================================
// Encryption Class
// ============================================================================

export class E2EEncryption {
  private keyPair: KeyPair | null = null
  private sharedKey: CryptoKey | null = null
  private _state: EncryptionState = 'none'
  private stateCallbacks: Set<EncryptionStateChange> = new Set()
  private _debugMode = false
  private _lastError: string | null = null

  constructor(debugMode = false) {
    this._debugMode = debugMode
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /** Current encryption state */
  get state(): EncryptionState {
    return this._state
  }

  /** Last error message */
  get lastError(): string | null {
    return this._lastError
  }

  /** Enable or disable debug mode */
  setDebugMode(enabled: boolean): void {
    this._debugMode = enabled
    this.log('Debug mode', enabled ? 'enabled' : 'disabled')
  }

  /** Subscribe to state changes */
  onStateChange(callback: EncryptionStateChange): () => void {
    this.stateCallbacks.add(callback)
    // Immediately call with current state
    callback(this._state, this._lastError ?? undefined)
    return () => this.stateCallbacks.delete(callback)
  }

  private setState(state: EncryptionState, error?: string): void {
    if (this._state !== state || error !== this._lastError) {
      this._state = state
      this._lastError = error ?? null
      this.log('State change:', state, error ?? '')
      this.stateCallbacks.forEach(cb => cb(state, this._lastError ?? undefined))
    }
  }

  private log(...args: unknown[]): void {
    if (this._debugMode) {
      console.log('[E2EEncryption]', ...args)
    }
  }

  // ==========================================================================
  // Key Management
  // ==========================================================================

  /** Generate a new ECDH key pair */
  async generateKeyPair(): Promise<string> {
    this.setState('generating')
    try {
      this.log('Generating ECDH P-256 key pair...')
      const pair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
      )

      this.keyPair = {
        publicKey: pair.publicKey,
        privateKey: pair.privateKey,
      }

      // Export public key as base64 for sharing
      const exported = await crypto.subtle.exportKey('raw', pair.publicKey)
      const publicKeyBase64 = arrayBufferToBase64(exported)

      this.setState('exchanging')
      this.log('Key pair generated, public key:', publicKeyBase64.slice(0, 16) + '...')
      return publicKeyBase64
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      this.setState('error', `Failed to generate key pair: ${error}`)
      throw e
    }
  }

  /** Derive shared key from peer's public key */
  async deriveSharedKey(peerPublicKeyBase64: string): Promise<void> {
    if (!this.keyPair) {
      const error = 'Cannot derive shared key: no key pair generated'
      this.setState('error', error)
      throw new Error(error)
    }

    try {
      this.log('Deriving shared key from peer public key...')

      // Import peer's public key
      const peerKeyData = base64ToArrayBuffer(peerPublicKeyBase64)
      const peerPublicKey = await crypto.subtle.importKey(
        'raw',
        peerKeyData,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
      )

      // Derive shared bits via ECDH
      const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: peerPublicKey },
        this.keyPair.privateKey,
        256
      )

      // Derive AES key from shared bits via HKDF
      const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])

      this.sharedKey = await crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new TextEncoder().encode('bfosa-remote-v1'),
          info: new TextEncoder().encode('aes-gcm-key'),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )

      this.setState('ready')
      this.log('Shared key derived, encryption ready')
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      this.setState('error', `Failed to derive shared key: ${error}`)
      throw e
    }
  }

  /** Check if encryption is ready */
  isReady(): boolean {
    return this._state === 'ready' && this.sharedKey !== null
  }

  /** Get public key without generating a new one (if exists) */
  async getPublicKey(): Promise<string | null> {
    if (!this.keyPair) return null
    // Re-export the public key
    return this.exportPublicKey()
  }

  private async exportPublicKey(): Promise<string> {
    if (!this.keyPair?.publicKey) {
      throw new Error('No public key available')
    }
    const exported = await crypto.subtle.exportKey('raw', this.keyPair.publicKey)
    return arrayBufferToBase64(exported)
  }

  // ==========================================================================
  // Encryption / Decryption
  // ==========================================================================

  /** Encrypt a message */
  async encrypt(message: RemoteMessage): Promise<EncryptedEnvelope> {
    if (!this.sharedKey) {
      const error = 'Cannot encrypt: shared key not derived'
      this.setState('error', error)
      throw new Error(error)
    }

    if (this._state !== 'ready') {
      const error = `Cannot encrypt in state: ${this._state}`
      this.setState('error', error)
      throw new Error(error)
    }

    try {
      const plaintext = new TextEncoder().encode(JSON.stringify(message))
      const iv = crypto.getRandomValues(new Uint8Array(12))

      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.sharedKey,
        plaintext
      )

      this.log('Encrypted message type:', message.type)

      return {
        encrypted: true,
        data: arrayBufferToBase64(ciphertext),
        iv: arrayBufferToBase64(iv.buffer),
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      this.setState('error', `Encryption failed: ${error}`)
      throw e
    }
  }

  /** Decrypt an encrypted envelope */
  async decrypt(envelope: EncryptedEnvelope): Promise<RemoteMessage> {
    if (!this.sharedKey) {
      const error = 'Cannot decrypt: shared key not derived'
      this.setState('error', error)
      throw new Error(error)
    }

    try {
      const ciphertext = base64ToArrayBuffer(envelope.data)
      const iv = base64ToArrayBuffer(envelope.iv)

      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        this.sharedKey,
        ciphertext
      )

      const json = new TextDecoder().decode(plaintext)
      const message = JSON.parse(json) as RemoteMessage

      this.log('Decrypted message type:', message.type)

      return message
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      this.setState('error', `Decryption failed: ${error}`)
      throw e
    }
  }

  /** Reset encryption state */
  reset(): void {
    this.keyPair = null
    this.sharedKey = null
    this._lastError = null
    this.setState('none')
    this.log('Encryption state reset')
  }
}

// ============================================================================
// Protocol Types
// ============================================================================

/** Message indicating encryption is ready */
export interface EncryptionReadyMessage {
  type: 'encryption:ready'
  encrypted: true
  timestamp: number
}

/** Message indicating encryption error */
export interface EncryptionErrorMessage {
  type: 'encryption:error'
  error: string
  timestamp: number
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Check if a message is an encrypted envelope */
export function isEncryptedEnvelope(msg: WireMessage): msg is EncryptedEnvelope {
  return typeof msg === 'object' && msg !== null && 'encrypted' in msg && msg.encrypted === true
}

/** Check if a message is a protocol message (not encrypted) */
export function isProtocolMessage(msg: WireMessage): boolean {
  if (!isEncryptedEnvelope(msg)) {
    const type = (msg as RemoteMessage).type
    return PROTOCOL_MESSAGE_TYPES.has(type)
  }
  return false
}

/** Messages that should never be encrypted */
const PROTOCOL_MESSAGE_TYPES = new Set([
  'session:create',
  'session:join',
  'session:joined',
  'session:error',
  'session:closed',
  'session:close',
  'peer:disconnected',
  'ping',
  'pong',
  'encryption:ready',
  'encryption:error',
])

/** Messages that MUST be encrypted */
export function mustEncrypt(type: string): boolean {
  return MUST_ENCRYPT_TYPES.has(type)
}

const MUST_ENCRYPT_TYPES = new Set([
  'remote:send_message',
  'remote:cancel',
  'agent:message',
  'agent:thinking',
  'agent:status',
  'agent:tool_call',
  'agent:tool_result',
  'file:change',
  'sync:state',
])

// ============================================================================
// Helper Functions
// ============================================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/** Generate a UUID v4 session ID */
export function generateSessionId(): string {
  return crypto.randomUUID()
}
