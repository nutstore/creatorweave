import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'
import { getWebContainerRuntimeService } from '@/services/webcontainer/runtime.service'
import type {
  DevServerInfo,
  WebContainerPackageManager,
  WebContainerRuntimeStatus,
} from '@/services/webcontainer/types'
import { webProjectDetector } from '@/services/webcontainer/project-detector'
import { useFolderAccessStore } from './folder-access.store'
import { useProjectStore } from './project.store'

interface WebContainerStoreState {
  boundProjectId: string | null
  status: WebContainerRuntimeStatus
  packageManager: WebContainerPackageManager | null
  packageName: string | null
  startScriptName: string | null
  startScriptOverride: string | null
  startScriptOptions: string[]
  startupPath: string
  effectiveDevWorkingDirectory: string
  effectiveInstallWorkingDirectory: string
  previewUrl: string | null
  previewPort: number | null
  logs: string[]
  errorMessage: string | null
  initialized: boolean
  isPanelOpen: boolean
  startupPathOptions: string[]
  isScanningStartupPaths: boolean
  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
  reinstall: () => Promise<void>
  syncNow: () => Promise<void>
  clearLogs: () => void
  openPanel: () => void
  closePanel: () => void
  setStartupPath: (path: string) => void
  setStartScriptOverride: (scriptName: string | null) => void
  refreshStartupPathOptions: () => Promise<void>
  refreshStartScriptOptions: () => Promise<void>
}

const MAX_LOG_LINES = 2000

function pushLog(lines: string[], chunk: string): string[] {
  const split = chunk.split('\n').filter((line) => line.trim().length > 0)
  if (split.length === 0) return lines
  const next = [...lines, ...split]
  if (next.length <= MAX_LOG_LINES) return next
  return next.slice(next.length - MAX_LOG_LINES)
}

let listenerBound = false
const STARTUP_PATH_EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'coverage',
  '.turbo',
])

function normalizeStartupPath(path: string): string {
  const normalized = path.trim().replace(/^\/+|\/+$/g, '')
  return normalized.length > 0 ? normalized : '.'
}

function getStartupPathStorageKey(projectId: string): string {
  return `webcontainer:start-path:${projectId}`
}

function getStartScriptOverrideStorageKey(projectId: string): string {
  return `webcontainer:start-script:${projectId}`
}

async function collectDirectoryOptions(
  rootHandle: FileSystemDirectoryHandle
): Promise<string[]> {
  const result = ['.']
  const children: string[] = []
  for await (const [name, entry] of rootHandle.entries()) {
    if (entry.kind !== 'directory') continue
    if (STARTUP_PATH_EXCLUDED_DIRS.has(name)) continue
    children.push(name)
  }
  children.sort((a, b) => a.localeCompare(b)).forEach((path) => result.push(path))
  return result.sort((a, b) => {
    if (a === '.') return -1
    if (b === '.') return 1
    return a.localeCompare(b)
  })
}

