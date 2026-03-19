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
import { Plus, Trash2, PanelLeftClose, PanelLeft, FolderTree, Puzzle, Clock, History } from 'lucide-react'
import { toast } from 'sonner'
import {
  BrandButton,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
} from '@creatorweave/ui'
import { useConversationStore } from '@/store/conversation.store'
import { useAgentStore } from '@/store/agent.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { FileTreePanel } from '@/components/file-viewer/FileTreePanel'
import { PendingSyncPanel } from '@/components/sync/PendingSyncPanel'
import { SnapshotList } from '@/components/sync/SnapshotList'

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
  onFileSelect?: (path: string, handle: FileSystemFileHandle) => void
  /** Currently selected file path (for highlight in tree) */
  selectedFilePath?: string | null
}

export function Sidebar({ onFileSelect, selectedFilePath }: SidebarProps) {
  const {
    conversations,
    activeConversationId,
    loaded,
    loadFromDB,
    createNew,
    setActive,
    deleteConversation,
    deleteConversations,
    isConversationRunning,
  } = useConversationStore()

  const { directoryHandle, directoryName } = useAgentStore()
  const workspaceStats = useWorkspaceStore((state) => state.workspaces)
  const workspaceIds = workspaceStats.map((w) => w.id)
  const currentPendingCount = useWorkspaceStore((state) => state.currentPendingCount)
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
  const scopedConversationIds = useMemo(() => scopedConversations.map((conv) => conv.id), [scopedConversations])

  // Load conversations on mount
  useEffect(() => {
    if (!loaded) loadFromDB()
  }, [loaded, loadFromDB])

  // Sidebar state
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(260)
  const [resourceTab, setResourceTab] = useState<ResourceTab>('files')
  const [conversationRatio, _setConversationRatio] = useState(loadConversationRatio)
  const [clearConversationsDialogOpen, setClearConversationsDialogOpen] = useState(false)
  const [clearingConversations, setClearingConversations] = useState(false)

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

  // Refresh pending changes when switching to pending tab
  const refreshPending = useCallback(async () => {
    const { refreshPendingChanges } = useWorkspaceStore.getState()
    await refreshPendingChanges()
  }, [])

  const handleFileSelect = useCallback(
    (path: string, handle: FileSystemFileHandle) => {
      onFileSelect?.(path, handle)
      // 如果有待同步文件，自动切换到 pending 标签
      const state = useWorkspaceStore.getState()
      if (state.pendingChanges && state.pendingChanges.changes.length > 0) {
        setResourceTab('pending')
      } else {
        setResourceTab('files')
      }
    },
    [onFileSelect]
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
          title="展开侧栏"
        >
          <PanelLeft className="h-4 w-4" />
        </BrandButton>
      </div>
    )
  }

  const hasResources = !!directoryHandle

  return (
    <>
      <div
        ref={sidebarRef}
        className="border-subtle bg-elevated flex shrink-0 flex-col border-r"
        style={{ width }}
      >
        {/* Collapse button */}
        <div className="border-subtle flex items-center justify-between border-b bg-white px-2 py-1 dark:bg-card">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">对话</span>
          <div className="flex items-center gap-1">
            <BrandButton
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              disabled={scopedConversationIds.length === 0 || clearingConversations}
              onClick={() => setClearConversationsDialogOpen(true)}
              title="清空当前项目会话"
            >
              清空
            </BrandButton>
            <BrandButton
              iconButton
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setCollapsed(true)}
              title="折叠侧栏"
            >
              <PanelLeftClose className="h-3 w-3" />
            </BrandButton>
          </div>
        </div>

        {/* Conversation list */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ height: hasResources ? `${conversationRatio}%` : '100%' }}
        >
          <div className="p-2">
            <BrandButton
              variant="ghost"
              className="h-7 w-full justify-start gap-1.5 bg-muted px-2 text-xs"
              onClick={() => {
                const conv = createNew()
                void setActive(conv.id)
              }}
            >
              <Plus className="h-3 w-3" />
              新对话
            </BrandButton>
          </div>

          <div className="custom-scrollbar flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {scopedConversations.map((conv) => {
              const isRunning = isConversationRunning(conv.id)
              const isActive = conv.id === activeConversationId
              const pendingReviewCount = pendingCountByConversationId.get(conv.id) || 0
              return (
                <div
                  key={conv.id}
                  className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    isActive
                      ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                      : 'hover:bg-hover text-secondary'
                  }`}
                  onClick={() => setActive(conv.id)}
                >
                  {/* Running status indicator */}
                  {isRunning && (
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-warning" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{conv.title}</span>
                  {pendingReviewCount > 0 && (
                    <span
                      className="rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-warning"
                      title={`${pendingReviewCount} 个变更待审阅`}
                    >
                      {pendingReviewCount}
                    </span>
                  )}
                  <BrandButton
                    iconButton
                    variant="ghost"
                    className="ml-auto h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={async (e) => {
                      e.stopPropagation()
                      try {
                        await deleteConversation(conv.id)
                        toast.success('会话已删除')
                      } catch (error) {
                        console.error('[Sidebar] Failed to delete conversation:', error)
                        toast.error('删除会话失败')
                      }
                    }}
                    title="删除对话"
                  >
                    <Trash2 className="h-3 w-3 text-danger" />
                  </BrandButton>
                </div>
              )
            })}
          </div>
        </div>

        {/* Vertical drag divider (only when resources are visible) */}
        {hasResources && (
          <div
            className="group relative flex h-2 shrink-0 cursor-row-resize items-center justify-center bg-neutral-50/50 transition-colors hover:bg-neutral-100/80 dark:bg-muted dark:hover:bg-muted"
            onMouseDown={handleVerticalDragStart}
            title="拖动调整高度"
          >
            {/* 中心圆点 */}
            <div className="group-hover:bg-primary-400 h-1 w-1 rounded-full bg-neutral-300 transition-colors" />
          </div>
        )}

        {/* Resource tabs (only when folder is selected) */}
        {hasResources && (
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
                文件
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
                快照
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
                变更
                {currentPendingCount > 0 && (
                  <span className="min-w-[1.1rem] rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-warning">
                    {currentPendingCount}
                  </span>
                )}
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
                插件
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
                />
              )}

              {resourceTab === 'plugins' && (
                <div className="custom-scrollbar h-full overflow-y-auto p-4">
                  <p className="text-tertiary text-xs">
                    插件管理功能将在此显示。请通过设置页面管理插件。
                  </p>
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
        )}
      </div>

      <BrandDialog
        open={clearConversationsDialogOpen}
        onOpenChange={setClearConversationsDialogOpen}
      >
        <BrandDialogContent className="max-w-md">
          <BrandDialogHeader>
            <BrandDialogTitle>清空会话</BrandDialogTitle>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="text-secondary text-sm">确认清空当前项目的所有会话？此操作不可撤销。</p>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton
              variant="ghost"
              disabled={clearingConversations}
              onClick={() => setClearConversationsDialogOpen(false)}
            >
              取消
            </BrandButton>
            <BrandButton
              variant="danger"
              onClick={async () => {
                try {
                  setClearingConversations(true)
                  const result = await deleteConversations(scopedConversationIds)
                  if (result.failed.length === 0) {
                    toast.success(`已清空 ${result.successIds.length} 个会话`)
                    setClearConversationsDialogOpen(false)
                  } else if (result.successIds.length === 0) {
                    toast.error(`清空失败（${result.failed.length} 个失败）`)
                  } else {
                    toast.error(`已删除 ${result.successIds.length} 个，失败 ${result.failed.length} 个`)
                  }
                } finally {
                  setClearingConversations(false)
                }
              }}
              disabled={scopedConversationIds.length === 0 || clearingConversations}
            >
              {clearingConversations ? '清空中...' : '清空'}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Horizontal drag divider (sidebar width) */}
      <div
        className="group relative flex w-2 shrink-0 cursor-col-resize flex-col items-center justify-center bg-neutral-50/50 transition-colors hover:bg-neutral-100/80 dark:bg-muted dark:hover:bg-muted"
        onMouseDown={handleDragStart}
        title="拖动调整宽度"
      >
        {/* 中心圆点 */}
        <div className="group-hover:bg-primary-400 h-1 w-1 rounded-full bg-neutral-300 transition-colors" />
      </div>
    </>
  )
}
