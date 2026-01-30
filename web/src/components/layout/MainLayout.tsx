/**
 * MainLayout - dual-pane layout for agent view.
 * Left: File tree + file preview / undo panel
 * Right: Agent conversation panel
 * Draggable divider between left and right.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { PanelLeftClose, PanelLeft, History } from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { FileTreePanel } from '@/components/file-viewer/FileTreePanel'
import { FilePreview } from '@/components/file-viewer/FilePreview'
import { UndoPanel } from '@/components/file-viewer/UndoPanel'
import { AgentPanel } from '@/components/agent/AgentPanel'
import { getUndoManager } from '@/undo/undo-manager'

type LeftTab = 'preview' | 'undo'

export function MainLayout() {
  const { directoryHandle, directoryName } = useAgentStore()

  // Sync undo manager with directory handle
  useEffect(() => {
    getUndoManager().setDirectoryHandle(directoryHandle)
  }, [directoryHandle])

  // Left panel state
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [leftWidth, setLeftWidth] = useState(360)
  const [leftTab, setLeftTab] = useState<LeftTab>('preview')

  // File preview state
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [selectedFileHandle, setSelectedFileHandle] = useState<FileSystemFileHandle | null>(null)

  // Drag state
  const dragRef = useRef<{
    startX: number
    startWidth: number
  } | null>(null)

  const handleFileSelect = useCallback((path: string, handle: FileSystemFileHandle) => {
    setSelectedFilePath(path)
    setSelectedFileHandle(handle)
    setLeftTab('preview')
  }, [])

  const handleClosePreview = useCallback(() => {
    setSelectedFilePath(null)
    setSelectedFileHandle(null)
  }, [])

  // Drag divider logic
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startWidth: leftWidth }

      const handleMove = (me: MouseEvent) => {
        if (!dragRef.current) return
        const delta = me.clientX - dragRef.current.startX
        const newWidth = Math.max(200, Math.min(600, dragRef.current.startWidth + delta))
        setLeftWidth(newWidth)
      }

      const handleUp = () => {
        dragRef.current = null
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [leftWidth]
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      {!leftCollapsed && (
        <>
          <div
            className="flex shrink-0 flex-col border-r border-neutral-200 bg-neutral-50"
            style={{ width: leftWidth }}
          >
            {/* Left panel toolbar */}
            <div className="flex items-center border-b border-neutral-200 bg-white px-1 py-1">
              <button
                type="button"
                onClick={() => setLeftCollapsed(true)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                title="折叠侧栏"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>

              <div className="ml-2 flex gap-0.5">
                <button
                  type="button"
                  onClick={() => setLeftTab('preview')}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    leftTab === 'preview'
                      ? 'bg-neutral-200 text-neutral-700'
                      : 'text-neutral-500 hover:bg-neutral-100'
                  }`}
                >
                  文件
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab('undo')}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                    leftTab === 'undo'
                      ? 'bg-neutral-200 text-neutral-700'
                      : 'text-neutral-500 hover:bg-neutral-100'
                  }`}
                >
                  <History className="h-3 w-3" />
                  变更
                </button>
              </div>
            </div>

            {/* Left panel content */}
            {leftTab === 'preview' ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* File tree (top half) */}
                <div className="h-1/2 overflow-hidden border-b border-neutral-200">
                  <FileTreePanel
                    directoryHandle={directoryHandle}
                    rootName={directoryName}
                    onFileSelect={handleFileSelect}
                    selectedPath={selectedFilePath}
                  />
                </div>

                {/* File preview (bottom half) */}
                <div className="flex-1 overflow-hidden">
                  <FilePreview
                    filePath={selectedFilePath}
                    fileHandle={selectedFileHandle}
                    onClose={handleClosePreview}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <UndoPanel />
              </div>
            )}
          </div>

          {/* Drag divider */}
          <div
            className="w-1 shrink-0 cursor-col-resize bg-neutral-200 hover:bg-primary-300 active:bg-primary-400"
            onMouseDown={handleDragStart}
          />
        </>
      )}

      {/* Collapse toggle (when collapsed) */}
      {leftCollapsed && (
        <div className="flex shrink-0 flex-col border-r border-neutral-200 bg-white">
          <button
            type="button"
            onClick={() => setLeftCollapsed(false)}
            className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title="展开侧栏"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Right panel - Agent */}
      <div className="flex-1 overflow-hidden">
        <AgentPanel />
      </div>
    </div>
  )
}
