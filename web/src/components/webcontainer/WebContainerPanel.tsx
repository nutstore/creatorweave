import { useEffect, useMemo, useRef } from 'react'
import { X, Play, Square, RotateCcw, RefreshCcw, Trash2, ExternalLink, Copy } from 'lucide-react'
import { useWebContainerStore } from '@/store/webcontainer.store'
import { useProjectStore } from '@/store/project.store'
import { buildWebContainerPreviewRoute } from '@/services/webcontainer/preview-route'
import { toast } from 'sonner'

interface WebContainerPanelProps {
  isOpen: boolean
  onClose: () => void
}

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

function statusStyles(status: string): string {
  if (status === 'running') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'error') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'idle') return 'bg-neutral-100 text-neutral-700 border-neutral-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
}

export function WebContainerPanel({ isOpen, onClose }: WebContainerPanelProps) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
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
    autoOpenPreviewInNewTab,
    startupPathOptions,
    isScanningStartupPaths,
    start,
    stop,
    restart,
    reinstall,
    syncNow,
    clearLogs,
    setStartupPath,
    setStartScriptOverride,
    setAutoOpenPreviewInNewTab,
    refreshStartupPathOptions,
  } = useWebContainerStore()

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

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logsText || '')
      toast.success('日志已复制到剪贴板')
    } catch {
      toast.error('复制日志失败，请检查浏览器权限')
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[720px] min-w-0 flex-col overflow-hidden border-l border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
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
              <span
                className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${statusStyles(status)}`}
              >
                {statusLabel(status)}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
                目录选择
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={startupPath}
                  onChange={(e) => setStartupPath(e.target.value)}
                  className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  {startupPathOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  {!startupPathOptions.includes(startupPath) && (
                    <option value={startupPath}>{startupPath}</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => void refreshStartupPathOptions()}
                  disabled={isScanningStartupPaths}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-neutral-200 px-2 text-xs text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
                  title="刷新目录列表"
                >
                  <RefreshCcw
                    className={`h-3.5 w-3.5 ${isScanningStartupPaths ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
                启动目录（手动）
              </label>
              <input
                type="text"
                value={startupPath}
                onChange={(e) => setStartupPath(e.target.value)}
                placeholder="例如 apps/web（默认 .）"
                className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
                启动脚本
              </label>
              <select
                value={startScriptOverride ?? '__auto__'}
                onChange={(e) =>
                  setStartScriptOverride(e.target.value === '__auto__' ? null : e.target.value)
                }
                className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              >
                <option value="__auto__">自动（当前: {startScriptName ?? '未识别'}）</option>
                {startScriptOptions.map((script) => (
                  <option key={script} value={script}>
                    {script}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={autoOpenPreviewInNewTab}
                  onChange={(e) => setAutoOpenPreviewInNewTab(e.target.checked)}
                />
                启动后自动新标签打开
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy || status === 'running'}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
            >
              <Play className="h-3.5 w-3.5" />
              Start
            </button>
            <button
              type="button"
              onClick={() => void stop()}
              disabled={busy || status === 'idle'}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
            <button
              type="button"
              onClick={() => void restart()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restart
            </button>
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Sync
            </button>
            <button
              type="button"
              onClick={() => void reinstall()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Reinstall
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[45%_55%]">
          <div className="min-h-0 min-w-0 border-b border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-700">
              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                日志输出 ({logCount})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => clearLogs()}
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyLogs()}
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
            </div>
            <pre
              ref={logRef}
              className="h-[calc(100%-41px)] min-w-0 overflow-auto whitespace-pre-wrap break-all bg-neutral-950 px-4 py-3 text-xs leading-5 text-neutral-100"
            >
              {logsText || '暂无输出，点击 Start 启动'}
            </pre>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-700">
              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                应用预览
              </div>
              {standalonePreviewHref && (
                <a
                  href={standalonePreviewHref}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Preview
                </a>
              )}
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-neutral-100 dark:bg-neutral-950">
              {previewUrl ? (
                <iframe
                  title="webcontainer-preview"
                  src={previewUrl}
                  className="h-full w-full min-w-0 border-0"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
                  暂无预览地址
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
