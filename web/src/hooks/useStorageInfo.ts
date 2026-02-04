/**
 * useStorageInfo Hook
 *
 * Hook for accessing storage information and session storage breakdown.
 * Now uses SQLite for session metadata and stats, while OPFS utilities
 * provide browser storage quota information.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '@/store/session.store'
import type { SessionWithStats } from '@/store/session.store'
import { getSessionRepository } from '@/sqlite'
import type { Session } from '@/sqlite/repositories/session.repository'
import { getSessionManager } from '@/opfs/session'
import {
  getStorageEstimate,
  getStorageStatus,
  formatBytes,
  getSessionSize,
} from '@/opfs/utils/storage-utils'
import type { StorageStatus } from '@/opfs/utils/storage-utils'

/** Session storage information */
export interface SessionStorageInfo {
  /** Session ID */
  id: string
  /** Session name */
  name: string
  /** Cache size in bytes */
  cacheSize: number
  /** Formatted cache size */
  cacheSizeFormatted: string
  /** Pending changes count */
  pendingCount: number
  /** Undo records count */
  undoCount: number
  /** Last active timestamp */
  lastActiveAt: number
}

/** Storage info result */
export interface StorageInfo {
  /** Total usage in bytes */
  usage: number
  /** Total quota in bytes */
  quota: number
  /** Usage percentage */
  usagePercent: number
  /** Formatted usage string */
  usageFormatted: string
  /** Formatted quota string */
  quotaFormatted: string
  /** Storage status */
  status: StorageStatus
}

/** Hook result */
export interface UseStorageInfoResult {
  /** Storage information */
  storage: StorageInfo | null
  /** Per-session storage breakdown */
  sessions: SessionStorageInfo[]
  /** Loading state */
  loading: boolean
  /** Error message */
  error: string | null
  /** Refresh storage info (optionally calculate session sizes) */
  refresh: (includeSessionSizes?: boolean) => Promise<void>
  /** Cleanup old sessions */
  cleanupOldSessions: (days: number) => Promise<number>
  /** Clear all cache */
  clearAllCache: () => Promise<void>
}

/**
 * Convert Session from SQLite to SessionWithStats format
 */
function sqliteSessionToWithStats(session: Session): SessionWithStats {
  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    lastActiveAt: session.lastAccessedAt,
    cacheSize: session.cacheSize,
    pendingCount: session.pendingCount,
    undoCount: session.undoCount,
    modifiedFiles: session.modifiedFiles,
    status: session.status,
  }
}

/**
 * Hook for accessing storage information
 * Uses SQLite for session metadata, OPFS utilities for storage quota
 */
