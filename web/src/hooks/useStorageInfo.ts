/**
 * useStorageInfo Hook
 *
 * Hook for accessing OPFS storage information and session storage breakdown.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '@/store/session.store'
import type { SessionWithStats } from '@/store/session.store'
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
 * Hook for accessing OPFS storage information
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
   * Calculate session sizes in batches to avoid blocking the main thread
   */
  const calculateSessionSizes = async (
    sessionsList: SessionWithStats[],
    signal: AbortSignal
  ): Promise<SessionStorageInfo[]> => {
    const manager = await getSessionManager()
    const results: Map<string, SessionStorageInfo> = new Map()

    // Initialize results with placeholder data
    for (const session of sessionsList) {
      results.set(session.id, {
        id: session.id,
        name: session.name,
        cacheSize: 0,
        cacheSizeFormatted: '计算中...',
        pendingCount: session.pendingCount,
        undoCount: session.undoCount,
        lastActiveAt: session.lastActiveAt || 0,
      })
    }

    // Update UI with placeholder data first
    setSessionStorageList(Array.from(results.values()))

    // Process sessions in batches
    const BATCH_SIZE = 1 // Process one at a time to avoid blocking
    for (let i = 0; i < sessionsList.length; i += BATCH_SIZE) {
      if (signal.aborted) break

      const batch = sessionsList.slice(i, i + BATCH_SIZE)

      for (const session of batch) {
        if (signal.aborted) break

        try {
          const workspace = await manager.getSession(session.id)
          if (workspace) {
            const sessionDir = await manager.sessionsRoot?.getDirectoryHandle(session.id, {
              create: false,
            })

            let cacheSize = 0
            if (sessionDir) {
              cacheSize = await getSessionSize(sessionDir)
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

            // Update UI incrementally
            setSessionStorageList(Array.from(results.values()))
          }
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
      // Get overall storage estimate
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

      // Use ref to get latest sessions
      const sessionsList = sessionsRef.current
      let sessionInfo: SessionStorageInfo[]

      if (includeSessionSizes) {
        // Calculate sizes in batches to avoid blocking
        sessionInfo = await calculateSessionSizes(sessionsList, abortControllerRef.current.signal)
      } else {
        // Quick mode: just use session data without calculating sizes
        sessionInfo = sessionsList.map((session) => ({
          id: session.id,
          name: session.name,
          cacheSize: 0,
          cacheSizeFormatted: '-',
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
  }, [sessionCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const cleanupOldSessions = useCallback(async (days: number): Promise<number> => {
    const manager = await getSessionManager()
    return await manager.cleanupOldSessions(days)
  }, [])

  const clearAllCache = useCallback(async (): Promise<void> => {
    const manager = await getSessionManager()
    const allSessions = manager.getAllSessions()

    for (const session of allSessions) {
      try {
        const workspace = await manager.getSession(session.sessionId)
        if (workspace) {
          await workspace.clear()
        }
      } catch (e) {
        console.error(`Failed to clear session ${session.sessionId}:`, e)
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
