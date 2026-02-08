/**
 * Session Storage Module
 *
 * In-memory storage for session sync data with automatic cleanup.
 * Sessions are stored with a TTL of 30 days from last access.
 */

import crypto from 'crypto'

// ============================================================================
// Types
// ============================================================================

export interface SessionMetadata {
  name: string
  deviceId: string
  browserInfo: string
  version: string
  createdAt: number
  updatedAt: number
}

export interface StoredSession {
  syncId: string
  sessionId: string
  encryptedData: string
  metadata: SessionMetadata
  uploadedAt: number
  lastAccessedAt: number
  size: number
}

export interface SessionListItem {
  syncId: string
  sessionId: string
  title: string
  deviceId: string
  deviceInfo: string
  createdAt: number
  updatedAt: number
  uploadedAt: number
  expiresAt: number
  size: number
}

// ============================================================================
// Configuration
// ============================================================================

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const MAX_SESSIONS_PER_DEVICE = 100
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024 // 10 MB
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

// ============================================================================
// Storage
// ============================================================================

const sessions = new Map<string, StoredSession>()
const deviceSessions = new Map<string, Set<string>>() // deviceId -> set of syncIds

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique sync ID
 */
export function generateSyncId(): string {
  const timestamp = Date.now().toString(36)
  const random = crypto.randomBytes(4).toString('hex')
  return `sync-${timestamp}-${random}`
}

/**
 * Calculate expiry timestamp
 */
export function getExpiryTimestamp(): number {
  return Date.now() + SESSION_TTL_MS
}

/**
 * Check if payload size is valid
 */
export function isValidPayloadSize(size: number): boolean {
  return size <= MAX_PAYLOAD_SIZE
}

/**
 * Get stored session by syncId
 */
export function getSession(syncId: string): StoredSession | null {
  const session = sessions.get(syncId)
  if (!session) return null

  // Check expiration
  if (Date.now() > session.lastAccessedAt + SESSION_TTL_MS) {
    deleteSession(syncId)
    return null
  }

  // Update last accessed time
  session.lastAccessedAt = Date.now()
  return session
}

/**
 * Store a new session
 */
export function storeSession(
  sessionId: string,
  encryptedData: string,
  metadata: SessionMetadata
): { syncId: string; expiresAt: number } | null {
  const size = Buffer.byteLength(encryptedData, 'utf8')

  // Validate payload size
  if (!isValidPayloadSize(size)) {
    return null
  }

  const syncId = generateSyncId()
  const now = Date.now()

  const session: StoredSession = {
    syncId,
    sessionId,
    encryptedData,
    metadata,
    uploadedAt: now,
    lastAccessedAt: now,
    size,
  }

  // Check device session limit
  const deviceSyncIds = deviceSessions.get(metadata.deviceId) || new Set()
  if (deviceSyncIds.size >= MAX_SESSIONS_PER_DEVICE) {
    // Remove oldest session for this device
    const oldestSyncId = getOldestSessionForDevice(metadata.deviceId)
    if (oldestSyncId) {
      deleteSession(oldestSyncId)
      deviceSyncIds.delete(oldestSyncId)
    }
  }

  sessions.set(syncId, session)
  deviceSyncIds.add(syncId)
  deviceSessions.set(metadata.deviceId, deviceSyncIds)

  return { syncId, expiresAt: now + SESSION_TTL_MS }
}

/**
 * List sessions for a device
 */
export function listSessions(
  deviceId?: string,
  limit: number = 50,
  offset: number = 0
): { sessions: SessionListItem[]; total: number; hasMore: boolean } {
  let syncIds: string[]

  if (deviceId) {
    const deviceSyncIds = deviceSessions.get(deviceId)
    if (!deviceSyncIds) {
      return { sessions: [], total: 0, hasMore: false }
    }
    syncIds = Array.from(deviceSyncIds)
  } else {
    syncIds = Array.from(sessions.keys())
  }

  // Filter out expired sessions
  const now = Date.now()
  syncIds = syncIds.filter((syncId) => {
    const session = sessions.get(syncId)
    if (!session) return false
    const isExpired = now > session.lastAccessedAt + SESSION_TTL_MS
    if (isExpired) {
      deleteSession(syncId)
      return false
    }
    return true
  })

  // Sort by last accessed (most recent first)
  syncIds.sort((a, b) => {
    const sessionA = sessions.get(a)!
    const sessionB = sessions.get(b)!
    return sessionB.lastAccessedAt - sessionA.lastAccessedAt
  })

  // Paginate
  const total = syncIds.length
  const paginatedSyncIds = syncIds.slice(offset, offset + limit)

  const sessionListItems: SessionListItem[] = paginatedSyncIds
    .map((syncId) => {
      const session = sessions.get(syncId)!
      return {
        syncId,
        sessionId: session.sessionId,
        title: session.metadata.name,
        deviceId: session.metadata.deviceId,
        deviceInfo: session.metadata.browserInfo,
        createdAt: session.metadata.createdAt,
        updatedAt: session.metadata.updatedAt,
        uploadedAt: session.uploadedAt,
        expiresAt: session.lastAccessedAt + SESSION_TTL_MS,
        size: session.size,
      }
    })
    .filter((item): item is SessionListItem => item !== null)

  return {
    sessions: sessionListItems,
    total,
    hasMore: offset + limit < total,
  }
}

/**
 * Delete a session
 */
export function deleteSession(syncId: string): boolean {
  const session = sessions.get(syncId)
  if (!session) return false

  // Remove from device sessions
  const deviceSyncIds = deviceSessions.get(session.metadata.deviceId)
  if (deviceSyncIds) {
    deviceSyncIds.delete(syncId)
    if (deviceSyncIds.size === 0) {
      deviceSessions.delete(session.metadata.deviceId)
    }
  }

  sessions.delete(syncId)
  return true
}

/**
 * Get oldest session for a device (for cleanup)
 */
function getOldestSessionForDevice(deviceId: string): string | null {
  const deviceSyncIds = deviceSessions.get(deviceId)
  if (!deviceSyncIds) return null

  let oldestSyncId: string | null = null
  let oldestAccessedAt = Infinity

  for (const syncId of deviceSyncIds) {
    const session = sessions.get(syncId)
    if (session && session.lastAccessedAt < oldestAccessedAt) {
      oldestAccessedAt = session.lastAccessedAt
      oldestSyncId = syncId
    }
  }

  return oldestSyncId
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): { cleaned: number } {
  const now = Date.now()
  let cleaned = 0

  for (const [syncId, session] of sessions) {
    if (now > session.lastAccessedAt + SESSION_TTL_MS) {
      deleteSession(syncId)
      cleaned++
    }
  }

  return { cleaned }
}

/**
 * Get storage statistics
 */
export function getStorageStats(): {
  totalSessions: number
  totalDevices: number
  totalSize: number
} {
  let totalSize = 0
  for (const session of sessions.values()) {
    totalSize += session.size
  }

  return {
    totalSessions: sessions.size,
    totalDevices: deviceSessions.size,
    totalSize,
  }
}

// ============================================================================
// Periodic Cleanup
// ============================================================================

setInterval(() => {
  const result = cleanupExpiredSessions()
  if (result.cleaned > 0) {
    console.log(`[SessionStorage] Cleaned up ${result.cleaned} expired sessions`)
  }
}, CLEANUP_INTERVAL_MS)
