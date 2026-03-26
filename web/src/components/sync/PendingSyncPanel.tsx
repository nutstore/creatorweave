/**
 * PendingSyncPanel - 侧边栏变更面板
 *
 * 方案 A: 极简紧凑版
 * - 单行紧凑显示，最大化空间利用
 * - 全选/批量操作
 * - 无额外滚动，集成在侧边栏
 */

import React, { useState, useCallback, useMemo, useEffect as useReactEffect } from 'react'
import { isImageFile, readFileFromNativeFS, readFileFromOPFS } from '@/opfs'
import { useConversationContextStore, getActiveConversation } from '@/store/conversation-context.store'
import { useSettingsStore } from '@/store/settings.store'
import { getApiKeyRepository } from '@/sqlite'
import { createLLMProvider } from '@/agent/llm/provider-factory'
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
import { sendChangeReviewToConversation } from './review-request'
import { toast } from 'sonner'

export function PendingSyncPanel() {
  const pendingChanges = useConversationContextStore((state) => state.pendingChanges)
  const clearChanges = useConversationContextStore((state) => state.clearChanges)
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
  const listRef = React.useRef<HTMLDivElement>(null)

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
        handleSync()
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

  // Handle open preview panel
  const handleOpenPreview = useCallback(() => {
    const { showPreviewPanel } = useConversationContextStore.getState()
    showPreviewPanel()
  }, [])

  const handleOpenPreviewForPath = useCallback((path: string) => {
    const { showPreviewPanelForPath } = useConversationContextStore.getState()
    showPreviewPanelForPath(path)
  }, [])

  // 计算选中的数量
  const selectedCount = selectedItems.size

  // 空状态
  const isEmpty = !pendingChanges || pendingChanges.changes.length === 0

  // 计算总大小 (必须在所有条件返回之前定义，保持hooks顺序一致)
  const totalSize = useMemo(() => {
    if (!pendingChanges) return 0
    return pendingChanges.changes.reduce((sum, c) => sum + (c.size || 0), 0)
  }, [pendingChanges])

  // 处理单个文件选择/取消选择 (必须在条件返回之前定义)
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

  // 处理全选/取消全选 (必须在条件返回之前定义)
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

  // 处理删除单个文件 (必须在条件返回之前定义)
  const handleRemoveFile = useCallback(async (path: string) => {
    await discardPendingPath(path)
  }, [discardPendingPath])

  // 处理拒绝全部 (必须在条件返回之前定义)
  const handleClear = useCallback(async () => {
    await clearChanges()
    setSelectedItems(new Set())
    setSelectAll(false)
    setShowClearConfirm(false)
  }, [clearChanges])

  const generateSummaryWithLLM = useCallback(async (paths: string[]): Promise<string | null> => {
    try {
      const activeConversation = await getActiveConversation()
      if (!activeConversation) return null
      const { conversation, conversationId } = activeConversation
      const nativeDir = await conversation.getNativeDirectoryHandle()

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
          const text = await readFileFromNativeFS(nativeDir, change.path)
          beforeText = text ?? ''
        }
        if (change.type !== 'delete') {
          const text = await readFileFromOPFS(conversationId, change.path)
          afterText = text ?? ''
        }
        diffInputs.push({
          path: change.path,
          beforeText: beforeText.slice(0, 2000),
          afterText: afterText.slice(0, 2000),
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

      const prompt = buildSnapshotSummaryPrompt(selectedChanges.length, changesText, diffSections)

      const response = await provider.chat({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 220,
      })
      const content = response.choices[0]?.message?.content?.trim()
      if (!content) return null
      return content.slice(0, 3000)
    } catch {
      return null
    }
  }, [pendingChanges])

  const runSync = useCallback(async (pathsToSync: string[], summary: string) => {
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

      // 创建审批快照（无论是否有本地目录都可以）
      const snapshotResult = await conversation.createApprovedSnapshotForPaths(
        filesToSync.map((c) => c.path),
        summary.trim(),
        nativeDir
      )

      // 只有在有本地目录时才同步到磁盘
      if (nativeDir) {
        // 执行同步（统一走 pending/cache 同步链路）
        const result = await conversation.syncToDisk(
          nativeDir,
          filesToSync.map((c) => c.path)
        )

        // 同步成功后标记快照为已同步
        if (snapshotResult?.snapshotId) {
          await conversation.markSnapshotAsSynced(snapshotResult.snapshotId)
        }

        if (result.failed > 0) {
          console.error(`[PendingSyncPanel] ${result.failed} files failed to sync`)
          const conflictHint =
            result.conflicts.length > 0
              ? `，其中 ${result.conflicts.length} 个存在冲突`
              : ''
          setSyncError(`${result.failed} 个文件审批应用失败${conflictHint}`)
          setTimeout(() => setSyncError(null), 6000)
          return false
        }
      }

      // 同步后刷新列表（支持部分同步）
      await useConversationContextStore.getState().refreshPendingChanges(true)
      setSelectedItems(new Set())
      setSelectAll(false)

      // Show success feedback
      setShowSyncSuccess(true)
      setSyncError(null)
      setTimeout(() => setShowSyncSuccess(false), 3000)
      return true
    } catch (err) {
      console.error('[PendingSyncPanel] Sync failed:', err)
      setSyncError(err instanceof Error ? err.message : '审批失败，请重试')
      setTimeout(() => setSyncError(null), 5000)
      return false
    } finally {
      setIsSyncing(false)
    }
  }, [pendingChanges, isSyncing, selectedItems])

  // 处理审批按钮点击：先弹窗
  const handleSync = useCallback(async () => {
    if (!pendingChanges || pendingChanges.changes.length === 0 || isSyncing) return
    const filesToSync = selectedItems.size > 0
      ? pendingChanges.changes.filter((c) => selectedItems.has(c.path))
      : pendingChanges.changes
    const paths = filesToSync.map((c) => c.path)
    if (paths.length === 0) return

    setPendingApprovePaths(paths)
    setSnapshotSummary('')
    setSummaryError(null)
    setApproveDialogOpen(true)

    setGeneratingSummary(true)
    const aiSummary = await generateSummaryWithLLM(paths)
    if (aiSummary && aiSummary.trim().length > 0) {
      setSnapshotSummary(aiSummary.trim())
      setSummaryError(null)
    } else {
      setSummaryError('AI 生成失败，请手动填写')
      toast.warning('AI 生成快照描述失败，请手动填写')
    }
    setGeneratingSummary(false)
  }, [pendingChanges, isSyncing, selectedItems, generateSummaryWithLLM])

  const handleReview = useCallback(async () => {
    if (!pendingChanges || pendingChanges.changes.length === 0 || isReviewing) return

    const filesToReview = selectedItems.size > 0
      ? pendingChanges.changes.filter((c) => selectedItems.has(c.path))
      : pendingChanges.changes

    if (filesToReview.length === 0) return

    setIsReviewing(true)
    try {
      await sendChangeReviewToConversation(filesToReview)
      toast.success('已发送变更审阅请求')
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送审阅请求失败'
      toast.error(message)
    } finally {
      setIsReviewing(false)
    }
  }, [pendingChanges, selectedItems, isReviewing])

  // 没有变更文件时显示空状态
  if (isEmpty) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-subtle flex items-center gap-2 border-b bg-elevated px-2 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">变更文件</span>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-20 transition-opacity duration-500 hover:opacity-30">✓</div>
            <p className="text-sm font-medium text-secondary">当前没有待审阅变更</p>
            <p className="text-xs text-tertiary mt-1">新变更会自动显示在此处</p>
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
          审批成功！
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
      <div className="border-subtle flex items-center justify-between border-b bg-elevated px-2 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">变更文件</span>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-warning/20 text-warning text-xs font-semibold rounded-full animate-pulse-on-change">
              {pendingChanges.changes.length}
            </span>
            <button
              onClick={handleRefresh}
              className="h-6 w-6 flex items-center justify-center text-tertiary hover:text-primary transition-colors rounded hover:bg-hover/50"
              title="刷新列表"
              type="button"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <button
              onClick={handleOpenPreview}
              className="h-6 w-6 flex items-center justify-center text-tertiary hover:text-primary transition-colors rounded hover:bg-hover/50"
              title="查看详情"
              type="button"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
        {selectedCount > 0 && (
          <span className="text-xs text-secondary">{selectedCount} 已选</span>
        )}
      </div>

      {/* File List */}
      <div
        ref={listRef}
        role="listbox"
        aria-label="变更文件列表"
        className="flex-1 overflow-y-auto custom-scrollbar"
      >
        <div className="divide-y divide-subtle/50">
          {pendingChanges.changes.map((change, index) => {
            const typeInfo = getChangeTypeInfo(change.type)
            const isSelected = selectedItems.has(change.path)

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
                  aria-label={`选择 ${change.path.split('/').pop() || change.path}`}
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
                  onClick={() => handleRemoveFile(change.path)}
                  className="p-0.5 text-tertiary hover:text-danger transition-colors rounded hover:bg-danger/10 active:bg-danger/20 flex-shrink-0"
                  title="从列表中移除"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-subtle flex items-center justify-between border-t bg-elevated px-3 py-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={handleToggleSelectAll}
              className="w-4 h-4 rounded border-subtle text-primary focus:ring-2 focus:ring-primary/50"
              aria-label="全选所有文件"
            />
            <span>全选</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <BrandButton
            variant="outline"
            className="h-8 px-3 py-1.5 text-xs"
            onClick={handleReview}
            disabled={isSyncing || isReviewing}
            aria-label="一键审阅变更"
          >
            {isReviewing ? (
              '审阅中...'
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                审阅
              </>
            )}
          </BrandButton>
          <BrandButton
            variant="outline"
            className="h-8 px-3 py-1.5 text-xs"
            onClick={() => setShowClearConfirm(true)}
            disabled={isSyncing || isReviewing}
            aria-label="拒绝全部变更"
          >
            拒绝
          </BrandButton>
          <BrandButton
            variant="primary"
            className="h-8 px-4 py-1.5 text-xs"
            onClick={handleSync}
            disabled={isSyncing || isReviewing}
            aria-label="审批通过所选变更"
          >
            {isSyncing ? (
              <>
                <div className={`w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin`} />
                审批中...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                {showSyncSuccess ? '完成!' : selectedCount > 0 ? `审批选中 (${selectedCount})` : '审批全部'}
              </>
            )}
          </BrandButton>
        </div>
      </div>

      {/* Total Size Info */}
      <div className="border-subtle bg-elevated border-t px-3 py-1.5 text-center">
        <span className="text-xs text-tertiary">
          总计 {formatFileSize(totalSize)}
        </span>
      </div>

      {/* Clear Confirmation Dialog */}
      <BrandDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>确认拒绝</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="text-sm text-secondary">
              确定要拒绝所有变更吗？此操作无法撤销。
            </p>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              onClick={() => setShowClearConfirm(false)}
            >
              取消
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={() => {
                handleClear()
                setShowClearConfirm(false)
              }}
            >
              确认拒绝
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
        onOpenChange={setApproveDialogOpen}
        onSummaryChange={setSnapshotSummary}
        onGenerateSummary={async () => {
          setGeneratingSummary(true)
          const aiSummary = await generateSummaryWithLLM(pendingApprovePaths)
          if (aiSummary && aiSummary.trim().length > 0) {
            setSnapshotSummary(aiSummary.trim())
            setSummaryError(null)
          } else {
            setSummaryError('AI 生成失败，请手动填写')
          }
          setGeneratingSummary(false)
        }}
        onConfirm={async () => {
          const ok = await runSync(pendingApprovePaths, snapshotSummary)
          if (ok) setApproveDialogOpen(false)
        }}
      />
    </div>
  )
}
