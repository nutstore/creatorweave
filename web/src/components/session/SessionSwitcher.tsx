/**
 * SessionSwitcher - dropdown menu for switching between OPFS sessions
 *
 * Displays:
 * - All available sessions
 * - Each session's pending/undo counts
 * - Active session indicator
 * - Switch session functionality
 */

import React, { useState, useCallback, useMemo } from 'react'
import { useWorkspaceStore } from '@/store/workspace.store'
import { ChevronDown, Check, Clock, RotateCcw, Trash2, Plus } from 'lucide-react'

export interface SessionSwitcherProps {
  /** Callback when session is switched */
  onSessionSwitch?: (sessionId: string) => void
  /** Show create new session button */
  showCreate?: boolean
  /** Show delete session button */
  showDelete?: boolean
}

export const SessionSwitcher: React.FC<SessionSwitcherProps> = ({
  onSessionSwitch,
  showCreate = false,
  showDelete = false,
}) => {
  const [open, setOpen] = useState(false)
  const { activeWorkspaceId, workspaces, switchWorkspace, deleteWorkspace, isLoading } =
    useWorkspaceStore()

  // Sort workspaces: active first, then by lastActiveAt
  const sortedWorkspaces = useMemo(() => {
    return [...workspaces].sort((a, b) => {
      if (a.id === activeWorkspaceId) return -1
      if (b.id === activeWorkspaceId) return 1
      return (b.lastActiveAt || 0) - (a.lastActiveAt || 0)
    })
  }, [workspaces, activeWorkspaceId])

  const handleSwitch = useCallback(
    async (workspaceId: string) => {
      try {
        await switchWorkspace(workspaceId)
        onSessionSwitch?.(workspaceId)
        setOpen(false)
      } catch (error) {
        console.error('[SessionSwitcher] Failed to switch workspace:', error)
      }
    },
    [switchWorkspace, onSessionSwitch]
  )

  const handleDelete = useCallback(
    async (e: React.MouseEvent, workspaceId: string) => {
      e.stopPropagation() // Prevent triggering switch

      if (!confirm('确定要删除此对话的缓存吗？所有文件缓存、待同步和撤销记录将被删除。')) {
        return
      }

      try {
        await deleteWorkspace(workspaceId)
      } catch (error) {
        console.error('[SessionSwitcher] Failed to delete workspace:', error)
      }
    },
    [deleteWorkspace]
  )

  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === activeWorkspaceId)
  }, [workspaces, activeWorkspaceId])

  const displayName = useMemo(() => {
    if (!activeWorkspace) return '选择对话'
    return activeWorkspace.name || activeWorkspaceId?.slice(0, 8) || '未知对话'
  }, [activeWorkspace, activeWorkspaceId])

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={isLoading || workspaces.length === 0}
        className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
      >
        <span className="max-w-[120px] truncate text-neutral-700 dark:text-neutral-300">{displayName}</span>
        {workspaces.length > 0 && (
          <span className="text-xs text-neutral-400">({workspaces.length})</span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />

          {/* Menu */}
          <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {/* Header */}
            <div className="border-b border-neutral-100 px-3 py-2 dark:border-neutral-700">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                对话列表 ({workspaces.length})
              </span>
            </div>

            {/* Workspace list */}
            <div className="custom-scrollbar max-h-80 overflow-y-auto">
              {sortedWorkspaces.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-neutral-400 dark:text-neutral-500">暂无对话</div>
              ) : (
                <ul>
                  {sortedWorkspaces.map((workspace) => {
                    const isActive = workspace.id === activeWorkspaceId
                    const hasPending = workspace.pendingCount > 0
                    const hasUndo = workspace.undoCount > 0

                    return (
                      <li
                        key={workspace.id}
                        className={`flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                          isActive ? 'bg-primary-50 dark:bg-primary-950/30' : ''
                        }`}
                      >
                        {/* Workspace selector */}
                        <button
                          type="button"
                          onClick={() => handleSwitch(workspace.id)}
                          className="flex flex-1 items-center gap-2 text-left"
                        >
                          {/* Active indicator */}
                          {isActive && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                          {!isActive && <span className="h-4 w-4 shrink-0" />}

                          {/* Workspace info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-xs font-medium text-neutral-700 dark:text-neutral-200">
                                {workspace.name || workspace.id.slice(0, 8)}
                              </span>
                            </div>

                            {/* Status badges */}
                            <div className="mt-0.5 flex items-center gap-2">
                              {/* Pending count */}
                              {hasPending && (
                                <span
                                  className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700"
                                  title={`${workspace.pendingCount} 个待同步`}
                                >
                                  <Clock className="h-2.5 w-2.5" />
                                  {workspace.pendingCount}
                                </span>
                              )}

                              {/* Undo count */}
                              {hasUndo && (
                                <span
                                  className="flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-700"
                                  title={`${workspace.undoCount} 个可撤销`}
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />
                                  {workspace.undoCount}
                                </span>
                              )}

                              {/* No changes */}
                              {!hasPending && !hasUndo && (
                                <span className="text-[10px] text-neutral-400">无变更</span>
                              )}
                            </div>
                          </div>
                        </button>

                        {/* Delete button */}
                        {showDelete && !isActive && (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, workspace.id)}
                            className="shrink-0 rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                            title="删除对话缓存"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Footer - Create new session */}
            {showCreate && (
              <div className="border-t border-neutral-100 p-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建对话
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
