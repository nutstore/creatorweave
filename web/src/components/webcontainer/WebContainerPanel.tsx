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
} from '@creatorweave/ui'
import { useT } from '@/i18n'

interface WebContainerPanelProps {
  isOpen: boolean
  onClose: () => void
}

type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'neutral'

function getStatusLabel(status: string, t: (key: string) => string): string {
  if (status === 'idle') return t('webContainer.statusIdle')
  if (status === 'booting') return t('webContainer.statusBooting')
  if (status === 'syncing') return t('webContainer.statusSyncing')
  if (status === 'installing') return t('webContainer.statusInstalling')
  if (status === 'starting') return t('webContainer.statusStarting')
  if (status === 'running') return t('webContainer.statusRunning')
  if (status === 'stopping') return t('webContainer.statusStopping')
  return t('webContainer.statusError')
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
  const t = useT()
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
      toast.success(t('webContainer.logsCopied'))
    } catch {
      toast.error(t('webContainer.copyLogsFailed'))
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
                {packageName || t('webContainer.unrecognisedProject')}
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
                {getStatusLabel(status, t)}
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
            <BrandCardHeader className="space-y-1 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
              <BrandCardTitle className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {t('webContainer.startupConfig')}
              </BrandCardTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t('webContainer.startupConfigHelp')}
              </p>
            </BrandCardHeader>
            <BrandCardContent className="space-y-3 px-4 py-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
                    {t('webContainer.directorySelect')}
                  </label>
                  <div className="space-y-2">
                    <BrandButton
                      type="button"
                      variant="outline"
                      onClick={openDirectoryPicker}
                      disabled={!activeDirectoryHandle}
                      className="h-8 px-3 text-xs"
                    >
                      {t('webContainer.selectDirectory')}
                    </BrandButton>
                    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 dark:border-neutral-700 dark:bg-neutral-800/60">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        {t('webContainer.currentStartupDir')}
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                        {startupPath}
                      </div>
                      <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                        {t('webContainer.dirChangeRequiresRestart')}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-neutral-200 px-2.5 py-2 text-left text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                  >
                    <span>{t('webContainer.advancedOptions')}</span>
                    {showAdvanced ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {showAdvanced && (
                    <div className="mt-2 space-y-1">
                      <label className="block text-xs text-neutral-500 dark:text-neutral-400">
                        {t('webContainer.startupDirManual')}
                      </label>
                      <BrandInput
                        value={startupPath}
                        onChange={(e) => setStartupPath(e.target.value)}
                        placeholder={t('webContainer.startupDirPlaceholder')}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
                    {t('webContainer.startupScript')}
                  </label>
                  <BrandSelect
                    value={startScriptOverride ?? '__auto__'}
                    onValueChange={(value) => setStartScriptOverride(value === '__auto__' ? null : value)}
                  >
                    <BrandSelectTrigger className="h-8">
                      <BrandSelectValue placeholder={t('webContainer.selectStartupScript')} />
                    </BrandSelectTrigger>
                    <BrandSelectContent>
                      <BrandSelectItem value="__auto__">
                        {t('webContainer.autoScript', { name: startScriptName ?? t('webContainer.unrecognisedProject') })}
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
              {t('webContainer.start')}
            </BrandButton>
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => void stop()}
              disabled={busy || status === 'idle'}
              className="h-9 px-3 text-sm"
            >
              <Square className="h-3.5 w-3.5" />
              {t('webContainer.stop')}
            </BrandButton>
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => void restart()}
              disabled={busy}
              className="h-9 px-3 text-sm"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('webContainer.restart')}
            </BrandButton>
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => void syncNow()}
              disabled={busy}
              className="h-9 px-3 text-sm"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {t('webContainer.sync')}
            </BrandButton>
            <BrandButton
              type="button"
              variant="outline"
              onClick={() => void reinstall()}
              disabled={busy}
              className="h-9 px-3 text-sm"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {t('webContainer.reinstallDeps')}
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
                {t('webContainer.logOutput', { count: logCount })}
              </div>
              <div className="flex items-center gap-2">
                <BrandButton
                  type="button"
                  variant="outline"
                  onClick={() => clearLogs()}
                  className="h-7 px-2 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('webContainer.clearLogs')}
                </BrandButton>
                <BrandButton
                  type="button"
                  variant="outline"
                  onClick={() => void handleCopyLogs()}
                  className="h-7 px-2 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t('webContainer.copyLogs')}
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
                  {t('webContainer.openPreview')}
                </BrandButton>
              </div>
            </div>
            <pre
              ref={logRef}
              className="h-full min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all bg-neutral-950 px-4 py-3 text-xs leading-5 text-neutral-100"
            >
              {logsText || t('webContainer.noOutputYet')}
            </pre>
          </div>
        </div>
      </div>

      {isDirectoryPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4">
          <div className="flex h-[70vh] w-full max-w-[760px] min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {t('webContainer.selectStartupDir')}
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
              <div className="h-full overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
                <FileTreePanel
                  directoryHandle={activeDirectoryHandle}
                  rootName={activeDirectoryHandle?.name ?? t('webContainer.projectDirectory')}
                  mode="directories"
                  selectedPath={pendingStartupPath === '.' ? null : pendingStartupPath}
                  onDirectorySelect={(path) => setPendingStartupPath(path)}
                  showHeader
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
              <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {t('webContainer.selected', { path: pendingStartupPath || '.' })}
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
                  {t('webContainer.resetToProjectRoot')}
                </BrandButton>
                <BrandButton
                  type="button"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  onClick={() => setIsDirectoryPickerOpen(false)}
                >
                  {t('webContainer.cancel')}
                </BrandButton>
                <BrandButton
                  type="button"
                  variant="primary"
                  className="h-8 px-3 text-xs"
                  onClick={confirmDirectoryPicker}
                >
                  {t('webContainer.confirm')}
                </BrandButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
