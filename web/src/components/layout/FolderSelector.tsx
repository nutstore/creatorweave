/**
 * FolderSelector - Folder selector component
 *
 * Features:
 * - Select folder (direct click when no folder selected)
 * - Switch folder (dropdown when folder selected)
 * - Restore folder handle permission
 * - Release folder handle
 * - Copy folder path
 */

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { FolderOpen, ChevronDown, Copy, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { useCurrentFolderAccess, useFolderAccessStore } from '@/store/folder-access.store'
import { useAgentStore } from '@/store/agent.store'
import { getRuntimeCapability } from '@/storage/runtime-capability'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

type MenuState = 'closed' | 'open' | 'selecting'

export function FolderSelector() {
  const t = useT()
  const folderAccess = useCurrentFolderAccess()
  const containerRef = useRef<HTMLDivElement>(null)

  const [menuState, setMenuState] = useState<MenuState>('closed')
  const [localError, setLocalError] = useState<string | null>(null)
  const [showStorageWarning, setShowStorageWarning] = useState(false)
  const [isRetryingStorage, setIsRetryingStorage] = useState(false)

  // Request persistent storage on first interaction
  useEffect(() => {
    let requested = false

    const requestStorage = async () => {
      if (requested) return
      requested = true

      try {
        if ('storage' in navigator && 'persist' in navigator.storage) {
          const persisted = await navigator.storage.persist()
          if (!persisted) {
            setShowStorageWarning(true)
          }
        }
      } catch (e) {
        console.error('[Storage] Error:', e)
      }
    }

    const handleInteraction = () => requestStorage()
    window.addEventListener('click', handleInteraction, { once: true })
    window.addEventListener('keydown', handleInteraction, { once: true })
    window.addEventListener('touchstart', handleInteraction, { once: true })

    return () => {
      window.removeEventListener('click', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
      window.removeEventListener('touchstart', handleInteraction)
    }
  }, [])

  const isMenuOpen = menuState === 'open'
  const isSelecting = folderAccess.isRequesting
  const isLoading = folderAccess.isChecking || folderAccess.isReleasing
  const runtimeCapability = getRuntimeCapability()
  const canPickDirectory = runtimeCapability.canPickDirectory

  const {
    pickDirectory,
    requestPermission,
    release,
    folderName,
    handle: directoryHandle,
    projectId,
    error,
  } = folderAccess

  // Click outside to close menu
  useEffect(() => {
    if (!isMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuState('closed')
        setLocalError(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  // Handle permission restore button click
  const handleRestorePermission = async () => {
    if (!projectId || !folderAccess.isNeedsActivation) return

    try {
      console.log('[FolderSelector] Requesting permission for folder')
      const granted = await requestPermission(projectId)
      if (!granted) {
        setLocalError(t('folderSelector.permissionDenied'))
        return
      }

      // Sync to agent.store
      const folderRecord = useFolderAccessStore.getState().getRecord()
      if (folderRecord) {
        useAgentStore.setState({
          directoryHandle: folderRecord.handle,
          directoryName: folderRecord.folderName,
          pendingHandle: folderRecord.persistedHandle,
        })
      }
    } catch (err) {
      console.error('[FolderSelector] Permission request error:', err)
      setLocalError(err instanceof Error ? err.message : t('folderSelector.permissionDenied'))
    }
  }

  const handleToggle = () => {
    if (isSelecting || isLoading) return

    // If needs user activation, don't toggle menu
    // User should click the restore button instead
    if (folderAccess.isNeedsActivation) {
      return
    }

    if (!directoryHandle) {
      if (!canPickDirectory) {
        return
      }
      handleSelectFolder()
      return
    }

    setMenuState(isMenuOpen ? 'closed' : 'open')
    setLocalError(null)
  }

  const handleSelectFolder = async () => {
    if (!projectId) return
    if (!canPickDirectory) {
      setLocalError(t('folderSelector.sandboxMode'))
      return
    }

    setMenuState('selecting')
    setLocalError(null)

    try {
      const success = await pickDirectory(projectId)

      if (success) {
        // On success, sync state and close menu
        const folderRecord = useFolderAccessStore.getState().getRecord()
        if (folderRecord) {
          useAgentStore.setState({
            directoryHandle: folderRecord.handle,
            directoryName: folderRecord.folderName,
            pendingHandle: folderRecord.persistedHandle,
          })
        }
        setMenuState('closed')
      } else {
        // On user cancel or failure, keep menu open or restore previous state
        setMenuState(directoryHandle ? 'open' : 'closed')
        setLocalError(t('folderSelector.selectionFailed'))
      }
    } catch (err) {
      console.error('[FolderSelector] Select folder error:', err)
      setLocalError(err instanceof Error ? err.message : t('folderSelector.selectionFailed'))
      setMenuState(directoryHandle ? 'open' : 'closed')
    }
  }

  const handleRelease = async () => {
    if (!projectId) return

    await release(projectId)

    // Sync clear state to agent.store
    useAgentStore.setState({
      directoryHandle: null,
      directoryName: null,
      pendingHandle: null,
    })

    setMenuState('closed')
    setLocalError(null)
  }

  const handleCopyPath = async () => {
    if (folderName) {
      await navigator.clipboard.writeText(folderName)
      setMenuState('closed')
    }
  }

  // Button content
  const renderButtonContent = () => {
    if (folderAccess.isChecking || isLoading) {
      return (
        <>
          <Loader2 className="h-[14px] w-[14px] animate-spin text-primary-600" />
          <span className="text-xs font-normal text-secondary">{t('folderSelector.loading')}</span>
        </>
      )
    }

    if (folderAccess.isNeedsActivation) {
      return (
        <>
          <AlertCircle className="h-[14px] w-[14px] text-warning" />
          <span className="text-xs font-normal text-warning">{t('folderSelector.needsPermissionRestore')}</span>
        </>
      )
    }

    if (directoryHandle && folderName) {
      return (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <FolderOpen className="h-[14px] w-[14px] text-primary-600" />
          <span className="max-w-[120px] truncate text-xs font-normal text-secondary">
            {folderName}
          </span>
          <ChevronDown
            className={cn('text-tertiary h-3 w-3 transition-transform', isMenuOpen && 'rotate-180')}
          />
        </>
      )
    }

    if (!canPickDirectory) {
      return (
        <>
          <FolderOpen className="h-[14px] w-[14px]" />
          <span className="text-xs font-normal text-secondary">{t('folderSelector.sandboxMode')}</span>
        </>
      )
    }

    return (
      <>
        <FolderOpen className="h-[14px] w-[14px]" />
        <span className="text-xs font-normal text-secondary">{t('folderSelector.openFolder')}</span>
      </>
    )
  }

  return (
    <div className="relative flex items-center gap-2" ref={containerRef}>
      {/* Storage warning - shown on the left of folder button */}
      {showStorageWarning && (
        <button
          type="button"
          onClick={async () => {
            setIsRetryingStorage(true)
            try {
              if ('storage' in navigator && 'persist' in navigator.storage) {
                const persisted = await navigator.storage.persist()
                if (persisted) {
                  setShowStorageWarning(false)
                  toast.success(t('folderSelector.storageSuccess') || 'Storage persisted')
                } else {
                  toast.warning(t('folderSelector.storageFailed') || 'Cannot get persistent storage')
                }
              }
            } catch {
              toast.error(t('folderSelector.storageRequestFailed') || 'Request failed')
            } finally {
              setIsRetryingStorage(false)
            }
          }}
          disabled={isRetryingStorage}
          className="flex items-center gap-1 rounded bg-yellow-50 px-1.5 py-0.5 text-[10px] text-yellow-600 hover:bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-400 dark:hover:bg-yellow-900"
          title={t('folderSelector.storageTooltip') || 'Persistent storage not granted. Click to retry.'}
        >
          <RefreshCw className={cn('h-2.5 w-2.5', isRetryingStorage && 'animate-spin')} />
          <span>{t('folderSelector.storageWarning') || 'Cache'}</span>
        </button>
      )}

      {/* Restore permission button when needs activation */}
      {folderAccess.isNeedsActivation && (
        <button
          type="button"
          onClick={handleRestorePermission}
          disabled={isSelecting}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border-2 border-warning bg-warning-bg px-3 py-1',
            'text-xs font-medium text-warning',
            'transition-colors hover:bg-warning focus:outline-none focus:ring-2 focus:ring-warning',
            isSelecting && 'cursor-wait opacity-70'
          )}
          title={`${t('folderSelector.restorePermission')} (${folderName || t('folderSelector.unknown')})`}
        >
          <AlertCircle className="h-[14px] w-[14px] text-warning" />
          <span>{t('folderSelector.restorePermission')}</span>
          {folderName && <span className="text-warning">({folderName})</span>}
        </button>
      )}

      {/* Normal folder selector button when no pending handle */}
      {!folderAccess.isNeedsActivation && (
        <button
          type="button"
          onClick={handleToggle}
          disabled={isSelecting || isLoading || (!directoryHandle && !canPickDirectory)}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1',
            'text-xs font-normal text-secondary',
            'transition-colors hover:bg-primary-50 focus:outline-none dark:border-border dark:bg-card dark:hover:bg-muted',
            (isSelecting || isLoading) && 'cursor-wait opacity-70',
            !directoryHandle && !canPickDirectory && 'cursor-not-allowed opacity-70'
          )}
          title={
            !canPickDirectory && !directoryHandle
              ? t('folderSelector.sandboxMode')
              : folderName
                ? t('folderSelector.switchFolder')
                : t('folderSelector.openFolder')
          }
        >
          {renderButtonContent()}
        </button>
      )}

      {/* Dropdown menu */}
      {isMenuOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] whitespace-nowrap rounded-lg border border-border bg-white py-1 shadow-lg dark:border-border dark:bg-card">
          {/* Switch folder */}
          {canPickDirectory && (
            <button
              type="button"
              onClick={handleSelectFolder}
              disabled={isSelecting || isLoading}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-sm text-secondary',
                'hover:bg-muted dark:hover:bg-muted dark:hover:bg-muted disabled:cursor-wait disabled:opacity-50'
              )}
            >
              <RefreshCw className={cn('h-4 w-4', isSelecting && 'animate-spin')} />
              <span>{t('folderSelector.switchFolder')}</span>
            </button>
          )}

          {/* Release handle - only shown when folder is selected */}
          {directoryHandle && (
            <button
              type="button"
              onClick={handleRelease}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-bg"
            >
              <FolderOpen className="h-4 w-4" />
              <span>{t('folderSelector.releaseHandle')}</span>
            </button>
          )}

          {/* Copy path - only shown when folder is selected */}
          {directoryHandle && folderName && (
            <button
              type="button"
              onClick={handleCopyPath}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-secondary hover:bg-muted dark:hover:bg-muted dark:hover:bg-muted"
            >
              <Copy className="h-4 w-4" />
              <span>{t('folderSelector.copyPath')}</span>
            </button>
          )}

          {/* Error message */}
          {(localError || error) && (
            <div className="mx-2 mt-1 rounded bg-danger-bg px-2 py-1 text-xs text-danger">
              {localError || error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
