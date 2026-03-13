import type { WebContainer, WebContainerProcess } from '@webcontainer/api'
import { webProjectDetector } from './project-detector'
import { folderToWebContainerSyncService } from './folder-sync.service'
import type { DevServerInfo, WebProjectInfo } from './types'

type LogListener = (line: string) => void
type DevServerListener = (info: DevServerInfo) => void
type DevProcessExitListener = (exitCode: number) => void

const LINUX_GLIBC_ENV: Record<string, string> = {
  npm_config_platform: 'linux',
  npm_config_arch: 'x64',
  npm_config_libc: 'glibc',
}

interface GlobalWebContainerState {
  instance: WebContainer | null
  bootPromise: Promise<WebContainer> | null
  contextKey: string | null
}

const GLOBAL_WEBCONTAINER_STATE_KEY = '__APP_WEBCONTAINER_STATE__'

function getGlobalWebContainerState(): GlobalWebContainerState {
  const root = globalThis as typeof globalThis & {
    [GLOBAL_WEBCONTAINER_STATE_KEY]?: GlobalWebContainerState
  }
  if (!root[GLOBAL_WEBCONTAINER_STATE_KEY]) {
    root[GLOBAL_WEBCONTAINER_STATE_KEY] = {
      instance: null,
      bootPromise: null,
      contextKey: null,
    }
  }
  return root[GLOBAL_WEBCONTAINER_STATE_KEY]!
}

