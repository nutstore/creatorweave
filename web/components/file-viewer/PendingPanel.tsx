/**
 * PendingPanel - displays pending changes waiting to be synced to disk
 *
 * Shows:
 * - List of pending changes (create/modify/delete)
 * - File path, type, and timestamp
 * - Sync button to write changes to real filesystem
 * - Sync result summary
 */

import { useState, useCallback, useMemo } from 'react'
import { useOPFSStore } from '@/store/opfs.store'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { Clock, FilePlus, FileEdit, FileX, RefreshCw, Check, X, AlertCircle } from 'lucide-react'
import type { PendingChange } from '@/opfs/types/opfs-types'
import { useT } from '@/i18n'

function formatTime(timestamp: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return t('pendingSync.justNow')
  if (diffMins < 60) return t('pendingSync.minutesAgo', { count: diffMins })

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return t('pendingSync.hoursAgo', { count: diffHours })

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PendingIcon({ type }: { type: PendingChange['type'] }) {
  switch (type) {
    case 'create':
      return <FilePlus className="h-3.5 w-3.5 text-green-500" />
    case 'modify':
      return <FileEdit className="h-3.5 w-3.5 text-amber-500" />
    case 'delete':
      return <FileX className="h-3.5 w-3.5 text-red-500" />
  }
}

function TypeBadge({ type, t }: { type: PendingChange['type']; t: (key: string, params?: Record<string, string | number>) => string }) {
  const styles = {
    create: 'bg-green-100 text-green-700',
    modify: 'bg-amber-100 text-amber-700',
    delete: 'bg-red-100 text-red-700',
  }
  const labelKey = {
    create: 'pendingSync.create',
    modify: 'pendingSync.modify',
    delete: 'pendingSync.delete',
  }[type]

  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${styles[type]}`}>
      {t(labelKey)}
    </span>
  )
}

export function PendingPanel({
  directoryHandle,
  onSyncComplete,
}: {
  directoryHandle: FileSystemDirectoryHandle | null
  onSyncComplete?: (result: { success: number; failed: number; skipped: number }) => void
}) {
  const t = useT()
  const { getPendingChanges, syncPendingChanges, isLoading } = useOPFSStore()
  const activeWorkspaceId = useConversationContextStore((s) => s.activeWorkspaceId)
  const currentPendingCount = useConversationContextStore((s) => s.currentPendingCount)

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{
    success: number
    failed: number
    skipped: number
  } | null>(null)

  const pendingChanges = useMemo(() => getPendingChanges(), [getPendingChanges])

  const handleSync = useCallback(async () => {
    if (!directoryHandle || syncing) return

    setSyncing(true)
    setSyncResult(null)

    try {
      const result = await syncPendingChanges(directoryHandle)
      setSyncResult(result)
      onSyncComplete?.(result)

      // Auto-hide result after 3 seconds if successful
      if (result.failed === 0) {
        setTimeout(() => setSyncResult(null), 3000)
      }
    } catch (error) {
      console.error('[PendingPanel] Sync failed:', error)
      setSyncResult({ success: 0, failed: 1, skipped: 0 })
    } finally {
      setSyncing(false)
    }
  }, [directoryHandle, syncing, syncPendingChanges, onSyncComplete])

  const hasPending = pendingChanges.length > 0
  const canSync = directoryHandle && hasPending && !syncing && !isLoading

  // No active workspace
  if (!activeWorkspaceId) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-neutral-300" />
          <p className="text-xs text-neutral-400">{t('pendingSync.noActiveConversations')}</p>
        </div>
      </div>
    )
  }

  // No pending changes
  if (!hasPending) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Check className="h-8 w-8 text-green-300" />
          <p className="text-xs text-neutral-400">{t('pendingSync.allChangesSynced')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-700">
        <span className="text-xs font-medium text-neutral-600">{t('pendingSync.pendingCount', { count: currentPendingCount })}</span>

        {/* Sync button */}
        <button
          type="button"
          onClick={handleSync}
          disabled={!canSync}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
            canSync
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : 'cursor-not-allowed bg-neutral-100 text-neutral-400'
          }`}
          title={directoryHandle ? t('pendingSync.syncAllToDisk') : t('pendingSync.selectProjectFolder')}
        >
          <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? t('pendingSync.syncing') : t('pendingSync.sync')}
        </button>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div
          className={`mx-3 mt-2 rounded px-3 py-2 ${
            syncResult.failed === 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2 text-xs">
            {syncResult.failed === 0 ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            <span>
              {t('pendingSync.syncComplete', { success: syncResult.success })}
              {syncResult.failed > 0 && `, ${syncResult.failed} ${t('pendingSync.failed')}`}
              {syncResult.skipped > 0 && `, ${syncResult.skipped} ${t('pendingSync.skipped')}`}
            </span>
          </div>
        </div>
      )}

      {/* Pending list */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {pendingChanges.map((pending) => {
          const fileName = pending.path.split('/').pop() || pending.path
          const dirPath = pending.path.substring(0, pending.path.lastIndexOf('/'))

          return (
            <div
              key={pending.id}
              className="flex items-start gap-2 border-b border-neutral-100 px-3 py-2 hover:bg-neutral-50"
            >
              {/* Icon */}
              <div className="mt-0.5 shrink-0">
                <PendingIcon type={pending.type} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <TypeBadge type={pending.type} t={t} />
                  <span
                    className="truncate text-xs font-medium text-neutral-700"
                    title={pending.path}
                  >
                    {fileName}
                  </span>
                </div>

                {/* Directory path */}
                {dirPath && (
                  <div
                    className="mt-0.5 truncate text-[10px] text-neutral-400"
                    title={pending.path}
                  >
                    {dirPath}/
                  </div>
                )}

                {/* Timestamp */}
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-400">
                  <Clock className="h-2.5 w-2.5" />
                  {formatTime(pending.timestamp, t)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <div className="border-t border-neutral-100 px-3 py-2">
        <p className="text-[10px] text-neutral-400">
          {t('pendingSync.pendingChangesWillBeWritten')}
        </p>
      </div>
    </div>
  )
}
