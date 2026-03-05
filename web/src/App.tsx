import { useEffect, useState, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { isSupported } from '@/services/fsAccess.service'
import { UnsupportedBrowser } from '@/components/UnsupportedBrowser'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { MobileLayout } from '@/components/mobile'
import { useMobile } from '@/components/mobile/useMobile'
import { StorageLoading } from '@/components/StorageLoading'
import { DatabaseRefreshDialog } from '@/components/DatabaseRefreshDialog'
import { attemptReconnect } from '@/store/remote.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useProjectStore } from '@/store/project.store'
import { useConversationStore } from '@/store/conversation.store'
import { initStorage, setupAutoSave } from '@/storage'
import { requestPersistentStorage } from '@/opfs'
import { useT } from '@/i18n'
import { PWAUpdateBanner } from '@/pwa/PWAUpdateBanner'
import { InstallPrompt } from '@/pwa/InstallPrompt'
import { ProjectHome } from '@/components/project/ProjectHome'

type AppRoute =
  | { kind: 'projectsHome' }
  | { kind: 'projectWorkspace'; projectId: string; workspaceId?: string }
  | { kind: 'legacyWorkspace' }
  | { kind: 'unknown' }

function resolveRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/'

  if (normalized === '/' || normalized === '/projects') {
    return { kind: 'projectsHome' }
  }

  if (normalized === '/workspace') {
    return { kind: 'legacyWorkspace' }
  }

  const segments = normalized.split('/').filter(Boolean)
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

  const encodedProjectId = encodeURIComponent(route.projectId)
  if (route.workspaceId) {
    return `/projects/${encodedProjectId}/workspaces/${encodeURIComponent(route.workspaceId)}`
  }
  return `/projects/${encodedProjectId}/workspace`
}

