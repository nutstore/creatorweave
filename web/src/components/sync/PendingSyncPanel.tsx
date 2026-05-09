/**
 * PendingSyncPanel - Sidebar change panel
 *
 * Approach A: Minimalist compact version
 * - Single-line compact display, maximize space utilization
 * - Select all / batch operations
 * - No extra scrolling, integrated in sidebar
 */

import React, { useState, useCallback, useMemo, useEffect as useReactEffect } from 'react'
import { isImageFile, readFileFromNativeFSMultiRoot, readFileFromOPFS } from '@/opfs'
import { useConversationContextStore, getActiveConversation } from '@/store/conversation-context.store'
import { useSettingsStore } from '@/store/settings.store'
import { getApiKeyRepository } from '@/sqlite'
import { createLLMProvider } from '@/agent/llm/provider-factory'
import { isCustomProviderType } from '@/agent/providers/types'
import { buildCommitSummaryDiffSections } from '@/workers/commit-summary-worker-manager'
import {
  BrandButton,
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogBody,
  BrandDialogFooter,
} from '@creatorweave/ui'
import { RefreshCw, Sparkles, ChevronRight, X, Check, AlertTriangle } from 'lucide-react'
import { getChangeTypeInfo, formatFileSize, FileIcon } from '@/utils/change-helpers'
import { buildSnapshotSummaryPrompt } from './snapshot-summary-prompt'
import { SnapshotApprovalDialog } from './SnapshotApprovalDialog'
import { sendChangeReviewToConversation, ReviewErrorKey } from './review-request'
import { ConflictResolutionDialog } from './ConflictResolutionDialog'
import { SidebarPanelHeader } from '@/components/layout/SidebarPanelHeader'
import { toast } from 'sonner'
import { useT } from '@/i18n'
import type { ConflictInfo, ConflictDetail, SyncResult } from '@/opfs/types/opfs-types'