function normalizeLine(line: string): string {
  return line.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export class WebContainerRuntimeService {
  private webcontainer: WebContainer | null = null
  private devProcess: WebContainerProcess | null = null
  private currentProjectInfo: WebProjectInfo | null = null
  private logListeners = new Set<LogListener>()
  private serverListeners = new Set<DevServerListener>()
  private exitListeners = new Set<DevProcessExitListener>()
  private isStopping = false
  private serverReadyListenerBound = false
  private currentContextKey: string | null = null

  onLog(listener: LogListener): () => void {
    this.logListeners.add(listener)
    return () => this.logListeners.delete(listener)
  }

  onServerReady(listener: DevServerListener): () => void {
    this.serverListeners.add(listener)
    return () => this.serverListeners.delete(listener)
  }

  onDevProcessExit(listener: DevProcessExitListener): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  private emitLog(message: string): void {
    const normalized = normalizeLine(message)
    for (const listener of this.logListeners) {
      listener(normalized)
    }
  }

  private emitServerReady(info: DevServerInfo): void {
    for (const listener of this.serverListeners) {
      listener(info)
    }
  }

  private emitDevProcessExit(exitCode: number): void {
    for (const listener of this.exitListeners) {
      listener(exitCode)
    }
  }

  private bindServerReadyListenerIfNeeded(): void {
    if (!this.webcontainer || this.serverReadyListenerBound) return
    this.webcontainer.on('server-ready', (port: number, url: string) => {
      this.emitLog(`[server] ready on port ${port}: ${url}`)
      this.emitServerReady({ port, url })
    })
    this.serverReadyListenerBound = true
  }

  private async teardownCurrentInstance(): Promise<void> {
    await this.stopDevServer()

    const globalState = getGlobalWebContainerState()
    const instance = this.webcontainer ?? globalState.instance
    if (instance?.teardown) {
      await instance.teardown()
    }

    this.webcontainer = null
    this.serverReadyListenerBound = false
    this.currentProjectInfo = null
    this.currentContextKey = null
    globalState.instance = null
    globalState.bootPromise = null
    globalState.contextKey = null
  }

  async ensureBooted(contextKey?: string): Promise<void> {
    const nextContextKey = contextKey ?? null

    if (
      nextContextKey &&
      this.currentContextKey &&
      nextContextKey !== this.currentContextKey
    ) {
      this.emitLog('[runtime] Context changed, recreating WebContainer instance...')
      await this.teardownCurrentInstance()
    }

    if (this.webcontainer) {
      this.bindServerReadyListenerIfNeeded()
      return
    }

    const globalState = getGlobalWebContainerState()

    if (globalState.instance) {
      if (
        nextContextKey &&
        globalState.contextKey &&
        nextContextKey !== globalState.contextKey
      ) {
        this.emitLog('[runtime] Global context changed, recreating WebContainer instance...')
        await this.teardownCurrentInstance()
      } else {
      this.webcontainer = globalState.instance
      this.bindServerReadyListenerIfNeeded()
        this.currentContextKey = globalState.contextKey
      this.emitLog('[runtime] Reusing existing WebContainer instance')
      return
      }
    }

    if (!globalState.bootPromise) {
      globalState.bootPromise = (async () => {
        const { WebContainer } = await import('@webcontainer/api')
        const instance = await WebContainer.boot()
        globalState.instance = instance
        globalState.contextKey = nextContextKey
        return instance
      })()
      globalState.bootPromise.finally(() => {
        globalState.bootPromise = null
      })
    }

    this.webcontainer = await globalState.bootPromise
    this.currentContextKey = nextContextKey
    this.bindServerReadyListenerIfNeeded()
    this.emitLog('[runtime] WebContainer booted')
  }

  async detectProject(
    rootDirectoryHandle: FileSystemDirectoryHandle,
    startupPath = '.',
    preferredScriptName?: string
  ): Promise<WebProjectInfo> {
    const info = await webProjectDetector.detect(
      rootDirectoryHandle,
      startupPath,
      preferredScriptName
    )
    this.currentProjectInfo = info
    this.emitLog(`[detect] project: ${info.packageName}`)
    this.emitLog(`[detect] mode: ${info.mode}`)
    this.emitLog(`[detect] package manager: ${info.packageManager}`)
    this.emitLog(`[detect] startup directory: ${info.devWorkingDirectory}`)
    this.emitLog(`[detect] install directory: ${info.installWorkingDirectory}`)
    this.emitLog(`[detect] startup script: ${info.startScriptName} -> ${info.startScriptCommand}`)
    this.emitLog(`[detect] script selection: ${info.startScriptReason}`)
    return info
  }

  async syncProject(directoryHandle: FileSystemDirectoryHandle): Promise<void> {
    if (!this.webcontainer) {
      throw new Error('WebContainer 尚未启动')
    }
    if (!this.currentProjectInfo) {
      throw new Error('项目未识别，无法同步')
    }
    this.emitLog('[sync] syncing project files to WebContainer...')
    const summary = await folderToWebContainerSyncService.syncToWebContainer(
      this.webcontainer,
      directoryHandle,
      {
        startupPath: this.currentProjectInfo.devWorkingDirectory,
        installWorkingDirectory: this.currentProjectInfo.installWorkingDirectory,
        packageManager: this.currentProjectInfo.packageManager,
      }
    )
    this.emitLog(
      `[sync] completed: ${summary.fileCount} files, ${summary.directoryCount} directories, ${summary.skippedFileCount} files skipped (${summary.skippedLargeFileCount} too large), ${summary.skippedDirectoryCount} directories skipped`
    )
  }

  async installDependencies(): Promise<void> {
    if (!this.webcontainer) {
      throw new Error('WebContainer 尚未启动')
    }
    if (!this.currentProjectInfo) {
      throw new Error('项目未识别，无法安装依赖')
    }
    if (!this.currentProjectInfo.requiresInstall) {
      this.emitLog('[install] skipped: current mode does not require dependency installation')
      return
    }

    this.emitLog('[install] patch: npm-config-libc-v3')
    const [cmd, ...args] = this.currentProjectInfo.installCommand

    if (cmd === 'npm') {
      const configCommands: Array<{ key: string; value: string }> = [
        { key: 'libc', value: 'glibc' },
        { key: 'platform', value: 'linux' },
        { key: 'arch', value: 'x64' },
      ]
      for (const config of configCommands) {
        try {
          this.emitLog(`[install] npm config set ${config.key}=${config.value}`)
          const cfgProcess = await this.webcontainer.spawn(
            'npm',
            ['config', 'set', config.key, config.value],
            {
              cwd: this.currentProjectInfo.installWorkingDirectory,
              env: {
                ...LINUX_GLIBC_ENV,
              },
            }
          )
          void cfgProcess.output.pipeTo(
            new WritableStream({
              write: (data) => this.emitLog(data),
            })
          )
          const cfgExit = await cfgProcess.exit
          if (cfgExit !== 0) {
            this.emitLog(
              `[install] warning: npm config set ${config.key} failed (exit ${cfgExit})`
            )
          }
        } catch (error) {
          this.emitLog(
            `[install] warning: npm config set ${config.key} error: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
      }
    }

    this.emitLog(`[install] running: ${cmd} ${args.join(' ')}`)

    const process = await this.webcontainer.spawn(cmd, args, {
      cwd: this.currentProjectInfo.installWorkingDirectory,
      env: {
        ...LINUX_GLIBC_ENV,
      },
    })
    void process.output.pipeTo(
      new WritableStream({
        write: (data) => this.emitLog(data),
      })
    )
    const exitCode = await process.exit

    if (exitCode !== 0) {
      throw new Error(`依赖安装失败，退出码: ${exitCode}`)
    }

    this.emitLog('[install] dependencies installed successfully')
  }

  private waitForServerReady(timeoutMs = 120_000): Promise<DevServerInfo> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        unsubscribe()
        reject(new Error('等待开发服务启动超时，请检查日志'))
      }, timeoutMs)

      const unsubscribe = this.onServerReady((info) => {
        window.clearTimeout(timer)
        unsubscribe()
        resolve(info)
      })
    })
  }

  async startDevServer(): Promise<DevServerInfo> {
    if (!this.webcontainer) {
      throw new Error('WebContainer 尚未启动')
    }
    if (!this.currentProjectInfo) {
      throw new Error('项目未识别，无法启动开发服务')
    }

    if (this.devProcess) {
      await this.stopDevServer()
    }

    const [cmd, ...rawArgs] = this.currentProjectInfo.startCommand
    const args = [...rawArgs]
    const startScriptCommand = this.currentProjectInfo.startScriptCommand.toLowerCase()
    const isNextDev = startScriptCommand.includes('next dev')
    if (isNextDev) {
      this.emitLog('[dev] detected next dev, disabling turbopack via env for compatibility')
    }
    this.emitLog(`[dev] running: ${cmd} ${args.join(' ')}`)

    const process = await this.webcontainer.spawn(cmd, args, {
      cwd: this.currentProjectInfo.devWorkingDirectory,
      env: {
        NODE_ENV: 'development',
        ...LINUX_GLIBC_ENV,
        ...(isNextDev
          ? {
              NEXT_DISABLE_TURBOPACK: '1',
              NEXT_DISABLE_LIGHTNINGCSS: '1',
            }
          : {}),
      },
    })
    this.devProcess = process

    void process.output.pipeTo(
      new WritableStream({
        write: (data) => this.emitLog(data),
      })
    )

    void process.exit.then((exitCode: number) => {
      this.emitLog(`[dev] process exited with code ${exitCode}`)
      this.devProcess = null
      if (!this.isStopping) {
        this.emitDevProcessExit(exitCode)
      }
    })

    return this.waitForServerReady()
  }

  async stopDevServer(): Promise<void> {
    if (!this.devProcess) return
    this.isStopping = true
    try {
      this.devProcess.kill()
      await this.devProcess.exit
      this.emitLog('[dev] stopped')
    } finally {
      this.devProcess = null
      this.isStopping = false
    }
  }

  async stop(): Promise<void> {
    await this.stopDevServer()
  }
}

const runtimeService = new WebContainerRuntimeService()

export function getWebContainerRuntimeService(): WebContainerRuntimeService {
  return runtimeService
}
