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

import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, Trash2, PanelLeftClose, PanelLeft, FolderTree, Puzzle, History } from 'lucide-react'
import { BrandButton } from '@browser-fs-analyzer/ui'
import { useConversationStore } from '@/store/conversation.store'
import { useAgentStore } from '@/store/agent.store'
import { FileTreePanel } from '@/components/file-viewer/FileTreePanel'
import { UndoPanel } from '@/components/file-viewer/UndoPanel'
import { getUndoManager } from '@/undo/undo-manager'

type ResourceTab = 'files' | 'plugins' | 'changes'

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
    isConversationRunning,
  } = useConversationStore()

  const { directoryHandle, directoryName } = useAgentStore()

  // Load conversations on mount
  useEffect(() => {
    if (!loaded) loadFromDB()
  }, [loaded, loadFromDB])

  // Sync undo manager with directory handle
  useEffect(() => {
    getUndoManager().setDirectoryHandle(directoryHandle)
  }, [directoryHandle])

  // Sidebar state
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(260)
  const [resourceTab, setResourceTab] = useState<ResourceTab>('files')
  const [conversationRatio, setConversationRatio] = useState(loadConversationRatio)

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

  const handleFileSelect = useCallback(
    (path: string, handle: FileSystemFileHandle) => {
      onFileSelect?.(path, handle)
      setResourceTab('files')
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
    [conversationRatio]
  )

  // Collapsed state
  if (collapsed) {
    return (
      <div className="border-subtle flex shrink-0 flex-col border-r bg-white">
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
        <div className="border-subtle flex items-center justify-between border-b bg-white px-3 py-2">
          <span className="text-tertiary text-[11px] font-semibold uppercase tracking-wider">
            对话
          </span>
          <BrandButton
            iconButton
            variant="ghost"
            onClick={() => setCollapsed(true)}
            title="折叠侧栏"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </BrandButton>
        </div>

        {/* Conversation list */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ height: hasResources ? `${conversationRatio}%` : '100%' }}
        >
          <div className="p-2">
            <BrandButton
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => createNew()}
            >
              <Plus className="h-3.5 w-3.5" />
              新对话
            </BrandButton>
          </div>

          <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-2 pb-2">
            {conversations.map((conv) => {
              const isRunning = isConversationRunning(conv.id)
              const isActive = conv.id === activeConversationId
              return (
                <div
                  key={conv.id}
                  className={`group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors ${
                    isActive
                      ? 'bg-primary-50 font-semibold text-primary-700'
                      : 'hover:bg-hover text-secondary'
                  }`}
                  onClick={() => setActive(conv.id)}
                >
                  {/* Running status indicator */}
                  {isRunning && (
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-warning" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{conv.title}</span>
                  <BrandButton
                    iconButton
                    variant="ghost"
                    className="ml-auto h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConversation(conv.id)
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
            className="bg-subtle hover:bg-primary-200 active:bg-primary-300 h-1 shrink-0 cursor-row-resize transition-colors"
            onMouseDown={handleVerticalDragStart}
            title="拖动调整高度"
          />
        )}

        {/* Resource tabs (only when folder is selected) */}
        {hasResources && (
          <div
            className="border-subtle flex flex-1 flex-col overflow-hidden border-t bg-white"
            style={{ height: `${100 - conversationRatio}%` }}
          >
            {/* Tab buttons */}
            <div className="border-subtle flex items-center gap-1 border-b px-2 py-2">
              <BrandButton
                variant={resourceTab === 'files' ? 'secondary' : 'ghost'}
                className="gap-1.5 px-3 py-1.5"
                onClick={() => setResourceTab('files')}
              >
                <FolderTree className="h-3.5 w-3.5" />
                文件
              </BrandButton>
              <BrandButton
                variant={resourceTab === 'plugins' ? 'secondary' : 'ghost'}
                className="gap-1.5 px-3 py-1.5"
                onClick={() => setResourceTab('plugins')}
              >
                <Puzzle className="h-3.5 w-3.5" />
                插件
              </BrandButton>
              <BrandButton
                variant={resourceTab === 'changes' ? 'secondary' : 'ghost'}
                className="gap-1.5 px-3 py-1.5"
                onClick={() => setResourceTab('changes')}
              >
                <History className="h-3.5 w-3.5" />
                变更
              </BrandButton>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
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

              {resourceTab === 'changes' && (
                <div className="h-full overflow-hidden">
                  <UndoPanel />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Horizontal drag divider (sidebar width) */}
      <div
        className="hover:bg-primary-200 active:bg-primary-300 w-1 shrink-0 cursor-col-resize bg-transparent transition-colors"
        onMouseDown={handleDragStart}
      />
    </>
  )
}
