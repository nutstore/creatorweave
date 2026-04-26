/**
 * useStorageInfo Hook
 *
 * Hook for accessing storage information and workspace storage breakdown.
 * Uses SQLite for workspace metadata/stats and OPFS utilities for browser quota data.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useWorkspaceStore, type WorkspaceWithStats } from '@/store/workspace.store'
import { getWorkspaceRepository } from '@/sqlite'
import type { Workspace } from '@/sqlite/repositories/workspace.repository'
import { getWorkspaceManager } from '@/opfs'
import {
  getStorageEstimate,
  getStorageStatus,
  formatBytes,
} from '@/opfs/utils/storage-utils'
import type { StorageStatus } from '@/opfs/utils/storage-utils'

/** Per-workspace storage information */
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
  /** Last active timestamp */
  lastActiveAt: number
}

/** @deprecated Use WorkspaceStorageInfo */
export type ConversationStorageInfo = WorkspaceStorageInfo

/** Storage info result */
export interface StorageInfo {
  usage: number
  quota: number
  usagePercent: number
  usageFormatted: string
  quotaFormatted: string
  status: StorageStatus
}

/** Cleanup preview information */
export interface CleanupPreview {
  /** Number of workspaces that will be cleaned */
  workspaceCount: number
  /** @deprecated Use workspaceCount */
  conversationCount: number
  /** Total cache size that will be freed */
  totalSize: number
  /** Total size formatted */
  totalSizeFormatted: string
  /** Number of pending changes that will be lost */
  pendingCount: number
  /** Whether there are any unsaved changes */
  hasUnsavedChanges: boolean
  /** List of workspace names that will be cleaned */
  workspaceNames: string[]
  /** @deprecated Use workspaceNames */
  conversationNames: string[]
}

/** Cleanup scope */
export type CleanupScope = 'old' | 'all'

/** Hook result */
export interface UseStorageInfoResult {
  /** Storage information */
  storage: StorageInfo | null
  /** Per-workspace storage breakdown */
  workspaces: WorkspaceStorageInfo[]
  /** @deprecated Use workspaces */
  conversations: WorkspaceStorageInfo[]
  /** Loading state */
  loading: boolean
  /** Error message */
  error: string | null
  /** Refresh storage info (optionally calculate workspace sizes) */
  refresh: (includeWorkspaceSizes?: boolean) => Promise<void>
  /** Get cleanup preview before executing */
  getCleanupPreview: (scope: CleanupScope, days?: number) => Promise<CleanupPreview | null>
  /** Execute cleanup with scope */
  executeCleanup: (scope: CleanupScope, days?: number) => Promise<number>
  /** @deprecated Use executeCleanup instead */
  clearAllCache: () => Promise<void>
}

/** Convert SQLite Workspace to WorkspaceWithStats shape. */
function sqliteWorkspaceToWithStats(workspace: Workspace): WorkspaceWithStats {
  return {
    id: workspace.id,
    name: workspace.name,
    createdAt: workspace.createdAt,
    lastActiveAt: workspace.lastAccessedAt,
    cacheSize: workspace.cacheSize,
    pendingCount: workspace.pendingCount,
    modifiedFiles: workspace.modifiedFiles,
    status: workspace.status,
  }
}

