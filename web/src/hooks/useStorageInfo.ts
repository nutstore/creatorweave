/**
 * useStorageInfo Hook
 *
 * Hook for accessing storage information and session storage breakdown.
 * Now uses SQLite for session metadata and stats, while OPFS utilities
 * provide browser storage quota information.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { WorkspaceWithStats } from '@/store/workspace.store'
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
export interface WorkspaceStorageInfo {
  /** Workspace ID */
  id: string
  /** Workspace name */
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

/** Cleanup preview information */
export interface CleanupPreview {
  /** Number of sessions that will be cleaned */
  sessionCount: number
  /** Total cache size that will be freed */
  totalSize: number
  /** Total size formatted */
  totalSizeFormatted: string
  /** Number of pending changes that will be lost */
  pendingCount: number
  /** Number of undo records that will be lost */
  undoCount: number
  /** Whether there are any unsaved changes */
  hasUnsavedChanges: boolean
  /** List of session names that will be cleaned */
  sessionNames: string[]
}

/** Cleanup scope */
export type CleanupScope = 'old' | 'all'

/** Hook result */
export interface UseStorageInfoResult {
  /** Storage information */
  storage: StorageInfo | null
  /** Per-workspace storage breakdown */
  sessions: WorkspaceStorageInfo[]
  /** Loading state */
  loading: boolean
  /** Error message */
  error: string | null
  /** Refresh storage info (optionally calculate session sizes) */
  refresh: (includeSessionSizes?: boolean) => Promise<void>
  /** Get cleanup preview before executing */
  getCleanupPreview: (scope: CleanupScope, days?: number) => Promise<CleanupPreview | null>
  /** Execute cleanup with scope */
  executeCleanup: (scope: CleanupScope, days?: number) => Promise<number>
  /** @deprecated Use executeCleanup instead */
  cleanupOldSessions: (days: number) => Promise<number>
  /** @deprecated Use executeCleanup instead */
  clearAllCache: () => Promise<void>
}

/**
 * Convert Session from SQLite to WorkspaceWithStats format
 */
function sqliteSessionToWithStats(session: Session): WorkspaceWithStats {
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
  // Use selector to only subscribe to workspaces, not entire store
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [sessionStorageList, setSessionStorageList] = useState<WorkspaceStorageInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use refs to store latest values without causing re-renders
  const sessionsRef = useRef<WorkspaceWithStats[]>(workspaces)
  const sessionIdsRef = useRef<string>('')
  const hasLoadedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const prevSessionCountRef = useRef(0)
  const sessionCount = workspaces.length

  // Keep sessionsRef updated
  useEffect(() => {
    sessionsRef.current = workspaces
  }, [workspaces])

  /**
   * Load workspaces from SQLite (fallback to OPFS if needed)
   */
  const loadSessionsFromSQLite = async (): Promise<WorkspaceWithStats[]> => {
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
   * Calculate workspace sizes using OPFS directory traversal
   * This is still needed because file content is stored in OPFS
   */
  const calculateSessionSizes = async (
    sessionsList: WorkspaceWithStats[],
    signal: AbortSignal
  ): Promise<WorkspaceStorageInfo[]> => {
    const manager = await getSessionManager()
    const results: Map<string, WorkspaceStorageInfo> = new Map()

    // Initialize results with SQLite data (fast)
    for (const workspace of sessionsList) {
      results.set(workspace.id, {
        id: workspace.id,
        name: workspace.name,
        cacheSize: workspace.cacheSize || 0,
        cacheSizeFormatted: workspace.cacheSize ? formatBytes(workspace.cacheSize) : '计算中...',
        pendingCount: workspace.pendingCount,
        undoCount: workspace.undoCount,
        lastActiveAt: workspace.lastActiveAt || 0,
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

          const info: WorkspaceStorageInfo = {
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

      // Load workspaces from SQLite (or fallback to store)
      const sessionsList = await loadSessionsFromSQLite()
      let sessionInfo: WorkspaceStorageInfo[]

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

  // Single useEffect for mount and workspace count changes
  useEffect(() => {
    const currentSessionIds = workspaces
      .map((w) => w.id)
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
          // Clear OPFS workspace cache (keeps session record)
          const workspace = await manager.getSession(session.id)
          if (workspace) {
            await workspace.clear()
            cleanedCount++
          }
        } catch (e) {
          console.error(`Failed to clear session ${session.id}:`, e)
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

  /**
   * Get cleanup preview - shows what will be cleaned before executing
   */
  const getCleanupPreview = useCallback(
    async (scope: CleanupScope, days: number = 30): Promise<CleanupPreview | null> => {
      const repo = getSessionRepository()

      let sessionsToClean: Session[]

      if (scope === 'old') {
        // Get inactive sessions
        sessionsToClean = await repo.findInactiveSessions(days)
      } else {
        // Get all sessions
        sessionsToClean = await repo.findAllSessions()
      }

      if (sessionsToClean.length === 0) {
        return null
      }

      // Calculate totals
      let totalSize = 0
      let totalPending = 0
      let totalUndo = 0
      const sessionNames: string[] = []

      for (const session of sessionsToClean) {
        totalSize += session.cacheSize || 0
        totalPending += session.pendingCount || 0
        totalUndo += session.undoCount || 0
        sessionNames.push(session.name)
      }

      return {
        sessionCount: sessionsToClean.length,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        pendingCount: totalPending,
        undoCount: totalUndo,
        hasUnsavedChanges: totalPending > 0,
        sessionNames,
      }
    },
    []
  )

  /**
   * Execute cleanup with specified scope
   */
  const executeCleanup = useCallback(
    async (scope: CleanupScope, days: number = 30): Promise<number> => {
      const repo = getSessionRepository()
      const manager = await getSessionManager()

      let sessionsToClean: Session[]

      if (scope === 'old') {
        sessionsToClean = await repo.findInactiveSessions(days)
      } else {
        sessionsToClean = await repo.findAllSessions()
      }

      let cleanedCount = 0

      for (const session of sessionsToClean) {
        try {
          // Clear OPFS workspace cache (keeps session record)
          const workspace = await manager.getSession(session.id)
          if (workspace) {
            await workspace.clear()
            cleanedCount++
          }
        } catch (e) {
          console.error(`Failed to clear session ${session.id}:`, e)
        }
      }

      // Refresh after cleanup
      await refresh()

      return cleanedCount
    },
    [refresh]
  )

  return {
    storage,
    sessions: sessionStorageList,
    loading,
    error,
    refresh,
    getCleanupPreview,
    executeCleanup,
    // Deprecated: use executeCleanup instead
    cleanupOldSessions,
    clearAllCache,
  }
}
