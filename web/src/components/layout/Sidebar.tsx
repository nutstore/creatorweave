/**
 * Sidebar - unified sidebar with conversation list + resource tabs.
 *
 * Design Specifications (Brand System):
 * - Colors: Uses brand semantic colors (primary, secondary, tertiary, etc.)
 * - Borders: border-subtle instead of border-neutral-200
 * - Buttons: BrandButton component with appropriate variants
 * - Spacing: Consistent with brand design tokens
 *
 * Top: Conversation list (always visible)
 * Bottom: Resource tabs (Files/Plugins/Changes) - visible when a folder is selected
 * Draggable divider between them for height adjustment.
 *
 * File preview is handled by WorkspaceLayout (push-squeeze panel in main area).
 */

import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { createPortal } from 'react-dom'
import { Plus, Trash2, PanelLeftClose, PanelLeft, FolderTree, Puzzle, Clock, History, Pencil, Archive, ArchiveRestore, Download, Pin, PinOff } from 'lucide-react'
import { toast } from 'sonner'
import {
  BrandButton,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@creatorweave/ui'
import { useConversationStore } from '@/store/conversation.store'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useFolderAccessStore } from '@/store/folder-access.store'
import { FileTreePanel } from '@/components/file-viewer/FileTreePanel'
import { PendingSyncPanel } from '@/components/sync/PendingSyncPanel'
import { SnapshotList } from '@/components/sync/SnapshotList'
import { SidebarPanelHeader } from '@/components/layout/SidebarPanelHeader'
import { useT } from '@/i18n'
import { ExportConversationDialog } from '@/components/conversation/ExportConversationDialog'
import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'

type ResourceTab = 'files' | 'plugins' | 'pending' | 'snapshots'

const MIN_CONVERSATION_RATIO = 20 // minimum percentage
const MAX_CONVERSATION_RATIO = 80 // maximum percentage

interface ConversationItemData {
  id: string
  title: string
  isRunning: boolean
  isActive: boolean
  pendingReviewCount: number
  isEditing: boolean
  isArchived: boolean
  isPinned: boolean
}

interface ConversationItemProps extends ConversationItemData {
  onSelect: (id: string) => void
  onStartRename: (id: string, title: string) => void
  onDeleteClick: (id: string, x: number, y: number) => void
  onTogglePin: (id: string) => void
  onExport: (id: string) => void
  onArchive: (id: string, archived: boolean) => void
  onDelete: (id: string) => void
  editingTitle: string
  onEditingTitleChange: (title: string) => void
  onConfirmRename: () => void
  onCancelRename: () => void
  onRenameBlur: () => void
  composing: boolean
  onComposingChange: (composing: boolean) => void
  renameInputRef: React.RefObject<HTMLInputElement | null>
  workspaceLabel: string
  t: (key: string, params?: Record<string, string | number>) => string
}

/** Memoized "New Workspace" button — isolated from conversation list re-renders. */
const NewWorkspaceButton = memo(function NewWorkspaceButton({
  onClick,
  label,
}: {
  onClick: () => void
  label: string
}) {
  return (
    <div className="px-2 pb-1">
      <BrandButton
        variant="ghost"
        className="h-7 w-full justify-start gap-1.5 bg-muted px-2 text-xs"
        onClick={onClick}
      >
        <Plus className="h-3 w-3" />
        {label}
      </BrandButton>
    </div>
  )
})

/**
 * Memoized conversation item — prevents all 30+ ContextMenu instances from
 * re-rendering when only one item's state changes.
 */
