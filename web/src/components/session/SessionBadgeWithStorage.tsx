/**
 * SessionBadgeWithStorage - Storage icon with status indicator
 *
 * Simple disk icon with status dot:
 * - 🟢 Green = initialized successfully
 * - 🟡 Yellow = initializing
 * - 🔴 Red = error
 *
 * Click to open storage panel
 */

import React, { useState, useCallback } from 'react'
import { Clock, RotateCcw, HardDrive, Trash2, Check, Sparkles } from 'lucide-react'
import { useSessionStore } from '@/store/session.store'
import { useStorageInfo } from '@/hooks/useStorageInfo'
import type { StorageStatus } from '@/opfs/utils/storage-utils'

export interface SessionBadgeWithStorageProps {
  /** Compact mode (show only counts) */
  compact?: boolean
}

/** Storage status colors */
const STORAGE_STATUS_COLORS: Record<StorageStatus, string> = {
  ok: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  urgent: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

/** Storage status labels */
const STORAGE_STATUS_LABELS: Record<StorageStatus, string> = {
  ok: '正常',
  warning: '空间不足',
  urgent: '急需清理',
  critical: '严重不足',
}

export const SessionBadgeWithStorage: React.FC<SessionBadgeWithStorageProps> = () => {
  const [open, setOpen] = useState(false)

  const {
    activeSessionId,
    sessions,
    initialized,
    error: sessionError,
    switchSession,
    deleteSession,
  } = useSessionStore()
  const {
    storage,
    sessions: storageSessions,
    loading: storageLoading,
    refresh,
    cleanupOldSessions,
    clearAllCache,
  } = useStorageInfo()

  // Determine status color
  const getStatusColor = (): string => {
    if (sessionError) return 'bg-red-500'
    if (!initialized) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const statusColor = getStatusColor()

  // Handle session switch
  const handleSwitch = useCallback(
    async (sessionId: string) => {
      try {
        await switchSession(sessionId)
        setOpen(false)
      } catch (error) {
        console.error('[SessionBadgeWithStorage] Failed to switch session:', error)
      }
    },
    [switchSession]
  )

  // Handle session delete
  const handleDelete = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation()

      if (!confirm('确定要删除此会话吗？所有缓存、待同步和撤销记录将被删除。')) {
        return
      }

      try {
        await deleteSession(sessionId)
        await refresh()
      } catch (error) {
        console.error('[SessionBadgeWithStorage] Failed to delete session:', error)
      }
    },
    [deleteSession, refresh]
  )

  // Handle cleanup old sessions
  const handleCleanup = useCallback(async () => {
    const days = prompt('清理多少天未活跃的会话？', '30')
    if (!days) return

    const daysNum = parseInt(days)
    if (isNaN(daysNum) || daysNum < 1) {
      alert('请输入有效的天数')
      return
    }

    try {
      const cleaned = await cleanupOldSessions(daysNum)
      alert(`已清理 ${cleaned} 个旧会话`)
      await refresh()
    } catch (error) {
      console.error('[SessionBadgeWithStorage] Failed to cleanup:', error)
    }
  }, [cleanupOldSessions, refresh])

  // Handle clear all cache
  const handleClearAll = useCallback(async () => {
    if (
      !confirm('确定要清空所有会话缓存吗？这不会删除对话记录，但会清空所有文件缓存和撤销历史。')
    ) {
      return
    }

    try {
      await clearAllCache()
      await refresh()
    } catch (error) {
      console.error('[SessionBadgeWithStorage] Failed to clear cache:', error)
    }
  }, [clearAllCache, refresh])

  // Get current session info
  const currentSession = sessions.find((s) => s.id === activeSessionId)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
        title="存储空间"
      >
        {/* Status dot */}
        <span className={`absolute right-0.5 top-0.5 h-2 w-2 rounded-full ${statusColor}`} />
        <HardDrive className="h-5 w-5" />
      </button>

      {open && <SessionDropdown />}
    </div>
  )

  function SessionDropdown() {
    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />

        {/* Dropdown menu */}
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-md border bg-white shadow-lg">
          {/* Header - Current session */}
          <div className="border-b border-neutral-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">当前会话</span>
              {currentSession && (
                <span className="text-xs font-medium text-primary-600">{currentSession.name}</span>
              )}
            </div>
          </div>

          {/* Storage overview */}
          <div className="border-b border-neutral-100 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-neutral-700">
              <HardDrive className="h-3.5 w-3.5" />
              <span>存储空间 (浏览器配额)</span>
              {storageLoading && <span className="text-neutral-400">加载中...</span>}
            </div>

            {storage && (
              <>
                {/* Progress bar */}
                <div className="mb-2">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-neutral-500">
                    <span>
                      {storage.usageFormatted} / {storage.quotaFormatted}
                    </span>
                    <span>{storage.usagePercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        storage.usagePercent < 70
                          ? 'bg-green-500'
                          : storage.usagePercent < 80
                            ? 'bg-yellow-500'
                            : storage.usagePercent < 95
                              ? 'bg-orange-500'
                              : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(storage.usagePercent, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Status badge and note */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STORAGE_STATUS_COLORS[storage.status]}`}
                    >
                      {STORAGE_STATUS_LABELS[storage.status]}
                    </span>
                    <button
                      type="button"
                      onClick={() => refresh(true)}
                      className="text-[10px] text-primary-600 hover:underline"
                      title="计算每个会话的缓存大小（可能较慢）"
                    >
                      刷新
                    </button>
                  </div>
                  {/* Explanatory note */}
                  <p className="text-[9px] leading-tight text-neutral-400">
                    配额是浏览器允许的上限，不等于实际剩余空间。写入时若超出实际空间会报错。
                  </p>
                </div>
              </>
            )}

            {!storage && !storageLoading && (
              <p className="text-[10px] text-neutral-400">无法获取存储信息</p>
            )}
          </div>

          {/* Session list */}
          <div className="custom-scrollbar max-h-60 overflow-y-auto">
            <div className="px-4 py-2">
              <span className="text-xs font-medium text-neutral-700">
                所有会话 ({sessions.length})
              </span>
            </div>

            {storageSessions.length === 0 ? (
              <div className="px-4 py-4 text-center text-xs text-neutral-400">暂无会话</div>
            ) : (
              <ul>
                {storageSessions.map((session) => {
                  const isActive = session.id === activeSessionId
                  const hasPending = session.pendingCount > 0
                  const hasUndo = session.undoCount > 0

                  return (
                    <li
                      key={session.id}
                      className={`flex items-center gap-2 px-4 py-2 hover:bg-neutral-50 ${isActive ? 'bg-primary-50' : ''}`}
                    >
                      {/* Active indicator */}
                      {isActive && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                      {!isActive && <span className="h-4 w-4 shrink-0" />}

                      {/* Session info */}
                      <button
                        type="button"
                        onClick={() => handleSwitch(session.id)}
                        className="flex flex-1 flex-col items-start text-left"
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className="truncate text-xs font-medium text-neutral-700">
                            {session.name}
                          </span>
                          <span className="ml-auto text-[10px] text-neutral-400">
                            {session.cacheSizeFormatted}
                          </span>
                        </div>

                        {/* Status badges */}
                        <div className="mt-0.5 flex items-center gap-2">
                          {hasPending && (
                            <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">
                              <Clock className="h-2.5 w-2.5" />
                              {session.pendingCount}
                            </span>
                          )}
                          {hasUndo && (
                            <span className="flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-700">
                              <RotateCcw className="h-2.5 w-2.5" />
                              {session.undoCount}
                            </span>
                          )}
                          {!hasPending && !hasUndo && (
                            <span className="text-[10px] text-neutral-400">无变更</span>
                          )}
                        </div>
                      </button>

                      {/* Delete button */}
                      {!isActive && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, session.id)}
                          className="shrink-0 rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                          title="删除会话"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Footer - Actions */}
          <div className="border-t border-neutral-100 px-4 py-2">
            <div className="space-y-1">
              <button
                type="button"
                onClick={handleCleanup}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50"
                title="删除 30 天未活跃的会话缓存（不影响对话记录）"
              >
                <Sparkles className="h-3.5 w-3.5" />
                清理旧会话 (30天未活跃)
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                title="清空所有会话的文件缓存和撤销历史（不影响对话记录）"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空所有缓存
              </button>
              {/* Help text */}
              <p className="px-1 text-[9px] leading-tight text-neutral-400">
                注：以上操作仅清理缓存数据，不影响对话记录
              </p>
            </div>
          </div>
        </div>
      </>
    )
  }
}
