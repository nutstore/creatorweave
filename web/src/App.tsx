import { useEffect, useState, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { isSupported } from '@/services/fsAccess.service'
import { UnsupportedBrowser } from '@/components/UnsupportedBrowser'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { StorageLoading } from '@/components/StorageLoading'
import { useAgentStore } from '@/store/agent.store'
import { attemptReconnect } from '@/store/remote.store'
import { useSessionStore } from '@/store/session.store'
import { initStorage, setupAutoSave } from '@/storage'
import { useT } from '@/i18n'
import { loadApiKey } from '@/security/api-key-store'

function App() {
  const [isSupportedBrowser, setIsSupportedBrowser] = useState(true)
  const [isStorageReady, setIsStorageReady] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState<number | undefined>(undefined)
  const restoreDirectoryHandle = useAgentStore((s) => s.restoreDirectoryHandle)
  const initializeSessions = useSessionStore((s) => s.initialize)
  const t = useT() // i18n hook

  // StrictMode guard - track if async init has already completed
  const initCompleteRef = useRef(false)

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
                // Keep the details from progress
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

          if (result.migrated && result.migrationResult) {
            console.log('[App] Migration complete:', result.migrationResult)
            const { conversations } = result.migrationResult
            toast.success(
              t('app.migrationComplete') +
                `: ${t('app.conversationsMigrated', { count: conversations })}`
            )
          }
        } else {
          // Storage initialization failed completely
          const errorMsg = result.error || t('app.initFailed')
          toast.error(errorMsg, { id: 'storage-init', duration: 10000 })

          // Still allow app to run - user can see what's wrong
          console.error('[App] Storage initialization failed:', errorMsg)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[App] Failed to initialize storage:', error)

        // Even on catastrophic failure, allow app to run
        toast.error(`存储初始化错误: ${errorMsg}`, { id: 'storage-init' })
      }

      // Set up auto-save on page unload
      setupAutoSave()

      if (!mounted) return

      // Restore directory handle
      restoreDirectoryHandle()

      // Initialize OPFS session store
      try {
        await initializeSessions()
      } catch (err) {
        console.error('[App] Failed to initialize session store:', err)
      }

      // Attempt to reconnect to previous remote session
      attemptReconnect()

      // Check if API key is already stored in SQLite
      try {
        const { useSettingsStore } = await import('@/store/settings.store')
        const currentProviderType = useSettingsStore.getState().providerType
        const existingKey = await loadApiKey(currentProviderType)
        useSettingsStore.getState().setHasApiKey(!!existingKey)
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

  if (!isSupportedBrowser) {
    return <UnsupportedBrowser />
  }

  // Show loading while storage is being initialized
  if (!isStorageReady) {
    return <StorageLoading progress={loadingProgress} />
  }

  return (
    <>
      <WorkspaceLayout />
      <Toaster position="bottom-right" />
    </>
  )
}

export default App
