import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BrandButton,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
} from '@creatorweave/ui'
import {
  getFSOverlayRepository,
  type SnapshotFileMetaRecord,
  type SnapshotRecord,
} from '@/sqlite/repositories/fs-overlay.repository'
import { SidebarPanelHeader } from '@/components/layout/SidebarPanelHeader'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useProjectStore } from '@/store/project.store'
import { getWorkspaceManager } from '@/opfs'
import { useT } from '@/i18n'

interface SnapshotListProps {
  limit?: number
  fullHeight?: boolean
  onOpenSnapshotFile?: (payload: {
    snapshotId: string
    snapshotSummary: string | null
    path: string
    opType: 'create' | 'modify' | 'delete'
    createdAt: number
    beforeContentKind: 'text' | 'binary' | 'none'
    beforeContentSize: number
    afterContentKind: 'text' | 'binary' | 'none'
    afterContentSize: number
  }) => void
}

function formatSnapshotTime(timestamp: number | null): string {
  if (!timestamp) return '-'
  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(timestamp)
  }
}

function getStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'approved':
      return t('sidebar.snapshotList.approved')
    case 'committed':
      return t('sidebar.snapshotList.committed')
    case 'draft':
      return t('sidebar.snapshotList.draft')
    case 'rolled_back':
      return t('sidebar.snapshotList.rolledBack')
    default:
      return status
  }
}

function formatContentMeta(kind: 'text' | 'binary' | 'none', size: number, t: (key: string) => string): string {
  if (kind === 'none') return t('sidebar.snapshotList.contentKindNone')
  const kb = size / 1024
  const human = kb >= 1 ? `${kb.toFixed(1)}KB` : `${size}B`
  return `${kind === 'binary' ? t('sidebar.snapshotList.contentKindBinary') : t('sidebar.snapshotList.contentKindText')} ${human}`
}

