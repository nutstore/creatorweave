/**
 * PendingSyncPanel - 侧边栏待同步文件面板
 *
 * 方案 A: 极简紧凑版
 * - 单行紧凑显示，最大化空间利用
 * - 全选/批量操作
 * - 无额外滚动，集成在侧边栏
 */

import React, { useState, useCallback, useMemo, useEffect as useReactEffect } from 'react'
import { useWorkspaceStore, getActiveWorkspace } from '@/store/workspace.store'
import { BrandButton } from '@browser-fs-analyzer/ui'
import { RefreshCw } from 'lucide-react'
import { getChangeTypeInfo, formatFileSize, FileIcon } from '@/utils/change-helpers'

export function PendingSyncPanel() {
  const pendingChanges = useWorkspaceStore((state) => state.pendingChanges)
  const clearChanges = useWorkspaceStore((state) => state.clearChanges)
  const [selectAll, setSelectAll] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isSyncing, setIsSyncing] = useState(false)
  const [showSyncSuccess, setShowSyncSuccess] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)

  // Handle keyboard shortcuts
  useReactEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        handleToggleSelectAll()
      }
      // Ctrl/Cmd + Enter: Sync
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
      const { refreshPendingChanges } = useWorkspaceStore.getState()
      await refreshPendingChanges()
    }
    refreshOnMount()
  }, [])

  // Handle manual refresh
  const handleRefresh = useCallback(async () => {
    const { refreshPendingChanges } = useWorkspaceStore.getState()
    await refreshPendingChanges()
  }, [])

  // Handle open preview panel
  const handleOpenPreview = useCallback(() => {
    const { showPreviewPanel } = useWorkspaceStore.getState()
    showPreviewPanel()
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
  const handleRemoveFile = useCallback(
    (path: string) => {
      if (!pendingChanges) return

      // Remove file from changes
      const updatedChanges = {
        ...pendingChanges,
        changes: pendingChanges.changes.filter((c) => c.path !== path),
      }

      // Update store with filtered changes
      useWorkspaceStore.getState().addChanges(updatedChanges)
    },
    [pendingChanges]
  )

  // 处理清空列表 (必须在条件返回之前定义)
  const handleClear = useCallback(() => {
    clearChanges()
    setSelectedItems(new Set())
    setSelectAll(false)
    setShowClearConfirm(false)
  }, [clearChanges])

  // 处理同步 (必须在条件返回之前定义)
  const handleSync = useCallback(async () => {
    if (!pendingChanges || pendingChanges.changes.length === 0 || isSyncing) return

    setIsSyncing(true)

    try {
      const activeWorkspace = await getActiveWorkspace()

      if (!activeWorkspace) {
        console.error('[PendingSyncPanel] No active workspace')
        return
      }

      const { workspace } = activeWorkspace
      const nativeDir = await workspace.getNativeDirectoryHandle()

      if (!nativeDir) {
        // 没有目录句柄，触发目录选择
        const store = useWorkspaceStore.getState()
        if (store.requestDirectoryAccess) {
          await store.requestDirectoryAccess()
        }
        return
      }

      // Determine which files to sync: selected items or all
      const filesToSync = selectedItems.size > 0
        ? pendingChanges.changes.filter(c => selectedItems.has(c.path))
        : pendingChanges.changes

      // 执行同步
      const result = await workspace.syncToNative(nativeDir, filesToSync)

      if (result.failed > 0) {
        console.error(`[PendingSyncPanel] ${result.failed} files failed to sync`)
      }

      // 同步后清空列表
      clearChanges()
      setSelectedItems(new Set())
      setSelectAll(false)

      // Show success feedback
      setShowSyncSuccess(true)
      setSyncError(null)
      setTimeout(() => setShowSyncSuccess(false), 3000)
    } catch (err) {
      console.error('[PendingSyncPanel] Sync failed:', err)
      setSyncError(err instanceof Error ? err.message : '同步失败，请重试')
      setTimeout(() => setSyncError(null), 5000)
    } finally {
      setIsSyncing(false)
    }
  }, [pendingChanges, isSyncing, clearChanges, selectedItems])

  // 没有待同步文件时显示空状态
  if (isEmpty) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-subtle flex items-center gap-2 border-b bg-elevated px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">待同步文件</span>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-20 transition-opacity duration-500 hover:opacity-30">✓</div>
            <p className="text-sm font-medium text-secondary">所有文件已同步</p>
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7l-7 7-7-7 7" />
          </svg>
          同步成功！
        </div>
      )}

      {/* Error Toast Notification */}
      {syncError && (
        <div className="mx-3 mt-2 px-3 py-2 bg-danger/20 text-danger text-sm rounded-lg flex items-center gap-2 animate-fade-in-down">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {syncError}
        </div>
      )}

      {/* Header with count */}
      <div className="border-subtle flex items-center justify-between border-b bg-elevated px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">待同步文件</span>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-warning/20 text-warning text-xs font-semibold rounded-full animate-pulse-on-change">
              {pendingChanges.changes.length}
            </span>
            <button
              onClick={handleRefresh}
              className="p-1 text-tertiary hover:text-primary transition-colors rounded hover:bg-hover/50"
              title="刷新列表"
              type="button"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleOpenPreview}
              className="p-1 text-tertiary hover:text-primary transition-colors rounded hover:bg-hover/50"
              title="查看详情"
              type="button"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
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
        aria-label="待同步文件列表"
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
                className={`group flex items-center gap-2 px-3 py-2 transition-all cursor-pointer ${
                  isSelected ? 'bg-primary-50/50' : 'hover:bg-hover'
                }`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleSelect(change.path)}
                  className="w-4 h-4 rounded border-subtle text-primary focus:ring-2 focus:ring-primary/50 focus:ring-offset-0 cursor-pointer transition-shadow"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`选择 ${change.path.split('/').pop() || change.path}`}
                />

                {/* File Icon */}
                <span className="text-tertiary flex-shrink-0">
                  <FileIcon filename={change.path} className="w-4 h-4" />
                </span>

                {/* File Name */}
                <span
                  className="flex-1 text-sm font-medium text-primary truncate min-w-0"
                  title={change.path}
                >
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
                  className="p-1 text-tertiary hover:text-danger transition-colors rounded hover:bg-danger/10 active:bg-danger/20 flex-shrink-0"
                  title="从列表中移除"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-subtle flex items-center justify-between border-t bg-elevated px-3 py-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
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
            onClick={() => setShowClearConfirm(true)}
            disabled={isSyncing}
            aria-label="清空列表"
          >
            清空
          </BrandButton>
          <BrandButton
            variant="primary"
            className="h-8 px-4 py-1.5 text-xs"
            onClick={handleSync}
            disabled={isSyncing}
            aria-label="同步所有文件到本机"
          >
            {isSyncing ? (
              <>
                <div className={`w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin`} />
                同步中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4 4h.01M5 8h14a1 1 0 110-1 0" />
                </svg>
                {showSyncSuccess ? '完成!' : selectedCount > 0 ? `同步选中 (${selectedCount})` : '同步全部'}
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
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-primary mb-2">确认清空</h3>
            <p className="text-sm text-secondary mb-4">
              确定要清空所有待同步文件吗？此操作无法撤销。
            </p>
            <div className="flex justify-end gap-2">
              <BrandButton
                variant="outline"
                onClick={() => setShowClearConfirm(false)}
              >
                取消
              </BrandButton>
              <BrandButton
                variant="primary"
                onClick={() => {
                  handleClear()
                  setShowClearConfirm(false)
                }}
                className="text-danger bg-danger hover:bg-danger/90 focus:ring-danger"
              >
                确认清空
              </BrandButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
