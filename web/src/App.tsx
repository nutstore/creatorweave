import { useEffect, useState, useRef } from 'react'
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
import { shouldApplyRouteWorkspaceToConversation } from '@/app/route-sync'

type AppRoute =
  | { kind: 'projectsHome' }
  | { kind: 'projectWorkspace'; projectId: string; workspaceId?: string }
  | { kind: 'legacyWorkspace' }
  | { kind: 'webcontainerPreview' }
  | { kind: 'filePreview'; path: string }
  | { kind: 'docs'; language?: 'zh' | 'en'; category?: 'user' | 'developer'; page?: string }
  | { kind: 'unknown' }

function isDocsLanguage(value: string | undefined): value is 'zh' | 'en' {
  return value === 'zh' || value === 'en'
}

function isDocsCategory(value: string | undefined): value is 'user' | 'developer' {
  return value === 'user' || value === 'developer'
}

function getCurrentRoutePath(): string {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash

  if (hash) {
    return hash.startsWith('/') ? hash : `/${hash}`
  }

  const fallbackPath = `${window.location.pathname}${window.location.search || ''}`
  return fallbackPath || '/projects'
}

function resolveRoute(routePath: string): AppRoute {
  const url = new URL(routePath.startsWith('/') ? routePath : `/${routePath}`, window.location.origin)
  const normalized = url.pathname.replace(/\/+$/, '') || '/'

  if (normalized === '/' || normalized === '/projects') {
    return { kind: 'projectsHome' }
  }

  if (normalized === '/workspace') {
    return { kind: 'legacyWorkspace' }
  }

  if (normalized === '/webcontainer-preview') {
    return { kind: 'webcontainerPreview' }
  }

  // Preview route: /preview?path=xxx
  if (normalized === '/preview') {
    const path = url.searchParams.get('path')
    if (path) {
      return { kind: 'filePreview', path: decodeURIComponent(path) }
    }
  }

  const segments = normalized.split('/').filter(Boolean)

  // Docs route: /docs, /docs/zh, /docs/en/user, /docs/user (legacy)
  if (segments[0] === 'docs') {
    const second = segments[1]
    if (isDocsLanguage(second)) {
      const category = isDocsCategory(segments[2]) ? segments[2] : undefined
      return {
        kind: 'docs',
        language: second,
        category,
        page: category ? segments[3] : undefined,
      }
    }

    const legacyCategory = isDocsCategory(second) ? second : undefined
    return {
      kind: 'docs',
      category: legacyCategory,
      page: legacyCategory ? segments[2] : undefined,
    }
  }

  if (segments[0] !== 'projects' || !segments[1]) {
    return { kind: 'unknown' }
  }

  const projectId = decodeURIComponent(segments[1])

  if (segments.length === 2) {
    return { kind: 'projectWorkspace', projectId }
  }

  if (segments.length === 3 && segments[2] === 'workspace') {
    return { kind: 'projectWorkspace', projectId }
  }

  if (segments.length === 4 && segments[2] === 'workspaces' && segments[3]) {
    return {
      kind: 'projectWorkspace',
      projectId,
      workspaceId: decodeURIComponent(segments[3]),
    }
  }

  if (segments.length === 4 && segments[2] === 'workspace' && segments[3]) {
    return {
      kind: 'projectWorkspace',
      projectId,
      workspaceId: decodeURIComponent(segments[3]),
    }
  }

  return { kind: 'unknown' }
}

function toPath(route: AppRoute): string {
  if (route.kind === 'projectsHome' || route.kind === 'unknown') {
    return '/projects'
  }

  if (route.kind === 'legacyWorkspace') {
    return '/workspace'
  }

  if (route.kind === 'webcontainerPreview') {
    return '/webcontainer-preview'
  }

  if (route.kind === 'filePreview') {
    return `/preview?path=${encodeURIComponent(route.path)}`
  }

  if (route.kind === 'docs') {
    const parts = ['docs', route.language, route.category, route.page].filter(Boolean)
    return '/' + parts.join('/')
  }

  const encodedProjectId = encodeURIComponent(route.projectId)
  if (route.workspaceId) {
    return `/projects/${encodedProjectId}/workspaces/${encodeURIComponent(route.workspaceId)}`
  }
  return `/projects/${encodedProjectId}/workspace`
}

