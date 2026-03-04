/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WorkspaceLayout - main layout for the AI workbench.
 *
 * Composes: TopBar + Sidebar + Main content (ConversationView | WelcomeScreen) + SyncPreviewPanel
 *
 * SyncPreviewPanel uses a "push-squeeze" pattern:
 * - When file changes are detected, preview panel opens in main area
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
import { useAgentStore } from '@/store/agent.store'
import { useSettingsStore } from '@/store/settings.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'
import { useRemoteStore, registerRemoteCallbacks } from '@/store/remote.store'
import { useMobile } from '@/components/mobile/useMobile'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { ConversationView } from '@/components/agent/ConversationView'
import { FilePreview } from '@/components/file-viewer/FilePreview'
import { WelcomeScreenV2 } from '@/components/WelcomeScreenV2'
import { SyncPreviewPanel } from '@/components/sync'
import { SkillsManager } from '@/components/skills/SkillsManager'
import { ProjectSkillsDialog } from '@/components/skills/ProjectSkillsDialog'
import { ToolsPanel, QuickActionsPanel } from '@/components/tools'
import { scanProjectSkills } from '@/skills/skill-scanner'
import { useSkillsStore } from '@/store/skills.store'
import type { SkillMetadata } from '@/skills/skill-types'
import { createUserMessage } from '@/agent/message-types'
import {
  CommandPalette,
  OnboardingTour,
  KeyboardShortcutsHelp,
  RecentFilesPanel,
  WorkspaceSettingsDialog,
  buildEnhancedCommands,
  type Command,
} from '@/components/workspace'
import { ExportPanel, useExport } from '@/components/export'
import { initializeTheme } from '@/store/theme.store'
import { BrandButton } from '@browser-fs-analyzer/ui'

interface WorkspaceLayoutProps {
  onBackToProjects?: () => void
  projectName?: string
  workspaceName?: string
}

