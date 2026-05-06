/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WorkspaceLayout - main layout for the AI workbench.
 *
 * Composes: TopBar + Sidebar + Main content (ConversationView | WelcomeScreen) + SyncPreviewPanel
 *
 * Preview panels use Drawer overlays:
 * - File preview opens as an overlay drawer (does not squeeze conversation)
 * - Sync preview opens as an overlay drawer
 * - ESC or close button dismisses the preview
 *
 * When user sends a message from WelcomeScreen:
 * 1. WelcomeScreen calls onStartConversation(text)
 * 2. WorkspaceLayout creates a new conversation, sets it active, stores pendingMessage
 * 3. React re-renders → ConversationView mounts with initialMessage prop
 * 4. ConversationView's useEffect picks up initialMessage and calls sendMessage()
 * 5. pendingMessage is cleared via onInitialMessageConsumed callback
 */

import { useState, useCallback, useEffect } from 'react'
import { useConversationStore } from '@/store/conversation.store'
import { useAgentStore } from '@/store/agent.store'
import { useProjectStore } from '@/store/project.store'
import { useSettingsStore } from '@/store/settings.store'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useWorkspacePreferencesStore } from '@/store/workspace-preferences.store'
import { useRemoteStore, registerRemoteCallbacks } from '@/store/remote.store'
import { useMobile } from '@/components/mobile/useMobile'
import { useUnloadGuard } from '@/hooks/useUnloadGuard'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { ConversationView } from '@/components/agent/ConversationView'
import { FilePreview } from '@/components/file-viewer/FilePreview'
import { WelcomeScreenV2 } from '@/components/WelcomeScreenV2'
import { SyncPreviewPanel } from '@/components/sync'
import { Drawer } from '@/components/ui/drawer'
import { SkillsManager } from '@/components/skills/SkillsManager'
import { ToolsPanel, QuickActionsPanel } from '@/components/tools'
import { scanProjectSkills, syncResourcesToOPFS, syncProjectSkillsToActiveWorkspace } from '@/skills/skill-scanner'
import type { Skill, SkillResource } from '@/skills/skill-types'
import { getSkillManager } from '@/skills/skill-manager'
import { useSkillsStore } from '@/store/skills.store'
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
import { initializeTheme, useThemeStore } from '@/store/theme.store'
import { BrandButton } from '@creatorweave/ui'
import { MCPSettingsDialog } from '@/components/mcp'
import { useLocale, useT } from '@/i18n'
import { WebContainerPanel } from '@/components/webcontainer/WebContainerPanel'
import { useWebContainerStore } from '@/store/webcontainer.store'
import { getWorkspaceManager } from '@/opfs'
import { useFolderAccessStore } from '@/store/folder-access.store'

interface WorkspaceLayoutProps {
  onBackToProjects?: () => void
  projectName?: string
  conversationName?: string
  /** @deprecated use conversationName */
  workspaceName?: string
  /** Switch to a different project */
  onSwitchProject?: (projectId: string) => Promise<void>
  /** Open create-project dialog */
  onCreateProject?: () => void
  /** Navigate to project list */
  onManageProjects?: () => void
}