function App() {
  const [isRuntimeSupported, setIsRuntimeSupported] = useState(true)
  const [isStorageReady, setIsStorageReady] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState<number | undefined>(undefined)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [canResetDatabase, setCanResetDatabase] = useState(false)
  const [isDatabaseInaccessible, setIsDatabaseInaccessible] = useState(false)
  const [isClearingLocalData, setIsClearingLocalData] = useState(false)
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => resolveRoute(getCurrentRoutePath()))
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const createProject = useProjectStore((s) => s.createProject)
  const renameProject = useProjectStore((s) => s.renameProject)
  const setProjectArchived = useProjectStore((s) => s.setProjectArchived)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const projects = useProjectStore((s) => s.projects)
  const projectStats = useProjectStore((s) => s.projectStats)
  const projectLoading = useProjectStore((s) => s.isLoading)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  // NOTE: activeWorkspaceId and switchingWorkspaceId are NOT subscribed here.
  // They are read via getState() inside syncFromRoute useEffect to prevent
  // this component from re-rendering on every workspace switch (which caused
  // the syncFromRoute infinite loop and CPU spikes).
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  // Only select the active conversation's title — avoids re-renders when
  // agent streaming updates change the conversations array reference.
  const activeConversationTitle = useConversationStore((s) => {
    if (!s.activeConversationId) return undefined
    return s.conversations.find((c) => c.id === s.activeConversationId)?.title
  })
  const t = useT() // i18n hook
  const [locale] = useLocale()
  const docsLanguage: 'zh' | 'en' = locale === 'zh-CN' ? 'zh' : 'en'
  const tRef = useRef(t)
  tRef.current = t

  // Extension install guide dialog (global, shared across all pages)
  const extensionGuideOpen = useExtensionStore((s) => s.installGuideOpen)
  const extensionCloseGuide = useExtensionStore((s) => s.closeInstallGuide)
  const extensionCheckStatus = useExtensionStore((s) => s.checkStatus)

  // Periodic extension status check
  // Delay first check to allow content script injection (runAt: document_idle)
  // Without this, the banner flashes on briefly then disappears.
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

  /**
   * Handle database reset - deletes the database and reloads the page
   */
  async function handleResetDatabase() {
    try {
      const { resetSQLiteDB } = await import('@/sqlite')
      await resetSQLiteDB()
    } catch (error) {
      console.error('[App] Failed to reset database:', error)
      toast.error(t('app.resetDatabaseFailed'))
    }
  }

  /**
   * Handle clearing all local data - SQLite database and OPFS projects directory
   */
  async function handleClearLocalData() {
    setIsClearingLocalData(true)
    try {
      // No page refresh: clear SQLite + OPFS projects/ in-place.
      await clearSQLiteAndProjectsDirectory()

      // Clear in-memory stores so UI cannot keep stale cards from previous runtime state.
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
      // Also reset the runtime store
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

      await runInitStep('reinitializeProjectsAfterReset', () => useProjectStore.getState().initialize())
      await runInitStep('reinitializeWorkspacesAfterReset', () =>
        useConversationContextStore.getState().initialize()
      )
      await runInitStep('reinitializeOPFSAfterReset', () => useOPFSStore.getState().initialize())

      navigateToRoute({ kind: 'projectsHome' }, true)
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

            // Update loading UI based on progress
            switch (progress.step) {
              case 'init':
                setLoadingProgress(undefined)
                break
              case 'migration':
                // Calculate progress from migration step
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
                // Check if this is a database corruption error that needs reset
                if (progress.step === 'error' && progress.details) {
                  const details = progress.details.toLowerCase()
                  const isCorruption =
                    details.includes('corrupt') ||
                    details.includes('malformed') ||
                    details.includes('cantopen') ||
                    details.includes('database')

                  // Check for DATABASE_INACCESSIBLE error (OPFS handle staleness)
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
          // Show warnings for degraded storage modes
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
          // Storage initialization failed completely
          const errorMsg = result.error || tRef.current('app.initFailed')

          // Check if this is a DATABASE_INACCESSIBLE error (OPFS handle staleness)
          if (errorMsg.toLowerCase().includes('database_inaccessible')) {
            console.error('[App] Database inaccessible - showing refresh dialog')
            setIsDatabaseInaccessible(true)
            return
          }

          // Check if this is a database error that might need reset
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

          // Don't proceed with initialization on storage failure
          return
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[App] Failed to initialize storage:', error)

        // Check if this is a DATABASE_INACCESSIBLE error (OPFS handle staleness)
        if (errorMsg.toLowerCase().includes('database_inaccessible')) {
          console.error('[App] Database inaccessible - showing refresh dialog')
          setIsDatabaseInaccessible(true)
          return
        }

        // Check if this is a database error that might need reset
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

        // Don't proceed with initialization on storage failure
        return
      }

      // Set up auto-save on page unload
      setupAutoSave()

      if (!mounted) return

      // Don't restore directory handle on load - it requires user activation
      // User will click to restore permission when needed

      // Initialize projects first, then workspaces
      try {
        await runInitStep('initializeProjects', () => useProjectStore.getState().initialize())
        await runInitStep('initializeWorkspaces', () => useConversationContextStore.getState().initialize())
        await runInitStep('initializeOPFS', () => useOPFSStore.getState().initialize())
      } catch (err) {
        console.error('[App] Failed to initialize projects/workspaces:', err)
      }

      // Attempt to reconnect to previous remote session
      attemptReconnect()

      // Check if API key is already stored in SQLite
      // Use the store's checkHasApiKey method for proper caching
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
  }, []) // Guarded by initCompleteRef/initInProgressRef

  // Global error handler for DATABASE_INACCESSIBLE errors that occur after initialization
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const errorMsg = event.error?.message || event.message || ''
      if (errorMsg.toLowerCase().includes('database_inaccessible')) {
        console.error('[App] Database inaccessible detected in global handler')
        setIsDatabaseInaccessible(true)
        event.preventDefault()
      }
    }

    // Handle unhandled promise rejections
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
  // Note: requestPersistentStorage() must be called directly in event handler, not in async function
  useEffect(() => {
    console.log('[Storage] Setting up persistent storage listener...')

    const handleFirstInteraction = async (_e: Event) => {
      // Directly call requestPersistentStorage in the event handler (synchronous call)
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

      // Note: Storage status is now shown in FolderSelector component

      // Handle folder permission restore (can be async)
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

    // Listen for first user interaction
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

  // Force entry to project cards on each app mount (helps with dev Fast Refresh state retention).
  useEffect(() => {
    setCurrentRoute(resolveRoute(getCurrentRoutePath()))
  }, [])

  // Ensure app entry always starts from project cards after bootstrap completes.
  useEffect(() => {
    if (isStorageReady) {
      setCurrentRoute(resolveRoute(getCurrentRoutePath()))
    }
  }, [isStorageReady])

  useEffect(() => {
    const handlePopstate = () => {
      setCurrentRoute(resolveRoute(getCurrentRoutePath()))
    }

    const handleHashchange = () => {
      setCurrentRoute(resolveRoute(getCurrentRoutePath()))
    }

    const handleRouteChange = () => {
      setCurrentRoute(resolveRoute(getCurrentRoutePath()))
    }

    window.addEventListener('popstate', handlePopstate)
    window.addEventListener('hashchange', handleHashchange)
    window.addEventListener('routechange', handleRouteChange)
    return () => {
      window.removeEventListener('popstate', handlePopstate)
      window.removeEventListener('hashchange', handleHashchange)
      window.removeEventListener('routechange', handleRouteChange)
    }
  }, [])

  const activeProject = projects.find((project) => project.id === activeProjectId)

  const activeConversation = activeConversationId
    ? { title: activeConversationTitle }
    : undefined

  const navigateToRoute = (route: AppRoute, replace = false) => {
    const path = toPath(route)
    const hashPath = `#${path}`
    if (replace) {
      window.history.replaceState(null, '', hashPath)
    } else {
      window.history.pushState(null, '', hashPath)
    }
    setCurrentRoute(route)
  }

  // Route → state sync.
  // Reads store state via getState() inside the effect body to avoid
  // subscribing to values that this effect itself modifies (which caused
  // infinite re-trigger loops and CPU spikes).
  useEffect(() => {
    if (!isStorageReady || projectLoading) return

    let cancelled = false

    const syncFromRoute = async () => {
      // Snapshot current store state to avoid stale closures
      const _projects = useProjectStore.getState().projects
      const _activeProjectId = useProjectStore.getState().activeProjectId
      const _activeWorkspaceId = useConversationContextStore.getState().activeWorkspaceId

      if (currentRoute.kind === 'projectsHome') {
        return
      }

      if (currentRoute.kind === 'webcontainerPreview') {
        return
      }

      if (currentRoute.kind === 'filePreview') {
        return
      }

      if (currentRoute.kind === 'docs') {
        return
      }

      if (currentRoute.kind === 'unknown') {
        navigateToRoute({ kind: 'projectsHome' }, true)
        return
      }

      if (currentRoute.kind === 'legacyWorkspace') {
        if (_activeProjectId && _activeWorkspaceId) {
          navigateToRoute(
            {
              kind: 'projectWorkspace',
              projectId: _activeProjectId,
              workspaceId: _activeWorkspaceId,
            },
            true
          )
        } else if (_activeProjectId) {
          navigateToRoute({ kind: 'projectWorkspace', projectId: _activeProjectId }, true)
        } else {
          navigateToRoute({ kind: 'projectsHome' }, true)
        }
        return
      }

      const { projectId, workspaceId } = currentRoute

      const projectExists = _projects.some((project) => project.id === projectId)
      if (!projectExists) {
        toast.error(t('app.projectNotFound'))
        navigateToRoute({ kind: 'projectsHome' }, true)
        return
      }

      if (_activeProjectId !== projectId) {
        const switched = await setActiveProject(projectId)
        if (!switched) {
          if (!cancelled) {
            toast.error(t('app.switchProjectFailed'))
            navigateToRoute({ kind: 'projectsHome' }, true)
          }
          return
        }
      }

      if (cancelled) return

      // Re-read workspace list after potential project switch
      const scopedWorkspaceIds = useConversationContextStore.getState().workspaces.map((workspace) => workspace.id)

      if (!workspaceId) {
        if (scopedWorkspaceIds.length > 0) {
          const fallbackWorkspaceId = scopedWorkspaceIds[0]
          navigateToRoute({ kind: 'projectWorkspace', projectId, workspaceId: fallbackWorkspaceId }, true)
          if (useConversationStore.getState().activeConversationId !== fallbackWorkspaceId) {
            await useConversationStore.getState().setActive(fallbackWorkspaceId)
          }
        }
        return
      }

      if (scopedWorkspaceIds.includes(workspaceId)) {
        const convState = useConversationStore.getState()
        const shouldApplyRouteWorkspace = shouldApplyRouteWorkspaceToConversation({
          routeWorkspaceId: workspaceId,
          activeConversationId: convState.activeConversationId,
          switchingWorkspaceId: useConversationContextStore.getState().switchingWorkspaceId,
        })
        if (shouldApplyRouteWorkspace) {
          await useConversationStore.getState().setActive(workspaceId)
        }
        return
      }

      const convState = useConversationStore.getState()
      const latestSwitchingId = useConversationContextStore.getState().switchingWorkspaceId
      const isTransientActiveConversation =
        latestSwitchingId === workspaceId &&
        convState.activeConversationId === workspaceId &&
        convState.conversations.some((conversation) => conversation.id === workspaceId)
      if (isTransientActiveConversation) {
        return
      }

      if (scopedWorkspaceIds.length > 0) {
        const fallbackWorkspaceId = scopedWorkspaceIds[0]
        navigateToRoute(
          { kind: 'projectWorkspace', projectId, workspaceId: fallbackWorkspaceId },
          true
        )
        if (useConversationStore.getState().activeConversationId !== fallbackWorkspaceId) {
          await useConversationStore.getState().setActive(fallbackWorkspaceId)
        }
        return
      }

      toast.error(t('app.noWorkspaceInProject'))
      navigateToRoute({ kind: 'projectWorkspace', projectId }, true)
    }

    void syncFromRoute()

    return () => {
      cancelled = true
    }
  }, [
    isStorageReady,
    projectLoading,
    currentRoute,
    // NOTE: Only depend on values that this effect does NOT modify.
    // projects/activeProjectId/activeWorkspaceId/activeConversationId/switchingWorkspaceId
    // are now read via getState() inside the effect body to prevent infinite re-trigger loops.
    setActiveProject,
  ])

  // URL sync: active conversation → URL path.
  // This effect ONLY writes to the URL (navigateToRoute), it does NOT modify
  // store state. Safe to subscribe to activeProjectId/activeConversationId.
  useEffect(() => {
    if (!isStorageReady || currentRoute.kind !== 'projectWorkspace') return
    if (!activeProjectId || !activeConversationId) return
    const scopedWorkspaceIds = new Set(useConversationContextStore.getState().workspaces.map((workspace) => workspace.id))
    const convState = useConversationStore.getState()
    const activeConversation = convState.conversations.find(
      (conversation) => conversation.id === activeConversationId
    )
    const allowTransientRoute =
      !!activeConversation &&
      !scopedWorkspaceIds.has(activeConversationId) &&
      Date.now() - activeConversation.createdAt < 15000
    if (!scopedWorkspaceIds.has(activeConversationId) && !allowTransientRoute) return

    const routePath = toPath({
      kind: 'projectWorkspace',
      projectId: activeProjectId,
      workspaceId: activeConversationId,
    })
    if (getCurrentRoutePath() === routePath) return

    navigateToRoute(
      {
        kind: 'projectWorkspace',
        projectId: activeProjectId,
        workspaceId: activeConversationId,
      },
      false
    )
  }, [isStorageReady, currentRoute.kind, activeProjectId, activeConversationId])

  const handleOpenProject = async (projectId: string) => {
    navigateToRoute({ kind: 'projectWorkspace', projectId })
  }

  const handleCreateProject = async (name: string) => {
    const project = await createProject(name)
    if (project) {
      navigateToRoute({ kind: 'projectWorkspace', projectId: project.id })
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

  if (!isRuntimeSupported) {
    return <UnsupportedBrowser />
  }

  // Show refresh dialog if database is inaccessible
  if (isDatabaseInaccessible) {
    return (
      <>
        <DatabaseRefreshDialog isOpen={true} />
        <Toaster position="bottom-right" />
      </>
    )
  }

  // Show loading or error while storage is being initialized
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

  const workspaceView = (
    <WorkspaceLayout
      onBackToProjects={() => navigateToRoute({ kind: 'projectsHome' })}
      projectName={activeProject?.name}
      conversationName={activeConversation?.title}
      onSwitchProject={async (projectId: string) => {
        navigateToRoute({ kind: 'projectWorkspace', projectId })
      }}
      onCreateProject={() => navigateToRoute({ kind: 'projectsHome' })}
      onManageProjects={() => navigateToRoute({ kind: 'projectsHome' })}
    />
  )

  const rootView = currentRoute.kind === 'projectsHome' ? (
    <ProjectHome
      projects={projects}
      projectStats={projectStats}
      activeProjectId={activeProjectId}
      isLoading={projectLoading}
      onOpenProject={handleOpenProject}
      onCreateProject={handleCreateProject}
      onRenameProject={handleRenameProject}
      onArchiveProject={handleArchiveProject}
      onDeleteProject={handleDeleteProject}
      onClearLocalData={handleClearLocalData}
      onOpenDocs={() => navigateToRoute({ kind: 'docs', language: docsLanguage })}
      isClearingLocalData={isClearingLocalData}
    />
  ) : currentRoute.kind === 'webcontainerPreview' ? (
    <WebContainerStandalonePreview />
  ) : currentRoute.kind === 'filePreview' ? (
    <StandalonePreview filePath={currentRoute.path} />
  ) : currentRoute.kind === 'docs' ? (
    <DocsPage
      language={currentRoute.language}
      category={currentRoute.category}
      page={currentRoute.page}
      onBack={() => navigateToRoute({ kind: 'projectsHome' })}
    />
  ) : (
    workspaceView
  )

  return (
    <>
      {rootView}
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

export default App