/** Hook for accessing storage information */
export function useStorageInfo(): UseStorageInfoResult {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [workspaceStorageList, setWorkspaceStorageList] = useState<WorkspaceStorageInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const workspacesRef = useRef<WorkspaceWithStats[]>(workspaces)
  const workspaceIdsRef = useRef<string>('')
  const hasLoadedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const prevWorkspaceCountRef = useRef(0)
  const workspaceCount = workspaces.length

  useEffect(() => {
    workspacesRef.current = workspaces
  }, [workspaces])

  const loadWorkspacesFromSQLite = async (): Promise<WorkspaceWithStats[]> => {
    try {
      const repo = getWorkspaceRepository()
      const sqliteWorkspaces = await repo.findAllWorkspaces()
      if (sqliteWorkspaces.length > 0) {
        return sqliteWorkspaces.map(sqliteWorkspaceToWithStats)
      }
    } catch (e) {
      console.warn('[useStorageInfo] Failed to load workspaces from SQLite, falling back to store:', e)
    }

    return workspacesRef.current
  }

  const calculateWorkspaceSizes = async (
    workspacesList: WorkspaceWithStats[],
    signal: AbortSignal
  ): Promise<WorkspaceStorageInfo[]> => {
    const manager = await getWorkspaceManager()
    const results: Map<string, WorkspaceStorageInfo> = new Map()

    for (const workspace of workspacesList) {
      results.set(workspace.id, {
        id: workspace.id,
        name: workspace.name,
        cacheSize: workspace.cacheSize || 0,
        cacheSizeFormatted: workspace.cacheSize ? formatBytes(workspace.cacheSize) : '计算中...',
        pendingCount: workspace.pendingCount,
        lastActiveAt: workspace.lastActiveAt || 0,
      })
    }

    setWorkspaceStorageList(Array.from(results.values()))

    const BATCH_SIZE = 1
    for (let i = 0; i < workspacesList.length; i += BATCH_SIZE) {
      if (signal.aborted) break

      const batch = workspacesList.slice(i, i + BATCH_SIZE)
      for (const workspace of batch) {
        if (signal.aborted) break

        try {
          let cacheSize = 0
          const workspaceRuntime = await manager.getWorkspace(workspace.id)
          if (workspaceRuntime) {
            const stats = await workspaceRuntime.getStats()
            cacheSize = stats.files.size
            try {
              const repo = getWorkspaceRepository()
              await repo.updateWorkspaceStats(workspace.id, { cacheSize })
            } catch (e) {
              console.warn('[useStorageInfo] Failed to update cache size in SQLite:', e)
            }
          }

          results.set(workspace.id, {
            id: workspace.id,
            name: workspace.name,
            cacheSize,
            cacheSizeFormatted: formatBytes(cacheSize),
            pendingCount: workspace.pendingCount,
            lastActiveAt: workspace.lastActiveAt || 0,
          })
          setWorkspaceStorageList(Array.from(results.values()))
        } catch (e) {
          console.error(`Failed to get size for workspace ${workspace.id}:`, e)
          results.set(workspace.id, {
            id: workspace.id,
            name: workspace.name,
            cacheSize: 0,
            cacheSizeFormatted: '0 B',
            pendingCount: workspace.pendingCount,
            lastActiveAt: workspace.lastActiveAt || 0,
          })
        }

        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    return Array.from(results.values())
  }

  const refresh = useCallback(async (includeWorkspaceSizes = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setLoading(true)
    setError(null)

    try {
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

      const workspacesList = await loadWorkspacesFromSQLite()

      // Always get real pending counts from OPFS ledger (not cached SQLite values)
      const repo = getWorkspaceRepository()
      let realPendingCounts: Map<string, number> | undefined
      try {
        realPendingCounts = await repo.getRealPendingCounts()
      } catch {
        // Fallback to cached values if OPFS ledger is unavailable
      }
      const workspacesWithRealPending = realPendingCounts
        ? workspacesList.map((w) => ({ ...w, pendingCount: realPendingCounts!.get(w.id) ?? w.pendingCount }))
        : workspacesList

      let workspaceInfo: WorkspaceStorageInfo[]

      if (includeWorkspaceSizes) {
        workspaceInfo = await calculateWorkspaceSizes(workspacesWithRealPending, abortControllerRef.current.signal)
      } else {
        workspaceInfo = workspacesWithRealPending.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          cacheSize: workspace.cacheSize || 0,
          cacheSizeFormatted: workspace.cacheSize ? formatBytes(workspace.cacheSize) : '-',
          pendingCount: workspace.pendingCount,
          lastActiveAt: workspace.lastActiveAt || 0,
        }))
      }

      setWorkspaceStorageList(workspaceInfo)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const message = e instanceof Error ? e.message : 'Failed to load storage info'
      setError(message)
      console.error('[useStorageInfo] Failed to load storage info:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const currentWorkspaceIds = workspaces
      .map((w) => w.id)
      .sort()
      .join(',')

    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true
      workspaceIdsRef.current = currentWorkspaceIds
      prevWorkspaceCountRef.current = workspaceCount
      refresh(true)
    } else if (
      workspaceIdsRef.current !== currentWorkspaceIds ||
      prevWorkspaceCountRef.current !== workspaceCount
    ) {
      workspaceIdsRef.current = currentWorkspaceIds
      prevWorkspaceCountRef.current = workspaceCount
      refresh(true)
    }
  }, [workspaceCount, refresh, workspaces])

  const clearAllCache = useCallback(async (): Promise<void> => {
    const repo = getWorkspaceRepository()
    const manager = await getWorkspaceManager()
    const allWorkspaces = await repo.findAllWorkspaces()

    // Get real pending counts to skip workspaces with unsaved changes
    const pendingCounts = await repo.getRealPendingCounts()

    for (const workspace of allWorkspaces) {
      const pending = pendingCounts.get(workspace.id) ?? 0
      if (pending > 0) {
        // Skip workspaces with pending unsaved changes
        continue
      }

      try {
        const runtime = await manager.getWorkspace(workspace.id)
        if (runtime) {
          await runtime.clear()
        }
      } catch (e) {
        console.error(`Failed to clear workspace ${workspace.id}:`, e)
      }
    }

    await refresh()
  }, [refresh])

  const getCleanupPreview = useCallback(
    async (scope: CleanupScope, days: number = 30): Promise<CleanupPreview | null> => {
      const repo = getWorkspaceRepository()
      const workspacesToClean =
        scope === 'old' ? await repo.findInactiveWorkspaces(days) : await repo.findAllWorkspaces()

      if (workspacesToClean.length === 0) {
        return null
      }

      // Get real pending counts to exclude workspaces with unsaved changes
      const pendingCounts = await repo.getRealPendingCounts()

      let totalSize = 0
      let totalPending = 0
      const workspaceNames: string[] = []
      let cleanableCount = 0

      for (const workspace of workspacesToClean) {
        const pending = pendingCounts.get(workspace.id) ?? 0
        if (pending > 0) {
          // Skip workspaces with pending changes from size/count preview
          totalPending += pending
          continue
        }
        totalSize += workspace.cacheSize || 0
        workspaceNames.push(workspace.name)
        cleanableCount++
      }

      if (cleanableCount === 0) {
        return null
      }

      return {
        workspaceCount: cleanableCount,
        conversationCount: cleanableCount,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        pendingCount: totalPending,
        hasUnsavedChanges: totalPending > 0,
        workspaceNames,
        conversationNames: workspaceNames,
      }
    },
    []
  )

  const executeCleanup = useCallback(
    async (scope: CleanupScope, days: number = 30): Promise<number> => {
      const repo = getWorkspaceRepository()
      const manager = await getWorkspaceManager()
      const workspacesToClean =
        scope === 'old' ? await repo.findInactiveWorkspaces(days) : await repo.findAllWorkspaces()

      // Get real pending counts to skip workspaces with unsaved changes
      const pendingCounts = await repo.getRealPendingCounts()

      let cleanedCount = 0

      for (const workspace of workspacesToClean) {
        const pending = pendingCounts.get(workspace.id) ?? 0
        if (pending > 0) {
          // Skip workspaces with pending unsaved changes
          continue
        }

        try {
          const runtime = await manager.getWorkspace(workspace.id)
          if (runtime) {
            await runtime.clear()
            cleanedCount++
          }
        } catch (e) {
          console.error(`Failed to clear workspace ${workspace.id}:`, e)
        }
      }

      await refresh()
      return cleanedCount
    },
    [refresh]
  )

  return {
    storage,
    workspaces: workspaceStorageList,
    conversations: workspaceStorageList,
    loading,
    error,
    refresh,
    getCleanupPreview,
    executeCleanup,
    clearAllCache,
  }
}