function App() {
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(true)
  const [isStorageReady, setIsStorageReady] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState<number | undefined>(undefined)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [canResetDatabase, setCanResetDatabase] = useState(false)
  const [isDatabaseInaccessible, setIsDatabaseInaccessible] = useState(false)
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => resolveRoute(window.location.pathname))
  const persistentStorageToastShownRef = useRef(false)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const createProject = useProjectStore((s) => s.createProject)
  const renameProject = useProjectStore((s) => s.renameProject)
  const setProjectArchived = useProjectStore((s) => s.setProjectArchived)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const projects = useProjectStore((s) => s.projects)
  const projectStats = useProjectStore((s) => s.projectStats)
  const projectLoading = useProjectStore((s) => s.isLoading)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const conversations = useConversationStore((s) => s.conversations)
  const t = useT() // i18n hook
  const tRef = useRef(t)
  tRef.current = t

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
      toast.error('重置数据库失败，请手动刷新页面')
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
      // Check browser support
      const supported = isSupported()
      if (!mounted) return
      setIsSupportedBrowser(supported)

      if (!supported) return

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

        toast.error(`存储初始化错误: ${errorMsg}`, { id: 'storage-init' })

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
        await runInitStep('initializeWorkspaces', () => useWorkspaceStore.getState().initialize())
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
  useEffect(() => {
    console.log('[Storage] Setting up persistent storage listener...')

    const handleFirstInteraction = async () => {
      console.log('[Storage] User interaction detected, requesting persistent storage...')
      const persisted = await requestPersistentStorage()
      console.log('[Storage] Persistent storage result:', persisted ? 'GRANTED ✅' : 'DENIED ❌')

      if (!persisted && !persistentStorageToastShownRef.current) {
        persistentStorageToastShownRef.current = true
        toast.warning('浏览器未授予持久化存储，缓存可能在空间紧张时被清理。', {
          action: {
            label: '重试',
            onClick: async () => {
              const granted = await requestPersistentStorage()
              // Retry folder-handle permission restore if needed.
              const { useFolderAccessStore } = await import('@/store/folder-access.store')
              const folderState = useFolderAccessStore.getState()
              const folderRecord = folderState.getRecord()
              let handleGranted = false

              if (folderRecord?.status === 'needs_user_activation' && folderRecord.projectId) {
                handleGranted = await folderState.requestPermission(folderRecord.projectId)
              }

              if (granted || handleGranted) {
                toast.success('权限已恢复。')
              } else {
                toast.warning('仍未授予权限，请检查浏览器站点权限设置。')
              }
            },
          },
          duration: 7000,
        })
      }

      // Also try to restore directory handle permission if pending (from folder-access.store)
      const { useFolderAccessStore } = await import('@/store/folder-access.store')
      const folderState = useFolderAccessStore.getState()
      const folderRecord = folderState.getRecord()

      if (folderRecord?.status === 'needs_user_activation' && folderRecord.projectId) {
        console.log('[Storage] Folder needs activation, requesting permission...')
        const granted = await folderState.requestPermission(folderRecord.projectId)
        console.log('[Storage] Handle permission result:', granted ? 'GRANTED ✅' : 'DENIED ❌')

        // Sync to agent.store after permission is restored
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
    setCurrentRoute(resolveRoute(window.location.pathname))
  }, [])

  // Ensure app entry always starts from project cards after bootstrap completes.
  useEffect(() => {
    if (isStorageReady) {
      setCurrentRoute(resolveRoute(window.location.pathname))
    }
  }, [isStorageReady])

  useEffect(() => {
    const handlePopstate = () => {
      setCurrentRoute(resolveRoute(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopstate)
    return () => {
      window.removeEventListener('popstate', handlePopstate)
    }
  }, [])

  // Responsive layout detection - must be called before any conditional returns
  const isMobile = useMobile()
  const activeProject = projects.find((project) => project.id === activeProjectId)

  const activeConversation = activeConversationId
    ? conversations.find((conversation) => conversation.id === activeConversationId)
    : undefined

  const navigateToRoute = (route: AppRoute, replace = false) => {
    const path = toPath(route)
    if (replace) {
      window.history.replaceState(null, '', path)
    } else {
      window.history.pushState(null, '', path)
    }
    setCurrentRoute(route)
  }

  useEffect(() => {
    if (!isStorageReady || projectLoading) return

    let cancelled = false

    const syncFromRoute = async () => {
      if (currentRoute.kind === 'projectsHome') {
        return
      }

      if (currentRoute.kind === 'unknown') {
        navigateToRoute({ kind: 'projectsHome' }, true)
        return
      }

      if (currentRoute.kind === 'legacyWorkspace') {
        if (activeProjectId && activeWorkspaceId) {
          navigateToRoute(
            {
              kind: 'projectWorkspace',
              projectId: activeProjectId,
              workspaceId: activeWorkspaceId,
            },
            true
          )
        } else if (activeProjectId) {
          navigateToRoute({ kind: 'projectWorkspace', projectId: activeProjectId }, true)
        } else {
          navigateToRoute({ kind: 'projectsHome' }, true)
        }
        return
      }

      const { projectId, workspaceId } = currentRoute

      const projectExists = projects.some((project) => project.id === projectId)
      if (!projectExists) {
        toast.error('项目不存在或已删除')
        navigateToRoute({ kind: 'projectsHome' }, true)
        return
      }

      if (activeProjectId !== projectId) {
        const switched = await setActiveProject(projectId)
        if (!switched) {
          if (!cancelled) {
            toast.error('切换项目失败，请稍后重试')
            navigateToRoute({ kind: 'projectsHome' }, true)
          }
          return
        }
      }

      if (cancelled) return

      const scopedWorkspaceIds = useWorkspaceStore.getState().workspaces.map((workspace) => workspace.id)

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
        if (useConversationStore.getState().activeConversationId !== workspaceId) {
          await useConversationStore.getState().setActive(workspaceId)
        }
        return
      }

      const hasConversation = useConversationStore
        .getState()
        .conversations.some((conversation) => conversation.id === workspaceId)
      if (hasConversation) {
        if (useConversationStore.getState().activeConversationId !== workspaceId) {
          await useConversationStore.getState().setActive(workspaceId)
        }
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

      toast.error('当前项目还没有工作区')
      navigateToRoute({ kind: 'projectWorkspace', projectId }, true)
    }

    void syncFromRoute()

    return () => {
      cancelled = true
    }
  }, [isStorageReady, projectLoading, currentRoute, projects, activeProjectId, activeWorkspaceId, setActiveProject])

  useEffect(() => {
    if (!isStorageReady || currentRoute.kind !== 'projectWorkspace') return
    if (!activeProjectId || !activeConversationId) return
    const hasConversation = useConversationStore
      .getState()
      .conversations.some((conversation) => conversation.id === activeConversationId)
    if (!hasConversation) return

    const routePath = toPath({
      kind: 'projectWorkspace',
      projectId: activeProjectId,
      workspaceId: activeConversationId,
    })
    if (window.location.pathname === routePath) return

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
    const ok = await setActiveProject(projectId)
    if (ok) {
      const targetWorkspaceId = useWorkspaceStore.getState().workspaces[0]?.id
      if (targetWorkspaceId) {
        await useConversationStore.getState().setActive(targetWorkspaceId)
        navigateToRoute({ kind: 'projectWorkspace', projectId, workspaceId: targetWorkspaceId })
      } else {
        navigateToRoute({ kind: 'projectWorkspace', projectId })
      }
    } else {
      toast.error('切换项目失败，请稍后重试')
    }
  }

  const handleCreateProject = async (name: string) => {
    const project = await createProject(name)
    if (project) {
      const switched = await setActiveProject(project.id)
      if (switched) {
        navigateToRoute({ kind: 'projectWorkspace', projectId: project.id })
        toast.success(`项目「${project.name}」已创建`)
      } else {
        toast.error('项目已创建，但切换失败，请手动重试')
      }
    } else {
      toast.error('创建项目失败，请稍后重试')
    }
  }

  const handleRenameProject = async (projectId: string, name: string) => {
    const ok = await renameProject(projectId, name)
    if (ok) {
      toast.success('项目已重命名')
    } else {
      toast.error('重命名失败，请稍后重试')
    }
  }

  const handleArchiveProject = async (projectId: string, archived: boolean) => {
    const ok = await setProjectArchived(projectId, archived)
    if (ok) {
      toast.success(archived ? '项目已归档' : '项目已取消归档')
    } else {
      toast.error(archived ? '归档失败，请稍后重试' : '取消归档失败，请稍后重试')
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    const ok = await deleteProject(projectId)
    if (ok) {
      toast.success('项目已删除')
    } else {
      toast.error('删除失败，请稍后重试')
    }
  }

  if (!isSupportedBrowser) {
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
      workspaceName={activeConversation?.title}
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
    />
  ) : isMobile ? (
    <MobileLayout>{workspaceView}</MobileLayout>
  ) : (
    workspaceView
  )

  return (
    <>
      {rootView}
      <InstallPrompt />
      <PWAUpdateBanner />
      <DatabaseRefreshDialog isOpen={false} />
      <Toaster position="bottom-right" />
    </>
  )
}

export default App
