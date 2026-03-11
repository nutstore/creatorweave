import { useEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  Play,
  Square,
  RotateCcw,
  RefreshCcw,
  Trash2,
  ExternalLink,
  Copy,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useWebContainerStore } from '@/store/webcontainer.store'
import { useProjectStore } from '@/store/project.store'
import { useFolderAccessStore } from '@/store/folder-access.store'
import { FileTreePanel } from '@/components/file-viewer/FileTreePanel'
import { buildWebContainerPreviewRoute } from '@/services/webcontainer/preview-route'
import { toast } from 'sonner'
import {
  BrandBadge,
  BrandButton,
  BrandCard,
  BrandCardContent,
  BrandCardHeader,
  BrandCardTitle,
  BrandInput,
  BrandSelect,
  BrandSelectContent,
  BrandSelectItem,
  BrandSelectTrigger,
  BrandSelectValue,
} from '@browser-fs-analyzer/ui'

interface WebContainerPanelProps {
  isOpen: boolean
  onClose: () => void
}

type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'neutral'

function statusLabel(status: string): string {
  if (status === 'idle') return '空闲'
  if (status === 'booting') return '启动容器中'
  if (status === 'syncing') return '同步文件中'
  if (status === 'installing') return '安装依赖中'
  if (status === 'starting') return '启动服务中'
  if (status === 'running') return '运行中'
  if (status === 'stopping') return '停止中'
  return '错误'
}

function statusStyles(status: string): StatusBadgeVariant {
  if (status === 'running') return 'success'
  if (status === 'error') return 'error'
  if (status === 'idle') return 'neutral'
  return 'warning'
}

