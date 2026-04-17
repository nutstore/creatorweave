/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PendingFileList Component - Compact change list
 *
 * Approach A: Compact inline list
 * - Single-line compact file display
 * - Support select all / batch operations
 * - Support single file removal
 * - Hover preview effect
 * - HTML file right-click inspect element
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { type ChangeDetectionResult, type FileChange } from '@/opfs/types/opfs-types'
import { getChangeTypeInfo, formatFileSize, FileIcon } from '@/utils/change-helpers'
import { BrandButton, BrandCheckbox } from '@creatorweave/ui'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Trash2, X, ChevronDown, ChevronRight, MousePointer2, Copy } from 'lucide-react'
import { readFileFromOPFS } from '@/opfs'
import { getActiveConversation } from '@/store/conversation-context.store'
import { useT } from '@/i18n'

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
  const t = useT()
  // Internal state for uncontrolled mode (backward compatibility)
  const [internalSelectAll, setInternalSelectAll] = useState(false)
  const [internalSelectedItems, setInternalSelectedItems] = useState<Set<string>>(new Set())
  // Snapshot group expand/collapse state
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

  // Group by snapshot
  const groupedChanges = useMemo(() => {
    const groupsMap = new Map<string, Omit<SnapshotGroup, 'expanded'>>()
    for (const change of changes.changes) {
      const status = change.snapshotStatus || 'draft'
      const key = status === 'draft' ? 'draft' : change.snapshotId || 'draft'
      const existing = groupsMap.get(key)
      if (existing) {
        existing.changes.push(change)
        existing.count += 1
        continue
      }
      groupsMap.set(key, {
        key,
        title:
          status === 'draft'
            ? t('settings.pendingSyncPanel.currentDraft')
            : t('settings.pendingSyncPanel.snapshotLabel', { id: key.slice(-8) }),
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

  // Toggle snapshot group expand/collapse
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

  // Calculate selected count
  const selectedCount = selectedItems.size

  // Handle single file select/deselect
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

  // Handle select all / deselect all
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

  // Handle remove single file
  const handleRemoveFile = useCallback(
    (path: string, e: React.MouseEvent) => {
      e.stopPropagation() // Prevent triggering selection
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

  // Check if there are selected items
  const hasSelection = selectedCount > 0

  return (
    <div className="flex h-full flex-col">
      {/* Compact header */}
      <div className="border-subtle bg-elevated flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary">
            {t('settings.pendingSyncPanel.title')}
          </span>
          <Badge variant="warning">{changes.changes.length}</Badge>
        </div>
        {hasSelection && (
          <span className="text-xs text-secondary">
            {t('settings.pendingSyncPanel.selectedCount', { count: selectedCount })}
          </span>
        )}
      </div>

      {/* Compact file list - grouped by change type */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="divide-subtle/50 divide-y">
          {groupedChanges.map((group) => {
            return (
              <div key={group.key}>
                {/* Group title */}
                <div
                  className="flex cursor-pointer items-center gap-2 bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50"
                  onClick={() => toggleGroup(group.key)}
                >
                  {/* Expand/collapse icon */}
                  {group.expanded ? (
                    <ChevronDown className="text-tertiary h-4 w-4" />
                  ) : (
                    <ChevronRight className="text-tertiary h-4 w-4" />
                  )}

                  {/* Group label */}
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
                      ? t('settings.pendingSyncPanel.saved')
                      : group.status === 'approved'
                        ? t('settings.pendingSyncPanel.approved')
                        : group.status === 'rolled_back'
                          ? t('settings.pendingSyncPanel.rolledBack')
                          : t('settings.pendingSyncPanel.draft')}
                  </Badge>

                  {/* Group title */}
                  <span className="text-sm font-medium text-primary">{group.title}</span>

                  {group.summary && (
                    <span
                      className="max-w-[220px] truncate text-xs text-secondary"
                      title={group.summary}
                    >
                      {group.summary}
                    </span>
                  )}

                  {/* File count */}
                  <span className="text-xs text-secondary">({group.count})</span>
                </div>

                {/* File list within group */}
                {group.expanded &&
                  group.changes.map((change, index) => {
                    const isSelected =
                      selectedItems.has(change.path) || change.path === selectedPath
                    const typeInfo = getChangeTypeInfo(change.type)
                    const isHtml = isHtmlFile(change.path) && change.type !== 'delete'
                    const hasConflict = conflictPaths.has(change.path)

                    return (
                      <div
                        key={`${change.path}-${index}`}
                        className={`hover:bg-hover group flex items-center gap-2 px-3 py-2 transition-colors ${
                          isSelected ? 'bg-primary-50/50' : ''
                        }`}
                        onContextMenu={isHtml ? (e) => handleContextMenu(e, change) : undefined}
                      >
                        {/* Checkbox */}
                        <BrandCheckbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleSelect(change.path)}
                          className="ml-6 shrink-0"
                        />

                        {/* File icon */}
                        <span className="text-tertiary flex-shrink-0">
                          <FileIcon filename={change.path} className="h-4 w-4" />
                        </span>

                        {/* File name */}
                        <span
                          className="min-w-0 flex-1 cursor-pointer truncate text-sm text-primary"
                          onClick={() => onSelectFile?.(change)}
                          title={change.path}
                        >
                          {change.path.split('/').pop() || change.path}
                        </span>

                        {/* File size */}
                        <span className="text-tertiary w-16 flex-shrink-0 text-right text-xs">
                          {formatFileSize(change.size)}
                        </span>

                        {/* Conflict marker */}
                        {hasConflict && (
                          <Badge className="flex-shrink-0 border border-red-200 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                            C
                          </Badge>
                        )}

                        {/* Change type */}
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
                            className="shrink-0 p-1 text-emerald-500 opacity-0 transition-opacity hover:text-emerald-600 group-hover:opacity-100 dark:text-emerald-400 dark:hover:text-emerald-300"
                            title={t('settings.pendingSyncPanel.reviewElements')}
                          >
                            <MousePointer2 className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Delete button */}
                        <BrandButton
                          variant="ghost"
                          onClick={(e) => handleRemoveFile(change.path, e as any)}
                          className="text-tertiary shrink-0 p-1 hover:text-destructive"
                          title="Remove from list"
                        >
                          <X className="h-3.5 w-3.5" />
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
              <MousePointer2 className="h-4 w-4 text-emerald-500" />
              {t('settings.pendingSyncPanel.reviewElements')}
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
            <Copy className="h-4 w-4 text-neutral-400" />
            {t('settings.pendingSyncPanel.copyPath')}
          </button>
          {/* Remove from list */}
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            onClick={() => {
              onRemoveFile?.(contextMenu.change.path)
              setContextMenu(null)
            }}
          >
            <X className="h-4 w-4" />
            {t('settings.pendingSyncPanel.removeFromList')}
          </button>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="border-subtle bg-elevated flex items-center justify-between border-t px-3 py-2">
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
            <BrandCheckbox checked={selectAll} onCheckedChange={handleToggleSelectAll} />
            <span>{t('settings.pendingSyncPanel.selectAll')}</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <BrandButton variant="outline" onClick={onClear} disabled={isSyncing}>
            <Trash2 className="h-4 w-4" />
            {t('settings.pendingSyncPanel.reject')}
          </BrandButton>
          <BrandButton
            variant="primary"
            onClick={() => onSync?.(Array.from(selectedItems))}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t('settings.pendingSyncPanel.processing')}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {hasSelection
                  ? t('settings.pendingSyncPanel.approveSelectedCount', { count: selectedCount })
                  : t('settings.pendingSyncPanel.approveAll')}
              </>
            )}
          </BrandButton>
        </div>
      </div>
    </div>
  )
}
