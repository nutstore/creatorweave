/**
 * ConversationStorageBadge - Storage icon with status indicator
 *
 * Simple disk icon with status dot:
 * - 🟢 Green = initialized successfully
 * - 🟡 Yellow = initializing
 * - 🔴 Red = error
 *
 * Click to open storage panel
 * Refactored to use brand components
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Clock, RotateCcw, HardDrive, Trash2, Check, Info, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useStorageInfo, type CleanupPreview } from '@/hooks/useStorageInfo'
import { useSQLiteMode } from '@/hooks/useSQLiteMode'
import type { StorageStatus } from '@/opfs/utils/storage-utils'
import {
  BrandButton,
  BrandBadge,
  BrandSelectSeparator,
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogBody,
  BrandDialogFooter,
  BrandDialogTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@browser-fs-analyzer/ui'
import { cn } from '@/lib/utils'

export interface ConversationStorageBadgeProps {
  /** Compact mode (show only counts) */
  compact?: boolean
}

/** Storage status to badge variant mapping */
const STORAGE_STATUS_VARIANT: Record<StorageStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  ok: 'success',
  warning: 'warning',
  urgent: 'warning',
  critical: 'error',
}

/** Storage status labels */
const STORAGE_STATUS_LABELS: Record<StorageStatus, string> = {
  ok: '正常',
  warning: '空间不足',
  urgent: '急需清理',
  critical: '严重不足',
}

/** Progress color based on usage percentage */
const getProgressColor = (percent: number): string => {
  if (percent < 70) return 'bg-emerald-500'
  if (percent < 80) return 'bg-amber-500'
  if (percent < 95) return 'bg-orange-500'
  return 'bg-danger'
}

/** Status dot color class */
const getStatusDotColor = (hasError: boolean, isInitialized: boolean, isOPFS: boolean): string => {
  if (hasError) return 'bg-danger'
  if (!isInitialized) return 'bg-amber-500'
  return isOPFS ? 'bg-emerald-500' : ''
}

