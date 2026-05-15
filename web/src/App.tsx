import { useEffect, useState, useRef } from 'react'
import { HashRouter, Routes, Route, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { UnsupportedBrowser } from '@/components/UnsupportedBrowser'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { StorageLoading } from '@/components/StorageLoading'
import { DatabaseRefreshDialog } from '@/components/DatabaseRefreshDialog'
import { attemptReconnect } from '@/store/remote.store'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useProjectStore } from '@/store/project.store'
import { useConversationStore } from '@/store/conversation.store'
import { useOPFSStore } from '@/store/opfs.store'
import {
  initStorage,
  setupAutoSave,
  clearSQLiteAndProjectsDirectory,
  RESET_REQUIRES_TAB_CLOSURE,
  getRuntimeCapability,
} from '@/storage'
import { useT } from '@/i18n'
import { useLocale } from '@/i18n'
import { InstallPrompt } from '@/pwa/InstallPrompt'
import { useExtensionStore } from '@/store/extension.store'
import { ExtensionInstallGuide } from '@/components/extension'
import { ProjectHome } from '@/components/project/ProjectHome'
import { WebContainerStandalonePreview } from '@/components/webcontainer/WebContainerStandalonePreview'
import { StandalonePreview } from '@/components/file-viewer/StandalonePreview'
import { DocsPage } from '@/pages/docs/DocsPage'

// ---------------------------------------------------------------------------
// Route components — extract params from react-router and delegate to pages
// ---------------------------------------------------------------------------

/**
 * WorkspaceRoute — renders WorkspaceLayout with project/workspace sync logic.
 *
 * Moved from the giant syncFromRoute useEffect in the old hand-rolled router.
 * react-router controls when this component mounts/unmounts; we only need to
 * react to param changes (projectId / workspaceId) here.
 */
