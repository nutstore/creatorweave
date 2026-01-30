/**
 * WorkspaceLayout - main layout for the AI workbench.
 *
 * Composes: TopBar + Sidebar + Main content (ConversationView | WelcomeScreen) + FilePreview
 *
 * File preview uses a "push-squeeze" pattern:
 * - When a file is selected in the sidebar tree, the preview panel opens in the main area
 * - Conversation is squeezed to ~40%, preview takes ~60%
 * - A draggable divider allows resizing
 * - ESC or close button dismisses the preview
 *
 * When user sends a message from WelcomeScreen:
 * 1. WelcomeScreen calls onStartConversation(text)
 * 2. WorkspaceLayout creates a new conversation, sets it active, stores pendingMessage
 * 3. React re-renders → ConversationView mounts with initialMessage prop
 * 4. ConversationView's useEffect picks up initialMessage and calls sendMessage()
 * 5. pendingMessage is cleared via onInitialMessageConsumed callback
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useConversationStore } from '@/store/conversation.store'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { ConversationView } from '@/components/agent/ConversationView'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { FilePreview } from '@/components/file-viewer/FilePreview'

export function WorkspaceLayout() {
  const { activeConversationId, createNew, setActive } = useConversationStore()
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)

  // File preview state (push-squeeze panel)
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null)
  const [previewFileHandle, setPreviewFileHandle] = useState<FileSystemFileHandle | null>(null)
  const [previewRatio, setPreviewRatio] = useState(60) // preview takes 60% of main area

  // Drag divider for preview panel
  const dividerRef = useRef<{ startX: number; startRatio: number } | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  const handleStartConversation = useCallback(
    (text: string) => {
      const conv = createNew(text.slice(0, 30))
      setActive(conv.id)
      setPendingMessage(text)
    },
    [createNew, setActive]
  )

  const handleInitialMessageConsumed = useCallback(() => {
    setPendingMessage(null)
  }, [])

  const handleFileSelect = useCallback((path: string, handle: FileSystemFileHandle) => {
    setPreviewFilePath(path)
    setPreviewFileHandle(handle)
  }, [])

  const handleClosePreview = useCallback(() => {
    setPreviewFilePath(null)
    setPreviewFileHandle(null)
  }, [])

  // ESC key to close preview
  useEffect(() => {
    if (!previewFilePath) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClosePreview()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [previewFilePath, handleClosePreview])

  // Drag divider between conversation and preview
  const handleDividerDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (!mainRef.current) return
      dividerRef.current = { startX: e.clientX, startRatio: previewRatio }

      const mainWidth = mainRef.current.clientWidth

      const handleMove = (me: MouseEvent) => {
        if (!dividerRef.current) return
        const delta = me.clientX - dividerRef.current.startX
        // Moving right → preview smaller, moving left → preview larger
        const deltaPercent = (delta / mainWidth) * 100
        const newRatio = Math.max(30, Math.min(80, dividerRef.current.startRatio - deltaPercent))
        setPreviewRatio(newRatio)
      }

      const handleUp = () => {
        dividerRef.current = null
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [previewRatio]
  )

  const hasActiveConversation = !!activeConversationId
  const showPreview = !!previewFilePath

  return (
    <div className="flex h-screen flex-col bg-white">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar onFileSelect={handleFileSelect} selectedFilePath={previewFilePath} />

        {/* Main area: conversation + optional file preview */}
        <div ref={mainRef} className="flex flex-1 overflow-hidden">
          {/* Conversation / Welcome */}
          <main
            className="overflow-hidden"
            style={{ width: showPreview ? `${100 - previewRatio}%` : '100%' }}
          >
            {hasActiveConversation ? (
              <ConversationView
                initialMessage={pendingMessage}
                onInitialMessageConsumed={handleInitialMessageConsumed}
              />
            ) : (
              <WelcomeScreen onStartConversation={handleStartConversation} />
            )}
          </main>

          {/* Drag divider + File preview panel */}
          {showPreview && (
            <>
              <div
                className="w-1 shrink-0 cursor-col-resize bg-neutral-200 hover:bg-primary-300 active:bg-primary-400"
                onMouseDown={handleDividerDragStart}
              />
              <div
                className="overflow-hidden border-l border-neutral-200"
                style={{ width: `${previewRatio}%` }}
              >
                <FilePreview
                  filePath={previewFilePath}
                  fileHandle={previewFileHandle}
                  onClose={handleClosePreview}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
