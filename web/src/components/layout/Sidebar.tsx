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

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
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
import { useAgentStore } from '@/store/agent.store'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { FileTreePanel } from '@/components/file-viewer/FileTreePanel'
import { PendingSyncPanel } from '@/components/sync/PendingSyncPanel'
import { SnapshotList } from '@/components/sync/SnapshotList'
import { SidebarPanelHeader } from '@/components/layout/SidebarPanelHeader'
import { useT } from '@/i18n'
import { ExportConversationDialog } from '@/components/conversation/ExportConversationDialog'

type ResourceTab = 'files' | 'plugins' | 'pending' | 'snapshots'

const STORAGE_KEY_RATIO = 'sidebar-conversation-ratio'

const DEFAULT_CONVERSATION_RATIO = 50 // percentage
const MIN_CONVERSATION_RATIO = 20 // minimum percentage
const MAX_CONVERSATION_RATIO = 80 // maximum percentage

// Load saved conversation ratio from localStorage
function loadConversationRatio(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_RATIO)
    if (saved) {
      const ratio = Number(saved)
      if (ratio >= MIN_CONVERSATION_RATIO && ratio <= MAX_CONVERSATION_RATIO) {
        return ratio
      }
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_CONVERSATION_RATIO
}

// Save conversation ratio to localStorage
function saveConversationRatio(ratio: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_RATIO, String(ratio))
  } catch {
    // Ignore storage errors
  }
}

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
}

