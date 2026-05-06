/**
 * FolderSelector - Multi-root folder management component
 *
 * Features:
 * - No roots: show "Open Folder" button → pickDirectory
 * - Has roots: show root chips + [+] add button
 * - Each chip: root name, lock icon if read-only
 * - Chip dropdown: restore permission, toggle read-only, remove
 * - Handles permission restoration
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  FolderOpen,
  Plus,
  Lock,
  X,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { useFolderAccessStore } from '@/store/folder-access.store'
import { getRuntimeCapability } from '@/storage/runtime-capability'
import { bindRuntimeDirectoryHandle } from '@/native-fs'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import type { RootInfo } from '@/types/folder-access'

export function FolderSelector() {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)

  // Multi-root state
  const { roots, activeProjectId, addRoot, removeRoot, loadRoots, toggleReadOnly } =
    useFolderAccessStore()

  // UI state
  const [activeChip, setActiveChip] = useState<string | null>(null) // root.id of open dropdown
  const [isAdding, setIsAdding] = useState(false)

  const runtimeCapability = getRuntimeCapability()
  const canPickDirectory = runtimeCapability.canPickDirectory

  // Click outside to close dropdown
  useEffect(() => {
    if (!activeChip) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActiveChip(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [activeChip])

  // Load roots on mount/project change
  useEffect(() => {
    loadRoots()
  }, [activeProjectId, loadRoots])

  const handleAddRoot = useCallback(async () => {
    if (!canPickDirectory || isAdding) return
    setIsAdding(true)
    try {
      await addRoot()
    } finally {
      setIsAdding(false)
    }
  }, [addRoot, canPickDirectory, isAdding])

  const handleRemoveRoot = useCallback(
    async (root: RootInfo) => {
      const confirmed = window.confirm(
        t('projectRoots.confirmRemove', { name: root.name })
      )
      if (!confirmed) return
      await removeRoot(root.id)
      setActiveChip(null)
    },
    [removeRoot, t]
  )

  const handleRestorePermission = useCallback(
    async (root: RootInfo) => {
      if (!activeProjectId || !root.persistedHandle) return
      try {
        const permission = await root.persistedHandle.requestPermission()
        if (permission) {
          bindRuntimeDirectoryHandle(activeProjectId, root.name, root.persistedHandle)
          await loadRoots()

          // Sync to agent.store
          const { useAgentStore } = await import('@/store/agent.store')
          useAgentStore.setState({
            directoryHandle: root.persistedHandle,
            directoryName: root.name,
          })

          toast.success(t('projectRoots.permissionRestored'))
          setActiveChip(null)
        } else {
          toast.error(t('projectRoots.permissionDenied'))
        }
      } catch (error) {
        console.error('[FolderSelector] Failed to restore permission:', error)
        toast.error(t('projectRoots.permissionFailed'))
      }
    },
    [activeProjectId, loadRoots, t]
  )

  const handleToggleReadOnly = useCallback(
    async (rootId: string) => {
      await toggleReadOnly(rootId)
      setActiveChip(null)
    },
    [toggleReadOnly]
  )

  // No roots: show simple "Open Folder" button
  if (roots.length === 0) {
    return (
      <div className="relative flex items-center gap-2" ref={containerRef}>
        <button
          type="button"
          onClick={handleAddRoot}
          disabled={!canPickDirectory || isAdding}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1',
            'text-xs font-normal text-secondary',
            'transition-colors hover:bg-primary-50 focus:outline-none dark:border-border dark:bg-card dark:hover:bg-muted',
            isAdding && 'cursor-wait opacity-70',
            !canPickDirectory && 'cursor-not-allowed opacity-70'
          )}
          title={
            !canPickDirectory
              ? t('folderSelector.sandboxMode')
              : t('folderSelector.openFolder')
          }
        >
          {isAdding ? (
            <Loader2 className="h-[14px] w-[14px] animate-spin text-primary-600" />
          ) : (
            <FolderOpen className="h-[14px] w-[14px]" />
          )}
          <span className="text-xs font-normal text-secondary">
            {isAdding ? t('folderSelector.loading') : t('folderSelector.openFolder')}
          </span>
        </button>
      </div>
    )
  }

  // Has roots: show chips + [+] button
  return (
    <div className="relative flex items-center gap-1.5" ref={containerRef}>
      {roots.map((root) => (
        <RootChip
          key={root.id}
          root={root}
          isOpen={activeChip === root.id}
          onToggle={() => setActiveChip(activeChip === root.id ? null : root.id)}
          onRemove={() => handleRemoveRoot(root)}
          onRestorePermission={() => handleRestorePermission(root)}
          onToggleReadOnly={() => handleToggleReadOnly(root.id)}
          t={t}
        />
      ))}

      {/* Add button */}
      {canPickDirectory && (
        <button
          type="button"
          onClick={handleAddRoot}
          disabled={isAdding}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-border',
            'text-secondary transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600',
            'dark:border-border dark:hover:border-primary-600 dark:hover:bg-muted',
            isAdding && 'cursor-wait opacity-70'
          )}
          title={t('projectRoots.addFolder')}
        >
          {isAdding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  )
}

/**
 * Individual root chip with dropdown menu
 */
function RootChip({
  root,
  isOpen,
  onToggle,
  onRemove,
  onRestorePermission,
  onToggleReadOnly,
  t,
}: {
  root: RootInfo
  isOpen: boolean
  onToggle: () => void
  onRemove: () => void
  onRestorePermission: () => void
  onToggleReadOnly: () => void
  t: (key: string, params?: Record<string, string>) => string
}) {
  const isReady = root.status === 'ready'
  const needsActivation = root.status === 'needs_user_activation'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-normal',
          'transition-colors focus:outline-none',
          needsActivation
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30'
            : isReady
              ? 'border-border bg-white text-secondary hover:bg-primary-50 dark:border-border dark:bg-card dark:hover:bg-muted'
              : 'border-border bg-card text-muted-foreground hover:bg-muted'
        )}
      >
        {/* Status dot */}
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full flex-shrink-0',
            isReady ? 'bg-success' : needsActivation ? 'bg-amber-400' : 'bg-gray-300'
          )}
        />
        <span className="max-w-[100px] truncate">{root.name}</span>
        {root.readOnly && <Lock className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[160px] whitespace-nowrap rounded-lg border border-border bg-white py-1 shadow-lg dark:border-border dark:bg-card"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Restore permission */}
          {needsActivation && (
            <button
              type="button"
              onClick={onRestorePermission}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
            >
              <RefreshCw className="h-4 w-4" />
              <span>{t('projectRoots.restorePermission')}</span>
            </button>
          )}

          {/* Toggle read-only */}
          <button
            type="button"
            onClick={onToggleReadOnly}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-secondary hover:bg-muted dark:hover:bg-muted"
          >
            <Lock className="h-4 w-4" />
            <span>{root.readOnly ? t('projectRoots.enableWrite') : t('projectRoots.makeReadOnly')}</span>
          </button>

          {/* Remove */}
          <button
            type="button"
            onClick={onRemove}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/5"
          >
            <X className="h-4 w-4" />
            <span>{t('projectRoots.removeRoot')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