export const SnapshotList: React.FC<SnapshotListProps> = ({
  limit = 20,
  fullHeight = false,
  onOpenSnapshotFile,
}) => {
  const t = useT()
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [detailsMap, setDetailsMap] = useState<Record<string, SnapshotFileMetaRecord[]>>({})
  const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set())
  const [rollingBack, setRollingBack] = useState<string | null>(null)
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null)
  const [clearingSnapshots, setClearingSnapshots] = useState(false)
  const [confirmAction, setConfirmAction] = useState<null | { type: 'delete'; snapshotId: string } | { type: 'clear' }>(null)
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string | null>(null)
  const [switchProgress, setSwitchProgress] = useState<{
    phase: 'rollback' | 'apply'
    processed: number
    total: number
    snapshotId: string
  } | null>(null)

  const loadSnapshots = useCallback(async (cancelled: { value: boolean } = { value: false }) => {
    setLoading(true)
    setError(null)

    try {
      if (!activeProjectId) {
        if (!cancelled.value) setSnapshots([])
        return
      }

      const repo = getFSOverlayRepository()
      const rows = await repo.listProjectSnapshots(activeProjectId, limit)
      const currentId = rows.find((item) => item.isCurrent)?.id || null
      if (!cancelled.value) setSnapshots(rows)
      if (!cancelled.value) setCurrentSnapshotId(currentId)
    } catch (err) {
      if (!cancelled.value) {
        setError(err instanceof Error ? err.message : t('sidebar.snapshotList.loadFailed'))
      }
    } finally {
      if (!cancelled.value) setLoading(false)
    }
  }, [activeProjectId, limit, t])

  useEffect(() => {
    const cancelled = { value: false }

    loadSnapshots(cancelled)

    return () => {
      cancelled.value = true
    }
  }, [loadSnapshots])

  const latestRollbackableId = useMemo(
    () => snapshots.find((item) => item.status === 'approved' || item.status === 'committed')?.id ?? null,
    [snapshots]
  )

  const toggleExpand = useCallback(async (snapshotId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(snapshotId)) next.delete(snapshotId)
      else next.add(snapshotId)
      return next
    })

    if (detailsMap[snapshotId] !== undefined) return
    setDetailsLoading((prev) => new Set(prev).add(snapshotId))
    try {
      const repo = getFSOverlayRepository()
      const files = await repo.listSnapshotFiles(snapshotId)
      setDetailsMap((prev) => ({ ...prev, [snapshotId]: files }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.snapshotList.loadDetailFailed'))
    } finally {
      setDetailsLoading((prev) => {
        const next = new Set(prev)
        next.delete(snapshotId)
        return next
      })
    }
  }, [detailsMap, t])

  const handleRollbackLatest = useCallback(async () => {
    setRollingBack('__latest__')
    setError(null)
    try {
      if (!activeProjectId) throw new Error(t('sidebar.snapshotList.noActiveProject'))
      const repo = getFSOverlayRepository()
      const rows = await repo.listProjectSnapshots(activeProjectId, 200)
      const latest = rows.find((item) => item.status === 'approved' || item.status === 'committed')
      if (!latest) {
        setError(t('sidebar.snapshotList.noLatestSnapshot'))
      } else {
        const manager = await getWorkspaceManager()
        const workspace = await manager.getWorkspace(latest.workspaceId)
        if (!workspace) throw new Error(t('sidebar.snapshotList.workspaceNotFound', { name: latest.workspaceName || latest.workspaceId }))
        const nativeDir = await workspace.getNativeDirectoryHandle()
        const result = await workspace.switchToSnapshot(latest.id, nativeDir, setSwitchProgress)
        if (result.unresolved.length > 0) {
          setError(t('sidebar.snapshotList.switchFailedWithCount', { count: result.unresolved.length }))
        } else if (result.compensationAttempted && !result.compensationSucceeded) {
          setError(t('sidebar.snapshotList.switchFailed'))
        }
      }
      await useWorkspaceStore.getState().refreshPendingChanges(true)
      await useWorkspaceStore.getState().refreshWorkspaces()
      await loadSnapshots()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.snapshotList.switchToLatestFailed'))
    } finally {
      setRollingBack(null)
      setSwitchProgress(null)
    }
  }, [activeProjectId, loadSnapshots, t])

  const handleRollbackTo = useCallback(async (snapshotId: string) => {
    setRollingBack(snapshotId)
    setError(null)
    try {
      const target = snapshots.find((item) => item.id === snapshotId)
      if (!target) throw new Error(t('sidebar.snapshotList.snapshotNotFound'))
      const manager = await getWorkspaceManager()
      const workspace = await manager.getWorkspace(target.workspaceId)
      if (!workspace) throw new Error(t('sidebar.snapshotList.workspaceNotFound', { name: target.workspaceName || target.workspaceId }))
      const nativeDir = await workspace.getNativeDirectoryHandle()
      const result = await workspace.switchToSnapshot(snapshotId, nativeDir, setSwitchProgress)
      if (result.unresolved.length > 0) {
        setError(
          t('sidebar.snapshotList.switchPartial', { failedSnapshotId: result.failedSnapshotId || '-', count: result.unresolved.length })
        )
      } else if (result.compensationAttempted && !result.compensationSucceeded) {
        setError(t('sidebar.snapshotList.switchFailed'))
      }
      await useWorkspaceStore.getState().refreshPendingChanges(true)
      await useWorkspaceStore.getState().refreshWorkspaces()
      await loadSnapshots()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.snapshotList.switchFailed'))
    } finally {
      setRollingBack(null)
      setSwitchProgress(null)
    }
  }, [loadSnapshots, snapshots, t])

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    setConfirmAction({ type: 'delete', snapshotId })
  }, [])

  const performDeleteSnapshot = useCallback(async (snapshotId: string) => {
    setDeletingSnapshotId(snapshotId)
    setError(null)
    try {
      const repo = getFSOverlayRepository()
      await repo.deleteSnapshot(snapshotId)
      await useWorkspaceStore.getState().refreshWorkspaces()
      await loadSnapshots()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.snapshotList.deleteFailed'))
    } finally {
      setDeletingSnapshotId(null)
    }
  }, [loadSnapshots, t])

  const handleClearSnapshots = useCallback(async () => {
    setConfirmAction({ type: 'clear' })
  }, [])

  const performClearSnapshots = useCallback(async () => {
    if (!activeProjectId) {
      setError(t('sidebar.snapshotList.noActiveProject'))
      return
    }
    setClearingSnapshots(true)
    setError(null)
    try {
      const repo = getFSOverlayRepository()
      await repo.clearProjectSnapshots(activeProjectId)
      await useWorkspaceStore.getState().refreshWorkspaces()
      await loadSnapshots()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sidebar.snapshotList.clearFailed'))
    } finally {
      setClearingSnapshots(false)
    }
  }, [activeProjectId, loadSnapshots, t])

  const handleConfirmAction = useCallback(async () => {
    const action = confirmAction
    setConfirmAction(null)
    if (!action) return
    if (action.type === 'delete') {
      await performDeleteSnapshot(action.snapshotId)
      return
    }
    await performClearSnapshots()
  }, [confirmAction, performClearSnapshots, performDeleteSnapshot])

  return (
    <div className={`${fullHeight ? 'h-full' : ''} flex flex-col`}>
      <SidebarPanelHeader
        title={t('sidebar.snapshotList.title')}
        leftExtra={
          <span className="px-2 py-0.5 bg-muted text-secondary text-xs font-semibold rounded-full">
            {snapshots.length}
          </span>
        }
        right={
          <div className="flex items-center gap-1">
            <BrandButton
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              disabled={clearingSnapshots || snapshots.length === 0}
              onClick={handleClearSnapshots}
            >
              {clearingSnapshots ? t('sidebar.snapshotList.clearing') : t('sidebar.snapshotList.clear')}
            </BrandButton>
            <BrandButton
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              disabled={!latestRollbackableId || rollingBack === '__latest__' || clearingSnapshots}
              onClick={handleRollbackLatest}
            >
              {rollingBack === '__latest__' ? t('sidebar.snapshotList.switching') : t('sidebar.snapshotList.current')}
            </BrandButton>
          </div>
        }
      />

      {loading && <p className="px-2 py-2 text-xs text-secondary">{t('sidebar.snapshotList.loading')}</p>}
      {error && <p className="px-2 py-2 text-xs text-destructive">{error}</p>}
      {switchProgress && (
        <p className="px-2 py-2 text-xs text-secondary">
          {t('sidebar.snapshotList.processing', { current: switchProgress.processed, total: switchProgress.total })}
        </p>
      )}

      {!loading && !error && snapshots.length === 0 && (
        <p className="px-2 py-2 text-xs text-secondary">{t('sidebar.snapshotList.noSnapshots')}</p>
      )}

      {!loading && !error && snapshots.length > 0 && (
        <div
          role="list"
          aria-label={t('sidebar.snapshotList.title')}
          className={`${fullHeight ? 'flex-1 min-h-0' : 'max-h-48'} space-y-px overflow-y-auto px-1 py-1 custom-scrollbar`}
        >
          {snapshots.map((item) => (
            <div
              key={item.id}
              role="listitem"
              aria-current={currentSnapshotId === item.id ? 'true' : undefined}
              className={`rounded-md px-2 py-1.5 ${
                currentSnapshotId === item.id ? 'bg-primary-50/50 dark:bg-primary-900/20' : 'hover:bg-hover'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs font-medium text-primary hover:underline"
                  title={item.summary || item.id}
                  onClick={() => toggleExpand(item.id)}
                >
                  {item.summary || t('sidebar.snapshotList.unnamedSnapshot')}
                </button>
                <div className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-secondary">
                    {getStatusLabel(item.status, t)}
                  </span>
                  {currentSnapshotId === item.id && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-primary/10 text-primary">{t('sidebar.snapshotList.current')}</span>
                  )}
                </div>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-secondary">
                <span>{item.workspaceName || item.workspaceId} · {t('sidebar.snapshotList.pendingCount', { count: item.opCount })}</span>
                <span>{formatSnapshotTime(item.committedAt || item.createdAt)}</span>
              </div>
              <div className="mt-1 flex justify-end gap-1">
                <BrandButton
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  disabled={deletingSnapshotId === item.id || rollingBack !== null || clearingSnapshots}
                  onClick={() => handleDeleteSnapshot(item.id)}
                >
                  {deletingSnapshotId === item.id ? t('sidebar.snapshotList.deleting') : t('sidebar.snapshotList.delete')}
                </BrandButton>
                {(item.status === 'approved' || item.status === 'committed') && (
                  <BrandButton
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    disabled={rollingBack === item.id || deletingSnapshotId !== null || clearingSnapshots}
                    onClick={() => handleRollbackTo(item.id)}
                  >
                    {rollingBack === item.id ? t('sidebar.snapshotList.switching') : item.id === latestRollbackableId ? t('sidebar.snapshotList.current') : t('sidebar.snapshotList.switch')}
                  </BrandButton>
                )}
              </div>
              {expanded.has(item.id) && (
                <div className="mt-2 border-t border-subtle pt-2">
                  {detailsLoading.has(item.id) && (
                    <p className="text-[11px] text-secondary">{t('sidebar.snapshotList.loadingDetails')}</p>
                  )}
                  {!detailsLoading.has(item.id) && (detailsMap[item.id] || []).length === 0 && (
                    <p className="text-[11px] text-secondary">{t('sidebar.snapshotList.noDetails')}</p>
                  )}
                  {!detailsLoading.has(item.id) && (detailsMap[item.id] || []).length > 0 && (
                    <div className="space-y-1">
                      {(detailsMap[item.id] || []).map((file) => (
                        <button
                          type="button"
                          key={`${item.id}:${file.path}`}
                          className="flex w-full items-center justify-between gap-2 text-[11px] hover:bg-muted/50 rounded px-1 py-0.5"
                          onClick={() =>
                            onOpenSnapshotFile?.({
                              snapshotId: item.id,
                              snapshotSummary: item.summary,
                              path: file.path,
                              opType: file.opType,
                              createdAt: file.createdAt,
                              beforeContentKind: file.beforeContentKind,
                              beforeContentSize: file.beforeContentSize,
                              afterContentKind: file.afterContentKind,
                              afterContentSize: file.afterContentSize,
                            })
                          }
                        >
                          <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-primary" title={file.path}>
                              {file.path}
                            </span>
                            <span className="block text-[10px] text-secondary">
                              {t('sidebar.snapshotList.before')}: {formatContentMeta(file.beforeContentKind, file.beforeContentSize, t)} | {t('sidebar.snapshotList.after')}: {formatContentMeta(file.afterContentKind, file.afterContentSize, t)}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-secondary">
                            <span className="block">
                              {file.opType === 'create' ? t('sidebar.snapshotList.fileOpCreate') : file.opType === 'modify' ? t('sidebar.snapshotList.fileOpModify') : t('sidebar.snapshotList.fileOpDelete')}
                            </span>
                            <span className="block text-[10px]">{formatSnapshotTime(file.createdAt)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <BrandDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>
              {confirmAction?.type === 'clear' ? t('sidebar.snapshotList.confirmClearTitle') : t('sidebar.snapshotList.confirmDeleteTitle')}
            </BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="text-sm text-secondary">
              {confirmAction?.type === 'clear'
                ? t('sidebar.snapshotList.confirmClearMessage')
                : t('sidebar.snapshotList.confirmDeleteMessage')}
            </p>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton variant="outline" onClick={() => setConfirmAction(null)}>
              {t('common.cancel')}
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={() => void handleConfirmAction()}
              disabled={clearingSnapshots || deletingSnapshotId !== null}
            >
              {t('common.confirm')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>
    </div>
  )
}
