import { useEffect, useState, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { isSupported } from '@/services/fsAccess.service'
import { UnsupportedBrowser } from '@/components/UnsupportedBrowser'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { MobileLayout } from '@/components/mobile'
import { useMobile } from '@/components/mobile/useMobile'
import { StorageLoading } from '@/components/StorageLoading'
import { DatabaseRefreshDialog } from '@/components/DatabaseRefreshDialog'
import { useAgentStore } from '@/store/agent.store'
import { attemptReconnect } from '@/store/remote.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { initStorage, setupAutoSave } from '@/storage'
import { requestPersistentStorage } from '@/opfs'
import { useT } from '@/i18n'
import { PWAUpdateBanner } from '@/pwa/PWAUpdateBanner'
import { InstallPrompt } from '@/pwa/InstallPrompt'

function App() {
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(true)
  const [isStorageReady, setIsStorageReady] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState<number | undefined>(undefined)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [canResetDatabase, setCanResetDatabase] = useState(false)
  const [isDatabaseInaccessible, setIsDatabaseInaccessible] = useState(false)
  const initializeWorkspaces = useWorkspaceStore((s) => s.initialize)
  const t = useT() // i18n hook

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
      toastId = toast.loading(t('app.initializing'), { id: 'storage-init' })

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
                toast.loading(`${t('app.migrationInProgress')}: ${progress.details}`, {
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
            toast.warning(t('app.sessionStorageOnly'), { id: 'storage-init', duration: 8000 })
          } else if (result.mode === 'indexeddb-fallback') {
            toast.warning(t('app.localStorageMode'), { id: 'storage-init', duration: 8000 })
          } else {
            toast.success(t('app.initComplete'), { id: 'storage-init' })
          }
        } else {
          // Storage initialization failed completely
          const errorMsg = result.error || t('app.initFailed')

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

      // Initialize workspaces
      try {
        await initializeWorkspaces()
      } catch (err) {
        console.error('[App] Failed to initialize workspaces:', err)
      }

      // Attempt to reconnect to previous remote session
      attemptReconnect()

      // Check if API key is already stored in SQLite
      // Use the store's checkHasApiKey method for proper caching
      try {
        const { useSettingsStore } = await import('@/store/settings.store')
        await useSettingsStore.getState().checkHasApiKey()
      } catch (err) {
        console.error('[App] Failed to check API key:', err)
      }

      if (mounted) {
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
  }, []) // Empty deps - run once, guarded by initializingRef

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

      // Also try to restore directory handle permission if pending
      const { requestPendingHandlePermission, pendingHandle } = useAgentStore.getState()
      if (pendingHandle) {
        console.log('[Storage] Pending handle found, requesting permission...')
        const granted = await requestPendingHandlePermission()
        console.log('[Storage] Handle permission result:', granted ? 'GRANTED ✅' : 'DENIED ❌')
      }
    }

    // Listen for first user interaction
    window.addEventListener('click', handleFirstInteraction, { once: true })
    window.addEventListener('keydown', handleFirstInteraction, { once: true })
    window.addEventListener('touchstart', handleFirstInteraction, { once: true })
  }, [])

  // Set up offline queue monitoring
  useEffect(() => {
    import('@/store/offline-queue.store').then(({ setupOfflineMonitoring }) => {
      return setupOfflineMonitoring()
    })
  }, [])

  // Responsive layout detection - must be called before any conditional returns
  const isMobile = useMobile()

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

  return (
    <>
      {isMobile ? <MobileLayout>{<WorkspaceLayout />}</MobileLayout> : <WorkspaceLayout />}
      <InstallPrompt />
      <PWAUpdateBanner />
      <DatabaseRefreshDialog isOpen={false} />
      <Toaster position="bottom-right" />
    </>
  )
}

export default App
