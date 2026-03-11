export type WebContainerPackageManager = 'pnpm' | 'yarn' | 'npm'

export interface CompatibilityWarning {
  type: string
  message: string
}

export interface WebProjectInfo {
  mode: 'package-script' | 'static'
  packageManager: WebContainerPackageManager
  startCommand: string[]
  installCommand: string[]
  requiresInstall: boolean
  packageName: string
  startScriptName: string
  startScriptCommand: string
  startScriptReason: string
  availableScripts: string[]
  devWorkingDirectory: string
  installWorkingDirectory: string
  compatibilityWarnings: CompatibilityWarning[]
}

export type WebContainerRuntimeStatus =
  | 'idle'
  | 'booting'
  | 'syncing'
  | 'installing'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

export interface DevServerInfo {
  port: number
  url: string
}
