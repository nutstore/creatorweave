/**
 * Sidebar - unified sidebar with conversation list + resource tabs.
 *
 * Top: Conversation list (always visible)
 * Bottom: Resource tabs (Files/Plugins/Changes) - visible when a folder is selected
 *
 * File preview is handled by WorkspaceLayout (push-squeeze panel in main area).
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, Trash2, PanelLeftClose, PanelLeft, FolderTree, Puzzle, History } from 'lucide-react'
import { useConversationStore } from '@/store/conversation.store'
import { useAgentStore } from '@/store/agent.store'
import { FileTreePanel } from '@/components/file-viewer/FileTreePanel'
import { UndoPanel } from '@/components/file-viewer/UndoPanel'
import { getUndoManager } from '@/undo/undo-manager'

type ResourceTab = 'files' | 'plugins' | 'changes'

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

  // Drag sidebar width
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const handleFileSelect = useCallback(
    (path: string, handle: FileSystemFileHandle) => {
      onFileSelect?.(path, handle)
      setResourceTab('files')
    },
    [onFileSelect]
  )

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

  // Collapsed state
  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col border-r border-neutral-200 bg-white">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          title="展开侧栏"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>
    )
  }

  const hasResources = !!directoryHandle

  return (
    <>
      <div
        className="flex shrink-0 flex-col border-r border-neutral-200 bg-neutral-50"
        style={{ width }}
      >
        {/* Collapse button */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-2 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
            对话
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title="折叠侧栏"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Conversation list */}
        <div className={`flex flex-col overflow-hidden ${hasResources ? 'h-1/2' : 'flex-1'}`}>
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => createNew()}
              className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
            >
              <Plus className="h-3.5 w-3.5" />
              新对话
            </button>
          </div>

          <div className="flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-1.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex cursor-pointer items-center rounded-md px-2.5 py-1.5 text-xs ${
                  conv.id === activeConversationId
                    ? 'bg-primary-100 font-medium text-primary-700'
                    : 'text-neutral-600 hover:bg-neutral-200'
                }`}
                onClick={() => setActive(conv.id)}
              >
                <span className="min-w-0 flex-1 truncate">{conv.title}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConversation(conv.id)
                  }}
                  className="ml-1 hidden shrink-0 rounded p-0.5 text-neutral-400 hover:text-red-500 group-hover:block"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Resource tabs (only when folder is selected) */}
        {hasResources && (
          <div className="flex flex-1 flex-col overflow-hidden border-t border-neutral-200">
            {/* Tab buttons */}
            <div className="flex items-center gap-0.5 border-b border-neutral-200 bg-white px-2 py-1">
              <button
                type="button"
                onClick={() => setResourceTab('files')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                  resourceTab === 'files'
                    ? 'bg-neutral-200 text-neutral-700'
                    : 'text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                <FolderTree className="h-3 w-3" />
                文件
              </button>
              <button
                type="button"
                onClick={() => setResourceTab('plugins')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                  resourceTab === 'plugins'
                    ? 'bg-neutral-200 text-neutral-700'
                    : 'text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                <Puzzle className="h-3 w-3" />
                插件
              </button>
              <button
                type="button"
                onClick={() => setResourceTab('changes')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                  resourceTab === 'changes'
                    ? 'bg-neutral-200 text-neutral-700'
                    : 'text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                <History className="h-3 w-3" />
                变更
              </button>
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
                <div className="h-full overflow-y-auto p-2">
                  <p className="text-xs text-neutral-500">
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

      {/* Drag divider */}
      <div
        className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-primary-300 active:bg-primary-400"
        onMouseDown={handleDragStart}
      />
    </>
  )
}
