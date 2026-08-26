import React, { useCallback, useEffect, useState } from 'react'
import { Settings, Check, X as XIcon } from 'lucide-react'
import {
  BrandButton,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
} from '@creatorweave/ui'
import { getFSOverlayRepository, type SnapshotFileMetaRecord, type SnapshotRecord } from '@/sqlite/repositories/fs-overlay.repository'
import { SidebarPanelHeader } from '@/components/layout/SidebarPanelHeader'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useProjectStore } from '@/store/project.store'
import { useSettingsStore } from '@/store/settings.store'
import { useT } from '@/i18n'
import { SnapshotDetailDrawer } from '@/components/sync/SnapshotDetailDrawer'

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

function getSnapshotTitle(snapshot: Pick<SnapshotRecord, 'summary' | 'opCount'>, t: ReturnType<typeof useT>): string {
  return snapshot.summary || t('sidebar.snapshotList.autoSnapshotTitle', { count: snapshot.opCount })
}

export const SnapshotList: React.FC<SnapshotListProps> = ({
  limit = 20,
  fullHeight = false,
  onOpenSnapshotFile,
}) => {
  const t = useT()
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  // Auto-reload when a snapshot is created/deleted/pruned anywhere in the
  // project (e.g. via auto-apply), without requiring a manual tab switch.
  const snapshotVersion = useWorkspaceStore((state) => state.snapshotVersion)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [detailsMap, setDetailsMap] = useState<Record<string, SnapshotFileMetaRecord[]>>({})
  const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set())
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null)
  const [clearingSnapshots, setClearingSnapshots] = useState(false)
  const [confirmAction, setConfirmAction] = useState<null | { type: 'delete'; snapshotId: string } | { type: 'clear' }>(null)
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string | null>(null)
  const [detailSnapshot, setDetailSnapshot] = useState<SnapshotRecord | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Snapshot retention watermarks When the project has more
  // than `watermarkHigh` snapshots, the repo auto-prunes down to
  // `watermarkLow` (see FSOverlayRepository.createApprovedSnapshotForPaths).
  // UI here is a thin read/write layer over the SQLite app_settings table.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [watermarkHigh, setWatermarkHigh] = useState('')
  const [watermarkLow, setWatermarkLow] = useState('')
  const [savingWatermark, setSavingWatermark] = useState(false)
  const [watermarkError, setWatermarkError] = useState<string | null>(null)

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
  }, [loadSnapshots, snapshotVersion])

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

  // Load current watermarks from SQLite when the settings panel first opens.
  // We keep the inputs as strings so the user can clear/type freely without
  // the value being re-coerced on every keystroke; parse happens on save.
  useEffect(() => {
    if (!settingsOpen) return
    let cancelled = false
    const repo = getFSOverlayRepository()
    repo
      .getSnapshotWatermarks()
      .then((w) => {
        if (cancelled) return
        setWatermarkHigh(String(w.high))
        setWatermarkLow(String(w.low))
        setWatermarkError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setWatermarkError(
          err instanceof Error ? err.message : t('sidebar.snapshotList.watermark.loadFailed')
        )
      })
    return () => {
      cancelled = true
    }
  }, [settingsOpen, t])

  const handleSaveWatermark = useCallback(async () => {
    setWatermarkError(null)
    const high = Number(watermarkHigh)
    const low = Number(watermarkLow)
    if (!Number.isFinite(high) || !Number.isInteger(high) || high <= 0) {
      setWatermarkError(t('sidebar.snapshotList.watermark.invalidHigh'))
      return
    }
    if (!Number.isFinite(low) || !Number.isInteger(low) || low < 0) {
      setWatermarkError(t('sidebar.snapshotList.watermark.invalidLow'))
      return
    }
    if (low >= high) {
      setWatermarkError(t('sidebar.snapshotList.watermark.lowMustBeLessThanHigh'))
      return
    }
    setSavingWatermark(true)
    try {
      const repo = getFSOverlayRepository()
      await repo.setSnapshotWatermarks(high, low)
      useSettingsStore.setState({
        snapshotHighWatermark: high,
        snapshotLowWatermark: low,
      })
      setSettingsOpen(false)
    } catch (err) {
      setWatermarkError(
        err instanceof Error ? err.message : t('sidebar.snapshotList.watermark.saveFailed')
      )
    } finally {
      setSavingWatermark(false)
    }
  }, [watermarkHigh, watermarkLow, t])

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
            <button
              type="button"
              className="text-secondary hover:text-primary h-6 w-6 inline-flex items-center justify-center rounded transition-colors"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label={t('sidebar.snapshotList.watermark.title')}
              aria-expanded={settingsOpen}
              title={t('sidebar.snapshotList.watermark.title')}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <BrandButton
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              disabled={clearingSnapshots || snapshots.length === 0}
              onClick={handleClearSnapshots}
            >
              {clearingSnapshots ? t('sidebar.snapshotList.clearing') : t('sidebar.snapshotList.clear')}
            </BrandButton>
          </div>
        }
      />

      {settingsOpen && (
        <div
          role="region"
          aria-label={t('sidebar.snapshotList.watermark.title')}
          className="space-y-2 border-subtle border-b bg-subtle/50 px-3 py-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-secondary text-[11px] font-semibold uppercase tracking-wide">
              {t('sidebar.snapshotList.watermark.title')}
            </span>
            <button
              type="button"
              className="text-secondary hover:text-primary inline-flex h-5 w-5 items-center justify-center rounded"
              onClick={() => setSettingsOpen(false)}
              aria-label={t('sidebar.snapshotList.watermark.close')}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
          <p className="text-secondary text-[11px] leading-snug">
            {t('sidebar.snapshotList.watermark.description')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-[10px] font-medium">
                {t('sidebar.snapshotList.watermark.high')}
              </span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                className="border-subtle bg-elevated text-primary h-7 rounded border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                value={watermarkHigh}
                onChange={(e) => setWatermarkHigh(e.target.value)}
                disabled={savingWatermark}
                aria-label={t('sidebar.snapshotList.watermark.high')}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-[10px] font-medium">
                {t('sidebar.snapshotList.watermark.low')}
              </span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                className="border-subtle bg-elevated text-primary h-7 rounded border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                value={watermarkLow}
                onChange={(e) => setWatermarkLow(e.target.value)}
                disabled={savingWatermark}
                aria-label={t('sidebar.snapshotList.watermark.low')}
              />
            </label>
          </div>
          {watermarkError && (
            <p className="text-destructive text-[11px] leading-snug">{watermarkError}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="text-secondary hover:text-primary h-6 px-2 text-[11px] rounded"
              onClick={() => setSettingsOpen(false)}
              disabled={savingWatermark}
            >
              {t('sidebar.snapshotList.watermark.cancel')}
            </button>
            <BrandButton
              variant="primary"
              className="h-6 px-2 text-[11px]"
              onClick={handleSaveWatermark}
              disabled={savingWatermark}
            >
              {savingWatermark ? (
                t('sidebar.snapshotList.watermark.saving')
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  {t('sidebar.snapshotList.watermark.save')}
                </span>
              )}
            </BrandButton>
          </div>
        </div>
      )}

      {loading && <p className="px-2 py-2 text-xs text-secondary">{t('sidebar.snapshotList.loading')}</p>}
      {error && <p className="px-2 py-2 text-xs text-destructive">{error}</p>}

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
                currentSnapshotId === item.id ? 'bg-primary-50/50 dark:bg-primary-100/20' : 'hover:bg-hover'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs font-medium text-secondary hover:underline"
                  title={getSnapshotTitle(item, t)}
                  onClick={() => toggleExpand(item.id)}
                >
                  {getSnapshotTitle(item, t)}
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
                  onClick={() => { setDetailSnapshot(item); setDetailOpen(true) }}
                >
                  {t('sidebar.snapshotDetail.viewDetail')}
                </BrandButton>
                <BrandButton
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  disabled={deletingSnapshotId === item.id || clearingSnapshots}
                  onClick={() => handleDeleteSnapshot(item.id)}
                >
                  {deletingSnapshotId === item.id ? t('sidebar.snapshotList.deleting') : t('sidebar.snapshotList.delete')}
                </BrandButton>
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
                            <span className="block truncate text-secondary" title={file.path}>
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

      {/* Snapshot Detail Drawer */}
      <SnapshotDetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        snapshot={detailSnapshot}
      />
    </div>
  )
}
