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

import type { RemoteMessage, EncryptedEnvelope } from './remote-protocol'

/** Key pair for ECDH exchange */
export interface KeyPair {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

export class E2EEncryption {
  private keyPair: KeyPair | null = null
  private sharedKey: CryptoKey | null = null

  /** Generate a new ECDH key pair */
  async generateKeyPair(): Promise<string> {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])

    this.keyPair = {
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
    }

    // Export public key as base64 for sharing
    const exported = await crypto.subtle.exportKey('raw', pair.publicKey)
    return arrayBufferToBase64(exported)
  }

  /** Derive shared key from peer's public key */
  async deriveSharedKey(peerPublicKeyBase64: string): Promise<void> {
    if (!this.keyPair) {
      throw new Error('Key pair not generated')
    }

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
  }

  /** Check if encryption is ready */
  isReady(): boolean {
    return this.sharedKey !== null
  }

  /** Encrypt a message */
  async encrypt(message: RemoteMessage): Promise<EncryptedEnvelope> {
    if (!this.sharedKey) {
      throw new Error('Shared key not derived')
    }

    const plaintext = new TextEncoder().encode(JSON.stringify(message))
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.sharedKey,
      plaintext
    )

    return {
      encrypted: true,
      data: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv.buffer),
    }
  }

  /** Decrypt an encrypted envelope */
  async decrypt(envelope: EncryptedEnvelope): Promise<RemoteMessage> {
    if (!this.sharedKey) {
      throw new Error('Shared key not derived')
    }

    const ciphertext = base64ToArrayBuffer(envelope.data)
    const iv = base64ToArrayBuffer(envelope.iv)

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      this.sharedKey,
      ciphertext
    )

    const json = new TextDecoder().decode(plaintext)
    return JSON.parse(json) as RemoteMessage
  }

  /** Reset encryption state */
  reset(): void {
    this.keyPair = null
    this.sharedKey = null
  }
}

// ============================================================================
// Helper functions
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

/**
 * Generate a UUID v4 session ID.
 * Uses crypto.randomUUID() which is available in all modern browsers and Node.js.
 *
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * Example: 550e8400-e29b-41d4-a716-446655440000
 */
export function generateSessionId(): string {
  return crypto.randomUUID()
}
