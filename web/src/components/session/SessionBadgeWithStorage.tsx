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
import { Clock, HardDrive, Trash2, Check, Info, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useConversationStore } from '@/store/conversation.store'
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
} from '@creatorweave/ui'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

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

/** Storage status labels - translation keys */
const STORAGE_STATUS_LABELS: Record<StorageStatus, string> = {
  ok: 'conversationStorage.statusOk',
  warning: 'conversationStorage.statusWarning',
  urgent: 'conversationStorage.statusUrgent',
  critical: 'conversationStorage.statusCritical',
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
  const t = useT()
  const [open, setOpen] = useState(false)
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false)
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null)
  const [cleanupScope, setCleanupScope] = useState<'old' | 'all'>('old')
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Click outside to close dropdown (same pattern as LanguageSwitcher)
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
    activeWorkspaceId: activeConversationId,
    workspaces: conversations,
    initialized,
    error: contextError,
    switchWorkspace,
  } = useConversationContextStore()
  const deleteConversation = useConversationStore((state) => state.deleteConversation)
  const {
    storage,
    conversations: storageConversations,
    loading: storageLoading,
    refresh,
    getCleanupPreview,
    executeCleanup,
  } = useStorageInfo()
  const { isOPFS } = useSQLiteMode()

  // Status dot color
  const statusDotColor = getStatusDotColor(!!contextError, initialized, isOPFS)
  const showStatusDot = Boolean(contextError || !initialized || isOPFS)

  // Handle conversation switch
  const handleSwitch = useCallback(
    async (conversationId: string) => {
      try {
        await switchWorkspace(conversationId)
        setOpen(false)
      } catch (error) {
        console.error('[ConversationStorageBadge] Failed to switch conversation:', error)
      }
    },
    [switchWorkspace]
  )

  // Handle conversation delete - open dialog
  const handleDeleteClick = useCallback((conversationId: string) => {
    setConversationToDelete(conversationId)
    setDeleteDialogOpen(true)
    setOpen(false) // Close dropdown when opening dialog
  }, [])

  // Confirm conversation delete
  const handleConfirmDelete = useCallback(async () => {
    if (!conversationToDelete) return

    setDeleteLoading(true)

    try {
      await deleteConversation(conversationToDelete)
      toast.success(t('conversationStorage.sessionDeleted'))
      setDeleteDialogOpen(false)
      setConversationToDelete(null)
      await refresh()
    } catch (error) {
      console.error('[ConversationStorageBadge] Failed to delete conversation:', error)
      toast.error(t('conversationStorage.deleteFailed'))
    } finally {
      setDeleteLoading(false)
    }
  }, [conversationToDelete, deleteConversation, refresh])

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
          toast.info(scope === 'old' ? t('conversationStorage.noOldConversations') : t('conversationStorage.noCleanupNeeded'))
        }
      } catch (error) {
        console.error('[ConversationStorageBadge] Failed to get cleanup preview:', error)
        toast.error(t('conversationStorage.getCleanupInfoFailed'))
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
      toast.success(t('conversationStorage.cleanupSuccess', { count: cleaned, size: cleanupPreview.totalSizeFormatted }))
      setCleanupDialogOpen(false)
      setCleanupPreview(null)
      await refresh()
    } catch (error) {
      console.error('[ConversationStorageBadge] Failed to execute cleanup:', error)
      toast.error(t('conversationStorage.cleanupFailed'))
    } finally {
      setCleanupLoading(false)
    }
  }, [cleanupPreview, cleanupScope, executeCleanup, refresh])

  // Get current conversation info
  const currentConversation = conversations.find((w) => w.id === activeConversationId)

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
        <ActionTooltip label={t('conversationStorage.storageSpace')}>
          <BrandButton iconButton variant="ghost" onClick={() => setOpen(!open)}>
            <HardDrive className="h-5 w-5" />
          </BrandButton>
        </ActionTooltip>
      {/* Status dot: sibling element to avoid overflow clipping */}
      {showStatusDot && (
        <span className={cn('absolute right-0 top-0 h-2 w-2 rounded-full', statusDotColor)} />
      )}

      {open && <ConversationDropdown />}

      {/* Cleanup Confirmation Dialog */}
      <BrandDialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <BrandDialogContent>
          <BrandDialogHeader>
            <BrandDialogTitle>{t('conversationStorage.cleanupTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            {cleanupPreview && (
              <>
                {cleanupPreview.hasUnsavedChanges && (
                  <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="text-[10px] text-amber-800">
                      <span className="font-semibold">{t('conversationStorage.attention')}</span>
                      {t('conversationStorage.willDiscard', { count: cleanupPreview.pendingCount })}
                    </div>
                  </div>
                )}

                <div className="space-y-2 text-xs text-secondary">
                  <div>{t('conversationStorage.willCleanup')}</div>
                  <div className="ml-4 space-y-1">
                    <div>
                      • {t('conversationStorage.conversationCount', { count: cleanupPreview.conversationCount })}
                      {cleanupScope === 'old' && ` ${t('conversationStorage.daysInactive')}`}
                    </div>
                    <div>• {t('conversationStorage.fileCacheSize', { size: cleanupPreview.totalSizeFormatted })}</div>
                    <div
                      className={cn(
                        cleanupPreview.hasUnsavedChanges ? 'text-amber-600' : 'text-emerald-600'
                      )}
                    >
                      • {t('conversationStorage.unsavedChanges', { count: cleanupPreview.pendingCount })}
                    </div>
                  </div>
                </div>

                {/* Scope Selection */}
                <div className="mt-3 space-y-2">
                  <div className="text-[10px] font-medium uppercase text-muted">{t('conversationStorage.selectScope')}</div>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setCleanupScope('old')}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors',
                        cleanupScope === 'old'
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                          : 'text-secondary hover:bg-muted dark:hover:bg-muted'
                      )}
                    >
                      <div
                        className={cn(
                          'h-3 w-3 rounded-full border',
                          cleanupScope === 'old'
                            ? 'border-primary-500 bg-primary-500'
                            : 'border-border dark:border-border'
                        )}
                      />
                      {t('conversationStorage.cleanupOldSessions')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCleanupScope('all')}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors',
                        cleanupScope === 'all'
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                          : 'text-secondary hover:bg-muted dark:hover:bg-muted'
                      )}
                    >
                      <div
                        className={cn(
                          'h-3 w-3 rounded-full border',
                          cleanupScope === 'all'
                            ? 'border-primary-500 bg-primary-500'
                            : 'border-border dark:border-border'
                        )}
                      />
                      {t('conversationStorage.cleanupAll')}
                    </button>
                  </div>
                </div>

                {/* Help text */}
                <div className="mt-3 flex items-start gap-1.5 text-[9px] leading-tight text-muted">
                  <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                  <p>{t('conversationStorage.cleanupHelpText')}</p>
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
              {t('conversationStorage.canceling')}
            </BrandButton>
            <BrandButton
              variant={cleanupPreview?.hasUnsavedChanges ? 'secondary' : 'danger'}
              onClick={handleExecuteCleanup}
              disabled={cleanupLoading}
            >
              {cleanupLoading ? t('conversationStorage.cleaning') : t('conversationStorage.confirmCleanup')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Delete Confirmation Dialog */}
      <BrandDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <BrandDialogContent>
          <BrandDialogHeader>
            <BrandDialogTitle>{t('conversationStorage.deleteTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            {(() => {
              const conversation = conversations.find((w) => w.id === conversationToDelete)
              const hasPending = conversation?.pendingCount ? conversation.pendingCount > 0 : false
              const hasData = hasPending

              return (
                <>
                  <p className="text-sm text-secondary">
                    {t('conversationStorage.deleteConfirm', { name: conversation?.name ?? '' })}
                  </p>

                  {hasData && (
                    <div className="mt-3 rounded-md bg-amber-50 px-3 py-2">
                      <p className="flex items-center gap-2 text-[10px] text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-semibold">{t('conversationStorage.warningUnsaved')}</span>
                      </p>
                      <p className="ml-5 text-[10px] text-amber-700">
                        {hasPending && t('conversationStorage.pendingSync', { count: conversation?.pendingCount ?? 0 })}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 space-y-3 text-sm">
                    <div>
                      <span className="font-medium text-danger">❌ {t('conversationStorage.willDelete')}</span>
                      <ul className="ml-6 mt-1 list-disc space-y-1 text-secondary">
                        <li>{t('conversationStorage.conversationRecords')}</li>
                        <li>{t('conversationStorage.fileCache')}</li>
                        <li>{t('conversationStorage.unsavedCannotRecover')}</li>
                      </ul>
                    </div>

                    <div className="rounded-md bg-muted dark:bg-muted px-3 py-2 dark:bg-muted">
                      <p className="flex items-center gap-2 text-[10px] text-muted">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        <span>{t('conversationStorage.cannotRecover')}</span>
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
              {t('conversationStorage.canceling')}
            </BrandButton>
            <BrandButton variant="danger" onClick={handleConfirmDelete} disabled={deleteLoading}>
              {deleteLoading ? t('conversationStorage.deleting') : t('conversationStorage.confirmDelete')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>
      </div>
    </TooltipProvider>
  )

  function ConversationDropdown() {
    return (
      <>
        {/* Dropdown menu - same z-index pattern as LanguageSwitcher */}
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-white shadow-lg dark:border-border dark:bg-card">
          {/* Header - Current conversation */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-tertiary text-xs font-medium">{t('conversationStorage.currentConversation')}</span>
              {currentConversation && (
                <span className="text-xs font-semibold text-primary-600">
                  {currentConversation.name}
                </span>
              )}
            </div>
          </div>

          <BrandSelectSeparator />

          {/* Storage overview */}
          <div className="px-4 py-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-secondary">
              <HardDrive className="h-3.5 w-3.5" />
              <span>{t('conversationStorage.storageSpace')} {t('conversationStorage.browserQuota')}</span>
              {storageLoading && <span className="text-muted">{t('conversationStorage.loading')}</span>}
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
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted dark:bg-muted dark:bg-neutral-700">
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
                      {t(STORAGE_STATUS_LABELS[storage.status])}
                    </BrandBadge>
                    <ActionTooltip label={t('conversationStorage.calculateSize')}>
                      <button
                        type="button"
                        onClick={() => refresh(true)}
                        className="text-[10px] text-primary-600 hover:underline"
                      >
                        {t('conversationStorage.refresh')}
                      </button>
                    </ActionTooltip>
                  </div>
                  {/* Explanatory note */}
                  <div className="flex items-start gap-1.5 text-[9px] leading-tight text-muted">
                    <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                    <p>{t('conversationStorage.quotaExplanation')}</p>
                  </div>
                </div>
              </>
            )}

            {!storage && !storageLoading && (
              <p className="text-[10px] text-muted">{t('conversationStorage.cannotGetStorage')}</p>
            )}
          </div>

          <BrandSelectSeparator />

          {/* Conversation list */}
          <div className="custom-scrollbar max-h-60 overflow-y-auto">
            <div className="px-4 py-2">
              <span className="text-xs font-semibold text-secondary">
                {t('conversationStorage.allConversations', { count: conversations.length })}
              </span>
            </div>

            {storageConversations.length === 0 ? (
              <div className="px-4 py-4 text-center text-xs text-muted">{t('conversationStorage.noSessions')}</div>
            ) : (
              <ul>
                {storageConversations.map((conversation) => {
                  const isActive = conversation.id === activeConversationId
                  const hasPending = conversation.pendingCount > 0

                  return (
                    <li
                      key={conversation.id}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 transition-colors',
                        isActive ? 'bg-primary-50' : 'hover:bg-muted dark:hover:bg-muted'
                      )}
                    >
                      {/* Active indicator */}
                      {isActive && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                      {!isActive && <span className="h-4 w-4 shrink-0" />}

                      {/* Conversation info */}
                      <button
                        type="button"
                        onClick={() => handleSwitch(conversation.id)}
                        className="flex min-w-0 flex-1 flex-col items-start text-left"
                      >
                        {/* First row: name + size */}
                        <div className="flex w-full min-w-0 items-center gap-2">
                          <span className="truncate text-xs font-medium text-primary">
                            {conversation.name}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted">
                            {conversation.cacheSizeFormatted}
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
                              {conversation.pendingCount}
                            </BrandBadge>
                          )}
                          {!hasPending && <span className="text-muted">{t('conversationStorage.noChanges')}</span>}
                        </div>
                      </button>

                      {/* Delete button */}
                      {!isActive && (
                        <ActionTooltip label={t('conversationStorage.deleteConversation')}>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(conversation.id)}
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
            <ActionTooltip label={t('conversationStorage.cleanupOldDescription')}>
              <button
                type="button"
                onClick={() => handleOpenCleanupDialog('old')}
                disabled={cleanupLoading}
                className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-secondary transition-colors hover:bg-muted dark:hover:bg-muted dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {cleanupLoading ? t('conversationStorage.loading') : t('conversationStorage.cleanupFileCache')}
              </button>
            </ActionTooltip>
            <p className="px-1 pt-1.5 text-[9px] leading-tight text-muted">
              {t('conversationStorage.cleanupFileCacheHelp')}
            </p>
          </div>
        </div>
      </>
    )
  }
}
