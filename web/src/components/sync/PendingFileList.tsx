/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PendingFileList Component - 紧凑变更列表
 *
 * 方案 A: 紧凑内联列表
 * - 单行紧凑显示文件
 * - 支持全选/批量操作
 * - 支持单个文件删除
 * - hover 预览效果
 * - HTML 文件右键审查元素
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { type ChangeDetectionResult, type FileChange } from '@/opfs/types/opfs-types'
import { getChangeTypeInfo, formatFileSize, FileIcon } from '@/utils/change-helpers'
import { BrandButton, BrandCheckbox } from '@creatorweave/ui'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Trash2, X, ChevronDown, ChevronRight, MousePointer2, Copy } from 'lucide-react'
import { readFileFromOPFS } from '@/opfs'
import { getActiveConversation } from '@/store/conversation-context.store'

type SnapshotGroup = {
  key: string
  title: string
  status: 'draft' | 'committed' | 'approved' | 'rolled_back'
  summary?: string
  count: number
  changes: FileChange[]
  expanded: boolean
}

interface PendingFileListProps {
  /** Change detection result from workspace store */
  changes: ChangeDetectionResult
  /** Callback when user selects a file */
  onSelectFile?: (file: FileChange) => void
  /** Currently selected file path */
  selectedPath?: string
  /** Callback when user requests sync */
  onSync?: (selectedPaths: string[]) => void
  /** Callback when user requests clear all */
  onClear?: () => void
  /** Callback when user removes a single file */
  onRemoveFile?: (path: string) => void
  /** Whether sync operation is in progress */
  isSyncing?: boolean
  /** Currently selected items for sync (controlled) */
  selectedItems?: Set<string>
  /** Callback when selection changes */
  onSelectionChange?: (selected: Set<string>) => void
  /** Paths currently marked as conflicts */
  conflictPaths?: Set<string>
}

/** Check if a file path points to an HTML file */
function isHtmlFile(path: string): boolean {
  return path.toLowerCase().endsWith('.html') || path.toLowerCase().endsWith('.htm')
}

