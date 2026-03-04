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
import { FolderOpen, ChevronDown, Copy, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { useCurrentFolderAccess, useFolderAccessStore } from '@/store/folder-access.store'
import { useAgentStore } from '@/store/agent.store'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

type MenuState = 'closed' | 'open' | 'selecting'

export function FolderSelector() {
  const t = useT()
  const folderAccess = useCurrentFolderAccess()
  const containerRef = useRef<HTMLDivElement>(null)

  const [menuState, setMenuState] = useState<MenuState>('closed')
  const [localError, setLocalError] = useState<string | null>(null)

  const isMenuOpen = menuState === 'open'
  const isSelecting = folderAccess.isRequesting
  const isLoading = folderAccess.isChecking || folderAccess.isReleasing

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
        setLocalError('权限被拒绝')
        return
      }

      // 同步到 agent.store
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
      setLocalError(err instanceof Error ? err.message : '权限请求失败')
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
      handleSelectFolder()
      return
    }

    setMenuState(isMenuOpen ? 'closed' : 'open')
    setLocalError(null)
  }

  const handleSelectFolder = async () => {
    if (!projectId) return

    setMenuState('selecting')
    setLocalError(null)

    try {
      const success = await pickDirectory(projectId)

      if (success) {
        // 成功时同步状态并关闭菜单
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
        // 用户取消或失败，保持菜单打开或恢复之前状态
        setMenuState(directoryHandle ? 'open' : 'closed')
        setLocalError('选择文件夹失败，请重试')
      }
    } catch (err) {
      console.error('[FolderSelector] Select folder error:', err)
      setLocalError(err instanceof Error ? err.message : '选择文件夹失败')
      setMenuState(directoryHandle ? 'open' : 'closed')
    }
  }

  const handleRelease = async () => {
    if (!projectId) return

    await release(projectId)

    // 同步清空状态到 agent.store
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
          <span className="text-xs font-normal text-secondary">加载中...</span>
        </>
      )
    }

    if (folderAccess.isNeedsActivation && !directoryHandle) {
      return (
        <>
          <AlertCircle className="h-[14px] w-[14px] text-warning" />
          <span className="text-xs font-normal text-warning">需要恢复权限</span>
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

    return (
      <>
        <FolderOpen className="h-[14px] w-[14px]" />
        <span className="text-xs font-normal text-secondary">{t('folderSelector.openFolder')}</span>
      </>
    )
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Restore permission button when needs activation */}
      {folderAccess.isNeedsActivation && !directoryHandle && (
        <button
          type="button"
          onClick={handleRestorePermission}
          disabled={isSelecting}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border-2 border-amber-500 bg-amber-50 px-3 py-1',
            'text-xs font-medium text-amber-700',
            'transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500',
            isSelecting && 'cursor-wait opacity-70'
          )}
          title={`恢复文件夹访问权限 (${folderName || '未知'})`}
        >
          <AlertCircle className="h-[14px] w-[14px] text-amber-600" />
          <span>恢复权限</span>
          {folderName && <span className="text-amber-500">({folderName})</span>}
        </button>
      )}

      {/* Normal folder selector button when no pending handle */}
      {(!folderAccess.isNeedsActivation || directoryHandle) && (
        <button
          type="button"
          onClick={handleToggle}
          disabled={isSelecting || isLoading}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1',
            'text-xs font-normal text-secondary',
            'transition-colors hover:bg-primary-50 focus:outline-none',
            (isSelecting || isLoading) && 'cursor-wait opacity-70'
          )}
          title={folderName ? t('folderSelector.switchFolder') : t('folderSelector.openFolder')}
        >
          {renderButtonContent()}
        </button>
      )}

      {/* Dropdown menu */}
      {isMenuOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] whitespace-nowrap rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {/* Switch folder */}
          <button
            type="button"
            onClick={handleSelectFolder}
            disabled={isSelecting || isLoading}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-sm text-secondary',
              'hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50'
            )}
          >
            <RefreshCw className={cn('h-4 w-4', isSelecting && 'animate-spin')} />
            <span>{t('folderSelector.switchFolder')}</span>
          </button>

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
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-secondary hover:bg-gray-50"
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