export function useStorageInfo(): UseStorageInfoResult {
  // Use selector to only subscribe to sessions, not entire store
  const sessions = useSessionStore((state) => state.sessions)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [sessionStorageList, setSessionStorageList] = useState<SessionStorageInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use refs to store latest values without causing re-renders
  const sessionsRef = useRef<SessionWithStats[]>(sessions)
  const sessionIdsRef = useRef<string>('')
  const hasLoadedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const prevSessionCountRef = useRef(0)
  const sessionCount = sessions.length

  // Keep sessionsRef updated
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  /**
   * Load sessions from SQLite (fallback to OPFS if needed)
   */
  const loadSessionsFromSQLite = async (): Promise<SessionWithStats[]> => {
    try {
      const repo = getSessionRepository()
      const sqliteSessions = await repo.findAllSessions()

      if (sqliteSessions.length > 0) {
        // Use SQLite data
        return sqliteSessions.map(sqliteSessionToWithStats)
      }
    } catch (e) {
      console.warn(
        '[useStorageInfo] Failed to load sessions from SQLite, falling back to store:',
        e
      )
    }

    // Fallback to store data
    return sessionsRef.current
  }

  /**
   * Calculate session sizes using OPFS directory traversal
   * This is still needed because file content is stored in OPFS
   */
  const calculateSessionSizes = async (
    sessionsList: SessionWithStats[],
    signal: AbortSignal
  ): Promise<SessionStorageInfo[]> => {
    const manager = await getSessionManager()
    const results: Map<string, SessionStorageInfo> = new Map()

    // Initialize results with SQLite data (fast)
    for (const session of sessionsList) {
      results.set(session.id, {
        id: session.id,
        name: session.name,
        cacheSize: session.cacheSize || 0,
        cacheSizeFormatted: session.cacheSize ? formatBytes(session.cacheSize) : '计算中...',
        pendingCount: session.pendingCount,
        undoCount: session.undoCount,
        lastActiveAt: session.lastActiveAt || 0,
      })
    }

    // Update UI with initial data
    setSessionStorageList(Array.from(results.values()))

    // Process sessions in batches to calculate actual OPFS size
    const BATCH_SIZE = 1
    for (let i = 0; i < sessionsList.length; i += BATCH_SIZE) {
      if (signal.aborted) break

      const batch = sessionsList.slice(i, i + BATCH_SIZE)

      for (const session of batch) {
        if (signal.aborted) break

        try {
          const sessionDir = await manager.sessionsRoot?.getDirectoryHandle(session.id, {
            create: false,
          })

          let cacheSize = 0
          if (sessionDir) {
            cacheSize = await getSessionSize(sessionDir)

            // Update SQLite with new cache size
            try {
              const repo = getSessionRepository()
              await repo.updateSessionStats(session.id, { cacheSize })
            } catch (e) {
              console.warn('[useStorageInfo] Failed to update cache size in SQLite:', e)
            }
          }

          const info: SessionStorageInfo = {
            id: session.id,
            name: session.name,
            cacheSize,
            cacheSizeFormatted: formatBytes(cacheSize),
            pendingCount: session.pendingCount,
            undoCount: session.undoCount,
            lastActiveAt: session.lastActiveAt || 0,
          }

          results.set(session.id, info)
          setSessionStorageList(Array.from(results.values()))
        } catch (e) {
          console.error(`Failed to get size for session ${session.id}:`, e)
          results.set(session.id, {
            id: session.id,
            name: session.name,
            cacheSize: 0,
            cacheSizeFormatted: '0 B',
            pendingCount: session.pendingCount,
            undoCount: session.undoCount,
            lastActiveAt: session.lastActiveAt || 0,
          })
        }

        // Yield to the main thread after each session
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    return Array.from(results.values())
  }

  const refresh = useCallback(async (includeSessionSizes = false) => {
    // Cancel any ongoing refresh
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setLoading(true)
    setError(null)

    try {
      // Get overall storage estimate (browser API, includes OPFS + IndexedDB)
      const estimate = await getStorageEstimate()
      if (estimate) {
        setStorage({
          usage: estimate.usage,
          quota: estimate.quota,
          usagePercent: estimate.usagePercent,
          usageFormatted: formatBytes(estimate.usage),
          quotaFormatted: formatBytes(estimate.quota),
          status: getStorageStatus(estimate.usagePercent),
        })
      }

      // Load sessions from SQLite (or fallback to store)
      const sessionsList = await loadSessionsFromSQLite()
      let sessionInfo: SessionStorageInfo[]

      if (includeSessionSizes) {
        // Calculate actual OPFS sizes in batches
        sessionInfo = await calculateSessionSizes(sessionsList, abortControllerRef.current.signal)
      } else {
        // Quick mode: use SQLite data without OPFS size calculation
        sessionInfo = sessionsList.map((session) => ({
          id: session.id,
          name: session.name,
          cacheSize: session.cacheSize || 0,
          cacheSizeFormatted: session.cacheSize ? formatBytes(session.cacheSize) : '-',
          pendingCount: session.pendingCount,
          undoCount: session.undoCount,
          lastActiveAt: session.lastActiveAt || 0,
        }))
      }

      setSessionStorageList(sessionInfo)
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // silently ignore abort
        return
      }
      const message = e instanceof Error ? e.message : 'Failed to load storage info'
      setError(message)
      console.error('[useStorageInfo] Failed to load storage info:', e)
    } finally {
      // Always reset loading, even if aborted
      setLoading(false)
    }
  }, [])

  // Single useEffect for mount and session count changes
  useEffect(() => {
    const currentSessionIds = sessions
      .map((s) => s.id)
      .sort()
      .join(',')

    // Initial load on mount
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true
      sessionIdsRef.current = currentSessionIds
      prevSessionCountRef.current = sessionCount
      refresh(true)
    } else if (
      sessionIdsRef.current !== currentSessionIds ||
      prevSessionCountRef.current !== sessionCount
    ) {
      // Session IDs or count changed, update refs and refresh
      sessionIdsRef.current = currentSessionIds
      prevSessionCountRef.current = sessionCount
      refresh(true)
    }
    // If only session properties changed (like activeSessionId, pendingCount), don't recalculate sizes
  }, [sessionCount, refresh])

  const cleanupOldSessions = useCallback(
    async (days: number): Promise<number> => {
      const repo = getSessionRepository()
      const manager = await getSessionManager()

      // Find inactive sessions from SQLite
      const inactiveSessions = await repo.findInactiveSessions(days)
      let cleanedCount = 0

      for (const session of inactiveSessions) {
        try {
          // Delete from OPFS
          await manager.deleteSession(session.id)
          // Delete from SQLite (cascade deletes related records)
          await repo.deleteSession(session.id)
          cleanedCount++
        } catch (e) {
          console.error(`Failed to delete session ${session.id}:`, e)
        }
      }

      // Refresh after cleanup
      await refresh()

      return cleanedCount
    },
    [refresh]
  )

  const clearAllCache = useCallback(async (): Promise<void> => {
    const repo = getSessionRepository()
    const manager = await getSessionManager()

    // Get all sessions from SQLite
    const allSessions = await repo.findAllSessions()

    for (const session of allSessions) {
      try {
        // Clear OPFS workspace
        const workspace = await manager.getSession(session.id)
        if (workspace) {
          await workspace.clear()
        }
      } catch (e) {
        console.error(`Failed to clear session ${session.id}:`, e)
      }
    }

    // Refresh after clearing
    await refresh()
  }, [refresh])

  return {
    storage,
    sessions: sessionStorageList,
    loading,
    error,
    refresh,
    cleanupOldSessions,
    clearAllCache,
  }
}