export const PendingFileList: React.FC<PendingFileListProps> = ({
  changes,
  onSelectFile,
  selectedPath,
  onSync,
  onClear,
  onRemoveFile,
  isSyncing = false,
  selectedItems: externalSelectedItems,
  onSelectionChange,
  conflictPaths = new Set<string>(),
}) => {
  // Internal state for uncontrolled mode (backward compatibility)
  const [internalSelectAll, setInternalSelectAll] = useState(false)
  const [internalSelectedItems, setInternalSelectedItems] = useState<Set<string>>(new Set())
  // snapshot 分组展开/折叠状态
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>({
    draft: true,
  })

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    change: FileChange
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Close context menu on outside click or escape
  useEffect(() => {
    if (!contextMenu) return

    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    // Delay to avoid the same right-click closing immediately
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKeyDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  // 按 snapshot 分组
  const groupedChanges = useMemo(() => {
    const groupsMap = new Map<string, Omit<SnapshotGroup, 'expanded'>>()
    for (const change of changes.changes) {
      const status = change.snapshotStatus || 'draft'
      const key = status === 'draft' ? 'draft' : (change.snapshotId || 'draft')
      const existing = groupsMap.get(key)
      if (existing) {
        existing.changes.push(change)
        existing.count += 1
        continue
      }
      groupsMap.set(key, {
        key,
        title: status === 'draft' ? '当前草稿' : `快照 ${key.slice(-8)}`,
        status,
        summary: status === 'draft' ? undefined : change.snapshotSummary,
        count: 1,
        changes: [change],
      })
    }

    return Array.from(groupsMap.values()).map((group) => ({
      ...group,
      expanded: groupExpanded[group.key] ?? true,
    }))
  }, [changes.changes, groupExpanded])

  // 切换 snapshot 分组展开/折叠
  const toggleGroup = useCallback((key: string) => {
    setGroupExpanded((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }))
  }, [])

  // Use external state if provided (controlled mode), otherwise use internal state
  const isControlled = externalSelectedItems !== undefined && onSelectionChange !== undefined
  const selectAll = isControlled 
    ? externalSelectedItems.size === changes.changes.length
    : internalSelectAll
  const selectedItems = isControlled ? externalSelectedItems : internalSelectedItems

  // 计算选中的数量
  const selectedCount = selectedItems.size

  // 处理单个文件选择/取消选择
  const handleToggleSelect = useCallback(
    (path: string) => {
      if (isControlled && onSelectionChange) {
        // Controlled mode: notify parent
        const newSelected = new Set(selectedItems)
        if (newSelected.has(path)) {
          newSelected.delete(path)
        } else {
          newSelected.add(path)
        }
        onSelectionChange(newSelected)
      } else {
        // Uncontrolled mode: update internal state
        const newSelected = new Set(selectedItems)
        if (newSelected.has(path)) {
          newSelected.delete(path)
        } else {
          newSelected.add(path)
        }
        setInternalSelectedItems(newSelected)
        setInternalSelectAll(newSelected.size === changes.changes.length - 1)
      }
    },
    [selectedItems, changes.changes.length, isControlled, onSelectionChange]
  )

  // 处理全选/取消全选
  const handleToggleSelectAll = useCallback(() => {
    const newSelectAll = !selectAll
    if (isControlled && onSelectionChange) {
      // Controlled mode
      if (newSelectAll) {
        onSelectionChange(new Set(changes.changes.map((c) => c.path)))
      } else {
        onSelectionChange(new Set())
      }
    } else {
      // Uncontrolled mode
      setInternalSelectAll(newSelectAll)
      if (newSelectAll) {
        setInternalSelectedItems(new Set(changes.changes.map((c) => c.path)))
      } else {
        setInternalSelectedItems(new Set())
      }
    }
  }, [selectAll, changes.changes, isControlled, onSelectionChange])

  // 处理删除单个文件
  const handleRemoveFile = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation() // 防止触发选择
      onRemoveFile?.(path)
    },
    [onRemoveFile]
  )

  // Handle right-click context menu for HTML files
  const handleContextMenu = useCallback((e: React.MouseEvent, change: FileChange) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, change })
  }, [])

  // Handle "Inspect Element" from context menu
  const handleInspectElement = useCallback(async (change: FileChange) => {
    setContextMenu(null)
    if (change.type === 'delete') return

    try {
      const activeConversation = await getActiveConversation()
      if (!activeConversation) return

      const { conversationId } = activeConversation
      const htmlContent = await readFileFromOPFS(conversationId, change.path)
      if (!htmlContent) return

      // Save to localStorage and open in new tab (same pattern as WorkspaceLayout.handleElementInspect)
      localStorage.setItem('preview-content-' + change.path, htmlContent)
      window.open(`/preview?path=${encodeURIComponent(change.path)}`, '_blank')
    } catch (err) {
      console.error('[PendingFileList] Failed to open inspector:', err)
    }
  }, [])

  // 检查是否有选中项
  const hasSelection = selectedCount > 0

  return (
    <div className="flex flex-col h-full">
      {/* 紧凑标题栏 */}
      <div className="border-subtle flex items-center justify-between border-b bg-elevated px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary">变更文件</span>
          <Badge variant="warning">{changes.changes.length}</Badge>
        </div>
        {hasSelection && (
          <span className="text-xs text-secondary">
            已选 {selectedCount} 项
          </span>
        )}
      </div>

      {/* 紧凑文件列表 - 按变更类型分组显示 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="divide-y divide-subtle/50">
          {groupedChanges.map((group) => {
            return (
              <div key={group.key}>
                {/* 分组标题 */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleGroup(group.key)}
                >
                  {/* 展开/折叠图标 */}
                  {group.expanded ? (
                    <ChevronDown className="w-4 h-4 text-tertiary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-tertiary" />
                  )}
                  
                  {/* 分组标签 */}
                  <Badge
                    className={`flex-shrink-0 ${
                      group.status === 'committed'
                        ? 'bg-blue-100 text-blue-700'
                        : group.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : group.status === 'rolled_back'
                            ? 'bg-neutral-200 text-neutral-700'
                            : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {group.status === 'committed'
                      ? '已保存'
                      : group.status === 'approved'
                        ? '已审批'
                        : group.status === 'rolled_back'
                          ? '已回滚'
                          : '草稿'}
                  </Badge>
                  
                  {/* 分组标题 */}
                  <span className="text-sm font-medium text-primary">
                    {group.title}
                  </span>

                  {group.summary && (
                    <span className="text-xs text-secondary truncate max-w-[220px]" title={group.summary}>
                      {group.summary}
                    </span>
                  )}
                  
                  {/* 文件数量 */}
                  <span className="text-xs text-secondary">
                    ({group.count})
                  </span>
                </div>

                {/* 分组内的文件列表 */}
                {group.expanded && group.changes.map((change, index) => {
                  const isSelected = selectedItems.has(change.path) || change.path === selectedPath
                  const typeInfo = getChangeTypeInfo(change.type)
                  const isHtml = isHtmlFile(change.path) && change.type !== 'delete'
                  const hasConflict = conflictPaths.has(change.path)

                  return (
                    <div
                      key={`${change.path}-${index}`}
                      className={`group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-hover ${
                        isSelected ? 'bg-primary-50/50' : ''
                      }`}
                      onContextMenu={isHtml ? (e) => handleContextMenu(e, change) : undefined}
                    >
                      {/* 选择框 */}
                      <BrandCheckbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleSelect(change.path)}
                        className="shrink-0 ml-6"
                      />

                      {/* 文件图标 */}
                      <span className="text-tertiary flex-shrink-0">
                        <FileIcon filename={change.path} className="w-4 h-4" />
                      </span>

                      {/* 文件名 */}
                      <span
                        className="flex-1 text-sm text-primary truncate min-w-0 cursor-pointer"
                        onClick={() => onSelectFile?.(change)}
                        title={change.path}
                      >
                        {change.path.split('/').pop() || change.path}
                      </span>

                      {/* 文件大小 */}
                      <span className="text-xs text-tertiary flex-shrink-0 w-16 text-right">
                        {formatFileSize(change.size)}
                      </span>

                      {/* 冲突标记 */}
                      {hasConflict && (
                        <Badge className="flex-shrink-0 bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                          C
                        </Badge>
                      )}

                      {/* 变更类型 */}
                      <Badge className={`${typeInfo.bg} ${typeInfo.color} flex-shrink-0`}>
                        {typeInfo.label}
                      </Badge>

                      {/* HTML inspect button (visible on hover for HTML files) */}
                      {isHtml && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleInspectElement(change)
                          }}
                          className="shrink-0 p-1 text-emerald-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                          title="审查元素"
                        >
                          <MousePointer2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* 删除按钮 */}
                      <BrandButton
                        variant="ghost"
                        onClick={(e) => handleRemoveFile(change.path, e as any)}
                        className="shrink-0 text-tertiary hover:text-destructive p-1"
                        title="从列表中移除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </BrandButton>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Right-click context menu for HTML files */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[100] min-w-[160px] rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {/* Inspect Element */}
          {isHtmlFile(contextMenu.change.path) && contextMenu.change.type !== 'delete' && (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
              onClick={() => handleInspectElement(contextMenu.change)}
            >
              <MousePointer2 className="w-4 h-4 text-emerald-500" />
              审查元素
            </button>
          )}
          {/* Copy Path */}
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.change.path).catch(() => {})
              setContextMenu(null)
            }}
          >
            <Copy className="w-4 h-4 text-neutral-400" />
            复制路径
          </button>
          {/* Remove from list */}
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            onClick={() => {
              onRemoveFile?.(contextMenu.change.path)
              setContextMenu(null)
            }}
          >
            <X className="w-4 h-4" />
            从列表移除
          </button>
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="border-subtle flex items-center justify-between border-t bg-elevated px-3 py-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
            <BrandCheckbox
              checked={selectAll}
              onCheckedChange={handleToggleSelectAll}
            />
            <span>全选</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <BrandButton
            variant="outline"
            onClick={onClear}
            disabled={isSyncing}
          >
            <Trash2 className="w-4 h-4" />
            拒绝
          </BrandButton>
          <BrandButton
            variant="primary"
            onClick={() => onSync?.(Array.from(selectedItems))}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                处理中...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                {hasSelection ? `审批通过选中 (${selectedCount})` : '审批通过全部'}
              </>
            )}
          </BrandButton>
        </div>
      </div>
    </div>
  )
}