export function WorkspaceLayout({
  onBackToProjects,
  projectName,
  conversationName,
  workspaceName,
  onSwitchProject,
  onCreateProject,
  onManageProjects,
}: WorkspaceLayoutProps) {
  const waitForWorkspaceReady = useCallback(async (workspaceId: string, timeoutMs = 30000) => {
    const manager = await getWorkspaceManager()
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const workspace = await manager.getWorkspace(workspaceId)
      if (workspace) return true
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return false
  }, [])

  const {
    activeConversationId,
    conversations,
    createNew,
    setActive,
    runAgent,
    isConversationRunning,
    updateMessages,
    loaded,
    loadFromDB,
  } = useConversationStore()
  const { directoryHandle } = useAgentStore()
  const roots = useFolderAccessStore((s) => s.roots)
  const activeProjectId = useProjectStore((s) => s.activeProjectId || null)
  const { providerType, modelName, maxTokens, hasApiKey } = useSettingsStore()
  const { role } = useRemoteStore()
  const showPreview = useConversationContextStore((state) => state.showPreview)
  const projectWorkspaceIds = useConversationContextStore((state) => state.workspaces.map((w) => w.id))
  const workspaceCount = projectWorkspaceIds.length
  const hidePreviewPanel = useConversationContextStore((state) => state.hidePreviewPanel)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [selectedFileHandle, setSelectedFileHandle] = useState<FileSystemFileHandle | null>(null)
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false)

  // Skills management state
  const [skillsManagerOpen, setSkillsManagerOpen] = useState(false)
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const skillsLoaded = useSkillsStore((s) => s.loaded) // Reactive state
  const loadSkills = useSkillsStore((s) => s.loadSkills)

  // Phase 4: Workspace preferences state
  const {
    panelState,
    setSidebarCollapsed,
    setActiveResourceTab,
  } = useWorkspacePreferencesStore()

  // Phase 4: Dialog states
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false)
  const [showRecentFiles, setShowRecentFiles] = useState(false)
  const [showMcpSettings, setShowMcpSettings] = useState(false)
  const isWebContainerPanelOpen = useWebContainerStore((s) => s.isPanelOpen)
  const openWebContainerPanel = useWebContainerStore((s) => s.openPanel)
  const closeWebContainerPanel = useWebContainerStore((s) => s.closePanel)
  const [locale] = useLocale()
  const t = useT()

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
  const activeConversationName = conversationName ?? workspaceName

  // Guard against accidental page close when there are unsaved changes or running agent loops
  useUnloadGuard()

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

  // Phase 4: Initialize theme system on mount
  useEffect(() => {
    const cleanup = initializeTheme()
    return cleanup
  }, [])

  // Phase 4: Load conversations on mount (independent of Sidebar rendering)
  useEffect(() => {
    if (!loaded) loadFromDB()
  }, [loaded, loadFromDB])

  // Phase 4: Enhanced command palette commands
  const commands: Command[] = buildEnhancedCommands({
    // Conversations
    onNewConversation: () => {
      const newConv = createNew('New conversation')
      setActive(newConv.id)
    },
    onContinueLast: () => {
      if (conversations.length === 0) return
      const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
      const target = sorted.find((conv) => conv.id !== activeConversationId) || sorted[0]
      void setActive(target.id)
    },
    // Files
    onOpenFile: () => {
      setSidebarCollapsed(false)
      setActiveResourceTab('files')
      if (isMobile) {
        setIsSidebarOpen(true)
      }
    },
    onShowRecentFiles: () => setShowRecentFiles(true),

    // View
    onToggleSidebar: () => setSidebarCollapsed(!panelState.sidebarCollapsed),
    onToggleTheme: () => {
      const { mode, setTheme } = useThemeStore.getState()
      setTheme(mode === 'dark' ? 'light' : 'dark')
    },
    // Tools
    onOpenSkills: handleSkillsManagerOpen,
    onOpenTools: () => setToolsPanelOpen(true),
    onOpenMCP: () => {
      setShowMcpSettings(true)
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
  }, {
    t,
    enableLocalization: locale === 'zh-CN' || locale === 'en-US',
  })

  // Initialize skills on mount
  useEffect(() => {
    if (!skillsLoaded) {
      void loadSkills()
    }
  }, [skillsLoaded, loadSkills])

  // Scan project skills when roots change
  // Must wait for skillsLoaded to be true, otherwise cannot properly filter loaded skills
  useEffect(() => {
    const manager = getSkillManager()

    // Collect handles from all roots
    const handlesToScan: Array<{ handle: FileSystemDirectoryHandle; rootName: string }> = []
    for (const root of roots) {
      if (root.handle) {
        handlesToScan.push({ handle: root.handle, rootName: root.name })
      }
    }

    if (handlesToScan.length === 0) {
      manager.clearProjectSkills()
      void loadSkills()
      return
    }
    if (!skillsLoaded) return

    const scanForSkills = async () => {
      try {
        // Prevent stale cross-project visibility while switching projects.
        manager.clearProjectSkills()
        await loadSkills()

        console.log(`[WorkspaceLayout] Scanning project skills across ${handlesToScan.length} root(s)...`)

        let allSkills: Skill[] = []
        let allResources: SkillResource[] = []
        let allErrors: string[] = []

        for (const { handle, rootName } of handlesToScan) {
          const result = await scanProjectSkills(handle)
          // Prefix skill IDs with root name for disambiguation
          for (const skill of result.skills) {
            skill.id = `project:${rootName}:${skill.id.replace('project:', '')}`
          }
          allSkills = allSkills.concat(result.skills)
          allResources = allResources.concat(result.resources)
          allErrors = allErrors.concat(result.errors)
        }

        console.log(`[WorkspaceLayout] Scan result: ${allSkills.length} skills found`)
        if (allErrors.length > 0) {
          console.warn('[WorkspaceLayout] Scan errors:', allErrors)
        }

        if (allSkills.length > 0) {
          manager.setProjectSkills(allSkills, allResources, activeProjectId)
          await loadSkills()
        } else {
          manager.clearProjectSkills()
          await loadSkills()
          console.log(
            '[WorkspaceLayout] No project skills found (checked .claude/skills/ and .skills/)'
          )
        }

        // Sync skill resources to OPFS so Pyodide can access them at /mnt/.skills/
        await syncResourcesToOPFS({ skills: allSkills, resources: allResources, errors: allErrors })
        // Also sync .skills/ directories from all roots directly to OPFS
        if (activeConversationId) {
          const ready = await waitForWorkspaceReady(activeConversationId)
          if (ready) {
            for (const { handle, rootName } of handlesToScan) {
              await syncProjectSkillsToActiveWorkspace(handle, activeConversationId, rootName)
            }
          } else {
            console.warn(
              `[WorkspaceLayout] Workspace not ready for skill sync after timeout: ${activeConversationId}`
            )
          }
        }
      } catch (error) {
        console.error('Failed to scan project skills:', error)
      }
    }

    void scanForSkills()
  }, [roots, skillsLoaded, loadSkills, activeProjectId, activeConversationId, waitForWorkspaceReady])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open Command Palette (replaces Quick Actions)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowCommandPalette(true)
        return
      }

      // Cmd/Ctrl + P to toggle project switcher
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        setProjectSwitcherOpen((prev) => !prev)
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
        } else if (isWebContainerPanelOpen) {
          closeWebContainerPanel()
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
    isWebContainerPanelOpen,
    selectedFilePath,
    panelState.sidebarCollapsed,
    setSidebarCollapsed,
    setActiveResourceTab,
    closeWebContainerPanel,
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

  const hasActiveConversation =
    !!activeConversationId && conversations.some((c) => c.id === activeConversationId)

  // Close preview panel (hide without clearing changes)
  const handleClosePreview = useCallback(() => {
    hidePreviewPanel()
  }, [hidePreviewPanel])

  // Handle file click - set selected file for drawer preview
  const handleSidebarFileSelect = useCallback((path: string, handle: FileSystemFileHandle | null) => {
    setSelectedFilePath(path)
    setSelectedFileHandle(handle)
    if (isMobile) {
      setIsSidebarOpen(false)
    }
  }, [isMobile])

  // Handle element inspector from sidebar - open in new tab
  const handleElementInspect = useCallback(async (path: string, handle: FileSystemFileHandle | null) => {
    try {
      let content: string
      if (handle) {
        // Read from disk file handle
        const file = await handle.getFile()
        content = await file.text()
      } else {
        // Read from OPFS for pending create files
        const opfs = (await import('@/store/opfs.store')).useOPFSStore.getState()
        const result = await opfs.readFile(path)
        if (typeof result.content === 'string') {
          content = result.content
        } else if (result.content instanceof Blob) {
          content = await result.content.text()
        } else {
          const decoder = new TextDecoder()
          content = decoder.decode(result.content as ArrayBuffer)
        }
      }
      // Save to localStorage
      localStorage.setItem('preview-content-' + path, content)
      // Open in new tab
      window.open(`/preview?path=${encodeURIComponent(path)}`, '_blank')
    } catch (err) {
      console.error('[WorkspaceLayout] Failed to open inspector:', err)
    }
  }, [])

  // Close file preview drawer
  const handleCloseFilePreview = useCallback(() => {
    setSelectedFilePath(null)
    setSelectedFileHandle(null)
  }, [])

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white dark:bg-neutral-950">
      {/* Header */}
      <TopBar
        onSkillsManagerOpen={handleSkillsManagerOpen}
        onToolsPanelOpen={() => setToolsPanelOpen(true)}
        onCommandPaletteOpen={() => setShowCommandPalette(true)}
        onWorkspaceSettingsOpen={() => setShowWorkspaceSettings(true)}
        onWebContainerOpen={openWebContainerPanel}
        onBackToProjects={onBackToProjects}
        activeProjectName={projectName}
        activeConversationName={activeConversationName}
        onMenuOpen={() => setIsSidebarOpen((prev) => !prev)}
        isMobile={isMobile}
        onSwitchProject={onSwitchProject}
        onCreateProject={onCreateProject}
        onManageProjects={onManageProjects}
        projectSwitcherOpen={projectSwitcherOpen}
        onProjectSwitcherOpenChange={setProjectSwitcherOpen}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Mobile sidebar overlay */}
        {isMobile && isSidebarOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/45"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar - desktop inline, mobile drawer */}
        {!isMobile && (
          <Sidebar
            onFileSelect={handleSidebarFileSelect}
            onInspect={handleElementInspect}
            selectedFilePath={selectedFilePath}
          />
        )}
        {isMobile && isSidebarOpen && (
          <div className="absolute inset-y-0 left-0 z-50 w-[min(88vw,360px)] border-r border-border bg-background shadow-2xl dark:bg-card">
            <Sidebar
              isMobile
              onRequestClose={() => setIsSidebarOpen(false)}
              onFileSelect={handleSidebarFileSelect}
              onInspect={handleElementInspect}
              selectedFilePath={selectedFilePath}
            />
          </div>
        )}

        {/* Main area: conversation + optional sync preview panel */}
        <div className="flex min-w-0 flex-1 overflow-hidden">
          {/* Conversation / Welcome */}
          <main className="min-w-0 flex-1 overflow-hidden">
            {hasActiveConversation ? (
              <ConversationView
                initialMessage={pendingMessage}
                onInitialMessageConsumed={handleInitialMessageConsumed}
              />
            ) : (
              <div className="relative h-full min-h-0 w-full overflow-hidden">
                {workspaceCount === 0 && (
                  <div
                    className={`absolute z-10 rounded-lg border border-primary-200/70 bg-primary-50/85 text-primary-800 shadow-sm backdrop-blur-sm dark:border-primary-900/40 dark:bg-primary-950/25 dark:text-primary-200 ${
                      isMobile
                        ? 'left-3 right-3 top-3 max-w-none p-2.5 text-xs'
                        : 'left-4 top-4 max-w-md p-3 text-sm'
                    }`}
                  >
                    <p className="mb-2 text-primary-800 dark:text-primary-200">
                      {t('sidebar.emptyStateNoWorkspace')}
                    </p>
                    <BrandButton variant="outline" onClick={handleCreateFirstWorkspace}>
                      {t('sidebar.createFirstWorkspace')}
                    </BrandButton>
                  </div>
                )}
                <WelcomeScreenV2 onStartConversation={handleStartConversation} />
              </div>
            )}
          </main>

          {/* File preview as Drawer (overlay, no squeeze) */}
          <Drawer
            open={!!selectedFilePath}
            onClose={handleCloseFilePreview}
            width={isMobile ? '100vw' : '50vw'}
          >
            <FilePreview
              filePath={selectedFilePath}
              fileHandle={selectedFileHandle}
              onClose={handleCloseFilePreview}
            />
          </Drawer>

          {/* Sync preview as Drawer (overlay, no squeeze) */}
          <Drawer
            open={showPreview}
            onClose={handleClosePreview}
            title={t('settings.syncPanel.syncPreview.emptyStateTitle')}
            width={isMobile ? '100vw' : '85vw'}
          >
            <SyncPreviewPanel onCancel={handleClosePreview} />
          </Drawer>
        </div>
      </div>

      {/* Skills Manager Dialog */}
      <SkillsManager
        open={skillsManagerOpen}
        onClose={() => setSkillsManagerOpen(false)}
        directoryHandle={directoryHandle}
      />

      {/* Tools Panel */}
      <ToolsPanel isOpen={toolsPanelOpen} onClose={() => setToolsPanelOpen(false)} />

      {/* Quick Actions Panel */}
      <QuickActionsPanel
        isOpen={quickActionsOpen}
        onClose={() => setQuickActionsOpen(false)}
        onStartConversation={handleStartConversation}
      />

      {/* Phase 4: Command Palette */}
      <CommandPalette
        open={showCommandPalette}
        onOpenChange={setShowCommandPalette}
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

      <MCPSettingsDialog open={showMcpSettings} onOpenChange={setShowMcpSettings} />
      <WebContainerPanel isOpen={isWebContainerPanelOpen} onClose={closeWebContainerPanel} />
    </div>
  )
}

export default WorkspaceLayout