export const useWebContainerStore = create<WebContainerStoreState>()(
  immer((set, get) => ({
    status: 'idle',
    boundProjectId: null,
    packageManager: null,
    packageName: null,
    startScriptName: null,
    startScriptOverride: null,
    startScriptOptions: [],
    startupPath: '.',
    effectiveDevWorkingDirectory: '/',
    effectiveInstallWorkingDirectory: '/',
    previewUrl: null,
    previewPort: null,
    logs: [],
    errorMessage: null,
    initialized: false,
    isPanelOpen: false,
    startupPathOptions: ['.'],
    isScanningStartupPaths: false,

    start: async () => {
      const state = get()
      if (
        state.status === 'booting' ||
        state.status === 'syncing' ||
        state.status === 'installing' ||
        state.status === 'starting' ||
        state.status === 'stopping'
      ) {
        return
      }

      const activeProjectId = useProjectStore.getState().activeProjectId
      if (!activeProjectId) {
        toast.error('请先进入项目，再启动 WebContainer')
        return
      }

      const folderRecord = useFolderAccessStore.getState().records[activeProjectId]
      const directoryHandle = folderRecord?.handle ?? null
      if (!directoryHandle) {
        toast.error('请先授权项目目录访问权限')
        return
      }

      const runtime = getWebContainerRuntimeService()
      if (!listenerBound) {
        runtime.onLog((line) => {
          set((draft) => {
            draft.logs = pushLog(draft.logs, line)
          })
        })
        runtime.onServerReady((info: DevServerInfo) => {
          set((draft) => {
            draft.previewPort = info.port
            draft.previewUrl = info.url
          })
        })
        runtime.onDevProcessExit((exitCode) => {
          if (exitCode === 0) return
          set((draft) => {
            if (draft.status === 'running') {
              draft.status = 'error'
              draft.errorMessage = `开发服务异常退出（exit code ${exitCode}）`
            }
          })
          toast.error(`开发服务异常退出（exit code ${exitCode}）`)
        })
        listenerBound = true
      }

      set((draft) => {
        draft.errorMessage = null
        draft.previewUrl = null
        draft.previewPort = null
        draft.status = 'booting'
      })

      try {
        const contextKey = [
          activeProjectId,
          folderRecord?.folderName ?? 'unknown-folder',
          normalizeStartupPath(get().startupPath),
          get().startScriptOverride ?? '__auto__',
        ].join('|')
        await runtime.ensureBooted(contextKey)

        set((draft) => {
          draft.status = 'syncing'
        })

        const startupPath = normalizeStartupPath(get().startupPath)
        const projectInfo = await runtime.detectProject(
          directoryHandle,
          startupPath,
          get().startScriptOverride ?? undefined
        )
        set((draft) => {
          draft.boundProjectId = activeProjectId
          draft.packageManager = projectInfo.packageManager
          draft.packageName = projectInfo.packageName
          draft.startScriptName = projectInfo.startScriptName
          draft.startScriptOptions = projectInfo.availableScripts
          draft.effectiveDevWorkingDirectory = projectInfo.devWorkingDirectory
          draft.effectiveInstallWorkingDirectory = projectInfo.installWorkingDirectory
        })

        await runtime.syncProject(directoryHandle)

        if (projectInfo.requiresInstall) {
          set((draft) => {
            draft.status = 'installing'
          })
          await runtime.installDependencies()
        }

        set((draft) => {
          draft.status = 'starting'
        })
        const server = await runtime.startDevServer()

        set((draft) => {
          draft.status = 'running'
          draft.previewPort = server.port
          draft.previewUrl = server.url
        })
        toast.success('项目开发服务已启动')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'WebContainer 启动失败'
        set((draft) => {
          draft.status = 'error'
          draft.errorMessage = message
        })
        toast.error(message)
      }
    },

    stop: async () => {
      const state = get()
      if (state.status === 'idle' || state.status === 'stopping') return

      const runtime = getWebContainerRuntimeService()
      set((draft) => {
        draft.status = 'stopping'
      })

      try {
        await runtime.stop()
        set((draft) => {
          draft.status = 'idle'
          draft.previewUrl = null
          draft.previewPort = null
          draft.errorMessage = null
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : '停止服务失败'
        set((draft) => {
          draft.status = 'error'
          draft.errorMessage = message
        })
        toast.error(message)
      }
    },

    restart: async () => {
      await get().stop()
      await get().start()
    },

    reinstall: async () => {
      const runtime = getWebContainerRuntimeService()
      set((draft) => {
        draft.errorMessage = null
        draft.status = 'installing'
      })

      try {
        await runtime.installDependencies()
        set((draft) => {
          draft.status = 'idle'
        })
        toast.success('依赖重装完成')
      } catch (error) {
        const message = error instanceof Error ? error.message : '依赖重装失败'
        set((draft) => {
          draft.status = 'error'
          draft.errorMessage = message
        })
        toast.error(message)
      }
    },

    syncNow: async () => {
      const activeProjectId = useProjectStore.getState().activeProjectId
      if (!activeProjectId) {
        toast.error('没有可同步的项目')
        return
      }

      const folderRecord = useFolderAccessStore.getState().records[activeProjectId]
      const directoryHandle = folderRecord?.handle ?? null
      if (!directoryHandle) {
        toast.error('请先授权项目目录访问权限')
        return
      }

      const runtime = getWebContainerRuntimeService()
      const previous = get().status

      set((draft) => {
        draft.status = 'syncing'
      })
      try {
        await runtime.syncProject(directoryHandle)
        set((draft) => {
          draft.status = previous === 'running' ? 'running' : 'idle'
        })
        toast.success('同步完成')
      } catch (error) {
        const message = error instanceof Error ? error.message : '同步失败'
        set((draft) => {
          draft.status = 'error'
          draft.errorMessage = message
        })
        toast.error(message)
      }
    },

    clearLogs: () =>
      set((draft) => {
        draft.logs = []
      }),

    openPanel: () => {
      set((draft) => {
        draft.isPanelOpen = true
        const activeProjectId = useProjectStore.getState().activeProjectId
        if (!activeProjectId || typeof window === 'undefined') return
        if (draft.boundProjectId && draft.boundProjectId !== activeProjectId) {
          draft.status = 'idle'
          draft.packageManager = null
          draft.packageName = null
          draft.startScriptName = null
          draft.startScriptOptions = []
          draft.previewUrl = null
          draft.previewPort = null
          draft.errorMessage = null
          draft.logs = []
        }
        draft.boundProjectId = activeProjectId
        const saved = window.localStorage.getItem(getStartupPathStorageKey(activeProjectId))
        if (saved) {
          draft.startupPath = normalizeStartupPath(saved)
        }
        const savedScript = window.localStorage.getItem(
          getStartScriptOverrideStorageKey(activeProjectId)
        )
        draft.startScriptOverride = savedScript && savedScript.length > 0 ? savedScript : null
      })
      void get().refreshStartupPathOptions()
    },

    closePanel: () =>
      set((draft) => {
        draft.isPanelOpen = false
      }),
    setStartupPath: (path: string) => {
      set((draft) => {
        const normalized = normalizeStartupPath(path)
        draft.startupPath = normalized
        const activeProjectId = useProjectStore.getState().activeProjectId
        if (!activeProjectId || typeof window === 'undefined') return
        window.localStorage.setItem(getStartupPathStorageKey(activeProjectId), normalized)
      })
      void get().refreshStartScriptOptions()
    },
    setStartScriptOverride: (scriptName: string | null) => {
      set((draft) => {
        const normalized = scriptName && scriptName.trim().length > 0 ? scriptName.trim() : null
        draft.startScriptOverride = normalized
        const activeProjectId = useProjectStore.getState().activeProjectId
        if (!activeProjectId || typeof window === 'undefined') return
        if (!normalized) {
          window.localStorage.removeItem(getStartScriptOverrideStorageKey(activeProjectId))
          return
        }
        window.localStorage.setItem(getStartScriptOverrideStorageKey(activeProjectId), normalized)
      })
      void get().refreshStartScriptOptions()
    },
    refreshStartupPathOptions: async () => {
      const activeProjectId = useProjectStore.getState().activeProjectId
      if (!activeProjectId) {
        set((draft) => {
          draft.startupPathOptions = ['.']
        })
        return
      }

      const folderRecord = useFolderAccessStore.getState().records[activeProjectId]
      const directoryHandle = folderRecord?.handle ?? null
      if (!directoryHandle) {
        set((draft) => {
          draft.startupPathOptions = ['.']
        })
        return
      }

      set((draft) => {
        draft.isScanningStartupPaths = true
      })
      try {
        const options = await collectDirectoryOptions(directoryHandle)
        set((draft) => {
          draft.startupPathOptions = options
        })

        await get().refreshStartScriptOptions()
      } catch (error) {
        console.error('[WebContainerStore] Failed to scan startup path options:', error)
        toast.error('扫描目录失败，请检查权限后重试')
      } finally {
        set((draft) => {
          draft.isScanningStartupPaths = false
        })
      }
    },
    refreshStartScriptOptions: async () => {
      const activeProjectId = useProjectStore.getState().activeProjectId
      if (!activeProjectId) return

      const folderRecord = useFolderAccessStore.getState().records[activeProjectId]
      const directoryHandle = folderRecord?.handle ?? null
      if (!directoryHandle) return

      try {
        const info = await webProjectDetector.detect(
          directoryHandle,
          get().startupPath,
          get().startScriptOverride ?? undefined
        )
        set((draft) => {
          draft.startScriptOptions = info.availableScripts
          draft.startScriptName = info.startScriptName
          draft.packageName = info.packageName
          draft.packageManager = info.packageManager
          draft.effectiveDevWorkingDirectory = info.devWorkingDirectory
          draft.effectiveInstallWorkingDirectory = info.installWorkingDirectory
        })
      } catch {
        set((draft) => {
          draft.startScriptOptions = []
        })
      }
    },
  }))
)