function WorkspaceRoute() {
  const { projectId: rawProjectId, workspaceId: rawWorkspaceId } = useParams<{
    projectId: string
    workspaceId?: string
  }>()
  const navigate = useNavigate()

  // react-router v6 useParams() already decodes URI components
  const projectId = rawProjectId ?? ''
  const workspaceId = rawWorkspaceId ?? undefined

  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeConversationTitle = useConversationStore((s) => {
    const { activeConversationId, conversations } = s
    if (!activeConversationId) return undefined
    return conversations.find((c) => c.id === activeConversationId)?.title
  })

  const t = useT()

  const activeProject = projects.find((project) => project.id === activeProjectId)
  const activeConversation = activeConversationTitle
    ? { title: activeConversationTitle }
    : undefined

  // Route → store sync effect (ported from original syncFromRoute)
  useEffect(() => {
    if (!projectId) return
    // Snapshot store state via getState() to avoid subscribing to values
    // that this effect itself modifies (prevents infinite loops).
    const _isStorageReady = useProjectStore.getState().initialized
    const _projectLoading = useProjectStore.getState().isLoading
    if (!_isStorageReady || _projectLoading) return

    let cancelled = false

    const syncFromRoute = async () => {
      const _projects = useProjectStore.getState().projects
      const _activeProjectId = useProjectStore.getState().activeProjectId

      // Step 1: Validate project exists
      const projectExists = _projects.some((project) => project.id === projectId)
      if (!projectExists) {
        toast.error(t('app.projectNotFound'))
        navigate('/projects', { replace: true })
        return
      }

      // Step 2: Switch project if needed (this clears workspace state & loads new list)
      if (_activeProjectId !== projectId) {
        const switched = await setActiveProject(projectId)
        if (!switched) {
          if (!cancelled) {
            toast.error(t('app.switchProjectFailed'))
            navigate('/projects', { replace: true })
          }
          return
        }
      }

      if (cancelled) return

      // Step 3: Determine which workspace to activate
      const workspaces = useConversationContextStore.getState().workspaces
      const scopedWorkspaceIds = workspaces.map((w) => w.id)
      const activeWorkspaceId = useConversationContextStore.getState().activeWorkspaceId

      // Resolve target workspace ID:
      // - If URL specifies one, use it (if valid)
      // - Otherwise fall back to current active or most recent
      let targetWorkspaceId: string | null = null

      if (workspaceId && scopedWorkspaceIds.includes(workspaceId)) {
        targetWorkspaceId = workspaceId
      } else if (workspaceId) {
        // URL workspace not found in this project — check if it's a brand-new conversation
        // (not yet in workspace list). Allow transient pass-through.
        const convState = useConversationStore.getState()
        const isNewConversation = convState.conversations.some((c) => c.id === workspaceId)
        if (isNewConversation) {
          targetWorkspaceId = workspaceId
        }
      }

      // Fallback: use active workspace or pick most recent
      if (!targetWorkspaceId) {
        if (activeWorkspaceId && scopedWorkspaceIds.includes(activeWorkspaceId)) {
          targetWorkspaceId = activeWorkspaceId
        } else if (scopedWorkspaceIds.length > 0) {
          const sorted = [...workspaces].sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0))
          targetWorkspaceId = sorted[0].id
        }
      }

      // No workspace available — redirect to bare project URL
      if (!targetWorkspaceId) {
        if (!workspaceId) {
          // Already on bare project URL, nothing more to do
          return
        }
        navigate(`/projects/${encodeURIComponent(projectId)}/workspace`, { replace: true })
        return
      }

      // Step 4: Update URL to include the resolved workspace (replace, not push)
      if (targetWorkspaceId !== workspaceId) {
        const desiredPath = `/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(targetWorkspaceId)}`
        navigate(desiredPath, { replace: true })
      }

      if (cancelled) return

      // Step 5: Switch workspace (OPFS/SQLite operations only, no conversation side-effects)
      if (activeWorkspaceId !== targetWorkspaceId) {
        await useConversationContextStore.getState().switchWorkspace(targetWorkspaceId)
      }

      if (cancelled) return

      // Step 6: Activate conversation (loads messages, no workspace side-effects)
      const activeConversationId = useConversationStore.getState().activeConversationId
      if (activeConversationId !== targetWorkspaceId) {
        await useConversationStore.getState().setActive(targetWorkspaceId)
      }
    }

    void syncFromRoute()

    return () => {
      cancelled = true
    }
  }, [projectId, workspaceId, setActiveProject, navigate, t])

  return (
    <WorkspaceLayout
      onBackToProjects={() => navigate('/projects')}
      projectName={activeProject?.name}
      conversationName={activeConversation?.title}
      onSwitchProject={async (targetProjectId: string) => {
        navigate(`/projects/${encodeURIComponent(targetProjectId)}/workspace`)
      }}
      onCreateProject={() => navigate('/projects')}
      onManageProjects={() => navigate('/projects')}
      onSelectWorkspace={(wsId: string) => {
        navigate(`/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(wsId)}`)
      }}
    />
  )
}

/**
 * DocsRoute — extracts language/category/page params for DocsPage.
 */
function DocsRoute() {
  const { language, category, page } = useParams<{
    language?: string
    category?: string
    page?: string
  }>()
  const navigate = useNavigate()

  const isDocsLanguage = (v?: string): v is 'zh' | 'en' => v === 'zh' || v === 'en'
  const isDocsCategory = (v?: string): v is 'user' | 'developer' => v === 'user' || v === 'developer'

  return (
    <DocsPage
      language={isDocsLanguage(language) ? language : undefined}
      category={isDocsCategory(category) ? category : undefined}
      page={page}
      onBack={() => navigate('/projects')}
    />
  )
}

/**
 * StandalonePreviewRoute — extracts ?path= search param for StandalonePreview.
 */
function StandalonePreviewRoute() {
  const [searchParams] = useSearchParams()
  const path = searchParams.get('path')
  if (!path) return null
  return <StandalonePreview filePath={decodeURIComponent(path)} />
}

/** Redirect legacy /workspace to the appropriate project URL */
function LegacyWorkspaceRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    const activeProjectId = useProjectStore.getState().activeProjectId
    const activeWorkspaceId = useConversationContextStore.getState().activeWorkspaceId
    if (activeProjectId && activeWorkspaceId) {
      navigate(`/projects/${encodeURIComponent(activeProjectId)}/workspaces/${encodeURIComponent(activeWorkspaceId)}`, { replace: true })
    } else if (activeProjectId) {
      navigate(`/projects/${encodeURIComponent(activeProjectId)}/workspace`, { replace: true })
    } else {
      navigate('/projects', { replace: true })
    }
  }, [navigate])
  return null
}

