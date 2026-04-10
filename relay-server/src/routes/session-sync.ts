/**
 * Session Sync API Routes
 *
 * REST API endpoints for cross-device session synchronization.
 * All endpoints support optional device-based authentication.
 */

import { Router, type Request, type Response, type Router as ExpressRouter } from 'express'
import {
  storeSession,
  getSession,
  listSessions,
  deleteSession,
  getStorageStats,
  isValidPayloadSize,
} from '../session-storage.js'

// ============================================================================
// Types
// ============================================================================

interface SessionUploadRequest {
  sessionId: string
  encryptedData: string
  metadata: {
    name: string
    deviceId: string
    browserInfo: string
    version: string
    createdAt: number
    updatedAt: number
  }
}

interface SessionUploadResponse {
  success: boolean
  syncId?: string
  expiresAt?: string
  error?: {
    code: string
    message: string
  }
}

interface SessionDownloadResponse {
  success: boolean
  sessionId?: string
  encryptedData?: string
  metadata?: {
    name: string
    deviceId: string
    browserInfo: string
    version: string
    createdAt: number
    updatedAt: number
  }
  uploadedAt?: string
  expiresAt?: string
  error?: {
    code: string
    message: string
  }
}

interface SessionListItem {
  syncId: string
  sessionId: string
  title: string
  deviceId: string
  deviceInfo: string
  createdAt: number
  updatedAt: number
  uploadedAt: string
  expiresAt: string
  size: number
}

interface SessionListResponse {
  success: boolean
  sessions: SessionListItem[]
  total: number
  hasMore: boolean
  error?: {
    code: string
    message: string
  }
}

interface SessionDeleteResponse {
  success: boolean
  message?: string
  error?: {
    code: string
    message: string
  }
}

// ============================================================================
// Router
// ============================================================================

const router: ExpressRouter = Router()

// ============================================================================
// Validation Utilities
// ============================================================================

function validateSessionUpload(body: any): body is SessionUploadRequest {
  if (!body || typeof body !== 'object') return false
  if (!body.sessionId || typeof body.sessionId !== 'string') return false
  if (!body.encryptedData || typeof body.encryptedData !== 'string') return false
  if (!body.metadata || typeof body.metadata !== 'object') return false
  if (!body.metadata.name || typeof body.metadata.name !== 'string') return false
  if (!body.metadata.deviceId || typeof body.metadata.deviceId !== 'string') return false
  if (!body.metadata.browserInfo || typeof body.metadata.browserInfo !== 'string') return false
  if (!body.metadata.version || typeof body.metadata.version !== 'string') return false
  if (typeof body.metadata.createdAt !== 'number') return false
  if (typeof body.metadata.updatedAt !== 'number') return false
  return true
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/session/upload
 *
 * Upload a session state for cross-device sync.
 */
router.post('/session/upload', (req: Request, res: Response) => {
  console.log(`[API] POST /api/session/upload`)

  try {
    // Validate request body
    if (!validateSessionUpload(req.body)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid request body. Required fields: sessionId, encryptedData, metadata',
        },
      } as SessionUploadResponse)
    }

    const { sessionId, encryptedData, metadata } = req.body

    // Check payload size
    const size = Buffer.byteLength(encryptedData, 'utf8')
    if (!isValidPayloadSize(size)) {
      return res.status(413).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Payload exceeds maximum size of 10MB (actual: ${(size / 1024 / 1024).toFixed(2)}MB)`,
        },
      } as SessionUploadResponse)
    }

    // Store session
    const result = storeSession(sessionId, encryptedData, metadata)
    if (!result) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'STORAGE_ERROR',
          message: 'Failed to store session',
        },
      } as SessionUploadResponse)
    }

    console.log(`[API] Session uploaded: ${result.syncId}`)

    return res.status(200).json({
      success: true,
      syncId: result.syncId,
      expiresAt: new Date(result.expiresAt).toISOString(),
    } as SessionUploadResponse)
  } catch (error) {
    console.error('[API] Upload error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    } as SessionUploadResponse)
  }
})

/**
 * GET /api/session/download/:syncId
 *
 * Download a session by its syncId.
 */
router.get('/session/download/:syncId', (req: Request, res: Response) => {
  const { syncId } = req.params
  console.log(`[API] GET /api/session/download/${syncId}`)

  try {
    const session = getSession(syncId)

    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found or has expired',
        },
      } as SessionDownloadResponse)
    }

    console.log(`[API] Session downloaded: ${syncId}`)

    return res.status(200).json({
      success: true,
      sessionId: session.sessionId,
      encryptedData: session.encryptedData,
      metadata: session.metadata,
      uploadedAt: new Date(session.uploadedAt).toISOString(),
      expiresAt: new Date(session.lastAccessedAt + 30 * 24 * 60 * 60 * 1000).toISOString(),
    } as SessionDownloadResponse)
  } catch (error) {
    console.error('[API] Download error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    } as SessionDownloadResponse)
  }
})

/**
 * GET /api/sessions
 *
 * List all sessions for a device.
 */
router.get('/sessions', (req: Request, res: Response) => {
  const deviceId = req.query.deviceId as string | undefined
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100)
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0)

  console.log(`[API] GET /api/sessions deviceId=${deviceId || 'all'} limit=${limit} offset=${offset}`)

  try {
    const result = listSessions(deviceId, limit, offset)

    const sessions = result.sessions.map((session) => ({
      syncId: session.syncId,
      sessionId: session.sessionId,
      title: session.title,
      deviceId: session.deviceId,
      deviceInfo: session.deviceInfo,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      uploadedAt: new Date(session.uploadedAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      size: session.size,
    }))

    return res.status(200).json({
      success: true,
      sessions,
      total: result.total,
      hasMore: result.hasMore,
    } as SessionListResponse)
  } catch (error) {
    console.error('[API] List error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    } as SessionListResponse)
  }
})

/**
 * DELETE /api/session/:syncId
 *
 * Delete a session by its syncId.
 */
router.delete('/session/:syncId', (req: Request, res: Response) => {
  const { syncId } = req.params
  console.log(`[API] DELETE /api/session/${syncId}`)

  try {
    const deleted = deleteSession(syncId)

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found',
        },
      } as SessionDeleteResponse)
    }

    console.log(`[API] Session deleted: ${syncId}`)

    return res.status(200).json({
      success: true,
      message: 'Session deleted successfully',
    } as SessionDeleteResponse)
  } catch (error) {
    console.error('[API] Delete error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    } as SessionDeleteResponse)
  }
})

/**
 * GET /api/sessions/stats
 *
 * Get storage statistics (for monitoring).
 */
router.get('/sessions/stats', (_req: Request, res: Response) => {
  console.log(`[API] GET /api/sessions/stats`)

  try {
    const stats = getStorageStats()

    return res.status(200).json({
      success: true,
      stats: {
        totalSessions: stats.totalSessions,
        totalDevices: stats.totalDevices,
        totalSize: stats.totalSize,
        totalSizeFormatted: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
      },
    })
  } catch (error) {
    console.error('[API] Stats error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    })
  }
})

export default router
