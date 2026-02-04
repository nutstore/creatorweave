/**
 * FolderSelector - Folder selector component
 *
 * Features:
 * - Select folder (direct click when no folder selected)
 * - Switch folder (dropdown when folder selected)
 * - Release folder handle
 * - Copy folder path
 *
 * Behavior:
 * - No folder selected: Click button → Open folder selection dialog
 * - Folder selected: Click button → Show dropdown menu
 */

import { useState, useRef, useEffect } from 'react'
import { FolderOpen, ChevronDown, Copy, RefreshCw } from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

type MenuState = 'closed' | 'open' | 'selecting'

export function FolderSelector() {
  const t = useT()
  const { directoryHandle, directoryName, setDirectoryHandle } = useAgentStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const [menuState, setMenuState] = useState<MenuState>('closed')
  const [error, setError] = useState<string | null>(null)
  const isMenuOpen = menuState === 'open'
  const isSelecting = menuState === 'selecting'

  // Click outside to close menu
  useEffect(() => {
    if (!isMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuState('closed')
        setError(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  const handleToggle = () => {
    if (isSelecting) return

    // If no folder selected, directly open folder selection dialog
    if (!directoryHandle) {
      handleSelectFolder()
      return
    }

    // Otherwise toggle the dropdown menu
    setMenuState(isMenuOpen ? 'closed' : 'open')
    setError(null)
  }

  const handleSelectFolder = async () => {
    setMenuState('selecting')
    setError(null)

    try {
      const handle = await selectFolderReadWrite()
      setDirectoryHandle(handle)
      setMenuState('closed')
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'User cancelled') {
          // Only show dropdown if there's a folder selected, otherwise close
          setMenuState(directoryHandle ? 'open' : 'closed')
        } else {
          setError(err.message)
          setMenuState(directoryHandle ? 'open' : 'closed')
        }
      }
    }
  }

  const handleRelease = () => {
    setDirectoryHandle(null)
    setMenuState('closed')
    setError(null)
  }

  const handleCopyPath = async () => {
    if (directoryName) {
      await navigator.clipboard.writeText(directoryName)
      setMenuState('closed')
    }
  }

  // Button content
  const renderButtonContent = () => {
    if (directoryHandle && directoryName) {
      return (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <FolderOpen className="h-[14px] w-[14px] text-primary-600" />
          <span className="max-w-[120px] truncate text-xs font-normal text-secondary">
            {directoryName}
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
      <button
        type="button"
        onClick={handleToggle}
        disabled={isSelecting}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1',
          'text-xs font-normal text-secondary',
          'transition-colors hover:bg-primary-50 focus:outline-none',
          isSelecting && 'cursor-wait opacity-70'
        )}
        title={directoryName ? t('folderSelector.switchFolder') : t('folderSelector.openFolder')}
      >
        {renderButtonContent()}
      </button>

      {/* Dropdown menu */}
      {isMenuOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] whitespace-nowrap rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {/* Switch folder */}
          <button
            type="button"
            onClick={handleSelectFolder}
            disabled={isSelecting}
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
          {directoryHandle && directoryName && (
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
          {error && (
            <div className="mx-2 mt-1 rounded bg-danger-bg px-2 py-1 text-xs text-danger">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
