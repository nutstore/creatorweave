/**
 * Folder Access Store - 唯一状态源
 *
 * 统一管理文件夹权限状态，解决：
 * 1. 状态分散问题
 * 2. release() 后权限记录未删除问题
 * 3. 释放后重新添加不弹框问题
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'
import type { FolderAccessRecord, FolderAccessStatus, FolderAccessStore } from '@/types/folder-access'
import { folderAccessRepo } from '@/services/folder-access.repository'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { bindRuntimeDirectoryHandle, unbindRuntimeDirectoryHandle } from '@/native-fs'

/**
 * 初始空记录
 */
function createEmptyRecord(projectId: string): FolderAccessRecord {
  return {
    projectId,
    folderName: null,
    handle: null,
    persistedHandle: null,
    status: 'idle',
    error: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

async function notifyWorkspaceNativeDirectoryGranted(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const { useWorkspaceStore } = await import('./workspace.store')
    await useWorkspaceStore.getState().onNativeDirectoryGranted(handle)
  } catch (error) {
    console.warn('[FolderAccessStore] Failed to notify workspace native handle grant:', error)
  }
}

export const useFolderAccessStore = create<FolderAccessStore>()(
  immer((set, get) => ({
    activeProjectId: null,
    records: {},

    // ========================================================================
    // Actions
    // ========================================================================

    /**
     * 设置活动项目并水合
     */
    setActiveProject: async (projectId: string | null) => {
      set((state) => {
        state.activeProjectId = projectId
      })

      if (!projectId) return

      // 如果还没有记录，创建空记录
      if (!get().records[projectId]) {
        set((state) => {
          state.records[projectId] = createEmptyRecord(projectId)
        })
      }

      await get().hydrateProject(projectId)
    },

    /**
     * 水合项目数据（从 IndexedDB 恢复）
     */
    hydrateProject: async (projectId: string) => {
      set((state) => {
        const record = state.records[projectId]
        if (record) {
          record.status = 'checking'
        }
      })

      try {
        // 从 IndexedDB 加载记录
        const existing = await folderAccessRepo.load(projectId)

        if (!existing || !existing.persistedHandle) {
          // 无记录 -> idle
          set((state) => {
            state.records[projectId] = createEmptyRecord(projectId)
          })
          return
        }

        // 有持久化句柄 -> 检查权限状态
        const handle = existing.persistedHandle

        try {
          const permission = await handle.queryPermission({ mode: 'readwrite' })

          if (permission === 'granted') {
            // 权限已授予 -> ready
            set((state) => {
              state.records[projectId] = {
                ...existing,
                handle,
                status: 'ready',
                updatedAt: Date.now(),
              }
            })
            bindRuntimeDirectoryHandle(projectId, handle)
            await notifyWorkspaceNativeDirectoryGranted(handle)
            console.log('[FolderAccessStore] Permission granted, handle ready:', handle.name)
          } else if (permission === 'prompt') {
            // 需要用户激活 -> needs_user_activation
            set((state) => {
              state.records[projectId] = {
                ...existing,
                handle: null,
                status: 'needs_user_activation',
                updatedAt: Date.now(),
              }
            })
            console.log('[FolderAccessStore] Permission prompt, needs activation:', handle.name)
          } else {
            // 权限被拒绝 -> 删除记录，回到 idle
            console.log('[FolderAccessStore] Permission denied, clearing record')
            await folderAccessRepo.delete(projectId)
            set((state) => {
              state.records[projectId] = createEmptyRecord(projectId)
            })
          }
        } catch (permError) {
          // 查询权限失败，可能是 handle 已失效
          console.error('[FolderAccessStore] Permission query failed:', permError)
          await folderAccessRepo.delete(projectId)
          set((state) => {
            state.records[projectId] = createEmptyRecord(projectId)
          })
        }
      } catch (error) {
        console.error('[FolderAccessStore] Hydrate failed:', error)
        set((state) => {
          const record = state.records[projectId]
          if (record) {
            record.status = 'error'
            record.error = error instanceof Error ? error.message : 'Unknown error'
          }
        })
      }
    },

    /**
     * 选择新文件夹（弹出选择框）
     */
    pickDirectory: async (projectId: string) => {
      set((state) => {
        const record = state.records[projectId]
        if (record) {
          record.status = 'requesting'
        }
      })

      try {
        const handle = await selectFolderReadWrite()

        if (!handle) {
          // 用户取消 -> 回到之前的状态
          set((state) => {
            const record = state.records[projectId]
            if (record) {
              // 修复：如果已经有有效的 handle，保持 ready 状态
              // 只有在没有持久化句柄时才设为 idle 或 needs_user_activation
              if (record.handle || record.persistedHandle) {
                record.status = 'ready'
              } else {
                record.status = 'idle'
              }
            }
          })
          return false
        }

        const record: FolderAccessRecord = {
          projectId,
          folderName: handle.name,
          handle,
          persistedHandle: handle,
          status: 'ready',
          error: undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        // 持久化
        await folderAccessRepo.save(record)
        bindRuntimeDirectoryHandle(projectId, handle)
        await notifyWorkspaceNativeDirectoryGranted(handle)

        set((state) => {
          state.records[projectId] = record
        })

        toast.success(`已选择文件夹: ${handle.name}`)

        // 通知文件树刷新
        get().notifyFileTreeRefresh()

        return true
      } catch (error) {
        console.error('[FolderAccessStore] Pick directory failed:', error)

        if (error instanceof Error && error.message === 'User cancelled') {
          // 用户取消，不设置错误状态
          set((state) => {
            const record = state.records[projectId]
            if (record) {
              // 修复：如果已经有有效的 handle，保持 ready 状态
              // 只有在没有持久化句柄时才设为 idle 或 needs_user_activation
              if (record.handle || record.persistedHandle) {
                record.status = 'ready'
              } else {
                record.status = 'idle'
              }
            }
          })
          return false
        }

        set((state) => {
          const record = state.records[projectId]
          if (record) {
            record.status = 'error'
            record.error = error instanceof Error ? error.message : 'Unknown error'
          }
        })

        toast.error('选择文件夹失败: ' + (error instanceof Error ? error.message : 'Unknown error'))
        return false
      }
    },

    /**
     * 直接设置文件夹句柄（不弹框，用于外部已获取 handle 的场景）
     */
    setHandle: async (projectId: string, handle: FileSystemDirectoryHandle) => {
      set((state) => {
        const record = state.records[projectId]
        if (record) {
          record.status = 'ready'
          record.error = undefined
        }
      })

      const record: FolderAccessRecord = {
        projectId,
        folderName: handle.name,
        handle,
        persistedHandle: handle,
        status: 'ready',
        error: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      // 持久化
      await folderAccessRepo.save(record)
      bindRuntimeDirectoryHandle(projectId, handle)
      await notifyWorkspaceNativeDirectoryGranted(handle)

      set((state) => {
        state.records[projectId] = record
      })

      console.log('[FolderAccessStore] Handle set directly:', handle.name)

      // 通知文件树刷新
      get().notifyFileTreeRefresh()
    },

    /**
     * 请求恢复权限（从 needs_user_activation 状态）
     */
    requestPermission: async (projectId: string) => {
      const record = get().records[projectId]
      if (!record?.persistedHandle) {
        console.warn('[FolderAccessStore] No persisted handle to request permission')
        return false
      }

      set((state) => {
        const r = state.records[projectId]
        if (r) r.status = 'requesting'
      })

      try {
        const handle = record.persistedHandle
        const result = await handle.requestPermission({ mode: 'readwrite' })

        if (result === 'granted') {
          set((state) => {
            const r = state.records[projectId]
            if (r) {
              r.handle = handle
              r.status = 'ready'
              r.error = undefined
              r.updatedAt = Date.now()
            }
          })

          // 更新持久化
          await folderAccessRepo.save(get().records[projectId])
          bindRuntimeDirectoryHandle(projectId, handle)
          await notifyWorkspaceNativeDirectoryGranted(handle)

          toast.success('文件夹权限已恢复')
          get().notifyFileTreeRefresh()
          return true
        } else {
          toast.error('权限被拒绝')
          set((state) => {
            const r = state.records[projectId]
            if (r) r.status = 'needs_user_activation'
          })
          return false
        }
      } catch (error) {
        console.error('[FolderAccessStore] Request permission failed:', error)

        if (error instanceof Error && error.name === 'SecurityError') {
          // 需要用户交互
          set((state) => {
            const r = state.records[projectId]
            if (r) r.status = 'needs_user_activation'
          })
          toast.info('请重新点击按钮恢复权限')
        } else {
          set((state) => {
            const r = state.records[projectId]
            if (r) {
              r.status = 'error'
              r.error = error instanceof Error ? error.message : 'Unknown error'
            }
          })
          toast.error('恢复权限失败')
        }
        return false
      }
    },

    /**
     * 彻底释放（删除记录）
     * 关键：必须删除 IndexedDB 记录，这样下次添加才会弹框
     */
    release: async (projectId: string) => {
      set((state) => {
        const record = state.records[projectId]
        if (record) {
          record.status = 'releasing'
        }
      })

      try {
        // 关键：彻底删除 IndexedDB 记录
        await folderAccessRepo.delete(projectId)
        unbindRuntimeDirectoryHandle(projectId)

        set((state) => {
          state.records[projectId] = createEmptyRecord(projectId)
        })

        toast.success('文件夹权限已释放')
        console.log('[FolderAccessStore] Released and deleted record for project:', projectId)
      } catch (error) {
        console.error('[FolderAccessStore] Release failed:', error)
        set((state) => {
          const record = state.records[projectId]
          if (record) {
            record.status = 'error'
            record.error = error instanceof Error ? error.message : 'Unknown error'
          }
        })
      }
    },

    /**
     * 清除错误状态
     */
    clearError: (projectId: string) => {
      set((state) => {
        const record = state.records[projectId]
        if (record) {
          record.status = record.persistedHandle ? 'needs_user_activation' : 'idle'
          record.error = undefined
        }
      })
    },

    // ========================================================================
    // Selectors
    // ========================================================================

    /**
     * 获取当前项目记录
     */
    getRecord: (): FolderAccessRecord | null => {
      const { activeProjectId, records } = get()
      if (!activeProjectId) return null
      return records[activeProjectId] ?? null
    },

    /**
     * 获取当前项目状态
     */
    getCurrentStatus: (): FolderAccessStatus | null => {
      const { activeProjectId, records } = get()
      if (!activeProjectId) return null
      return records[activeProjectId]?.status ?? null
    },

    /**
     * 获取当前项目句柄
     */
    getCurrentHandle: (): FileSystemDirectoryHandle | null => {
      const { activeProjectId, records } = get()
      if (!activeProjectId) return null
      return records[activeProjectId]?.handle ?? null
    },

    /**
     * 当前项目是否可用
     */
    isReady: (): boolean => {
      const status = get().getCurrentStatus()
      return status === 'ready'
    },

    // ========================================================================
    // Helpers
    // ========================================================================

    notifyFileTreeRefresh: async () => {
      try {
        const { useRemoteStore } = await import('./remote.store')
        const remoteStore = useRemoteStore.getState()
        if (remoteStore.session && remoteStore.getRole() === 'host') {
          remoteStore.refreshFileTree()
        }
      } catch (error) {
        console.error('[FolderAccessStore] Failed to notify file tree refresh:', error)
      }
    },
  }))
)

// ============================================================================
// 便捷 Hook
// ============================================================================

/**
 * 便捷 Hook：获取当前项目的文件夹状态
 */
export function useCurrentFolderAccess() {
  const store = useFolderAccessStore()
  const { activeProjectId, records } = store

  const record = activeProjectId ? records[activeProjectId] : null

  return {
    ...store,
    record,
    projectId: activeProjectId,
    isReady: record?.status === 'ready',
    isIdle: record?.status === 'idle',
    isNeedsActivation: record?.status === 'needs_user_activation',
    isChecking: record?.status === 'checking',
    isRequesting: record?.status === 'requesting',
    isReleasing: record?.status === 'releasing',
    hasError: record?.status === 'error',
    folderName: record?.folderName ?? null,
    handle: record?.handle ?? null,
    error: record?.error,
  }
}