export function WorkspaceLayout({ onBackToProjects, projectName, workspaceName }: WorkspaceLayoutProps) {
  const {
    activeConversationId,
    createNew,
    setActive,
    runAgent,
    isConversationRunning,
    updateMessages,
  } = useConversationStore()
  const { directoryHandle } = useAgentStore()
  const { providerType, modelName, maxTokens, hasApiKey } = useSettingsStore()
  const { role } = useRemoteStore()
  const showPreview = useWorkspaceStore((state) => state.showPreview)
  const projectWorkspaceIds = useWorkspaceStore((state) => state.workspaces.map((w) => w.id))
  const workspaceCount = projectWorkspaceIds.length
  const hidePreviewPanel = useWorkspaceStore((state) => state.hidePreviewPanel)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [selectedFileHandle, setSelectedFileHandle] = useState<FileSystemFileHandle | null>(null)

  // Skills management state
  const [skillsManagerOpen, setSkillsManagerOpen] = useState(false)
  const [projectSkills, setProjectSkills] = useState<SkillMetadata[]>([])
  const [showProjectSkillsDialog, setShowProjectSkillsDialog] = useState(false)
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const skillsStore = useSkillsStore()
  const skillsLoaded = useSkillsStore((s) => s.loaded) // Reactive state

  // Phase 4: Workspace preferences state
  const {
    panelSizes,
    panelState,
    setPreviewRatio,
    setSidebarCollapsed,
    setActiveResourceTab,
  } = useWorkspacePreferencesStore()

  // Phase 4: Dialog states
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false)
  const [showRecentFiles, setShowRecentFiles] = useState(false)

  // Export panel state
  const {
    isExportPanelOpen: isExportOpen,
    exportData,
    exportFilename,
    closeExport: closeExportPanel,
  } = useExport()

  // Mobile sidebar state
  const isMobile = useMobile()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Use panel sizes from preferences store
  const previewRatio = panelSizes.previewRatio

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

  const handleCreateFirstWorkspace = useCallback(() => {
    const conv = createNew('New conversation')
    setActive(conv.id)
  }, [createNew, setActive])

  // Skills management handlers
  const handleSkillsManagerOpen = useCallback(() => {
    setSkillsManagerOpen(true)
  }, [])

  const handleProjectSkillsConfirm = useCallback(
    async (selectedIds: string[]) => {
      console.log('[WorkspaceLayout] Loading skills:', selectedIds)
      // Load selected skills into skills store
      for (const id of selectedIds) {
        const skill = projectSkills.find((s) => s.id === id)
        if (skill) {
          console.log('[WorkspaceLayout] Saving skill to store:', {
            id: skill.id,
            name: skill.name,
          })
          await skillsStore.addSkill(skill as any)
          console.log(
            '[WorkspaceLayout] Skill saved, current store skills:',
            skillsStore.skills.map((s) => s.id)
          )
        }
      }
      console.log('[WorkspaceLayout] All skills saved, closing dialog')
      setShowProjectSkillsDialog(false)
      setProjectSkills([])
    },
    [projectSkills, skillsStore]
  )

  const handleProjectSkillsSkip = useCallback(() => {
    setShowProjectSkillsDialog(false)
    setProjectSkills([])
  }, [])

  // Phase 4: Initialize theme system on mount
  useEffect(() => {
    const cleanup = initializeTheme()
    return cleanup
  }, [])

  // Phase 4: Enhanced command palette commands
  const commands: Command[] = buildEnhancedCommands({
    // Conversations
    onNewConversation: () => {
      const newConv = createNew('New conversation')
      setActive(newConv.id)
    },
    onContinueLast: () => {
      // TODO: Implement continue last conversation
      console.log('[WorkspaceLayout] Continue last conversation')
    },
    // Files
    onOpenFile: () => {
      // TODO: Implement file picker
      console.log('[WorkspaceLayout] Open file')
    },
    onShowRecentFiles: () => setShowRecentFiles(true),

    // View
    onToggleSidebar: () => setSidebarCollapsed(!panelState.sidebarCollapsed),
    onToggleTheme: () => {
      // TODO: Toggle theme
      console.log('[WorkspaceLayout] Toggle theme')
    },
    // Tools
    onOpenSkills: handleSkillsManagerOpen,
    onOpenTools: () => setToolsPanelOpen(true),
    onOpenMCP: () => {
      // TODO: Open MCP settings
      console.log('[WorkspaceLayout] Open MCP')
    },
    // Settings & Help
    onOpenSettings: () => setShowWorkspaceSettings(true),
    onShowShortcuts: () => setShowShortcutsHelp(true),
    // Messages
    onSendMessage: (text: string) => {
      const conv = createNew(text.slice(0, 30))
      setActive(conv.id)
      setPendingMessage(text)
    },
  })

  // Initialize skills on mount
  useEffect(() => {
    if (!skillsLoaded) {
      skillsStore.loadSkills()
    }
  }, [skillsLoaded, skillsStore])

  // Scan project skills when directoryHandle changes
  // Must wait for skillsLoaded to be true, otherwise cannot properly filter loaded skills
  useEffect(() => {
    if (!directoryHandle) return
    if (!skillsLoaded) return

    const scanForSkills = async () => {
      try {
        console.log('[WorkspaceLayout] Scanning project skills...')
        const result = await scanProjectSkills(directoryHandle)
        console.log('[WorkspaceLayout] Scan result:', result.skills.length, 'skills found')
        if (result.errors.length > 0) {
          console.warn('[WorkspaceLayout] Scan errors:', result.errors)
        }

        if (result.skills.length > 0) {
          // Filter out skills that already exist in store
          const existingIds = new Set(skillsStore.skills.map((s) => s.id))
          const newSkills = result.skills.filter((s) => !existingIds.has(s.id))

          console.log(
            '[WorkspaceLayout] Found skills:',
            result.skills.map((s) => ({ id: s.id, name: s.name }))
          )
          console.log('[WorkspaceLayout] Already loaded skill IDs:', Array.from(existingIds))
          console.log(
            '[WorkspaceLayout] New skills (not loaded yet):',
            newSkills.map((s) => ({ id: s.id, name: s.name }))
          )

          if (newSkills.length > 0) {
            setProjectSkills(newSkills)
            setShowProjectSkillsDialog(true)
          }
        } else {
          console.log(
            '[WorkspaceLayout] No project skills found (checked .claude/skills/ and .skills/)'
          )
        }
      } catch (error) {
        console.error('Failed to scan project skills:', error)
      }
    }

    scanForSkills()
  }, [directoryHandle, skillsLoaded, skillsStore.skills])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open Command Palette (replaces Quick Actions)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowCommandPalette(true)
        return
      }

      // Cmd/Ctrl + B to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarCollapsed(!panelState.sidebarCollapsed)
        return
      }

      // Cmd/Ctrl + , to open workspace settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setShowWorkspaceSettings(true)
        return
      }

      // Cmd/Ctrl + 1/2/3 to switch resource tabs
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '3') {
        e.preventDefault()
        const tabs: Array<'files' | 'plugins' | 'changes'> = ['files', 'plugins', 'changes']
        const tabIndex = Number.parseInt(e.key) - 1
        if (tabIndex < tabs.length) {
          setActiveResourceTab(tabs[tabIndex])
        }
        return
      }

      // ? with Shift to show keyboard shortcuts
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault()
        setShowShortcutsHelp(true)
        return
      }

      // ESC to close panels
      if (e.key === 'Escape') {
        if (showCommandPalette) {
          setShowCommandPalette(false)
        } else if (showShortcutsHelp) {
          setShowShortcutsHelp(false)
        } else if (showWorkspaceSettings) {
          setShowWorkspaceSettings(false)
        } else if (showRecentFiles) {
          setShowRecentFiles(false)
        } else if (quickActionsOpen) {
          setQuickActionsOpen(false)
        } else if (toolsPanelOpen) {
          setToolsPanelOpen(false)
        } else if (skillsManagerOpen) {
          setSkillsManagerOpen(false)
        } else if (selectedFilePath) {
          setSelectedFilePath(null)
          setSelectedFileHandle(null)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    showCommandPalette,
    showShortcutsHelp,
    showWorkspaceSettings,
    showRecentFiles,
    quickActionsOpen,
    toolsPanelOpen,
    skillsManagerOpen,
    selectedFilePath,
    panelState.sidebarCollapsed,
    setSidebarCollapsed,
    setActiveResourceTab,
  ])

  // Register callbacks for remote messages (Host mode)
  useEffect(() => {
    if (role !== 'host') {
      return
    }

    const handleRemoteMessage = async (content: string, messageId: string) => {
      if (!hasApiKey) {
        return
      }

      // Use existing conversation or create new one
      let targetConvId = activeConversationId
      if (!targetConvId) {
        const newConv = createNew(content.slice(0, 30))
        setActive(newConv.id)
        targetConvId = newConv.id
        // Wait for state to update
        await new Promise((resolve) => setTimeout(resolve, 0))
      } else {
        // Check if already running
        if (isConversationRunning(targetConvId)) {
          return
        }
      }

      // Add user message
      const userMsg = createUserMessage(content)
      const currentConv = useConversationStore
        .getState()
        .conversations.find((c) => c.id === targetConvId)
      const currentMessages = currentConv ? [...currentConv.messages, userMsg] : [userMsg]
      updateMessages(targetConvId, currentMessages)

      // Run agent
      await runAgent(targetConvId, providerType, modelName, maxTokens, directoryHandle)

      // Send acknowledgment
      const { sendMessage } = useRemoteStore.getState()
      sendMessage('', messageId)
    }

    const handleRemoteCancel = () => {
      if (activeConversationId) {
        const { cancelAgent } = useConversationStore.getState()
        cancelAgent(activeConversationId)
      }
    }

    registerRemoteCallbacks(handleRemoteMessage, handleRemoteCancel)

    return () => {
      // Unregister callbacks on unmount or when role changes
      useRemoteStore.setState({
        _onRemoteMessage: null,
        _onRemoteCancel: null,
      })
    }
  }, [
    role,
    activeConversationId,
    hasApiKey,
    providerType,
    modelName,
    maxTokens,
    directoryHandle,
    createNew,
    setActive,
    updateMessages,
    runAgent,
    isConversationRunning,
  ])

  // Drag divider between conversation and preview
  const handleDividerDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (!mainRef.current) return
      dividerRef.current = { startX: e.clientX, startRatio: panelSizes.previewRatio }
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
    [panelSizes.previewRatio, setPreviewRatio]
  )

  const hasActiveConversation =
    !!activeConversationId && projectWorkspaceIds.includes(activeConversationId)
  const showFilePreview = !!selectedFilePath && !!selectedFileHandle
  const showRightPanel = showPreview || showFilePreview

  // Close preview panel (hide without clearing changes)
  const handleClosePreview = useCallback(() => {
    hidePreviewPanel()
  }, [hidePreviewPanel])

  const handleCloseFilePreview = useCallback(() => {
    setSelectedFilePath(null)
    setSelectedFileHandle(null)
  }, [])

  const handleSidebarFileSelect = useCallback((path: string, handle: FileSystemFileHandle) => {
    setSelectedFilePath(path)
    setSelectedFileHandle(handle)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-neutral-950">
      {/* Header */}
      <TopBar
        onSkillsManagerOpen={handleSkillsManagerOpen}
        onToolsPanelOpen={() => setToolsPanelOpen(true)}
        onCommandPaletteOpen={() => setShowCommandPalette(true)}
        onWorkspaceSettingsOpen={() => setShowWorkspaceSettings(true)}
        onBackToProjects={onBackToProjects}
        activeProjectName={projectName}
        activeWorkspaceName={workspaceName}
        onMenuOpen={() => setIsSidebarOpen(true)}
        isMobile={isMobile}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile sidebar overlay */}
        {isMobile && isSidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* Sidebar - hidden on mobile when closed */}
        {(!isMobile || isSidebarOpen) && (
          <Sidebar onFileSelect={handleSidebarFileSelect} selectedFilePath={selectedFilePath} />
        )}

        {/* Main area: conversation + optional sync preview panel */}
        <div ref={mainRef} className="flex flex-1 overflow-hidden">
          {/* Conversation / Welcome */}
          <main
            className="overflow-hidden"
            style={{ width: showRightPanel ? `${100 - previewRatio}%` : '100%' }}
          >
            {hasActiveConversation ? (
              <ConversationView
                initialMessage={pendingMessage}
                onInitialMessageConsumed={handleInitialMessageConsumed}
              />
            ) : (
              <div className="relative h-full">
                {workspaceCount === 0 && (
                  <div className="absolute left-4 top-4 z-10 max-w-md rounded-lg border border-primary-200/70 bg-primary-50/85 p-3 text-sm text-primary-800 shadow-sm backdrop-blur-sm dark:border-primary-900/40 dark:bg-primary-950/25 dark:text-primary-200">
                    <p className="mb-2 text-primary-800 dark:text-primary-200">
                      当前项目还没有工作区，创建首个会话后会自动生成工作区。
                    </p>
                    <BrandButton variant="outline" onClick={handleCreateFirstWorkspace}>
                      创建第一个工作区
                    </BrandButton>
                  </div>
                )}
                <WelcomeScreenV2 onStartConversation={handleStartConversation} />
              </div>
            )}
          </main>

          {/* Drag divider + Sync preview panel */}
          {showRightPanel && (
            <>
              <div
                className="hover:bg-primary-300 active:bg-primary-400 w-1 shrink-0 cursor-col-resize bg-neutral-200"
                onMouseDown={handleDividerDragStart}
              />
              <div
                className="overflow-hidden border-l border-neutral-200"
                style={{ width: `${previewRatio}%` }}
              >
                {showPreview ? (
                  <SyncPreviewPanel onCancel={handleClosePreview} />
                ) : (
                  <FilePreview
                    filePath={selectedFilePath}
                    fileHandle={selectedFileHandle}
                    onClose={handleCloseFilePreview}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Skills Manager Dialog */}
      <SkillsManager open={skillsManagerOpen} onClose={() => setSkillsManagerOpen(false)} />

      {/* Tools Panel */}
      <ToolsPanel isOpen={toolsPanelOpen} onClose={() => setToolsPanelOpen(false)} />

      {/* Quick Actions Panel */}
      <QuickActionsPanel
        isOpen={quickActionsOpen}
        onClose={() => setQuickActionsOpen(false)}
        onStartConversation={handleStartConversation}
      />

      {/* Project Skills Discovery Dialog */}
      <ProjectSkillsDialog
        open={showProjectSkillsDialog}
        skills={projectSkills}
        onConfirm={handleProjectSkillsConfirm}
        onSkip={handleProjectSkillsSkip}
      />

      {/* Phase 4: Command Palette */}
      <CommandPalette
        open={showCommandPalette}
        onOpenChange={() => setShowCommandPalette(false)}
        commands={commands}
      />

      {/* Phase 4: Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        open={showShortcutsHelp}
        onOpenChange={() => setShowShortcutsHelp(false)}
      />

      {/* Phase 4: Workspace Settings Dialog */}
      <WorkspaceSettingsDialog
        open={showWorkspaceSettings}
        onOpenChange={() => setShowWorkspaceSettings(false)}
      />

      {/* Phase 4: Recent Files Panel */}
      {showRecentFiles && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowRecentFiles(false)}
        >
          <div className="h-[60vh] w-[400px]" onClick={(e) => e.stopPropagation()}>
            <RecentFilesPanel
              onFileSelect={(path) => {
                setShowRecentFiles(false)
                // Find and select file
                const file = document.querySelector(`[data-file-path="${path}"]`) as HTMLElement
                file?.click()
              }}
            />
          </div>
        </div>
      )}

      {/* Phase 4: Onboarding Tour */}
      <OnboardingTour
        autoStart={true}
        onComplete={() => console.log('[WorkspaceLayout] Onboarding tour completed')}
        onSkip={() => console.log('[WorkspaceLayout] Onboarding tour skipped')}
      />

      {/* Export Panel */}
      {isExportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeExportPanel}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <ExportPanel
              data={exportData}
              defaultFilename={exportFilename}
              onExportComplete={(result) => {
                console.log('[WorkspaceLayout] Export completed:', result)
                closeExportPanel()
              }}
              onClose={closeExportPanel}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default WorkspaceLayout
