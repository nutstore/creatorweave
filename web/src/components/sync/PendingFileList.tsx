/**
 * PendingFileList Component - 紧凑待同步文件列表
 *
 * 方案 A: 紧凑内联列表
 * - 单行紧凑显示文件
 * - 支持全选/批量操作
 * - 支持单个文件删除
 * - hover 预览效果
 */

import React, { useState, useCallback, useMemo } from 'react'
import { type ChangeDetectionResult, type FileChange, type ChangeType } from '@/opfs/types/opfs-types'
import { getChangeTypeInfo, formatFileSize, FileIcon } from '@/utils/change-helpers'
import { BrandButton, BrandCheckbox } from '@browser-fs-analyzer/ui'
import { Badge } from '@/components/ui/badge'
import { Download, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react'

/** 分组类型定义 */
type ChangeGroup = {
  type: ChangeType
  label: string
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
}) => {
  // Internal state for uncontrolled mode (backward compatibility)
  const [internalSelectAll, setInternalSelectAll] = useState(false)
  const [internalSelectedItems, setInternalSelectedItems] = useState<Set<string>>(new Set())
  // 展开/折叠状态
  const [groupExpanded, setGroupExpanded] = useState<Record<ChangeType, boolean>>({
    add: true,
    modify: true,
    delete: true,
  })

  // 按变更类型分组
  const groupedChanges = useMemo(() => {
    const groups: ChangeGroup[] = []
    
    // 新增文件组
    const addedChanges = changes.changes.filter(c => c.type === 'add')
    if (addedChanges.length > 0) {
      groups.push({
        type: 'add',
        label: '新增',
        count: addedChanges.length,
        changes: addedChanges,
        expanded: groupExpanded.add,
      })
    }
    
    // 修改文件组
    const modifiedChanges = changes.changes.filter(c => c.type === 'modify')
    if (modifiedChanges.length > 0) {
      groups.push({
        type: 'modify',
        label: '修改',
        count: modifiedChanges.length,
        changes: modifiedChanges,
        expanded: groupExpanded.modify,
      })
    }
    
    // 删除文件组
    const deletedChanges = changes.changes.filter(c => c.type === 'delete')
    if (deletedChanges.length > 0) {
      groups.push({
        type: 'delete',
        label: '删除',
        count: deletedChanges.length,
        changes: deletedChanges,
        expanded: groupExpanded.delete,
      })
    }
    
    return groups
  }, [changes.changes, groupExpanded])

  // 切换分组展开/折叠
  const toggleGroup = useCallback((type: ChangeType) => {
    setGroupExpanded(prev => ({
      ...prev,
      [type]: !prev[type],
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

  // 检查是否有选中项
  const hasSelection = selectedCount > 0

  return (
    <div className="flex flex-col h-full">
      {/* 紧凑标题栏 */}
      <div className="border-subtle flex items-center justify-between border-b bg-elevated px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary">待同步文件</span>
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
            const typeInfo = getChangeTypeInfo(group.type)
            
            return (
              <div key={group.type}>
                {/* 分组标题 */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleGroup(group.type)}
                >
                  {/* 展开/折叠图标 */}
                  {group.expanded ? (
                    <ChevronDown className="w-4 h-4 text-tertiary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-tertiary" />
                  )}
                  
                  {/* 分组标签 */}
                  <Badge className={`${typeInfo.bg} ${typeInfo.color} flex-shrink-0`}>
                    {typeInfo.label}
                  </Badge>
                  
                  {/* 分组标题 */}
                  <span className="text-sm font-medium text-primary">
                    {group.label}
                  </span>
                  
                  {/* 文件数量 */}
                  <span className="text-xs text-secondary">
                    ({group.count})
                  </span>
                </div>

                {/* 分组内的文件列表 */}
                {group.expanded && group.changes.map((change, index) => {
                  const isSelected = selectedItems.has(change.path) || change.path === selectedPath

                  return (
                    <div
                      key={`${change.path}-${index}`}
                      className={`group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-hover ${
                        isSelected ? 'bg-primary-50/50' : ''
                      }`}
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
            清空
          </BrandButton>
          <BrandButton
            variant="primary"
            onClick={() => onSync?.(Array.from(selectedItems))}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                同步中...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                {hasSelection ? `同步选中 (${selectedCount})` : '同步全部'}
              </>
            )}
          </BrandButton>
        </div>
      </div>
    </div>
  )
}