export function PendingSyncPanel() {
  const t = useT()
  const pendingChanges = useConversationContextStore((state) => state.pendingChanges)
  const discardPendingPath = useConversationContextStore((state) => state.discardPendingPath)
  const [selectAll, setSelectAll] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isSyncing, setIsSyncing] = useState(false)
  const [showSyncSuccess, setShowSyncSuccess] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [pendingApprovePaths, setPendingApprovePaths] = useState<string[]>([])
  const [snapshotSummary, setSnapshotSummary] = useState('')
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [isReviewing, setIsReviewing] = useState(false)
  const [conflictPaths, setConflictPaths] = useState<Set<string>>(new Set())
  const [conflictQueue, setConflictQueue] = useState<ConflictDetail[]>([])
  const [conflictIndex, setConflictIndex] = useState(0)
  const [forceOverwritePaths, setForceOverwritePaths] = useState<Set<string>>(new Set())
  const [skippedConflictPaths, setSkippedConflictPaths] = useState<Set<string>>(new Set())
  const summaryAbortRef = React.useRef<AbortController | null>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const activeConflict = conflictQueue[conflictIndex] ?? null

  // Handle keyboard shortcuts
  useReactEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        handleToggleSelectAll()
      }
      // Ctrl/Cmd + Enter: Approve
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (selectedItems.size > 0) {
          handleSync()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pendingChanges, isSyncing])

  // Refresh pending changes when component mounts
  useReactEffect(() => {
    const refreshOnMount = async () => {
      const { refreshPendingChanges } = useConversationContextStore.getState()
      await refreshPendingChanges()
    }
    refreshOnMount()
  }, [])

  // Handle manual refresh
  const handleRefresh = useCallback(async () => {
    const { refreshPendingChanges } = useConversationContextStore.getState()
    await refreshPendingChanges()
  }, [])

  const refreshConflictPaths = useCallback(async () => {
    if (!pendingChanges || pendingChanges.changes.length === 0) {
      setConflictPaths(new Set())
      return
    }

    try {
      const activeConversation = await getActiveConversation()
      if (!activeConversation) {
        setConflictPaths(new Set())
        return
      }

      const nativeDir = await activeConversation.conversation.getNativeDirectoryHandle()
      if (!nativeDir) {
        setConflictPaths(new Set())
        return
      }

      const paths = pendingChanges.changes.map((c) => c.path)
      const conflicts = await activeConversation.conversation.detectSyncConflicts(nativeDir, paths)
      setConflictPaths(new Set(conflicts.map((c) => c.path)))
    } catch {
      setConflictPaths(new Set())
    }
  }, [pendingChanges])

  useReactEffect(() => {
    void refreshConflictPaths()
  }, [refreshConflictPaths])

  // Handle open preview panel
  const handleOpenPreview = useCallback(() => {
    const { showPreviewPanel } = useConversationContextStore.getState()
    showPreviewPanel()
  }, [])

  const handleOpenPreviewForPath = useCallback((path: string) => {
    const { showPreviewPanelForPath } = useConversationContextStore.getState()
    showPreviewPanelForPath(path)
  }, [])

  // Calculate selected count
  const selectedCount = selectedItems.size

  // Empty state
  const isEmpty = !pendingChanges || pendingChanges.changes.length === 0

  // Calculate total size (must be defined before all condition returns to maintain hooks order)
  const totalSize = useMemo(() => {
    if (!pendingChanges) return 0
    return pendingChanges.changes.reduce((sum, c) => sum + (c.size || 0), 0)
  }, [pendingChanges])
  // Handle individual file selection/deselection (must be defined before condition returns)
  const handleToggleSelect = useCallback(
    (path: string) => {
      if (!pendingChanges) return
      const newSelected = new Set(selectedItems)
      if (newSelected.has(path)) {
        newSelected.delete(path)
      } else {
        newSelected.add(path)
      }
      setSelectedItems(newSelected)
      setSelectAll(newSelected.size === pendingChanges.changes.length - 1)
    },
    [selectedItems, pendingChanges]
  )

  // Handle select all / deselect all (must be defined before condition returns)
  const handleToggleSelectAll = useCallback(() => {
    if (!pendingChanges) return
    const newSelectAll = !selectAll
    setSelectAll(newSelectAll)
    if (newSelectAll) {
      setSelectedItems(new Set(pendingChanges.changes.map((c) => c.path)))
    } else {
      setSelectedItems(new Set())
    }
  }, [selectAll, pendingChanges])

  // Handle remove single file (must be defined before condition returns)
  const handleRemoveFile = useCallback(async (path: string) => {
    try {
      await discardPendingPath(path)
      setConflictPaths((prev) => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.pendingSyncPanel.rejectChangeFailed')
      toast.error(message)
    }
  }, [discardPendingPath, t])

  // Handle reject all (must be defined before condition returns)
  const handleClear = useCallback(async () => {
    if (!pendingChanges || pendingChanges.changes.length === 0) {
      setSelectedItems(new Set())
      setSelectAll(false)
      setConflictPaths(new Set())
      setShowClearConfirm(false)
      return
    }

    const paths = pendingChanges.changes.map((c) => c.path)
    const { discardPendingPaths } = useConversationContextStore.getState()
    const result = await discardPendingPaths(paths)

    setSelectedItems(new Set())
    setSelectAll(false)
    setConflictPaths(new Set())
    setShowClearConfirm(false)

    if (result.failedCount > 0) {
      toast.warning(t('settings.pendingSyncPanel.rejectedCountWithFailure', { successCount: result.successCount, failedCount: result.failedCount }))
      return
    }

    toast.success(t('settings.pendingSyncPanel.rejectedAllSuccess'))
  }, [pendingChanges, t])

  const toConflictDetail = useCallback((conflict: ConflictInfo): ConflictDetail => ({
    path: conflict.path,
    opfsVersion: {
      workspaceId: conflict.workspaceId,
      mtime: conflict.opfsMtime,
    },
    nativeVersion: {
      exists: conflict.currentFsMtime > 0,
      mtime: conflict.currentFsMtime > 0 ? conflict.currentFsMtime : undefined,
    },
  }), [])

  const mergeSyncResult = useCallback((a: SyncResult, b: SyncResult): SyncResult => ({
    success: a.success + b.success,
    failed: a.failed + b.failed,
    skipped: a.skipped + b.skipped,
    conflicts: [...a.conflicts, ...b.conflicts],
  }), [])

  const generateSummaryWithLLM = useCallback(async (
    paths: string[],
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<string | null> => {
    try {
      const activeConversation = await getActiveConversation()
      signal?.throwIfAborted()
      if (!activeConversation) return null
      const { conversation, conversationId } = activeConversation
      const nativeDir = await conversation.getNativeDirectoryHandle()
      signal?.throwIfAborted()

      const settingsState = useSettingsStore.getState()
      const providerType = settingsState.providerType
      const effectiveConfig = settingsState.getEffectiveProviderConfig()
      if (!effectiveConfig?.baseUrl || !effectiveConfig.modelName) return null

      const apiKey = await getApiKeyRepository().load(effectiveConfig.apiKeyProviderKey)
      if (!apiKey) return null

      const provider = createLLMProvider({
        apiKey,
        providerType,
        baseUrl: effectiveConfig.baseUrl,
        model: effectiveConfig.modelName,
        apiMode: isCustomProviderType(providerType)
          ? settingsState.customProviders.find((p) => p.id === providerType)?.apiMode || 'chat-completions'
          : undefined,
      })

      const selectedChanges = (pendingChanges?.changes || []).filter((c) => paths.includes(c.path))
      const changesText = selectedChanges
        .slice(0, 20)
        .map((c) => `- ${c.type}: ${c.path}`)
        .join('\n')

      const diffInputs: Array<{
        path: string
        beforeText: string
        afterText: string
        isBinary?: boolean
      }> = []
      for (const change of selectedChanges.slice(0, 8)) {
        signal?.throwIfAborted()
        if (isImageFile(change.path)) {
          diffInputs.push({
            path: change.path,
            beforeText: '',
            afterText: '',
            isBinary: true,
          })
          continue
        }

        let beforeText = ''
        let afterText = ''
        if (change.type !== 'add' && nativeDir) {
          const text = await readFileFromNativeFSMultiRoot(nativeDir, change.path)
          beforeText = text ?? ''
        }
        if (change.type !== 'delete') {
          const text = await readFileFromOPFS(conversationId, change.path)
          afterText = text ?? ''
        }
        diffInputs.push({
          path: change.path,
          beforeText,
          afterText,
        })
      }
      let diffSections: string[] = []
      try {
        diffSections = await buildCommitSummaryDiffSections(diffInputs, {
          timeoutMs: 2500,
          maxOutputLines: 90,
          contextLines: 2,
          maxNoChangeLines: 20,
        })
      } catch {
        // Fallback to file-list-only prompt when worker times out/fails.
        diffSections = []
      }

      signal?.throwIfAborted()
      const prompt = buildSnapshotSummaryPrompt(selectedChanges.length, changesText, diffSections)

      // Use streaming to show text incrementally
      let content = ''
      for await (const chunk of provider.chatStream({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 220,
        disableThinking: true,
      }, signal)) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          content += delta
          onChunk(content.slice(0, 3000))
        }
      }
      signal?.throwIfAborted()
      const trimmed = content.trim()
      if (!trimmed) return null
      return trimmed.slice(0, 3000)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      return null
    }
  }, [pendingChanges])

  const runSync = useCallback(async (pathsToSync: string[], summary: string, overwritePaths: Set<string>) => {
    if (!pendingChanges || pendingChanges.changes.length === 0 || isSyncing) return false

    setIsSyncing(true)

    try {
      const activeConversation = await getActiveConversation()

      if (!activeConversation) {
        console.error('[PendingSyncPanel] No active workspace')
        return false
      }

      const { conversation } = activeConversation
      const nativeDir = await conversation.getNativeDirectoryHandle()

      const filesToSync = pendingChanges.changes.filter((c) => pathsToSync.includes(c.path))
      if (filesToSync.length === 0) return false

      // Create approval snapshot (can do regardless of local directory)
      const snapshotResult = await conversation.createApprovedSnapshotForPaths(
        filesToSync.map((c) => c.path),
        summary.trim(),
        nativeDir
      )

      // Only sync to disk when local directory exists
      if (nativeDir) {
        const allPaths = filesToSync.map((c) => c.path)
        const forceOverwriteList = allPaths.filter((path) => overwritePaths.has(path))
        const regularList = allPaths.filter((path) => !overwritePaths.has(path))

        let result: SyncResult = {
          success: 0,
          failed: 0,
          skipped: 0,
          conflicts: [],
        }
        if (regularList.length > 0) {
          result = mergeSyncResult(result, await conversation.syncToDisk(nativeDir, regularList))
        }
        if (forceOverwriteList.length > 0) {
          result = mergeSyncResult(result, await conversation.syncToDisk(nativeDir, forceOverwriteList, true))
        }

        // Mark snapshot as synced after successful sync
        if (snapshotResult?.snapshotId) {
          await conversation.markSnapshotAsSynced(snapshotResult.snapshotId)
        }

        if (result.failed > 0) {
          console.error(`[PendingSyncPanel] ${result.failed} files failed to sync`)
          const conflictHint =
            result.conflicts.length > 0
              ? t('settings.pendingSyncPanel.conflictCount', { count: result.conflicts.length })
              : ''
          setSyncError(t('settings.pendingSyncPanel.syncFailedCount', { failed: result.failed, conflicts: conflictHint }))
          setConflictPaths(new Set(result.conflicts.map((c) => c.path)))
          setTimeout(() => setSyncError(null), 6000)
          return false
        }
      }

      // Refresh list after sync (supports partial sync)
      await useConversationContextStore.getState().refreshPendingChanges(true)
      setConflictPaths((prev) => {
        const synced = new Set(pathsToSync)
        const next = new Set<string>()
        for (const path of prev) {
          if (!synced.has(path)) next.add(path)
        }
        return next
      })
      setSelectedItems(new Set())
      setSelectAll(false)

      // Show success feedback
      setShowSyncSuccess(true)
      setSyncError(null)
      setTimeout(() => setShowSyncSuccess(false), 3000)
      return true
    } catch (err) {
      console.error('[PendingSyncPanel] Sync failed:', err)
      setSyncError(err instanceof Error ? err.message : t('settings.pendingSyncPanel.syncFailed'))
      setTimeout(() => setSyncError(null), 5000)
      return false
    } finally {
      setIsSyncing(false)
    }
  }, [pendingChanges, isSyncing, mergeSyncResult, t])

  // Handle approve button click: show dialog first
  const handleSync = useCallback(async () => {
    if (!pendingChanges || pendingChanges.changes.length === 0 || isSyncing) return
    if (selectedItems.size === 0) return
    const filesToSync = pendingChanges.changes.filter((c) => selectedItems.has(c.path))
    const paths = filesToSync.map((c) => c.path)
    if (paths.length === 0) return

    // Detect conflicts first
    try {
      const activeConversation = await getActiveConversation()
      if (activeConversation) {
        const nativeDir = await activeConversation.conversation.getNativeDirectoryHandle()
        if (nativeDir) {
          const conflicts = await activeConversation.conversation.detectSyncConflicts(nativeDir, paths)

          if (conflicts.length > 0) {
            setConflictPaths(new Set(conflicts.map((c) => c.path)))
            setPendingApprovePaths(paths)
            setForceOverwritePaths(new Set())
            setSkippedConflictPaths(new Set())
            setConflictQueue(conflicts.map(toConflictDetail))
            setConflictIndex(0)
            return
          }
          setConflictPaths(new Set())
        }
      }
    } catch {
      // Conflict detection failed, continue with approval
    }

    // No conflicts, show approval dialog
    setPendingApprovePaths(paths)
    setSnapshotSummary('')
    setGeneratingSummary(false)
    setSummaryError(null)
    setApproveDialogOpen(true)
  }, [pendingChanges, isSyncing, selectedItems, toConflictDetail])

  const handleConflictResolve = useCallback(async (resolution: 'opfs' | 'native' | 'skip') => {
    const current = activeConflict
    if (!current) return

    const nextForce = new Set(forceOverwritePaths)
    const nextSkipped = new Set(skippedConflictPaths)

    if (resolution === 'opfs') {
      nextForce.add(current.path)
    } else {
      nextSkipped.add(current.path)
      if (resolution === 'native') {
        try {
          await discardPendingPath(current.path)
          await useConversationContextStore.getState().refreshPendingChanges(true)
        } catch (error) {
          const message = error instanceof Error ? error.message : t('settings.pendingSyncPanel.keepNativeVersionFailed')
          toast.error(message)
          return
        }
      }
      setConflictPaths((prev) => {
        const next = new Set(prev)
        next.delete(current.path)
        return next
      })
    }

    setForceOverwritePaths(nextForce)
    setSkippedConflictPaths(nextSkipped)

    const nextIndex = conflictIndex + 1
    if (nextIndex < conflictQueue.length) {
      setConflictIndex(nextIndex)
      return
    }

    setConflictQueue([])
    setConflictIndex(0)

    const nextPaths = pendingApprovePaths.filter((path) => !nextSkipped.has(path))
    if (nextPaths.length === 0) {
      setPendingApprovePaths([])
      toast.info(t('settings.pendingSyncPanel.noFilesToSyncAfterConflict'))
      return
    }

    setPendingApprovePaths(nextPaths)
    setSnapshotSummary('')
    setGeneratingSummary(false)
    setSummaryError(null)
    setApproveDialogOpen(true)
  }, [
    activeConflict,
    conflictIndex,
    conflictQueue.length,
    discardPendingPath,
    forceOverwritePaths,
    pendingApprovePaths,
    skippedConflictPaths,
    t,
  ])

  const handleConflictCancel = useCallback(() => {
    setConflictQueue([])
    setConflictIndex(0)
    setForceOverwritePaths(new Set())
    setSkippedConflictPaths(new Set())
  }, [])

  const handleReview = useCallback(async () => {
    if (!pendingChanges || pendingChanges.changes.length === 0 || isReviewing) return

    const filesToReview = selectedItems.size > 0
      ? pendingChanges.changes.filter((c) => selectedItems.has(c.path))
      : pendingChanges.changes

    if (filesToReview.length === 0) return

    setIsReviewing(true)
    try {
      await sendChangeReviewToConversation(filesToReview)
      toast.success(t('settings.pendingSyncPanel.reviewRequestSent'))
    } catch (error) {
      let message = t('settings.pendingSyncPanel.sendReviewRequestFailed')
      if (error instanceof Error) {
        const errorKey = error.message as (typeof ReviewErrorKey)[keyof typeof ReviewErrorKey]
        if (Object.values(ReviewErrorKey).includes(errorKey)) {
          message = t(`settings.pendingSyncPanel.${errorKey}`)
        } else {
          message = error.message
        }
      }
      toast.error(message)
    } finally {
      setIsReviewing(false)
    }
  }, [pendingChanges, selectedItems, isReviewing, t])

  // Show empty state when no pending changes
  if (isEmpty) {
    return (
      <div className="flex flex-col h-full">
        <SidebarPanelHeader title={t('settings.pendingSyncPanel.title')} />

        {/* Empty State */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-20 transition-opacity duration-500 hover:opacity-30">✓</div>
            <p className="text-sm font-medium text-secondary">{t('settings.pendingSyncPanel.noPendingChanges')}</p>
            <p className="text-xs text-tertiary mt-1">{t('settings.pendingSyncPanel.newChangesAppearHere')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Success Toast Notification */}
      {showSyncSuccess && (
        <div className="mx-3 mt-2 px-3 py-2 bg-success/20 text-success text-sm rounded-lg flex items-center gap-2 animate-fade-in-down">
          <Check className="w-4 h-4" />
          {t('settings.pendingSyncPanel.reviewSuccess')}
        </div>
      )}

      {/* Error Toast Notification */}
      {syncError && (
        <div className="mx-3 mt-2 px-3 py-2 bg-danger/20 text-danger text-sm rounded-lg flex items-center gap-2 animate-fade-in-down">
          <AlertTriangle className="w-4 h-4" />
          {syncError}
        </div>
      )}

      {/* Header with count */}
      <SidebarPanelHeader
        title={t('settings.pendingSyncPanel.title')}
        leftExtra={
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-warning/20 text-warning text-xs font-semibold rounded-full animate-pulse-on-change">
              {pendingChanges.changes.length}
            </span>
            <button
              onClick={handleRefresh}
              className="h-6 w-6 flex items-center justify-center text-tertiary hover:text-primary transition-colors rounded hover:bg-hover/50"
              title={t('settings.pendingSyncPanel.refreshTooltip')}
              type="button"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <button
              onClick={handleOpenPreview}
              className="h-6 w-6 flex items-center justify-center text-tertiary hover:text-primary transition-colors rounded hover:bg-hover/50"
              title={t('settings.pendingSyncPanel.viewDetailsTooltip')}
              type="button"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        }
        right={
          <div className="flex items-center gap-1">
            {selectedCount > 0 && (
              <span className="text-xs text-secondary">{selectedCount}</span>
            )}
            <button
              onClick={handleReview}
              disabled={isSyncing || isReviewing}
              className="h-6 w-6 flex items-center justify-center text-tertiary hover:text-primary transition-colors rounded hover:bg-hover/50 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isReviewing ? t('settings.pendingSyncPanel.reviewInProgress') : t('settings.pendingSyncPanel.review')}
              type="button"
            >
              {isReviewing ? (
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
            </button>
          </div>
        }
      />

      {/* File List */}
      <div
        ref={listRef}
        role="listbox"
        aria-label={t('settings.pendingSyncPanel.title')}
        className="flex-1 overflow-y-auto custom-scrollbar"
      >
        <div className="divide-y divide-subtle/50">
          {pendingChanges.changes.map((change, index) => {
            const typeInfo = getChangeTypeInfo(change.type)
            const isSelected = selectedItems.has(change.path)
            const hasConflict = conflictPaths.has(change.path)

            return (
              <div
                key={`${change.path}-${index}`}
                role="option"
                aria-selected={isSelected}
                className={`group flex items-center gap-2 px-2 h-7 transition-all cursor-pointer ${
                  isSelected ? 'bg-primary-50/50' : 'hover:bg-hover'
                }`}
                onClick={() => handleOpenPreviewForPath(change.path)}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleSelect(change.path)}
                  className="w-3.5 h-3.5 rounded border-subtle text-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0 cursor-pointer transition-shadow"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${t('settings.pendingSyncPanel.selectFile')} ${change.path.split('/').pop() || change.path}`}
                />

                {/* File Icon */}
                <span className="text-tertiary flex-shrink-0">
                  <FileIcon filename={change.path} className="w-3.5 h-3.5" />
                </span>

                {/* File Name */}
                <span className="flex-1 text-xs font-medium text-primary truncate min-w-0" title={change.path}>
                  {change.path.split('/').pop() || change.path}
                </span>

                {/* Type Badge */}
                {hasConflict && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded flex-shrink-0 bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                    C
                  </span>
                )}
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-semibold rounded flex-shrink-0 ${typeInfo.bg} ${typeInfo.color}`}
                >
                  {typeInfo.label}
                </span>

                {/* File Size */}
                <span className="text-xs text-tertiary flex-shrink-0 w-14 text-right">
                  {formatFileSize(change.size)}
                </span>

                {/* Remove Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleRemoveFile(change.path)
                  }}
                  className="p-0.5 text-tertiary hover:text-danger transition-colors rounded hover:bg-danger/10 active:bg-danger/20 flex-shrink-0"
                  title={t('settings.pendingSyncPanel.removeFromList')}
                  type="button"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-subtle bg-elevated border-t">
        {/* Row 1: Select all + Total size */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={handleToggleSelectAll}
              className="w-4 h-4 rounded border-subtle text-primary focus:ring-2 focus:ring-primary/50"
              aria-label={t('settings.pendingSyncPanel.selectAll')}
            />
            <span>{t('settings.pendingSyncPanel.selectAll')}</span>
          </label>
          <span className="text-xs text-tertiary">
            {t('settings.pendingSyncPanel.totalSize', { size: formatFileSize(totalSize) })}
          </span>
        </div>

        {/* Row 2: Action buttons */}
        <div className="flex items-center gap-2 px-3 pb-2">
          <BrandButton
            variant="outline"
            className="h-8 flex-1 text-xs"
            onClick={() => setShowClearConfirm(true)}
            disabled={isSyncing || isReviewing}
            aria-label={t('settings.pendingSyncPanel.rejectAll')}
          >
            {t('settings.pendingSyncPanel.reject')}
          </BrandButton>
          <BrandButton
            variant="primary"
            className="h-8 flex-1 text-xs"
            onClick={handleSync}
            disabled={isSyncing || isReviewing || selectedCount === 0}
            aria-label={t('settings.pendingSyncPanel.approveSelected')}
          >
            {isSyncing ? (
              <>
                <div className={`w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin`} />
                {t('settings.pendingSyncPanel.approvingInProgress')}
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                {showSyncSuccess ? t('settings.pendingSyncPanel.syncComplete') : t('settings.pendingSyncPanel.approveSelectedCount', { count: selectedCount })}
              </>
            )}
          </BrandButton>
        </div>
      </div>

      {/* Clear Confirmation Dialog */}
      <BrandDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('settings.pendingSyncPanel.confirmRejectTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="text-sm text-secondary">
              {t('settings.pendingSyncPanel.confirmRejectMessage')}
            </p>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setShowClearConfirm(false)}
            >
              {t('settings.pendingSyncPanel.cancel')}
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={() => {
                handleClear()
                setShowClearConfirm(false)
              }}
            >
              {t('settings.pendingSyncPanel.confirmReject')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      <SnapshotApprovalDialog
        open={approveDialogOpen}
        pendingCount={pendingApprovePaths.length}
        summary={snapshotSummary}
        summaryError={summaryError}
        generatingSummary={generatingSummary}
        isSyncing={isSyncing}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && generatingSummary) {
            summaryAbortRef.current?.abort()
            summaryAbortRef.current = null
          }
          setApproveDialogOpen(nextOpen)
        }}
        onSummaryChange={setSnapshotSummary}
        onGenerateSummary={async () => {
          summaryAbortRef.current?.abort()
          const controller = new AbortController()
          summaryAbortRef.current = controller
          setGeneratingSummary(true)
          setSnapshotSummary('')
          const aiSummary = await generateSummaryWithLLM(
            pendingApprovePaths,
            (chunk) => setSnapshotSummary(chunk),
            controller.signal,
          )
          // Only update state if this controller is still the active one
          // (prevents a cancelled first call from resetting spinner during a second call)
          if (summaryAbortRef.current !== controller) return
          if (controller.signal.aborted) {
            // Cancelled — don't update summary/error
          } else if (aiSummary && aiSummary.trim().length > 0) {
            setSnapshotSummary(aiSummary.trim())
            setSummaryError(null)
          } else {
            setSummaryError(t('settings.pendingSyncPanel.aiSummaryFailed'))
          }
          setGeneratingSummary(false)
          summaryAbortRef.current = null
        }}
        onConfirm={async () => {
          const ok = await runSync(pendingApprovePaths, snapshotSummary, forceOverwritePaths)
          if (ok) setApproveDialogOpen(false)
        }}
      />

      {activeConflict && (
        <ConflictResolutionDialog
          conflict={activeConflict}
          onResolve={handleConflictResolve}
          onCancel={handleConflictCancel}
        />
      )}
    </div>
  )
}