const ConversationItem = memo(function ConversationItem({
  id,
  title,
  isRunning,
  isActive,
  pendingReviewCount,
  isEditing,
  isArchived,
  isPinned,
  onSelect,
  onStartRename,
  onDeleteClick,
  onTogglePin,
  onExport,
  onArchive,
  onDelete,
  editingTitle,
  onEditingTitleChange,
  onConfirmRename,
  onCancelRename,
  onRenameBlur,
  composing,
  onComposingChange,
  renameInputRef,
  workspaceLabel,
  t,
}: ConversationItemProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          aria-pressed={isActive}
          aria-label={workspaceLabel}
          className={`group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 ${
            isActive
              ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : 'hover:bg-hover text-secondary'
          }`}
          onClick={() => {
            if (isEditing) return
            onSelect(id)
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            onStartRename(id, title)
          }}
          onKeyDown={(e) => {
            if (isEditing) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect(id)
            }
          }}
        >
          {/* Pin indicator icon */}
          {isPinned && (
            <Pin className="h-3 w-3 shrink-0 text-primary-500" />
          )}

          {/* Running status indicator */}
          {isRunning && (
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-warning" />
          )}

          {/* Action buttons - visible on hover */}
          {!isEditing && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center rounded-md border border-neutral-200 bg-neutral-100 p-0.5 opacity-0 shadow-sm group-hover:opacity-100 focus-within:opacity-100 transition-opacity dark:border-neutral-600 dark:bg-neutral-700">
              <button
                className="rounded p-0.5 text-secondary transition-colors hover:bg-neutral-200 hover:text-primary dark:hover:bg-neutral-600 dark:hover:text-primary-300"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onStartRename(id, title)
                }}
                title={t('sidebar.renameWorkspace')}
                aria-label={t('sidebar.renameWorkspace')}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <div className="mx-0.5 h-3 w-px bg-neutral-300 dark:bg-neutral-500" />
              <button
                className="rounded p-0.5 text-secondary transition-colors hover:bg-danger/10 hover:text-danger dark:hover:bg-danger/20"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const rect = e.currentTarget.getBoundingClientRect()
                  onDeleteClick(id, rect.left, rect.top)
                }}
                title={t('sidebar.deleteWorkspace')}
                aria-label={t('sidebar.deleteWorkspace')}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}

          {isEditing ? (
            <input
              ref={renameInputRef}
              type="text"
              value={editingTitle}
              onChange={(e) => onEditingTitleChange(e.target.value)}
              onCompositionStart={() => onComposingChange(true)}
              onCompositionEnd={() => onComposingChange(false)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && !composing) {
                  onConfirmRename()
                } else if (e.key === 'Escape') {
                  onCancelRename()
                }
              }}
              onBlur={onRenameBlur}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded border border-primary-300 bg-white px-1.5 py-0.5 text-xs text-primary outline-none focus:ring-1 focus:ring-primary-500 dark:border-primary-600 dark:bg-card dark:text-primary"
              maxLength={100}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate" title={title}>{title}</span>
          )}
          {pendingReviewCount > 0 && !isEditing && (
            <span
              className="shrink-0 rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-warning"
              title={t('sidebar.pendingReviewCount', { count: pendingReviewCount })}
            >
              {pendingReviewCount}
            </span>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          onClick={() => onTogglePin(id)}
        >
          {isPinned
            ? <PinOff className="mr-2 h-3.5 w-3.5" />
            : <Pin className="mr-2 h-3.5 w-3.5" />
          }
          {isPinned ? t('sidebar.unpinWorkspace') : t('sidebar.pinWorkspace')}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onExport(id)}
        >
          <Download className="mr-2 h-3.5 w-3.5" />
          {t('sidebar.exportWorkspace') || 'Export'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => onArchive(id, isArchived)}
        >
          {isArchived
            ? <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
            : <Archive className="mr-2 h-3.5 w-3.5" />
          }
          {isArchived ? t('sidebar.unarchiveWorkspace') : t('sidebar.archiveWorkspace')}
        </ContextMenuItem>
        <ContextMenuItem
          className="text-danger focus:text-danger"
          onClick={() => onDelete(id)}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          {t('sidebar.deleteWorkspace')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}, (prev, next) => {
  // Custom comparison — only re-render when meaningful data changes
  return (
    prev.id === next.id &&
    prev.title === next.title &&
    prev.isRunning === next.isRunning &&
    prev.isActive === next.isActive &&
    prev.pendingReviewCount === next.pendingReviewCount &&
    prev.isEditing === next.isEditing &&
    prev.isPinned === next.isPinned &&
    prev.isArchived === next.isArchived &&
    prev.editingTitle === next.editingTitle &&
    prev.composing === next.composing &&
    prev.workspaceLabel === next.workspaceLabel
    // Note: callback refs are stable (useCallback), so we skip comparing them
  )
})

interface SidebarProps {
  /** Called when user clicks a file in the tree */
  onFileSelect?: (path: string, handle: FileSystemFileHandle | null) => void
  /** Called when user clicks element inspector on a file */
  onInspect?: (path: string, handle: FileSystemFileHandle | null) => void
  /** Currently selected file path (for highlight in tree) */
  selectedFilePath?: string | null
  /** Whether sidebar is rendered in mobile mode */
  isMobile?: boolean
  /** Request parent to close mobile sidebar */
  onRequestClose?: () => void
  /** Target file path to reveal in tree (relative path without root prefix) */
  revealTargetPath?: string | null
  /** Called when reveal has been processed */
  onRevealComplete?: () => void
}