/** Catch-all: redirect unknown routes to projects home */
function NavigateToProjects() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/projects', { replace: true })
  }, [navigate])
  return null
}

// ---------------------------------------------------------------------------
// AppReady — rendered after storage init completes; lives inside HashRouter
// ---------------------------------------------------------------------------

function AppReady() {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const projectStats = useProjectStore((s) => s.projectStats)
  const projectLoading = useProjectStore((s) => s.isLoading)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const createProject = useProjectStore((s) => s.createProject)
  const renameProject = useProjectStore((s) => s.renameProject)
  const setProjectArchived = useProjectStore((s) => s.setProjectArchived)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const t = useT()
  const [locale] = useLocale()
  const docsLanguage: 'zh' | 'en' = locale === 'zh-CN' ? 'zh' : 'en'

  const extensionGuideOpen = useExtensionStore((s) => s.installGuideOpen)
  const extensionCloseGuide = useExtensionStore((s) => s.closeInstallGuide)

  const [isClearingLocalData, setIsClearingLocalData] = useState(false)

  const handleCreateProject = async (name: string) => {
    const project = await createProject(name)
    if (project) {
      navigate(`/projects/${encodeURIComponent(project.id)}/workspace`)
      toast.success(t('app.projectCreated', { name: project.name }))
    } else {
      toast.error(t('app.createProjectFailed'))
    }
  }

  const handleRenameProject = async (projectId: string, name: string) => {
    const ok = await renameProject(projectId, name)
    if (ok) {
      toast.success(t('app.projectRenamed'))
    } else {
      toast.error(t('app.renameFailed'))
    }
  }

  const handleArchiveProject = async (projectId: string, archived: boolean) => {
    const ok = await setProjectArchived(projectId, archived)
    if (ok) {
      toast.success(archived ? t('app.projectArchived') : t('app.projectUnarchived'))
    } else {
      toast.error(archived ? t('app.archiveFailed') : t('app.unarchiveFailed'))
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    const ok = await deleteProject(projectId)
    if (ok) {
      toast.success(t('app.projectDeleted'))
    } else {
      toast.error(t('app.deleteFailed'))
    }
  }

  const handleClearLocalData = async () => {
    setIsClearingLocalData(true)
    try {
      await clearSQLiteAndProjectsDirectory()

      useProjectStore.setState({
        activeProjectId: '',
        projects: [],
        projectStats: {},
        initialized: false,
        isLoading: false,
        error: null,
      })
      useConversationContextStore.setState({
        activeWorkspaceId: null,
        workspaces: [],
        currentPendingCount: 0,
        initialized: false,
        pendingChanges: null,
        showPreview: false,
        previewSelectedPath: null,
        hasDirectoryHandle: false,
        switchingWorkspaceId: null,
        unsyncedSnapshots: [],
        error: null,
      })
      useOPFSStore.setState({
        workspaceId: null,
        initialized: false,
        pendingChanges: [],
        approvedNotSyncedPaths: new Set<string>(),
        cachedPaths: [],
        isLoading: false,
        error: null,
      })
      useConversationStore.setState({
        conversations: [],
        activeConversationId: null,
        loaded: true,
        agentLoops: new Map(),
        streamingQueues: new Map(),
        suggestedFollowUps: new Map(),
        mountedConversations: new Map(),
      })

      const { useConversationRuntimeStore } = await import('@/store/conversation-runtime.store')
      useConversationRuntimeStore.setState({
        runtimes: new Map(),
        agentLoops: new Map(),
        streamingQueues: new Map(),
        suggestedFollowUps: new Map(),
        cancelledRunIds: new Set(),
        mountedConversations: new Map(),
        pendingWorkflowDryRuns: new Map(),
        pendingWorkflowRealRuns: new Map(),
        workflowAbortControllers: new Map(),
      })

      await useProjectStore.getState().initialize()
      await useConversationContextStore.getState().initialize()
      await useOPFSStore.getState().initialize()

      navigate('/projects', { replace: true })
      toast.success(t('app.localDataCleared'))
    } catch (error) {
      console.error('[App] Failed to clear local data:', error)
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes(RESET_REQUIRES_TAB_CLOSURE)) {
        toast.error(t('app.clearFailedCloseOtherTabs'))
      } else {
        toast.error(t('app.clearLocalDataFailed'))
      }
    } finally {
      setIsClearingLocalData(false)
    }
  }

  return (
    <>
      <Routes>
        {/* Projects home */}
        <Route
          path="/projects"
          element={
            <ProjectHome
              projects={projects}
              projectStats={projectStats}
              activeProjectId={activeProjectId}
              isLoading={projectLoading}
              onOpenProject={async (projectId) => {
                navigate(`/projects/${encodeURIComponent(projectId)}/workspace`)
              }}
              onCreateProject={handleCreateProject}
              onRenameProject={handleRenameProject}
              onArchiveProject={handleArchiveProject}
              onDeleteProject={handleDeleteProject}
              onClearLocalData={handleClearLocalData}
              onOpenDocs={() => navigate(`/docs/${docsLanguage}`)}
              isClearingLocalData={isClearingLocalData}
            />
          }
        />

        {/* WebContainer preview */}
        <Route
          path="/webcontainer-preview"
          element={<WebContainerStandalonePreview />}
        />

        {/* File preview */}
        <Route
          path="/preview"
          element={<StandalonePreviewRoute />}
        />

        {/* Docs — catch all sub-patterns */}
        <Route path="/docs" element={<DocsRoute />} />
        <Route path="/docs/:language" element={<DocsRoute />} />
        <Route path="/docs/:language/:category" element={<DocsRoute />} />
        <Route path="/docs/:language/:category/:page" element={<DocsRoute />} />

        {/* Legacy /workspace redirect → project workspace */}
        <Route
          path="/workspace"
          element={<LegacyWorkspaceRedirect />}
        />

        {/* Project workspace routes */}
        <Route
          path="/projects/:projectId/workspaces/:workspaceId"
          element={<WorkspaceRoute />}
        />
        {/* Singular "workspace" form for backwards compat */}
        <Route
          path="/projects/:projectId/workspace"
          element={<WorkspaceRoute />}
        />
        {/* Bare project URL (no specific workspace) */}
        <Route
          path="/projects/:projectId"
          element={<WorkspaceRoute />}
        />

        {/* Default / catch-all → redirect to projects home */}
        <Route
          path="*"
          element={<NavigateToProjects />}
        />
      </Routes>
      <InstallPrompt />
      <DatabaseRefreshDialog isOpen={false} />
      <ExtensionInstallGuide
        open={extensionGuideOpen}
        onOpenChange={(open) => { if (!open) extensionCloseGuide() }}
      />
      <Toaster position="bottom-right" />
    </>
  )
}