export function Sidebar({
  onFileSelect,
  onInspect,
  selectedFilePath,
  isMobile = false,
  onRequestClose,
}: SidebarProps) {
  const t = useT()

  const {
    conversations,
    activeConversationId,
    createNew,
    setActive,
    deleteConversation,
    deleteConversations,
    isConversationRunning,
    updateTitle,
  } = useConversationStore()

  const { directoryHandle, directoryName } = useAgentStore()
  const workspaceStats = useConversationContextStore((state) => state.workspaces)
  const workspaceIds = workspaceStats.map((w) => w.id)
  const currentPendingCount = useConversationContextStore((state) => state.currentPendingCount)
  const scopedWorkspaceIdSet = new Set(workspaceIds)
  const scopedConversations = conversations.filter(
    (conv) => scopedWorkspaceIdSet.has(conv.id) || conv.id === activeConversationId
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

  // Sidebar state
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(320)
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
  const [conversationRatio, _setConversationRatio] = useState(loadConversationRatio)
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

  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      onRequestClose?.()
    }
  }, [isMobile, onRequestClose])

  // Rename handlers
  const startRename = useCallback((convId: string, currentTitle: string) => {
    setEditingId(convId)
    setEditingTitle(currentTitle)
    // Focus the input after React renders it
    requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
  }, [])

  const confirmRename = useCallback(() => {
    if (editingId && editingTitle.trim()) {
      const trimmedTitle = editingTitle.trim()
      // Find current conversation to check if title actually changed
      const conv = scopedConversations.find((c) => c.id === editingId)
      if (conv && conv.title !== trimmedTitle) {
        updateTitle(editingId, trimmedTitle)
      }
    }
    setEditingId(null)
    setEditingTitle('')
  }, [editingId, editingTitle, updateTitle, scopedConversations])

  const cancelRename = useCallback(() => {
    setEditingId(null)
    setEditingTitle('')
    setComposing(false)
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

  // Save ratio when it changes
  useEffect(() => {
    saveConversationRatio(conversationRatio)
  }, [conversationRatio])

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
      dragRef.current = { startX: e.clientX, startWidth: width }

      const handleMove = (me: MouseEvent) => {
        if (!dragRef.current) return
        const delta = me.clientX - dragRef.current.startX
        const newWidth = Math.max(200, Math.min(400, dragRef.current.startWidth + delta))
        setWidth(newWidth)
      }

      const handleUp = () => {
        dragRef.current = null
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [width]
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
        _setConversationRatio(newRatio)
      }

      const handleUp = () => {
        verticalDragRef.current = null
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [conversationRatio]
  )

  // Collapsed state
  if (collapsed) {
    return (
      <div className="border-subtle flex shrink-0 flex-col border-r bg-white dark:bg-card">
        <BrandButton
          iconButton
          variant="ghost"
          onClick={() => setCollapsed(false)}
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
                setCollapsed(true)
              }}
              title={isMobile ? t('sidebar.closeSidebar') : t('sidebar.collapseSidebar')}
            >
              <PanelLeftClose className="h-3 w-3" />
            </BrandButton>
          </div>
        </div>

        {/* Conversation list */}
        <div
          className="flex flex-col overflow-hidden"
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
            <div className="px-2 pb-1">
              <BrandButton
                variant="ghost"
                className="h-7 w-full justify-start gap-1.5 bg-muted px-2 text-xs"
                onClick={() => {
                  const conv = createNew()
                  void setActive(conv.id)
                  closeMobileSidebar()
                }}
              >
                <Plus className="h-3 w-3" />
                {t('sidebar.newWorkspace')}
              </BrandButton>
            </div>
          )}

          <div className="custom-scrollbar flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {displayedConversations.map((conv) => {
              const isRunning = isConversationRunning(conv.id)
              const isActive = conv.id === activeConversationId
              const pendingReviewCount = pendingCountByConversationId.get(conv.id) || 0
              const isEditing = editingId === conv.id
              const isArchived = workspaceStatusMap.get(conv.id) === 'archived'
              const isPinned = pinnedIds.includes(conv.id)

              return (
                <ContextMenu key={conv.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={isActive}
                      aria-label={t('sidebar.workspaceLabel', { name: conv.title })}
                      className={`group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 ${
                        isActive
                          ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                          : 'hover:bg-hover text-secondary'
                      }`}
                      onClick={() => {
                        if (isEditing) return
                        setActive(conv.id)
                        closeMobileSidebar()
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startRename(conv.id, conv.title)
                      }}
                      onKeyDown={(e) => {
                        if (isEditing) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setActive(conv.id)
                          closeMobileSidebar()
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

                      {/* Delete button - visible on hover */}
                      <button
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-danger/30 bg-danger/10 p-0.5 opacity-0 text-danger transition-all hover:border-danger/50 hover:bg-danger/20 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-danger-500 focus:ring-offset-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          setConfirmDeleteId(conv.id)
                          // Get button position for portal
                          const rect = e.currentTarget.getBoundingClientRect()
                          setConfirmDeletePos({ x: rect.left, y: rect.top })
                        }}
                        title={t('sidebar.deleteWorkspace')}
                        aria-label={t('sidebar.deleteWorkspace')}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>

                      {isEditing ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onCompositionStart={() => setComposing(true)}
                          onCompositionEnd={() => setComposing(false)}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter' && !composing) {
                              confirmRename()
                            } else if (e.key === 'Escape') {
                              cancelRename()
                            }
                          }}
                          onBlur={confirmRename}
                          onClick={(e) => e.stopPropagation()}
                          className="min-w-0 flex-1 rounded border border-primary-300 bg-white px-1.5 py-0.5 text-xs text-primary outline-none focus:ring-1 focus:ring-primary-500 dark:border-primary-600 dark:bg-card dark:text-primary"
                          maxLength={100}
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate" title={conv.title}>{conv.title}</span>
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
                      onClick={() => togglePin(conv.id)}
                    >
                      {isPinned
                        ? <PinOff className="mr-2 h-3.5 w-3.5" />
                        : <Pin className="mr-2 h-3.5 w-3.5" />
                      }
                      {isPinned ? t('sidebar.unpinWorkspace') : t('sidebar.pinWorkspace')}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => startRename(conv.id, conv.title)}
                    >
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      {t('sidebar.renameWorkspace')}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => setExportConvId(conv.id)}
                    >
                      <Download className="mr-2 h-3.5 w-3.5" />
                      {t('sidebar.exportWorkspace') || 'Export'}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={async () => {
                        const { archiveWorkspace, unarchiveWorkspace } = useConversationContextStore.getState()
                        try {
                          if (isArchived) {
                            await unarchiveWorkspace(conv.id)
                            toast.success(t('sidebar.workspaceUnarchived'))
                          } else {
                            await archiveWorkspace(conv.id)
                            toast.success(t('sidebar.workspaceArchived'))
                          }
                        } catch (error) {
                          console.error('[Sidebar] Failed to toggle archive:', error)
                          toast.error(isArchived ? t('sidebar.unarchiveFailed') : t('sidebar.archiveFailed'))
                        }
                      }}
                    >
                      {isArchived
                        ? <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                        : <Archive className="mr-2 h-3.5 w-3.5" />
                      }
                      {isArchived ? t('sidebar.unarchiveWorkspace') : t('sidebar.archiveWorkspace')}
                    </ContextMenuItem>
                    <ContextMenuItem
                      className="text-danger focus:text-danger"
                      onClick={async () => {
                        try {
                          await deleteConversation(conv.id)
                          toast.success(t('sidebar.workspaceDeleted'))
                        } catch (error) {
                          console.error('[Sidebar] Failed to delete conversation:', error)
                          toast.error(t('sidebar.deleteWorkspaceFailed'))
                        }
                      }}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      {t('sidebar.deleteWorkspace')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
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

        {/* Resource tabs */}
        <div
          className="border-subtle flex flex-1 flex-col overflow-hidden border-t bg-white dark:bg-card"
          style={{ height: `${100 - conversationRatio}%` }}
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
                onClick={() => setResourceTab('files')}
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
                  setResourceTab('pending')
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
                onClick={() => setResourceTab('snapshots')}
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
                onClick={() => setResourceTab('plugins')}
              >
                <Puzzle className="h-3 w-3" />
                {t('sidebar.plugins')}
              </BrandButton>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden" data-tour="file-tree">
              {resourceTab === 'files' && (
                <FileTreePanel
                  directoryHandle={directoryHandle}
                  rootName={directoryName}
                  onFileSelect={handleFileSelect}
                  selectedPath={selectedFilePath}
                  onInspect={onInspect}
                />
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
}