export const ConversationStorageBadge: React.FC<ConversationStorageBadgeProps> = () => {
  const [open, setOpen] = useState(false)
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null)
  const [cleanupScope, setCleanupScope] = useState<'old' | 'all'>('old')
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭 dropdown（与 LanguageSwitcher 相同的模式）
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const {
    activeWorkspaceId,
    workspaces,
    initialized,
    error: sessionError,
    switchWorkspace,
    deleteWorkspace,
  } = useWorkspaceStore()
  const {
    storage,
    sessions: storageSessions,
    loading: storageLoading,
    refresh,
    getCleanupPreview,
    executeCleanup,
  } = useStorageInfo()
  const { isOPFS } = useSQLiteMode()

  // Status dot color
  const statusDotColor = getStatusDotColor(!!sessionError, initialized, isOPFS)
  const showStatusDot = Boolean(sessionError || !initialized || isOPFS)

  // Handle workspace switch
  const handleSwitch = useCallback(
    async (workspaceId: string) => {
      try {
        await switchWorkspace(workspaceId)
        setOpen(false)
      } catch (error) {
        console.error('[ConversationStorageBadge] Failed to switch workspace:', error)
      }
    },
    [switchWorkspace]
  )

  // Handle session delete - open dialog
  const handleDeleteClick = useCallback((workspaceId: string) => {
    setWorkspaceToDelete(workspaceId)
    setDeleteDialogOpen(true)
    setOpen(false) // Close dropdown when opening dialog
  }, [])

  // Confirm session delete
  const handleConfirmDelete = useCallback(async () => {
    if (!workspaceToDelete) return

    setDeleteLoading(true)

    try {
      await deleteWorkspace(workspaceToDelete)
      toast.success('会话已删除')
      setDeleteDialogOpen(false)
      setWorkspaceToDelete(null)
      await refresh()
    } catch (error) {
      console.error('[ConversationStorageBadge] Failed to delete workspace:', error)
      toast.error('删除会话失败')
    } finally {
      setDeleteLoading(false)
    }
  }, [workspaceToDelete, deleteWorkspace, refresh])

  // Handle open cleanup dialog
  const handleOpenCleanupDialog = useCallback(
    async (scope: 'old' | 'all') => {
      setCleanupScope(scope)
      setCleanupLoading(true)

      try {
        const preview = await getCleanupPreview(scope, 30)
        if (preview) {
          setCleanupPreview(preview)
          setCleanupDialogOpen(true)
        } else {
          toast.info(scope === 'old' ? '没有 30 天未活跃的对话可清理' : '没有可清理的缓存')
        }
      } catch (error) {
        console.error('[ConversationStorageBadge] Failed to get cleanup preview:', error)
        toast.error('获取清理信息失败')
      } finally {
        setCleanupLoading(false)
      }
    },
    [getCleanupPreview]
  )

  // Handle execute cleanup
  const handleExecuteCleanup = useCallback(async () => {
    if (!cleanupPreview) return

    setCleanupLoading(true)

    try {
      const cleaned = await executeCleanup(cleanupScope, 30)
      toast.success(`已清理 ${cleaned} 个对话的文件缓存，释放 ${cleanupPreview.totalSizeFormatted}`)
      setCleanupDialogOpen(false)
      setCleanupPreview(null)
      await refresh()
    } catch (error) {
      console.error('[ConversationStorageBadge] Failed to execute cleanup:', error)
      toast.error('清理失败，请重试')
    } finally {
      setCleanupLoading(false)
    }
  }, [cleanupPreview, cleanupScope, executeCleanup, refresh])

  // Get current workspace info
  const currentWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const ActionTooltip = ({
    label,
    children,
  }: {
    label: string
    children: React.ReactNode
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative" ref={containerRef}>
        <ActionTooltip label="存储空间">
          <BrandButton iconButton variant="ghost" onClick={() => setOpen(!open)}>
            <HardDrive className="h-5 w-5" />
          </BrandButton>
        </ActionTooltip>
      {/* Status dot: sibling element to avoid overflow clipping */}
      {showStatusDot && (
        <span className={cn('absolute right-0 top-0 h-2 w-2 rounded-full', statusDotColor)} />
      )}

      {open && <SessionDropdown />}

      {/* Cleanup Confirmation Dialog */}
      <BrandDialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <BrandDialogContent>
          <BrandDialogHeader>
            <BrandDialogTitle>清理对话缓存</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            {cleanupPreview && (
              <>
                {cleanupPreview.hasUnsavedChanges && (
                  <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="text-[10px] text-amber-800">
                      <span className="font-semibold">注意：</span>
                      将丢弃 {cleanupPreview.pendingCount} 个未保存的修改和{' '}
                      {cleanupPreview.undoCount} 条撤销记录
                    </div>
                  </div>
                )}

                <div className="space-y-2 text-xs text-secondary">
                  <div>将清理：</div>
                  <div className="ml-4 space-y-1">
                    <div>
                      • {cleanupPreview.sessionCount} 个会话
                      {cleanupScope === 'old' && ' (30天未活跃)'}
                    </div>
                    <div>• 约 {cleanupPreview.totalSizeFormatted} 文件缓存</div>
                    <div
                      className={cn(
                        cleanupPreview.hasUnsavedChanges ? 'text-amber-600' : 'text-emerald-600'
                      )}
                    >
                      • {cleanupPreview.pendingCount} 个未保存的修改
                    </div>
                  </div>
                </div>

                {/* Scope Selection */}
                <div className="mt-3 space-y-2">
                  <div className="text-[10px] font-medium uppercase text-muted">选择清理范围</div>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setCleanupScope('old')}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors',
                        cleanupScope === 'old'
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-secondary hover:bg-gray-50'
                      )}
                    >
                      <div
                        className={cn(
                          'h-3 w-3 rounded-full border',
                          cleanupScope === 'old'
                            ? 'border-primary-500 bg-primary-500'
                            : 'border-gray-300'
                        )}
                      />
                      仅清理旧会话 (30天未活跃)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCleanupScope('all')}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors',
                        cleanupScope === 'all'
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-secondary hover:bg-gray-50'
                      )}
                    >
                      <div
                        className={cn(
                          'h-3 w-3 rounded-full border',
                          cleanupScope === 'all'
                            ? 'border-primary-500 bg-primary-500'
                            : 'border-gray-300'
                        )}
                      />
                      清理所有工作区缓存
                    </button>
                  </div>
                </div>

                {/* Help text */}
                <div className="mt-3 flex items-start gap-1.5 text-[9px] leading-tight text-muted">
                  <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                  <p>对话记录不会被删除，下次访问文件时会重新从本地磁盘读取。</p>
                </div>
              </>
            )}
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="outline"
              onClick={() => setCleanupDialogOpen(false)}
              disabled={cleanupLoading}
            >
              取消
            </BrandButton>
            <BrandButton
              variant={cleanupPreview?.hasUnsavedChanges ? 'secondary' : 'danger'}
              onClick={handleExecuteCleanup}
              disabled={cleanupLoading}
            >
              {cleanupLoading ? '清理中...' : '确认清理'}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Delete Confirmation Dialog */}
      <BrandDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <BrandDialogContent>
          <BrandDialogHeader>
            <BrandDialogTitle>删除对话缓存</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            {(() => {
              const workspace = workspaces.find((w) => w.id === workspaceToDelete)
              const hasPending = workspace?.pendingCount ? workspace.pendingCount > 0 : false
              const hasUndo = workspace?.undoCount ? workspace.undoCount > 0 : false
              const hasData = hasPending || hasUndo

              return (
                <>
                  <p className="text-sm text-secondary">
                    确定要删除 <span className="font-medium text-primary">"{workspace?.name}"</span>{' '}
                    的对话缓存吗？
                  </p>

                  {hasData && (
                    <div className="mt-3 rounded-md bg-amber-50 px-3 py-2">
                      <p className="flex items-center gap-2 text-[10px] text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-semibold">注意：有未保存的修改</span>
                      </p>
                      <p className="ml-5 text-[10px] text-amber-700">
                        {hasPending && `${workspace?.pendingCount ?? 0} 个待同步的修改`}
                        {hasPending && hasUndo && '，'}
                        {hasUndo && `${workspace?.undoCount ?? 0} 条撤销记录`}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 space-y-3 text-sm">
                    <div>
                      <span className="font-medium text-danger">❌ 将删除</span>
                      <ul className="ml-6 mt-1 list-disc space-y-1 text-secondary">
                        <li>对话缓存和所有文件</li>
                        <li>未保存的修改（无法恢复）</li>
                      </ul>
                    </div>

                    <div>
                      <span className="font-medium text-emerald-600">✅ 将保留</span>
                      <ul className="ml-6 mt-1 list-disc space-y-1 text-secondary">
                        <li>对话记录</li>
                      </ul>
                    </div>

                    <div className="rounded-md bg-gray-50 px-3 py-2">
                      <p className="flex items-center gap-2 text-[10px] text-muted">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        <span>删除后对话记录还在，但无法再访问这个对话的文件缓存</span>
                      </p>
                    </div>
                  </div>
                </>
              )
            })()}
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteLoading}
            >
              取消
            </BrandButton>
            <BrandButton variant="danger" onClick={handleConfirmDelete} disabled={deleteLoading}>
              {deleteLoading ? '删除中...' : '确认删除'}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>
      </div>
    </TooltipProvider>
  )

  function SessionDropdown() {
    return (
      <>
        {/* Dropdown menu - 使用与 LanguageSwitcher 相同的 z-index */}
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
          {/* Header - Current session */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-tertiary text-xs font-medium">当前对话</span>
              {currentWorkspace && (
                <span className="text-xs font-semibold text-primary-600">
                  {currentWorkspace.name}
                </span>
              )}
            </div>
          </div>

          <BrandSelectSeparator />

          {/* Storage overview */}
          <div className="px-4 py-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-secondary">
              <HardDrive className="h-3.5 w-3.5" />
              <span>存储空间 (浏览器配额)</span>
              {storageLoading && <span className="text-muted">加载中...</span>}
            </div>

            {storage && (
              <>
                {/* Progress bar using BrandProgress */}
                <div className="mb-3">
                  <div className="text-tertiary mb-1.5 flex items-center justify-between text-[10px]">
                    <span>
                      {storage.usageFormatted} / {storage.quotaFormatted}
                    </span>
                    <span className="font-medium">{storage.usagePercent.toFixed(1)}%</span>
                  </div>
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        getProgressColor(storage.usagePercent)
                      )}
                      style={{ width: `${Math.max(storage.usagePercent, 2)}%` }}
                    />
                  </div>
                </div>

                {/* Status badge and note */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <BrandBadge
                      variant={STORAGE_STATUS_VARIANT[storage.status]}
                      shape="pill"
                      className="!px-1.5 !py-0.5 !text-[10px]"
                    >
                      {STORAGE_STATUS_LABELS[storage.status]}
                    </BrandBadge>
                    <ActionTooltip label="计算每个会话的缓存大小（可能较慢）">
                      <button
                        type="button"
                        onClick={() => refresh(true)}
                        className="text-[10px] text-primary-600 hover:underline"
                      >
                        刷新
                      </button>
                    </ActionTooltip>
                  </div>
                  {/* Explanatory note */}
                  <div className="flex items-start gap-1.5 text-[9px] leading-tight text-muted">
                    <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                    <p>配额是浏览器允许的上限，不等于实际剩余空间。写入时若超出实际空间会报错。</p>
                  </div>
                </div>
              </>
            )}

            {!storage && !storageLoading && (
              <p className="text-[10px] text-muted">无法获取存储信息</p>
            )}
          </div>

          <BrandSelectSeparator />

          {/* Session list */}
          <div className="custom-scrollbar max-h-60 overflow-y-auto">
            <div className="px-4 py-2">
              <span className="text-xs font-semibold text-secondary">
                所有对话 ({workspaces.length})
              </span>
            </div>

            {storageSessions.length === 0 ? (
              <div className="px-4 py-4 text-center text-xs text-muted">暂无会话</div>
            ) : (
              <ul>
                {storageSessions.map((session) => {
                  const isActive = session.id === activeWorkspaceId
                  const hasPending = session.pendingCount > 0
                  const hasUndo = session.undoCount > 0

                  return (
                    <li
                      key={session.id}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 transition-colors',
                        isActive ? 'bg-primary-50' : 'hover:bg-gray-50'
                      )}
                    >
                      {/* Active indicator */}
                      {isActive && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                      {!isActive && <span className="h-4 w-4 shrink-0" />}

                      {/* Session info */}
                      <button
                        type="button"
                        onClick={() => handleSwitch(session.id)}
                        className="flex min-w-0 flex-1 flex-col items-start text-left"
                      >
                        {/* First row: name + size */}
                        <div className="flex w-full min-w-0 items-center gap-2">
                          <span className="truncate text-xs font-medium text-primary">
                            {session.name}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted">
                            {session.cacheSizeFormatted}
                          </span>
                        </div>

                        {/* Second row: status */}
                        <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                          {hasPending && (
                            <BrandBadge
                              variant="warning"
                              shape="pill"
                              className="!gap-0.5 !px-1.5 !py-0 !text-[10px]"
                            >
                              <Clock className="h-2.5 w-2.5" />
                              {session.pendingCount}
                            </BrandBadge>
                          )}
                          {hasUndo && (
                            <BrandBadge
                              type="tag"
                              color="blue"
                              className="!gap-0.5 !px-1.5 !py-0 !text-[10px]"
                            >
                              <RotateCcw className="h-2.5 w-2.5" />
                              {session.undoCount}
                            </BrandBadge>
                          )}
                          {!hasPending && !hasUndo && <span className="text-muted">无变更</span>}
                        </div>
                      </button>

                      {/* Delete button */}
                      {!isActive && (
                        <ActionTooltip label="删除工作区">
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(session.id)}
                            className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </ActionTooltip>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <BrandSelectSeparator />

          {/* Footer - Cleanup Action */}
          <div className="px-4 py-2">
            <ActionTooltip label="清理旧会话的文件缓存，释放存储空间">
              <button
                type="button"
                onClick={() => handleOpenCleanupDialog('old')}
                disabled={cleanupLoading}
                className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-secondary transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {cleanupLoading ? '加载中...' : '清理文件缓存'}
              </button>
            </ActionTooltip>
            <p className="px-1 pt-1.5 text-[9px] leading-tight text-muted">
              仅清理文件缓存，不影响对话记录
            </p>
          </div>
        </div>
      </>
    )
  }
}