// ---------------------------------------------------------------------------
// App — top-level component; HashRouter wraps everything including loading states
// ---------------------------------------------------------------------------

function App() {
  const [isRuntimeSupported, setIsRuntimeSupported] = useState(true)
  const [isStorageReady, setIsStorageReady] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState<number | undefined>(undefined)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [canResetDatabase, setCanResetDatabase] = useState(false)
  const [isDatabaseInaccessible, setIsDatabaseInaccessible] = useState(false)
  const t = useT() // i18n hook
  const tRef = useRef(t)
  tRef.current = t

  // Extension status check (runs even before storage is ready)
  const extensionCheckStatus = useExtensionStore((s) => s.checkStatus)

  useEffect(() => {
    const initial = setTimeout(extensionCheckStatus, 2000)
    const interval = setInterval(extensionCheckStatus, 5000)
    return () => { clearTimeout(initial); clearInterval(interval) }
  }, [extensionCheckStatus])

  const runInitStep = async <T,>(
    label: string,
    fn: () => Promise<T>,
    timeoutMs = 15000
  ): Promise<T> => {
    const started = performance.now()
    console.log(`[App Init] ▶ ${label} start`)
    const timeoutId = window.setTimeout(() => {
      const elapsed = Math.round(performance.now() - started)
      console.warn(`[App Init] ⏳ ${label} still running after ${elapsed}ms`)
    }, timeoutMs)
    try {
      const result = await fn()
      const elapsed = Math.round(performance.now() - started)
      console.log(`[App Init] ✅ ${label} done (${elapsed}ms)`)
      return result
    } catch (error) {
      const elapsed = Math.round(performance.now() - started)
      console.error(`[App Init] ❌ ${label} failed (${elapsed}ms):`, error)
      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  // StrictMode guard - track if async init has already completed
  const initCompleteRef = useRef(false)

  async function handleResetDatabase() {
    try {
      const { resetSQLiteDB } = await import('@/sqlite')
      await resetSQLiteDB()
    } catch (error) {
      console.error('[App] Failed to reset database:', error)
      toast.error(t('app.resetDatabaseFailed'))
    }
  }

  useEffect(() => {
    // Skip if already completed (from previous StrictMode render)
    if (initCompleteRef.current) {
      setIsStorageReady(true)
      return
    }

    let mounted = true
    let toastId: string | number | undefined

    async function initializeApp() {
      const capability = getRuntimeCapability()
      if (!mounted) return
      setIsRuntimeSupported(capability.canRunApp)

      if (!capability.canRunApp) return

      // Initialize SQLite storage
      toastId = toast.loading(tRef.current('app.initializing'), { id: 'storage-init' })

      try {
        const result = await initStorage({
          onProgress: (progress) => {
            console.log('[Storage]', progress.step, progress.details)

            switch (progress.step) {
              case 'init':
                setLoadingProgress(undefined)
                break
              case 'migration':
                if (progress.total > 0) {
                  setLoadingProgress(Math.round((progress.current / progress.total) * 100))
                }
                toast.loading(`${tRef.current('app.migrationInProgress')}: ${progress.details}`, {
                  id: 'storage-init',
                })
                break
              case 'complete':
                setLoadingProgress(100)
                break
              case 'warning':
              case 'error':
                if (progress.step === 'error' && progress.details) {
                  const details = progress.details.toLowerCase()
                  const isCorruption =
                    details.includes('corrupt') ||
                    details.includes('malformed') ||
                    details.includes('cantopen') ||
                    details.includes('database')

                  if (details.includes('database_inaccessible')) {
                    console.error('[App] Database inaccessible - showing refresh dialog')
                    setIsDatabaseInaccessible(true)
                    return
                  }

                  if (isCorruption) {
                    setStorageError(progress.details)
                    setCanResetDatabase(true)
                  } else {
                    setStorageError(progress.details)
                  }
                }
                break
            }
          },
        })

        if (result.success) {
          if (result.mode === 'sqlite-memory') {
            toast.warning(tRef.current('app.sessionStorageOnly'), {
              id: 'storage-init',
              duration: 8000,
            })
          } else if (result.mode === 'indexeddb-fallback') {
            toast.warning(tRef.current('app.localStorageMode'), {
              id: 'storage-init',
              duration: 8000,
            })
          } else {
            toast.success(tRef.current('app.initComplete'), { id: 'storage-init' })
          }
        } else {
          const errorMsg = result.error || tRef.current('app.initFailed')

          if (errorMsg.toLowerCase().includes('database_inaccessible')) {
            console.error('[App] Database inaccessible - showing refresh dialog')
            setIsDatabaseInaccessible(true)
            return
          }

          const isDatabaseError =
            errorMsg.toLowerCase().includes('database') ||
            errorMsg.toLowerCase().includes('sqlite') ||
            errorMsg.toLowerCase().includes('corrupt')

          if (isDatabaseError) {
            setStorageError(errorMsg)
            setCanResetDatabase(true)
          } else {
            setStorageError(errorMsg)
          }

          toast.error(errorMsg, { id: 'storage-init', duration: 10000 })
          console.error('[App] Storage initialization failed:', errorMsg)
          return
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[App] Failed to initialize storage:', error)

        if (errorMsg.toLowerCase().includes('database_inaccessible')) {
          console.error('[App] Database inaccessible - showing refresh dialog')
          setIsDatabaseInaccessible(true)
          return
        }

        const isDatabaseError =
          errorMsg.toLowerCase().includes('database') ||
          errorMsg.toLowerCase().includes('sqlite') ||
          errorMsg.toLowerCase().includes('corrupt') ||
          errorMsg.toLowerCase().includes('migration failed')

        if (isDatabaseError) {
          setStorageError(errorMsg)
          setCanResetDatabase(true)
        } else {
          setStorageError(errorMsg)
        }

        toast.error(t('app.storageInitError') + `: ${errorMsg}`, { id: 'storage-init' })
        return
      }

      setupAutoSave()

      if (!mounted) return

      try {
        await runInitStep('initializeProjects', () => useProjectStore.getState().initialize())
        await runInitStep('initializeWorkspaces', () => useConversationContextStore.getState().initialize())
        await runInitStep('initializeOPFS', () => useOPFSStore.getState().initialize())
      } catch (err) {
        console.error('[App] Failed to initialize projects/workspaces:', err)
      }

      attemptReconnect()

      try {
        const { useSettingsStore } = await import('@/store/settings.store')
        await runInitStep('checkHasApiKey', () => useSettingsStore.getState().checkHasApiKey())
      } catch (err) {
        console.error('[App] Failed to check API key:', err)
      }

      if (mounted) {
        console.log('[App Init] ✅ setting isStorageReady=true')
        initCompleteRef.current = true
        setIsStorageReady(true)
      }
    }

    initializeApp()

    return () => {
      mounted = false
      if (toastId !== undefined) {
        toast.dismiss(toastId)
      }
    }
  }, [])

  // Global error handler for DATABASE_INACCESSIBLE errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const errorMsg = event.error?.message || event.message || ''
      if (errorMsg.toLowerCase().includes('database_inaccessible')) {
        console.error('[App] Database inaccessible detected in global handler')
        setIsDatabaseInaccessible(true)
        event.preventDefault()
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const errorMsg = event.reason?.message || String(event.reason) || ''
      if (errorMsg.toLowerCase().includes('database_inaccessible')) {
        console.error('[App] Database inaccessible detected in promise handler')
        setIsDatabaseInaccessible(true)
        event.preventDefault()
      }
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // Request persistent storage and restore directory handle on first user interaction
  useEffect(() => {
    console.log('[Storage] Setting up persistent storage listener...')

    const handleFirstInteraction = async (_e: Event) => {
      console.log('[Storage] User interaction detected, requesting persistent storage...')
      let persisted = false

      try {
        if ('storage' in navigator && 'persist' in navigator.storage) {
          persisted = await navigator.storage.persist()
        }
      } catch (err) {
        console.error('[Storage] Error requesting persistent storage:', err)
      }

      console.log('[Storage] Persistent storage result:', persisted ? 'GRANTED ✅' : 'DENIED ❌')

      try {
        const { useFolderAccessStore } = await import('@/store/folder-access.store')
        const folderState = useFolderAccessStore.getState()
        const folderRecord = folderState.getRecord()

        if (folderRecord?.status === 'needs_user_activation' && folderRecord.projectId) {
          console.log('[Storage] Folder needs activation, requesting permission...')
          const granted = await folderState.requestPermission(folderRecord.projectId)
          console.log('[Storage] Handle permission result:', granted ? 'GRANTED ✅' : 'DENIED ❌')

          if (granted) {
            const { useAgentStore } = await import('@/store/agent.store')
            const updatedRecord = folderState.getRecord()
            if (updatedRecord) {
              useAgentStore.setState({
                directoryHandle: updatedRecord.handle,
                directoryName: updatedRecord.folderName,
                pendingHandle: updatedRecord.persistedHandle,
              })
            }
          }
        }
      } catch (err) {
        console.error('[Storage] Error handling folder permission:', err)
      }
    }

    window.addEventListener('click', handleFirstInteraction, { once: true })
    window.addEventListener('keydown', handleFirstInteraction, { once: true })
    window.addEventListener('touchstart', handleFirstInteraction, { once: true })

    return () => {
      window.removeEventListener('click', handleFirstInteraction)
      window.removeEventListener('keydown', handleFirstInteraction)
      window.removeEventListener('touchstart', handleFirstInteraction)
    }
  }, [])

  // Set up offline queue monitoring
  useEffect(() => {
    import('@/store/offline-queue.store').then(({ setupOfflineMonitoring }) => {
      return setupOfflineMonitoring()
    })
  }, [])

  if (!isRuntimeSupported) {
    return <UnsupportedBrowser />
  }

  if (isDatabaseInaccessible) {
    return (
      <>
        <DatabaseRefreshDialog isOpen={true} />
        <Toaster position="bottom-right" />
      </>
    )
  }

  if (!isStorageReady) {
    return (
      <StorageLoading
        progress={loadingProgress}
        error={storageError}
        canReset={canResetDatabase}
        onReset={handleResetDatabase}
      />
    )
  }

  // Storage is ready — render the main app inside HashRouter
  // HashRouter wraps everything so that AppReady (which uses useNavigate) works
  return (
    <HashRouter>
      <AppReady />
    </HashRouter>
  )
}

export default App