/** Memoized wrapper for FileTreePanel with stable callbacks per root */
const RootFileTreePanel = memo(function RootFileTreePanel({
  root,
  selectedFilePath,
  revealTargetPath,
  rootsLength,
  onFileSelect,
  onInspect,
  onRevealComplete,
}: {
  root: { id: string; name: string; handle: FileSystemDirectoryHandle }
  selectedFilePath?: string | null
  revealTargetPath?: string | null
  rootsLength: number
  onFileSelect: (fullPath: string, handle: FileSystemFileHandle | null) => void
  onInspect?: ((fullPath: string, handle: FileSystemFileHandle | null) => void) | undefined
  onRevealComplete?: (() => void) | undefined
}) {
  const handleFileSelect = useCallback(
    (path: string, handle: FileSystemFileHandle | null) => {
      onFileSelect(`${root.name}/${path}`, handle)
    },
    [onFileSelect, root.name]
  )

  const handleInspect = useCallback(
    onInspect
      ? (path: string, handle: FileSystemFileHandle | null) => {
          onInspect(`${root.name}/${path}`, handle)
        }
      : undefined,
    [onInspect, root.name]
  ) as ((path: string, handle: FileSystemFileHandle | null) => void) | undefined

  const rootRevealTarget = useMemo(() => {
    if (!revealTargetPath) return null
    if (selectedFilePath?.startsWith(`${root.name}/`)) return revealTargetPath
    if (rootsLength === 1) return revealTargetPath
    return null
  }, [revealTargetPath, selectedFilePath, root.name, rootsLength])

  const rootSelectedPath = selectedFilePath?.startsWith(`${root.name}/`)
    ? selectedFilePath.slice(root.name.length + 1)
    : null

  return (
    <div className="flex-shrink-0">
      <FileTreePanel
        directoryHandle={root.handle}
        rootName={root.name}
        pathPrefix={root.name}
        onFileSelect={handleFileSelect}
        selectedPath={rootSelectedPath}
        onInspect={handleInspect}
        revealTarget={rootRevealTarget}
        onRevealComplete={onRevealComplete}
      />
    </div>
  )
})

/**
 * ResourceTabPanel — isolated from conversation state to avoid re-rendering
 * during agent streaming. Only re-renders when its own props change.
 */
const ResourceTabPanel = memo(function ResourceTabPanel({
  resourceTab,
  onTabChange,
  roots,
  selectedFilePath,
  revealTargetPath,
  rootsLength,
  onFileSelect,
  onInspect,
  onRevealComplete,
  currentPendingCount,
  refreshPending,
  t,
}: {
  resourceTab: ResourceTab
  onTabChange: (tab: ResourceTab) => void
  roots: { id: string; name: string; handle: FileSystemDirectoryHandle }[]
  selectedFilePath?: string | null
  revealTargetPath?: string | null
  rootsLength: number
  onFileSelect: (fullPath: string, handle: FileSystemFileHandle | null) => void
  onInspect?: ((fullPath: string, handle: FileSystemFileHandle | null) => void) | undefined
  onRevealComplete?: (() => void) | undefined
  currentPendingCount: number
  refreshPending: () => Promise<void>
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <div
      className="border-subtle flex h-full flex-col overflow-hidden border-t bg-white dark:bg-card"
    >
      {/* Tab buttons */}
      <div className="border-subtle flex items-center gap-0.5 border-b px-1.5 py-1">
        <BrandButton
          variant="ghost"
          className={`h-7 gap-1 px-2 py-1 text-xs ${
            resourceTab === 'files'
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : ''
          }`}
          onClick={() => onTabChange('files')}
        >
          <FolderTree className="h-3 w-3" />
          {t('sidebar.files')}
        </BrandButton>
        <BrandButton
          variant="ghost"
          className={`h-7 gap-1 px-2 py-1 text-xs ${
            resourceTab === 'pending'
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : ''
          }`}
          onClick={async () => {
            onTabChange('pending')
            await refreshPending()
          }}
        >
          <Clock className="h-3 w-3" />
          {t('sidebar.changes')}
          {currentPendingCount > 0 && (
            <span className="min-w-[1.1rem] rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-warning">
              {currentPendingCount}
            </span>
          )}
        </BrandButton>
        <BrandButton
          variant="ghost"
          className={`h-7 gap-1 px-2 py-1 text-xs ${
            resourceTab === 'snapshots'
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : ''
          }`}
          onClick={() => onTabChange('snapshots')}
        >
          <History className="h-3 w-3" />
          {t('sidebar.snapshots')}
        </BrandButton>
        <BrandButton
          variant="ghost"
          className={`h-7 gap-1 px-2 py-1 text-xs ${
            resourceTab === 'plugins'
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : ''
          }`}
          onClick={() => onTabChange('plugins')}
        >
          <Puzzle className="h-3 w-3" />
          {t('sidebar.plugins')}
        </BrandButton>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden" data-tour="file-tree">
        {resourceTab === 'files' && (
          <div className="custom-scrollbar flex h-full flex-col overflow-y-auto">
            {roots.map((root) => (
              <RootFileTreePanel
                key={root.id}
                root={root}
                selectedFilePath={selectedFilePath}
                revealTargetPath={revealTargetPath}
                rootsLength={rootsLength}
                onFileSelect={onFileSelect}
                onInspect={onInspect}
                onRevealComplete={onRevealComplete}
              />
            ))}
          </div>
        )}

        {resourceTab === 'plugins' && (
          <div className="flex h-full flex-col">
            <SidebarPanelHeader title={t('sidebar.pluginTitle')} />
            <div className="flex flex-1 items-center justify-center p-4">
              <p className="text-xs text-secondary">
                {t('sidebar.pluginManagerHint')}
              </p>
            </div>
          </div>
        )}

        {resourceTab === 'pending' && (
          <div className="h-full overflow-hidden">
            <PendingSyncPanel />
          </div>
        )}

        {resourceTab === 'snapshots' && (
          <div className="h-full overflow-hidden">
            <SnapshotList limit={300} fullHeight />
          </div>
        )}
      </div>
    </div>
  )
})

