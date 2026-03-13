/**
 * SyncPreviewPanel Component
 *
 * Main control panel for sync preview UI.
 * Orchestrates FileChangeList and FileDiffViewer.
 * Provides sync/cancel actions.
 *
 * Part of Phase 3: Sync Preview UI
 */

import React, { useState, useCallback } from 'react'
import { type FileChange } from '@/opfs/types/opfs-types'
import { useWorkspaceStore, getActiveWorkspace } from '@/store/workspace.store'
import { BrandButton } from '@creatorweave/ui'
import { Badge } from '@/components/ui/badge'
import { PendingFileList } from './PendingFileList'
import { FileDiffViewer } from './FileDiffViewer'
import { ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react'

/**
 * Empty state when no changes detected
 */
function EmptyState(): React.ReactNode {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16 px-6">
      <div className="w-16 h-16 rounded-xl bg-primary-50/80 dark:bg-primary-950/20 flex items-center justify-center mb-4 shadow-sm">
        <svg
          className="w-10 h-10 text-primary-500 dark:text-primary-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7h12m0 0l-4-4m4 4l4 4m0 6H4m0 0l4 4m-4-4l-4 4"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3">准备同步</h2>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md leading-relaxed">
        执行 Python 代码后，检测到的文件系统变更将在此处显示。
        您可以预览变更详情，然后选择是否同步到本机文件系统。
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 max-w-sm">
        <div className="flex items-start gap-3 p-4 bg-primary-50 dark:bg-primary-950/20 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-300 text-sm font-medium">
            1
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
              执行 Python 代码
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              在 Agent 对话中执行 Python 文件操作代码
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 bg-primary-50 dark:bg-primary-950/20 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-300 text-sm font-medium">
            2
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
              预览文件变更
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              查看所有修改、新增和删除的文件
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 bg-primary-50 dark:bg-primary-950/20 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-300 text-sm font-medium">
            3
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
              确认并同步
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              检查差异后，将变更同步到本机文件系统
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export interface SyncPreviewPanelProps {
  /** Callback when sync is confirmed */
  onSync?: () => void
  /** Callback when sync is cancelled */
  onCancel?: () => void
}

export const SyncPreviewPanel: React.FC<SyncPreviewPanelProps> = ({
  onSync,
  onCancel,
}) => {
  const pendingChanges = useWorkspaceStore((state) => state.pendingChanges)
  const clearChanges = useWorkspaceStore((state) => state.clearChanges)
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null)
  const selectedPath = selectedFile?.path
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  
  // Selection state for selective sync
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  /**
   * Handle file selection from list
   */
  const handleSelectFile = useCallback((file: FileChange) => {
    setSelectedFile(file)
    setSyncError(null)
  }, [])

  /**
   * Handle sync confirmation
   * @param selectedPaths - Optional array of selected file paths to sync. If empty, sync all.
   */
  const handleSync = useCallback(async (selectedPaths: string[] = []) => {
    if (!pendingChanges || isSyncing) return

    setIsSyncing(true)
    setSyncError(null)

    try {
      // Get active workspace
      const activeWorkspace = await getActiveWorkspace()
      if (!activeWorkspace) {
        throw new Error('No active workspace')
      }

      // Get Native FS directory handle
      const { workspace } = activeWorkspace
      const nativeDir = await workspace.getNativeDirectoryHandle()
      if (!nativeDir) {
        throw new Error('请先选择项目目录')
      }

      // Determine which files to sync: selected items or all
      const filesToSync = selectedPaths.length > 0
        ? pendingChanges.changes.filter(c => selectedPaths.includes(c.path))
        : pendingChanges.changes

      // Sync via unified pending pipeline (cache-backed)
      const result = await workspace.syncToDisk(
        nativeDir,
        filesToSync.map((c) => c.path)
      )

      // Show sync result
      if (result.failed > 0) {
        setSyncError(`${result.failed} 个文件同步失败`)
      }

      // Refresh pending snapshot after sync (supports partial sync)
      await useWorkspaceStore.getState().refreshPendingChanges(true)
      const latestChanges = useWorkspaceStore.getState().pendingChanges?.changes ?? []
      if (!latestChanges.some((c) => c.path === selectedPath)) {
        setSelectedFile(null)
      }
      onSync?.()
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : '同步失败')
    } finally {
      setIsSyncing(false)
      // Clear selection after sync
      setSelectedItems(new Set())
    }
  }, [pendingChanges, isSyncing, onSync, selectedPath])

  /**
   * Handle close (just close the panel, don't clear pending changes)
   */
  const handleClose = useCallback(() => {
    setSelectedFile(null)
    setSyncError(null)
    onCancel?.()
  }, [onCancel])

  /**
   * Handle clear all pending changes (user decides not to sync)
   */
  const handleClear = useCallback(() => {
    clearChanges()
    setSelectedFile(null)
    setSyncError(null)
    setSelectedItems(new Set())
  }, [clearChanges])

  /**
   * Handle removing a single file from pending list
   */
  const handleRemoveFile = useCallback(
    (path: string) => {
      if (!pendingChanges) return

      // Remove the file from changes
      const updatedChanges = {
        ...pendingChanges,
        changes: pendingChanges.changes.filter((c) => c.path !== path),
      }

      // Update counts based on removed file type
      const removedFile = pendingChanges.changes.find((c) => c.path === path)
      if (!removedFile) return

      // Update store with filtered changes
      useWorkspaceStore.getState().addChanges(updatedChanges)
    },
    [pendingChanges]
  )

  // Show empty state when no changes
  if (!pendingChanges || pendingChanges.changes.length === 0) {
    return <EmptyState />
  }

  const totalFiles = pendingChanges.changes.length

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4 bg-card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">同步预览</h2>
          <div className="flex items-center gap-2">
            {syncError && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {syncError}
              </span>
            )}
            <BrandButton variant="ghost" onClick={handleClose} disabled={isSyncing}>
              关闭
            </BrandButton>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-6 text-sm">
          <span className="text-muted-foreground">
            检测到{' '}
            <span className="font-semibold text-foreground">{totalFiles}</span>{' '}
            个文件变更
          </span>
          <div className="flex items-center gap-3 text-xs">
            {pendingChanges.added > 0 && (
              <Badge variant="success" className="gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                {pendingChanges.added} 新增
              </Badge>
            )}
            {pendingChanges.modified > 0 && (
              <Badge variant="outline" className="gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                {pendingChanges.modified} 修改
              </Badge>
            )}
            {pendingChanges.deleted > 0 && (
              <Badge variant="error" className="gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {pendingChanges.deleted} 删除
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Split View */}
      {!selectedFile ? (
        // 显示紧凑列表（未选择文件时）
        <div className="flex-1 overflow-hidden">
          <PendingFileList
            changes={pendingChanges}
            onSelectFile={handleSelectFile}
            selectedPath={undefined}
            onSync={handleSync}
            onClear={handleClear}
            onRemoveFile={handleRemoveFile}
            isSyncing={isSyncing}
            selectedItems={selectedItems}
            onSelectionChange={setSelectedItems}
          />
        </div>
      ) : (
        // 显示差分对比（选择文件后）
        <div className="flex-1 flex overflow-hidden">
          {/* Back to List Button */}
          <div className="w-12 flex-shrink-0 border-r flex items-center justify-center bg-muted/50">
            <BrandButton variant="ghost" onClick={() => setSelectedFile(null)} title="返回列表">
              <ArrowLeft className="w-5 h-5" />
            </BrandButton>
          </div>

          {/* Diff Viewer */}
          <div className="flex-1">
            <FileDiffViewer fileChange={selectedFile} />
          </div>
        </div>
      )}

      {/* Footer Actions - Only show when in list view */}
      {!selectedFile && (
        <div className="px-6 py-4 border-t bg-muted/50">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            点击文件查看变更详情，或使用上方按钮进行批量操作
          </div>
        </div>
      )}
    </div>
  )
}