export function WebContainerPanel({ isOpen, onClose }: WebContainerPanelProps) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeDirectoryHandle = useFolderAccessStore((s) =>
    activeProjectId ? s.records[activeProjectId]?.handle ?? null : null
  )
  const {
    status,
    packageManager,
    packageName,
    startScriptName,
    startScriptOverride,
    startScriptOptions,
    startupPath,
    effectiveDevWorkingDirectory,
    effectiveInstallWorkingDirectory,
    previewUrl,
    previewPort,
    logs,
    errorMessage,
    compatibilityWarnings,
    start,
    stop,
    restart,
    reinstall,
    syncNow,
    clearLogs,
    setStartupPath,
    setStartScriptOverride,
  } = useWebContainerStore()
  const [isDirectoryPickerOpen, setIsDirectoryPickerOpen] = useState(false)
  const [pendingStartupPath, setPendingStartupPath] = useState<string>(startupPath)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const logRef = useRef<HTMLPreElement>(null)
  const busy =
    status === 'booting' ||
    status === 'syncing' ||
    status === 'installing' ||
    status === 'starting' ||
    status === 'stopping'

  useEffect(() => {
    const node = logRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [logs])

  const logsText = useMemo(() => logs.join('\n'), [logs])
  const logCount = logs.length
  const standalonePreviewHref = useMemo(() => {
    if (!previewUrl) return null
    return buildWebContainerPreviewRoute(previewUrl, activeProjectId)
  }, [previewUrl, activeProjectId])

  const mergedScriptOptions = useMemo(() => {
    const options = startScriptOptions.slice()
    if (startScriptOverride && !options.includes(startScriptOverride)) {
      options.push(startScriptOverride)
    }
    return options
  }, [startScriptOptions, startScriptOverride])

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logsText || '')
      toast.success('日志已复制到剪贴板')
    } catch {
      toast.error('复制日志失败，请检查浏览器权限')
    }
  }

  useEffect(() => {
    if (!isDirectoryPickerOpen) {
      setPendingStartupPath(startupPath)
    }
  }, [startupPath, isDirectoryPickerOpen])

  const openDirectoryPicker = () => {
    setPendingStartupPath(startupPath)
    setIsDirectoryPickerOpen(true)
  }

  const confirmDirectoryPicker = () => {
    setStartupPath(pendingStartupPath || '.')
    setIsDirectoryPickerOpen(false)
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[720px] max-w-[92vw] min-w-0 flex-col overflow-hidden border-l border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                WebContainer
              </h2>
              <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                {packageName || '未识别项目'}
                {packageManager ? ` · ${packageManager}` : ''}
                {startScriptName ? ` · script=${startScriptName}` : ''}
                {effectiveDevWorkingDirectory ? ` · dev=${effectiveDevWorkingDirectory}` : ''}
                {effectiveInstallWorkingDirectory
                  ? ` · install=${effectiveInstallWorkingDirectory}`
                  : ''}
                {previewPort ? ` · :${previewPort}` : ''}
              </p>
            </div>
            <div className="ml-3 flex items-center gap-2">
              <BrandBadge variant={statusStyles(status)}>
                {statusLabel(status)}
              </BrandBadge>
              <BrandButton
                type="button"
                iconButton
                variant="ghost"
                onClick={onClose}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </BrandButton>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-b border-neutral-200 p-4 dark:border-neutral-700">
          <BrandCard variant="content" className="rounded-xl">
            <BrandCardHeader className="space-y-1 border-b border-gray-200 px-4 py-3 dark:border-neutral-700">
              <BrandCardTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                启动配置
              </BrandCardTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                可选择子目录与脚本，适配 monorepo 或多应用目录结构。
              </p>
            </BrandCardHeader>
            <BrandCardContent className="space-y-3 px-4 py-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
                    目录选择
                  </label>
                  <div className="space-y-2">
                    <BrandButton
                      type="button"
                      variant="outline"
                      onClick={openDirectoryPicker}
                      disabled={!activeDirectoryHandle}
                      className="h-8 px-3 text-xs"
                    >
                      选择目录
                    </BrandButton>
                    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 dark:border-neutral-700 dark:bg-neutral-800/60">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        当前启动目录
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                        {startupPath}
                      </div>
                      <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                        修改目录后需重新启动或重启才会生效
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-gray-200 px-2.5 py-2 text-left text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                  >
                    <span>高级选项</span>
                    {showAdvanced ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {showAdvanced && (
                    <div className="mt-2 space-y-1">
                      <label className="block text-xs text-neutral-500 dark:text-neutral-400">
                        启动目录（手动）
                      </label>
                      <BrandInput
                        value={startupPath}
                        onChange={(e) => setStartupPath(e.target.value)}
                        placeholder="例如 apps/web（默认 .）"
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
                    启动脚本
                  </label>
                  <BrandSelect
                    value={startScriptOverride ?? '__auto__'}
                    onValueChange={(value) => setStartScriptOverride(value === '__auto__' ? null : value)}
                  >
                    <BrandSelectTrigger className="h-8">
                      <BrandSelectValue placeholder="选择启动脚本" />
                    </BrandSelectTrigger>
                    <BrandSelectContent>
                      <BrandSelectItem value="__auto__">
                        自动（当前: {startScriptName ?? '未识别'}）
                      </BrandSelectItem>
                      {mergedScriptOptions.map((script) => (
                        <BrandSelectItem key={script} value={script}>
                          {script}
                        </BrandSelectItem>
                      ))}
                    </BrandSelectContent>
                    </BrandSelect>
                </div>
              </div>
            </BrandCardContent>
          </BrandCard>

          <div className="flex flex-wrap gap-2">
            <BrandButton
              type="button"
              variant="primary"
              onClick={() => void start()}
              disabled={busy || status === 'running'}
              className="h-9 px-3 text-sm"
            >
              <Play className="h-3.5 w-3.5" />
              启动
            </BrandButton>
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => void stop()}
              disabled={busy || status === 'idle'}
              className="h-9 px-3 text-sm"
            >
              <Square className="h-3.5 w-3.5" />
              停止
            </BrandButton>
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => void restart()}
              disabled={busy}
              className="h-9 px-3 text-sm"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重启
            </BrandButton>
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => void syncNow()}
              disabled={busy}
              className="h-9 px-3 text-sm"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              同步
            </BrandButton>
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => void reinstall()}
              disabled={busy}
              className="h-9 px-3 text-sm"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              重装依赖
            </BrandButton>
          </div>
        </div>

        {errorMessage && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {compatibilityWarnings.length > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            {compatibilityWarnings.map((warning, index) => (
              <div key={index} className={index > 0 ? 'mt-2' : ''}>
                <span className="font-medium">⚠️ {warning.type}:</span> {warning.message}
              </div>
            ))}
          </div>
        )}

        <div className="min-h-0 min-w-0 flex-1">
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-700">
              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                日志输出 ({logCount})
              </div>
              <div className="flex items-center gap-2">
                <BrandButton
                  type="button"
                  variant="outline"
                  onClick={() => clearLogs()}
                  className="h-7 px-2 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  清空日志
                </BrandButton>
                <BrandButton
                  type="button"
                  variant="outline"
                  onClick={() => void handleCopyLogs()}
                  className="h-7 px-2 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制日志
                </BrandButton>
                <BrandButton
                  type="button"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={!standalonePreviewHref}
                  onClick={() => {
                    if (!standalonePreviewHref) return
                    window.open(standalonePreviewHref, '_blank', 'noopener')
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  打开预览
                </BrandButton>
              </div>
            </div>
            <pre
              ref={logRef}
              className="h-full min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all bg-neutral-950 px-4 py-3 text-xs leading-5 text-neutral-100"
            >
              {logsText || '暂无输出，点击“启动”开始'}
            </pre>
          </div>
        </div>
      </div>

      {isDirectoryPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4">
          <div className="flex h-[70vh] w-full max-w-[760px] min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                选择启动目录
              </div>
              <BrandButton
                type="button"
                iconButton
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setIsDirectoryPickerOpen(false)}
              >
                <X className="h-4 w-4" />
              </BrandButton>
            </div>

            <div className="min-h-0 flex-1 p-3">
              <div className="h-full overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700">
                <FileTreePanel
                  directoryHandle={activeDirectoryHandle}
                  rootName={activeDirectoryHandle?.name ?? '项目目录'}
                  mode="directories"
                  selectedPath={pendingStartupPath === '.' ? null : pendingStartupPath}
                  onDirectorySelect={(path) => setPendingStartupPath(path)}
                  showHeader
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
              <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                已选择: {pendingStartupPath || '.'}
              </div>
              <div className="flex items-center gap-2">
                <BrandButton
                  type="button"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  onClick={() => {
                    setStartupPath('.')
                    setIsDirectoryPickerOpen(false)
                  }}
                >
                  重置为项目根目录
                </BrandButton>
                <BrandButton
                  type="button"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  onClick={() => setIsDirectoryPickerOpen(false)}
                >
                  取消
                </BrandButton>
                <BrandButton
                  type="button"
                  variant="primary"
                  className="h-8 px-3 text-xs"
                  onClick={confirmDirectoryPicker}
                >
                  确认
                </BrandButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