export const Sidebar = memo(function Sidebar({
  onFileSelect,
  onInspect,
  selectedFilePath,
  isMobile = false,
  onRequestClose,
  revealTargetPath,
  onRevealComplete,
}: SidebarProps) {
  const t = useT()

  // Use selectors to avoid re-rendering on every streaming delta.
  // Sidebar only needs id/title for the list — not streamingContent/toolCalls/etc.
  // NOTE: intentionally exclude updatedAt — cancelAgent writes updatedAt which would
  // cause unnecessary re-renders of the entire Sidebar (including buttons).
  // useShallow ensures stable references when the extracted values haven't changed.
  const conversationListItems = useConversationStore(
    useShallow((s) =>
      s.conversations.map((c) => ({ id: c.id, title: c.title }))
    )
  )
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const createNew = useConversationStore((s) => s.createNew)
  const setActive = useConversationStore((s) => s.setActive)
  const deleteConversation = useConversationStore((s) => s.deleteConversation)
  const deleteConversations = useConversationStore((s) => s.deleteConversations)
  const isConversationRunning = useConversationStore((s) => s.isConversationRunning)
  const updateTitle = useConversationStore((s) => s.updateTitle)

  // Multi-root: get all roots from folder-access store
  const roots = useFolderAccessStore((state) => state.roots)
  const workspaceStats = useConversationContextStore((state) => state.workspaces)
  const workspaceIds = workspaceStats.map((w) => w.id)
  const currentPendingCount = useConversationContextStore((state) => state.currentPendingCount)
  const scopedWorkspaceIdSet = useMemo(() => new Set(workspaceIds), [workspaceIds])
  const scopedConversations = useMemo(
    () => conversationListItems.filter(
      (conv) => scopedWorkspaceIdSet.has(conv.id) || conv.id === activeConversationId
    ),
    [conversationListItems, scopedWorkspaceIdSet, activeConversationId]
  )
  const pendingCountByConversationId = useMemo(() => {
    const map = new Map<string, number>()
    for (const ws of workspaceStats) {
      map.set(ws.id, ws.pendingCount || 0)
    }
    return map
  }, [workspaceStats])
  const workspaceStatusMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const ws of workspaceStats) {
      map.set(ws.id, ws.status || 'active')
    }
    return map
  }, [workspaceStats])

  // Sidebar state — read layout preferences from store (use selectors)
  const panelSizes = useWorkspacePreferencesStore((s) => s.panelSizes)
  const storePanelState = useWorkspacePreferencesStore((s) => s.panelState)
  const setSidebarWidth = useWorkspacePreferencesStore((s) => s.setSidebarWidth)
  const setConversationRatio = useWorkspacePreferencesStore((s) => s.setConversationRatio)
  const setSidebarCollapsed = useWorkspacePreferencesStore((s) => s.setSidebarCollapsed)

  const [collapsed, setCollapsed] = useState(storePanelState.sidebarCollapsed)
  const width = panelSizes.sidebarWidth
  const [resourceTab, setResourceTab] = useState<ResourceTab>('files')
  const [workspaceTab, setWorkspaceTab] = useState<'active' | 'archived'>('active')

  // Pin state from workspace store
  const pinnedIds = useWorkspaceStore((state) => state.pinnedWorkspaceIds)
  const togglePin = useWorkspaceStore((state) => state.togglePin)

  const displayedConversations = useMemo(
    () => {
      const filtered = scopedConversations.filter((conv) => {
        const status = workspaceStatusMap.get(conv.id) || 'active'
        return workspaceTab === 'active' ? status !== 'archived' : status === 'archived'
      })
      // Sort: pinned first, then by original order (lastActiveAt desc)
      const pinnedSet = new Set(pinnedIds)
      return [...filtered].sort((a, b) => {
        const aPinned = pinnedSet.has(a.id)
        const bPinned = pinnedSet.has(b.id)
        if (aPinned && !bPinned) return -1
        if (!aPinned && bPinned) return 1
        return 0 // preserve original relative order
      })
    },
    [scopedConversations, workspaceTab, workspaceStatusMap, pinnedIds]
  )
  const archivedCount = useMemo(
    () => scopedConversations.filter((conv) => workspaceStatusMap.get(conv.id) === 'archived').length,
    [scopedConversations, workspaceStatusMap]
  )
  const scopedConversationIds = useMemo(() => scopedConversations.map((conv) => conv.id), [scopedConversations])
  const conversationRatio = panelSizes.conversationRatio
  const [clearConversationsDialogOpen, setClearConversationsDialogOpen] = useState(false)
  const [clearingConversations, setClearingConversations] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [composing, setComposing] = useState(false)
  const [exportConvId, setExportConvId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeletePos, setConfirmDeletePos] = useState<{ x: number; y: number } | null>(null)
  const deleteConfirmRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Track the target rename ID to prevent click interference
  const pendingRenameIdRef = useRef<string | null>(null)

  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      onRequestClose?.()
    }
  }, [isMobile, onRequestClose])

  // Rename handlers
  const startRename = useCallback((convId: string, currentTitle: string) => {
    pendingRenameIdRef.current = convId
    setEditingId(convId)
    setEditingTitle(currentTitle)
    requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
  }, [])

  const confirmRename = useCallback(() => {
    if (editingId && editingTitle.trim()) {
      const trimmedTitle = editingTitle.trim()
      const conv = scopedConversations.find((c) => c.id === editingId)
      if (conv && conv.title !== trimmedTitle) {
        updateTitle(editingId, trimmedTitle)
      }
    }
    setEditingId(null)
    setEditingTitle('')
    pendingRenameIdRef.current = null
  }, [editingId, editingTitle, updateTitle, scopedConversations])

  const handleRenameBlur = useCallback(() => {
    setTimeout(() => {
      if (document.activeElement !== renameInputRef.current) {
        confirmRename()
      }
    }, 150)
  }, [confirmRename])

  const cancelRename = useCallback(() => {
    setEditingId(null)
    setEditingTitle('')
    setComposing(false)
    pendingRenameIdRef.current = null
  }, [])

  // Drag sidebar width (horizontal)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // Drag conversation ratio (vertical)
  const verticalDragRef = useRef<{
    startY: number
    startRatio: number
    containerHeight: number
  } | null>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isMobile && collapsed) {
      setCollapsed(false)
    }
  }, [isMobile, collapsed])

  // Close delete confirmation when clicking outside
  useEffect(() => {
    if (!confirmDeleteId) return

    const handleClick = (e: MouseEvent) => {
      if (deleteConfirmRef.current && !deleteConfirmRef.current.contains(e.target as Node)) {
        setConfirmDeleteId(null)
        setConfirmDeletePos(null)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirmDeleteId(null)
        setConfirmDeletePos(null)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [confirmDeleteId])

  // Refresh pending changes when switching to pending tab
  const refreshPending = useCallback(async () => {
    const { refreshPendingChanges } = useConversationContextStore.getState()
    await refreshPendingChanges()
  }, [])

  const handleFileSelect = useCallback(
    (path: string, handle: FileSystemFileHandle | null) => {
      onFileSelect?.(path, handle)
      closeMobileSidebar()
    },
    [onFileSelect, closeMobileSidebar]
  )

  // Horizontal drag (sidebar width)
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startWidth = width
      dragRef.current = { startX: e.clientX, startWidth }

      const handleMove = (me: MouseEvent) => {
        if (!dragRef.current) return
        const delta = me.clientX - dragRef.current.startX
        const newWidth = Math.max(200, Math.min(400, dragRef.current.startWidth + delta))
        setSidebarWidth(newWidth)
      }

      const handleUp = () => {
        dragRef.current = null
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [width, setSidebarWidth]
  )

  // Vertical drag (conversation/resource split)
  const handleVerticalDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const containerHeight = sidebarRef.current?.offsetHeight || 0
      if (containerHeight === 0) return

      verticalDragRef.current = {
        startY: e.clientY,
        startRatio: conversationRatio,
        containerHeight,
      }

      const handleMove = (me: MouseEvent) => {
        if (!verticalDragRef.current) return
        const delta = me.clientY - verticalDragRef.current.startY
        const deltaPercent = (delta / verticalDragRef.current.containerHeight) * 100
        let newRatio = verticalDragRef.current.startRatio + deltaPercent

        // Constrain to min/max values
        newRatio = Math.max(MIN_CONVERSATION_RATIO, Math.min(MAX_CONVERSATION_RATIO, newRatio))
        setConversationRatio(newRatio)
      }

      const handleUp = () => {
        verticalDragRef.current = null
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [conversationRatio, setConversationRatio]
  )

  // Stable callback for "新工作区" button
  const handleCreateNewWorkspace = useCallback(() => {
    const conv = createNew()
    void setActive(conv.id)
    closeMobileSidebar()
  }, [createNew, setActive, closeMobileSidebar])

  // Stable callback for editing title change
  const handleEditingTitleChange = useCallback((title: string) => setEditingTitle(title), [])

  // Collapsed state — sync local state with store
  useEffect(() => {
    setCollapsed(storePanelState.sidebarCollapsed)
  }, [storePanelState.sidebarCollapsed])

  const handleSetCollapsed = useCallback((value: boolean) => {
    setCollapsed(value)
    setSidebarCollapsed(value)
  }, [setSidebarCollapsed])

  // Stable callbacks for ConversationItem memoization
  const handleItemSelect = useCallback((id: string) => {
    if (pendingRenameIdRef.current === id) return
    setActive(id)
    closeMobileSidebar()
  }, [setActive, closeMobileSidebar])

  const handleItemDeleteClick = useCallback((id: string, x: number, y: number) => {
    setConfirmDeleteId(id)
    setConfirmDeletePos({ x, y })
  }, [])

  const handleItemTogglePin = useCallback((id: string) => {
    togglePin(id)
  }, [togglePin])

  const handleItemExport = useCallback((id: string) => {
    setExportConvId(id)
  }, [])

  const handleItemArchive = useCallback(async (id: string, _isArchived: boolean) => {
    const { archiveWorkspace, unarchiveWorkspace } = useConversationContextStore.getState()
    try {
      if (_isArchived) {
        await unarchiveWorkspace(id)
        toast.success(t('sidebar.workspaceUnarchived'))
      } else {
        await archiveWorkspace(id)
        toast.success(t('sidebar.workspaceArchived'))
      }
    } catch (error) {
      console.error('[Sidebar] Failed to toggle archive:', error)
      toast.error(_isArchived ? t('sidebar.unarchiveFailed') : t('sidebar.archiveFailed'))
    }
  }, [t])

  const handleItemDelete = useCallback(async (id: string) => {
    try {
      await deleteConversation(id)
      toast.success(t('sidebar.workspaceDeleted'))
    } catch (error) {
      console.error('[Sidebar] Failed to delete conversation:', error)
      toast.error(t('sidebar.deleteWorkspaceFailed'))
    }
  }, [deleteConversation, t])

  if (collapsed) {
    return (
      <div className="border-subtle flex shrink-0 flex-col border-r bg-white dark:bg-card">
        <BrandButton
          iconButton
          variant="ghost"
          onClick={() => handleSetCollapsed(false)}
          title={t('sidebar.expandSidebar')}
        >
          <PanelLeft className="h-4 w-4" />
        </BrandButton>
      </div>
    )
  }

  return (
    <>
      <div
        ref={sidebarRef}
        className={`border-subtle bg-background flex shrink-0 flex-col border-r dark:bg-card ${
          isMobile ? 'h-full w-full max-w-full' : ''
        }`}
        style={isMobile ? undefined : { width }}
      >
        {/* Collapse button */}
        <div className="border-subtle flex items-center justify-between border-b bg-white px-2 py-1 dark:bg-card">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">{t('sidebar.workspace')}</span>
          <div className="flex items-center gap-1">
            <BrandButton
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              disabled={scopedConversationIds.length === 0 || clearingConversations}
              onClick={() => setClearConversationsDialogOpen(true)}
              title={t('sidebar.clearWorkspace')}
            >
              {t('sidebar.clear')}
            </BrandButton>
            <BrandButton
              iconButton
              variant="ghost"
              className="h-6 w-6"
              onClick={() => {
                if (isMobile) {
                  onRequestClose?.()
                  return
                }
                handleSetCollapsed(true)
              }}
              title={isMobile ? t('sidebar.closeSidebar') : t('sidebar.collapseSidebar')}
            >
              <PanelLeftClose className="h-3 w-3" />
            </BrandButton>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Conversation list */}
          <div
            className="flex min-h-0 flex-col overflow-hidden"
            style={{ height: `${conversationRatio}%` }}
          >
          {/* Workspace tab filter with sliding indicator */}
          <div className="relative mx-2 mt-2 mb-1 flex rounded-md bg-muted/60 p-0.5">
            <div
              className="absolute top-0.5 bottom-0.5 rounded-[5px] bg-card shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
              style={{
                width: 'calc(50% - 2px)',
                transform: workspaceTab === 'archived' ? 'translateX(calc(100% + 2px))' : 'translateX(0)',
              }}
            />
            <button
              type="button"
              className={`relative z-10 flex-1 rounded-md py-1 text-center text-[11px] transition-colors duration-200 ${
                workspaceTab === 'active'
                  ? 'font-semibold text-primary'
                  : 'text-tertiary hover:text-secondary'
              }`}
              onClick={() => setWorkspaceTab('active')}
            >
              {t('sidebar.activeTab')}
            </button>
            <button
              type="button"
              className={`relative z-10 flex-1 items-center justify-center gap-1 rounded-md py-1 text-center text-[11px] transition-colors duration-200 ${
                workspaceTab === 'archived'
                  ? 'font-semibold text-primary'
                  : 'text-tertiary hover:text-secondary'
              }`}
              onClick={() => setWorkspaceTab('archived')}
            >
              {t('sidebar.archivedTab')}
              {archivedCount > 0 && (
                <span className="ml-0.5 text-[10px] text-tertiary">({archivedCount})</span>
              )}
            </button>
          </div>

          {workspaceTab === 'active' && (
            <NewWorkspaceButton
              onClick={handleCreateNewWorkspace}
              label={t('sidebar.newWorkspace')}
            />
          )}

          <div className="custom-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {displayedConversations.map((conv) => {
              const isRunning = isConversationRunning(conv.id)
              const isActive = conv.id === activeConversationId
              const pendingReviewCount = pendingCountByConversationId.get(conv.id) || 0
              const isEditing = editingId === conv.id
              const isArchived = workspaceStatusMap.get(conv.id) === 'archived'
              const isPinned = pinnedIds.includes(conv.id)

              return (
                <ConversationItem
                  key={conv.id}
                  id={conv.id}
                  title={conv.title}
                  isRunning={isRunning}
                  isActive={isActive}
                  pendingReviewCount={pendingReviewCount}
                  isEditing={isEditing}
                  isArchived={isArchived}
                  isPinned={isPinned}
                  onSelect={handleItemSelect}
                  onStartRename={startRename}
                  onDeleteClick={handleItemDeleteClick}
                  onTogglePin={handleItemTogglePin}
                  onExport={handleItemExport}
                  onArchive={handleItemArchive}
                  onDelete={handleItemDelete}
                  editingTitle={editingTitle}
                  onEditingTitleChange={handleEditingTitleChange}
                  onConfirmRename={confirmRename}
                  onCancelRename={cancelRename}
                  onRenameBlur={handleRenameBlur}
                  composing={composing}
                  onComposingChange={setComposing}
                  renameInputRef={renameInputRef}
                  workspaceLabel={t('sidebar.workspaceLabel', { name: conv.title })}
                  t={t}
                />
              )
            })}
          </div>
          </div>

          {/* Vertical drag divider */}
          {!isMobile && (
            <div
              className="group relative flex h-2 shrink-0 cursor-row-resize items-center justify-center bg-neutral-50/50 transition-colors hover:bg-neutral-100/80 dark:bg-muted dark:hover:bg-muted"
              onMouseDown={handleVerticalDragStart}
              title={t('sidebar.dragToResizeHeight')}
            >
              {/* center dot */}
              <div className="group-hover:bg-primary-400 h-1 w-1 rounded-full bg-neutral-300 transition-colors" />
            </div>
          )}

          {/* Resource tabs — memoized to avoid re-render during streaming */}
          <div className="min-h-0 overflow-hidden" style={{ height: `${100 - conversationRatio}%` }}>
            <ResourceTabPanel
              resourceTab={resourceTab}
              onTabChange={setResourceTab}
              roots={roots}
              selectedFilePath={selectedFilePath}
              revealTargetPath={revealTargetPath}
              rootsLength={roots.length}
              onFileSelect={handleFileSelect}
              onInspect={onInspect}
              onRevealComplete={onRevealComplete}
              currentPendingCount={currentPendingCount}
              refreshPending={refreshPending}
              t={t}
            />
          </div>
        </div>
      </div>

      <BrandDialog
        open={clearConversationsDialogOpen}
        onOpenChange={setClearConversationsDialogOpen}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('sidebar.clearWorkspaceTitle')}</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="text-secondary text-sm">{t('sidebar.confirmClearWorkspace')}</p>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              disabled={clearingConversations}
              onClick={() => setClearConversationsDialogOpen(false)}
            >
              {t('common.cancel')}
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={async () => {
                try {
                  setClearingConversations(true)
                  const result = await deleteConversations(scopedConversationIds)
                  if (result.failed.length === 0) {
                    toast.success(t('sidebar.clearedCount', { count: result.successIds.length }))
                    setClearConversationsDialogOpen(false)
                  } else if (result.successIds.length === 0) {
                    toast.error(t('sidebar.clearFailed', { count: result.failed.length }))
                  } else {
                    toast.error(t('sidebar.deletePartial', { success: result.successIds.length, failed: result.failed.length }))
                  }
                } finally {
                  setClearingConversations(false)
                }
              }}
              disabled={scopedConversationIds.length === 0 || clearingConversations}
            >
              {clearingConversations ? t('sidebar.clearing') : t('sidebar.clear')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Horizontal drag divider (sidebar width) */}
      {!isMobile && (
        <div
          className="group relative flex w-2 shrink-0 cursor-col-resize flex-col items-center justify-center bg-neutral-50/50 transition-colors hover:bg-neutral-100/80 dark:bg-muted dark:hover:bg-muted"
          onMouseDown={handleDragStart}
          title={t('sidebar.dragToResizeWidth')}
        >
          {/* center dot */}
          <div className="group-hover:bg-primary-400 h-1 w-1 rounded-full bg-neutral-300 transition-colors" />
        </div>
      )}

      {/* Export conversation dialog */}
      {exportConvId && (
        <ExportConversationDialog
          open={!!exportConvId}
          onOpenChange={(open) => {
            if (!open) setExportConvId(null)
          }}
          conversationId={exportConvId}
        />
      )}

      {/* Delete confirmation portal - rendered at body level */}
      {confirmDeleteId && confirmDeletePos && createPortal(
        <div
          ref={deleteConfirmRef}
          className="fixed z-[9999] rounded-lg border border-danger/30 bg-card p-3 shadow-xl"
          style={{
            left: Math.max(8, confirmDeletePos.x - 80),
            top: Math.max(8, confirmDeletePos.y - 60),
          }}
        >
          <p className="mb-2 text-xs text-secondary">
            {t('sidebar.confirmDeleteWorkspace', { name: displayedConversations.find(c => c.id === confirmDeleteId)?.title || '' })}
          </p>
          <div className="flex gap-2">
            <button
              className="rounded border border-danger/30 bg-danger/10 px-3 py-1 text-xs text-danger hover:bg-danger/20"
              onClick={() => {
                if (confirmDeleteId) {
                  deleteConversation(confirmDeleteId)
                    .then(() => toast.success(t('sidebar.workspaceDeleted')))
                    .catch((error) => {
                      console.error('[Sidebar] Failed to delete conversation:', error)
                      toast.error(t('sidebar.deleteWorkspaceFailed'))
                    })
                }
                setConfirmDeleteId(null)
                setConfirmDeletePos(null)
              }}
            >
              {t('common.delete')}
            </button>
            <button
              className="rounded border border-neutral-200 bg-white px-3 py-1 text-xs text-secondary hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              onClick={() => {
                setConfirmDeleteId(null)
                setConfirmDeletePos(null)
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
})
