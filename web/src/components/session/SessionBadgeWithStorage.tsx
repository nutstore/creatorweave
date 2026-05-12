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
import { useStorageInfo, type CleanupPreview, type WorkspaceStorageInfo } from '@/hooks/useStorageInfo'
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

// --- Module-level sub-components (stable references, won't cause DOM remount) ---

/** Reusable tooltip wrapper */
const ActionTooltip = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="bottom">{label}</TooltipContent>
  </Tooltip>
)

// --- Constants ---

/** Storage status to badge variant mapping */
const STORAGE_STATUS_VARIANT: Record<StorageStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  ok: 'success',
  warning: 'warning',
  urgent: 'warning',
  critical: 'error',
}

/** Storage status labels - translation keys */
const STORAGE_STATUS_LABELS: Record<StorageStatus, string> = {
  ok: 'workspaceStorage.statusOk',
  warning: 'workspaceStorage.statusWarning',
  urgent: 'workspaceStorage.statusUrgent',
  critical: 'workspaceStorage.statusCritical',
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

// --- Dropdown component (module-level for stable reference) ---

interface ConversationDropdownProps {
  activeConversationId: string | undefined
  currentConversationTitle: string
  conversationsCount: number
  storageConversations: WorkspaceStorageInfo[]
  conversationTitles: { id: string; title: string }[]
  storage: { usageFormatted: string; quotaFormatted: string; usagePercent: number; status: StorageStatus } | null
  storageLoading: boolean
  cleanupLoading: boolean
  onSwitch: (id: string) => void
  onDeleteClick: (id: string) => void
  onRefresh: () => void
  onOpenCleanupDialog: (scope: 'old' | 'all') => void
}

const ConversationDropdown: React.FC<ConversationDropdownProps> = ({
  activeConversationId,
  currentConversationTitle,
  conversationsCount,
  storageConversations,
  conversationTitles,
  storage,
  storageLoading,
  cleanupLoading,
  onSwitch,
  onDeleteClick,
  onRefresh,
  onOpenCleanupDialog,
}) => {
  const t = useT()

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-white shadow-lg dark:border-border dark:bg-card">
      {/* Header - Current conversation */}
      <div className="px-4 py-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="text-tertiary shrink-0 text-xs font-medium">{t('workspaceStorage.currentConversation')}</span>
          {activeConversationId && (
            <span className="min-w-0 truncate text-xs font-semibold text-primary-600">
              {currentConversationTitle}
            </span>
          )}
        </div>
      </div>

      <BrandSelectSeparator />

      {/* Storage overview */}
      <div className="px-4 py-3">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-secondary">
          <HardDrive className="h-3.5 w-3.5" />
          <span>{t('workspaceStorage.storageSpace')} {t('workspaceStorage.browserQuota')}</span>
          {storageLoading && <span className="text-muted">{t('workspaceStorage.loading')}</span>}
        </div>

        {storage && (
          <>
            {/* Progress bar */}
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
                <ActionTooltip label={t('workspaceStorage.calculateSize')}>
                  <button
                    type="button"
                    onClick={onRefresh}
                    className="text-[10px] text-primary-600 hover:underline"
                  >
                    {t('workspaceStorage.refresh')}
                  </button>
                </ActionTooltip>
              </div>
              {/* Explanatory note */}
              <div className="flex items-start gap-1.5 text-[9px] leading-tight text-muted">
                <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                <p>{t('workspaceStorage.quotaExplanation')}</p>
              </div>
            </div>
          </>
        )}

        {!storage && !storageLoading && (
          <p className="text-[10px] text-muted">{t('workspaceStorage.cannotGetStorage')}</p>
        )}
      </div>

      <BrandSelectSeparator />

      {/* Conversation list */}
      <div className="px-4 py-2">
        <span className="text-xs font-semibold text-secondary">
          {t('workspaceStorage.allConversations', { count: conversationsCount })}
        </span>
      </div>

      <div className="custom-scrollbar max-h-60 overflow-y-auto">
        {storageConversations.length === 0 ? (
          <div className="px-4 py-4 text-center text-xs text-muted">{t('workspaceStorage.noSessions')}</div>
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
                    onClick={() => onSwitch(conversation.id)}
                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                  >
                    {/* First row: name + size */}
                    <div className="flex w-full min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-medium text-primary">
                        {conversationTitles.find((c) => c.id === conversation.id)?.title ?? conversation.name}
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
                      {!hasPending && <span className="text-muted">{t('workspaceStorage.noChanges')}</span>}
                    </div>
                  </button>

                  {/* Delete button */}
                  {!isActive && (
                    <ActionTooltip label={t('workspaceStorage.deleteConversation')}>
                      <button
                        type="button"
                        onClick={() => onDeleteClick(conversation.id)}
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
        <ActionTooltip label={t('workspaceStorage.cleanupOldDescription')}>
          <button
            type="button"
            onClick={() => onOpenCleanupDialog('old')}
            disabled={cleanupLoading}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-secondary transition-colors hover:bg-muted dark:hover:bg-muted dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {cleanupLoading ? t('workspaceStorage.loading') : t('workspaceStorage.cleanupFileCache')}
          </button>
        </ActionTooltip>
        <p className="px-1 pt-1.5 text-[9px] leading-tight text-muted">
          {t('workspaceStorage.cleanupFileCacheHelp')}
        </p>
      </div>
    </div>
  )
}

// --- Main component ---

export interface ConversationStorageBadgeProps {
  /** Compact mode (show only counts) */
  compact?: boolean
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

  const activeConversationId = useConversationContextStore((s) => s.activeWorkspaceId)
  const conversations = useConversationContextStore((s) => s.workspaces)
  const initialized = useConversationContextStore((s) => s.initialized)
  const contextError = useConversationContextStore((s) => s.error)
  const switchWorkspace = useConversationContextStore((s) => s.switchWorkspace)
  const deleteConversation = useConversationStore((state) => state.deleteConversation)
  // Extract conversation id→title pairs (shallow-equal stable reference, won't re-render on streaming updates)
  const conversationTitles = useConversationStore(
    (state) => state.conversations.map((c) => ({ id: c.id, title: c.title })),
    (a, b) => {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id || a[i].title !== b[i].title) return false
      }
      return true
    }
  )
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
      toast.success(t('workspaceStorage.sessionDeleted'))
      setDeleteDialogOpen(false)
      setConversationToDelete(null)
      await refresh()
    } catch (error) {
      console.error('[ConversationStorageBadge] Failed to delete conversation:', error)
      toast.error(t('workspaceStorage.deleteFailed'))
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
          toast.info(scope === 'old' ? t('workspaceStorage.noOldConversations') : t('workspaceStorage.noCleanupNeeded'))
        }
      } catch (error) {
        console.error('[ConversationStorageBadge] Failed to get cleanup preview:', error)
        toast.error(t('workspaceStorage.getCleanupInfoFailed'))
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
      toast.success(t('workspaceStorage.cleanupSuccess', { count: cleaned, size: cleanupPreview.totalSizeFormatted }))
      setCleanupDialogOpen(false)
      setCleanupPreview(null)
      await refresh()
    } catch (error) {
      console.error('[ConversationStorageBadge] Failed to execute cleanup:', error)
      toast.error(t('workspaceStorage.cleanupFailed'))
    } finally {
      setCleanupLoading(false)
    }
  }, [cleanupPreview, cleanupScope, executeCleanup, refresh])

  // Get current conversation title from conversation store (single source of truth)
  const currentConversationTitle = activeConversationId
    ? (conversationTitles.find((c) => c.id === activeConversationId)?.title ?? conversations.find((w) => w.id === activeConversationId)?.name ?? '')
    : ''

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative" ref={containerRef}>
        <ActionTooltip label={t('workspaceStorage.storageSpace')}>
          <BrandButton iconButton variant="ghost" onClick={() => { const next = !open; setOpen(next); if (next) refresh(true) }}>
            <HardDrive className="h-5 w-5" />
          </BrandButton>
        </ActionTooltip>
      {/* Status dot: sibling element to avoid overflow clipping */}
      {showStatusDot && (
        <span className={cn('absolute right-0 top-0 h-2 w-2 rounded-full', statusDotColor)} />
      )}

      {open && (
        <ConversationDropdown
          activeConversationId={activeConversationId ?? undefined}
          currentConversationTitle={currentConversationTitle}
          conversationsCount={conversations.length}
          storageConversations={storageConversations}
          conversationTitles={conversationTitles}
          storage={storage}
          storageLoading={storageLoading}
          cleanupLoading={cleanupLoading}
          onSwitch={handleSwitch}
          onDeleteClick={handleDeleteClick}
          onRefresh={() => refresh(true)}
          onOpenCleanupDialog={handleOpenCleanupDialog}
        />
      )}

      {/* Cleanup Confirmation Dialog */}
      <BrandDialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <BrandDialogContent>
          <BrandDialogHeader>
            <BrandDialogTitle>{t('workspaceStorage.cleanupTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            {cleanupPreview && (
              <>
                {cleanupPreview.hasUnsavedChanges && (
                  <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="text-[10px] text-amber-800">
                      <span className="font-semibold">{t('workspaceStorage.attention')}</span>
                      {t('workspaceStorage.willDiscard', { count: cleanupPreview.pendingCount })}
                    </div>
                  </div>
                )}

                <div className="space-y-2 text-xs text-secondary">
                  <div>{t('workspaceStorage.willCleanup')}</div>
                  <div className="ml-4 space-y-1">
                    <div>
                      • {t('workspaceStorage.conversationCount', { count: cleanupPreview.conversationCount })}
                      {cleanupScope === 'old' && ` ${t('workspaceStorage.daysInactive')}`}
                    </div>
                    <div>• {t('workspaceStorage.fileCacheSize', { size: cleanupPreview.totalSizeFormatted })}</div>
                    <div
                      className={cn(
                        cleanupPreview.hasUnsavedChanges ? 'text-amber-600' : 'text-emerald-600'
                      )}
                    >
                      • {t('workspaceStorage.unsavedChanges', { count: cleanupPreview.pendingCount })}
                    </div>
                  </div>
                </div>

                {/* Scope Selection */}
                <div className="mt-3 space-y-2">
                  <div className="text-[10px] font-medium uppercase text-muted">{t('workspaceStorage.selectScope')}</div>
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
                      {t('workspaceStorage.cleanupOldSessions')}
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
                      {t('workspaceStorage.cleanupAll')}
                    </button>
                  </div>
                </div>

                {/* Help text */}
                <div className="mt-3 flex items-start gap-1.5 text-[9px] leading-tight text-muted">
                  <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                  <p>{t('workspaceStorage.cleanupHelpText')}</p>
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
              {t('workspaceStorage.canceling')}
            </BrandButton>
            <BrandButton
              variant={cleanupPreview?.hasUnsavedChanges ? 'secondary' : 'danger'}
              onClick={handleExecuteCleanup}
              disabled={cleanupLoading}
            >
              {cleanupLoading ? t('workspaceStorage.cleaning') : t('workspaceStorage.confirmCleanup')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Delete Confirmation Dialog */}
      <BrandDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <BrandDialogContent>
          <BrandDialogHeader>
            <BrandDialogTitle>{t('workspaceStorage.deleteTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            {(() => {
              const workspaceInfo = conversations.find((w) => w.id === conversationToDelete)
              const hasPending = workspaceInfo?.pendingCount ? workspaceInfo.pendingCount > 0 : false
              const hasData = hasPending
              const displayName = conversationToDelete ? (conversationTitles.find((c) => c.id === conversationToDelete)?.title ?? workspaceInfo?.name ?? '') : ''

              return (
                <>
                  <p className="text-sm text-secondary">
                    {t('workspaceStorage.deleteConfirm', { name: displayName })}
                  </p>

                  {hasData && (
                    <div className="mt-3 rounded-md bg-amber-50 px-3 py-2">
                      <p className="flex items-center gap-2 text-[10px] text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-semibold">{t('workspaceStorage.warningUnsaved')}</span>
                      </p>
                      <p className="ml-5 text-[10px] text-amber-700">
                        {hasPending && t('workspaceStorage.pendingSync', { count: workspaceInfo?.pendingCount ?? 0 })}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 space-y-3 text-sm">
                    <div>
                      <span className="font-medium text-danger">❌ {t('workspaceStorage.willDelete')}</span>
                      <ul className="ml-6 mt-1 list-disc space-y-1 text-secondary">
                        <li>{t('workspaceStorage.conversationRecords')}</li>
                        <li>{t('workspaceStorage.fileCache')}</li>
                        <li>{t('workspaceStorage.unsavedCannotRecover')}</li>
                      </ul>
                    </div>

                    <div className="rounded-md bg-muted dark:bg-muted px-3 py-2 dark:bg-muted">
                      <p className="flex items-center gap-2 text-[10px] text-muted">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        <span>{t('workspaceStorage.cannotRecover')}</span>
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
              {t('workspaceStorage.canceling')}
            </BrandButton>
            <BrandButton variant="danger" onClick={handleConfirmDelete} disabled={deleteLoading}>
              {deleteLoading ? t('workspaceStorage.deleting') : t('workspaceStorage.confirmDelete')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>
      </div>
    </TooltipProvider>
  )
}
