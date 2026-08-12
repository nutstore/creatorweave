/**
 * ExtensionInstallGuide — full-screen modal that walks users through
 * installing the browser extension step-by-step.
 *
 * 5 steps: Intro → Download → Extract → Install → Refresh
 */

import { useState } from 'react'
import {
  Globe,
  Search,
  FileText,
  Download,
  Archive,
  Puzzle,
  CheckCircle2,
  Loader2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Clock,
  ClipboardList,
  Folder,
  Info,
  AlertTriangle,
} from 'lucide-react'
import {
  BrandDialog,
  BrandDialogContent,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandDialogClose,
} from '@creatorweave/ui'
import { useT } from '@/i18n'
import { useExtensionStore } from '@/store/extension.store'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 5

// The extension zip is built and hosted alongside the web app
// Cache-bust via build ID so users always get the latest version
const EXTENSION_DOWNLOAD_URL = `/chrome-extension.zip?v=${__APP_BUILD_ID__}`

// ---------------------------------------------------------------------------
// Step 1: Introduction
// ---------------------------------------------------------------------------

function StepIntro() {
  const t = useT()
  const features = [
    { icon: <Search className="h-4 w-4" />, text: t('extension.featureSearch') },
    { icon: <FileText className="h-4 w-4" />, text: t('extension.featureFetch') },
  ]

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-100/30">
          <Globe className="h-8 w-8 text-primary-600 dark:text-primary-400" />
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold text-secondary">
          {t('extension.guideSubtitle')}
        </h3>
      </div>

      <div className="space-y-2">
        {features.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <span className="text-primary-600 dark:text-primary-400">{f.icon}</span>
            <span className="text-sm text-secondary">{f.text}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 rounded-xl border border-border bg-tertiary px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <Clock className="h-3.5 w-3.5 text-tertiary" /> {t('extension.estimatedTime')}
        </div>
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <ClipboardList className="h-3.5 w-3.5 text-tertiary" /> {t('extension.prerequisite')}
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-warning">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {t('extension.previewNote')}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Download
// ---------------------------------------------------------------------------

function StepDownload() {
  const t = useT()
  const [downloading, setDownloading] = useState(false)

  const handleDownload = () => {
    setDownloading(true)
    window.open(EXTENSION_DOWNLOAD_URL, '_blank')
    // Reset after a short delay since we can't track download completion
    setTimeout(() => setDownloading(false), 3000)
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-100/30">
          <Download className="h-7 w-7 text-primary-600 dark:text-primary-400" />
        </div>
      </div>

      <p className="text-center text-sm text-secondary">
        {t('extension.stepDownloadDesc')} ({t('extension.downloadSize')})
      </p>

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:opacity-60 dark:bg-primary-500 dark:hover:bg-primary-600"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {downloading ? '...' : t('extension.downloadButton')}
      </button>

      <div className="flex items-start gap-2 rounded-xl border border-border bg-tertiary px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400" />
        <p className="text-xs text-secondary">
          {t('extension.downloadHint')}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Extract
// ---------------------------------------------------------------------------

function StepExtract() {
  const t = useT()

  const instructions = [
    { label: 'Windows', text: t('extension.extractWindows') },
    { label: 'macOS', text: t('extension.extractMac') },
    { label: 'Linux', text: t('extension.extractLinux') },
  ]

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-100/30">
          <Archive className="h-7 w-7 text-primary-600 dark:text-primary-400" />
        </div>
      </div>

      <h3 className="text-center text-sm font-medium text-secondary">
        {t('extension.extractTitle')}
      </h3>

      <div className="space-y-2">
        {instructions.map((inst) => (
          <div
            key={inst.label}
            className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <span className="shrink-0 rounded-md bg-tertiary px-2 py-0.5 text-xs font-medium text-secondary">
              {inst.label}
            </span>
            <span className="text-sm text-secondary">{inst.text}</span>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-tertiary p-3">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <Folder className="h-3.5 w-3.5 text-tertiary" />
          <code className="font-mono">
            chrome-extension.zip → chrome-extension/
          </code>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Install in Browser
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-100/30"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {t('extension.installCopyLink')}
    </button>
  )
}

function StepInstall() {
  const t = useT()

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-100/30">
          <Puzzle className="h-7 w-7 text-primary-600 dark:text-primary-400" />
        </div>
      </div>

      <h3 className="text-center text-sm font-medium text-secondary">
        {t('extension.stepInstallDesc')}
      </h3>

      {/* Step A */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-100/30 dark:text-primary-300">
            A
          </span>
          <span className="text-sm font-medium text-secondary">
            {t('extension.installStepA')}
          </span>
        </div>
        <div className="ml-7 space-y-1">
          <div className="flex items-center gap-2">
            <code className="rounded bg-tertiary px-1.5 py-0.5 text-xs text-secondary">
              chrome://extensions
            </code>
            <CopyButton text="chrome://extensions" />
          </div>
          <div className="flex items-center gap-2">
            <code className="rounded bg-tertiary px-1.5 py-0.5 text-xs text-secondary">
              edge://extensions
            </code>
            <CopyButton text="edge://extensions" />
          </div>
        </div>
      </div>

      {/* Step B */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-100/30 dark:text-primary-300">
            B
          </span>
          <span className="text-sm font-medium text-secondary">
            {t('extension.installStepB')}
          </span>
        </div>
        <div className="ml-7">
          <div className="flex items-center gap-2">
            <span className="text-xs text-tertiary">OFF</span>
            <div className="h-5 w-9 rounded-full bg-border-strong" />
            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">ON</span>
          </div>
        </div>
      </div>

      {/* Step C */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-100/30 dark:text-primary-300">
            C
          </span>
          <span className="text-sm font-medium text-secondary">
            {t('extension.installStepC')}
          </span>
        </div>
        <div className="ml-7 text-xs text-tertiary">
          {t('extension.installStepCSelect')}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success-bg px-3 py-2.5">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
        <p className="text-xs text-success">
          {t('extension.installSuccessHint')}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 5: Refresh Page
// ---------------------------------------------------------------------------

function StepRefresh({ onRefresh }: { onRefresh: () => void }) {
  const t = useT()

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-100/30">
          <RefreshCw className="h-8 w-8 text-primary-600 dark:text-primary-400" />
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold text-secondary">
          {t('extension.refreshTitle')}
        </h3>
        <p className="mt-2 text-sm text-tertiary">
          {t('extension.refreshDescription')}
        </p>
      </div>

      <button
        type="button"
        onClick={onRefresh}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 dark:bg-primary-500 dark:hover:bg-primary-600"
      >
        <RefreshCw className="h-4 w-4" />
        {t('extension.refreshButton')}
      </button>

      <div className="flex items-start gap-2 rounded-xl border border-border bg-tertiary px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400" />
        <p className="text-xs text-secondary">
          {t('extension.refreshHint')}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step Indicator (progress dots)
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const active = i < current
        const cls = active
          ? 'h-1.5 w-6 rounded-full bg-primary-600 transition-all dark:bg-primary-500'
          : 'h-1.5 w-1.5 rounded-full bg-border-strong transition-all'
        return <span key={i} className={cls} />
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Install Guide Dialog
// ---------------------------------------------------------------------------

interface ExtensionInstallGuideProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExtensionInstallGuide({ open, onOpenChange }: ExtensionInstallGuideProps) {
  const t = useT()
  const installGuideStep = useExtensionStore((s) => s.installGuideStep)
  const goToStep = useExtensionStore((s) => s.goToStep)
  const closeInstallGuide = useExtensionStore((s) => s.closeInstallGuide)

  const handleClose = () => {
    closeInstallGuide()
    onOpenChange(false)
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  const stepLabels = [
    t('extension.stepIntro'),
    t('extension.stepDownload'),
    t('extension.stepExtract'),
    t('extension.stepInstall'),
    t('extension.stepRefresh'),
  ]

  return (
    <BrandDialog open={open} onOpenChange={onOpenChange} modal={true}>
      <BrandDialogContent className="flex w-[min(94vw,560px)] max-w-none flex-col overflow-hidden p-0">
        <BrandDialogHeader>
          <div className="flex items-center gap-2.5">
            <Globe className="h-[18px] w-[18px] text-primary-600 dark:text-primary-400" />
            <BrandDialogTitle>{t('extension.guideTitle')}</BrandDialogTitle>
          </div>
          <BrandDialogClose asChild>
            <button
              type="button"
              aria-label={t('common.close')}
              className="text-tertiary transition-colors hover:text-primary"
              onClick={handleClose}
            >
              <X className="h-5 w-5" />
            </button>
          </BrandDialogClose>
        </BrandDialogHeader>

        {/* Step indicator + quick jump */}
        <div className="border-b border-border px-5 pb-3 pt-1">
          <div className="flex items-center justify-between">
            <StepIndicator current={installGuideStep} total={TOTAL_STEPS} />
            <button
              type="button"
              onClick={() => goToStep(5)}
              className="text-xs text-primary-600 hover:underline dark:text-primary-400"
            >
              {t('extension.refreshPageLink')}
            </button>
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {stepLabels.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goToStep(i + 1)}
                className={`shrink-0 rounded-md px-2 py-1 text-xs transition-colors ${
                  installGuideStep === i + 1
                    ? 'bg-primary-100 font-medium text-primary-700 dark:bg-primary-100/30 dark:text-primary-300'
                    : 'text-tertiary hover:bg-hover'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {installGuideStep === 1 && <StepIntro />}
          {installGuideStep === 2 && <StepDownload />}
          {installGuideStep === 3 && <StepExtract />}
          {installGuideStep === 4 && <StepInstall />}
          {installGuideStep === 5 && <StepRefresh onRefresh={handleRefresh} />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={installGuideStep > 1 ? () => goToStep(installGuideStep - 1) : handleClose}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-tertiary transition-colors hover:bg-hover hover:text-secondary"
          >
            <ChevronLeft className="h-4 w-4" />
            {installGuideStep > 1 ? t('extension.prevStep') : t('extension.skip')}
          </button>

          {installGuideStep < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => goToStep(installGuideStep + 1)}
              className="flex items-center gap-1 rounded-md bg-primary-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 dark:bg-primary-500 dark:hover:bg-primary-600"
            >
              {t('extension.nextStep')}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center gap-1 rounded-md bg-primary-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 dark:bg-primary-500 dark:hover:bg-primary-600"
            >
              {t('extension.finish')}
            </button>
          )}
        </div>
      </BrandDialogContent>
    </BrandDialog>
  )
}
