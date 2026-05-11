/**
 * ExtensionBanner — top banner that shows when the browser extension is not installed.
 * Dismissible for 7 days. Auto-hides when extension is detected.
 */

import { useState, useEffect } from 'react'
import { Globe, X } from 'lucide-react'
import { useT } from '@/i18n'
import { useExtensionStore } from '@/store/extension.store'

interface ExtensionBannerProps {
  onInstallClick: () => void
}

export function ExtensionBanner({ onInstallClick }: ExtensionBannerProps) {
  const t = useT()
  const status = useExtensionStore((s) => s.status)
  const shouldShowBanner = useExtensionStore((s) => s.shouldShowBanner)
  const dismissBanner = useExtensionStore((s) => s.dismissBanner)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (status === 'checking') return
    setVisible(shouldShowBanner())
  }, [status, shouldShowBanner])

  if (!visible) return null

  return (
    <div className="relative flex items-center justify-between gap-3 border-b border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2.5 dark:border-blue-800 dark:from-blue-950/60 dark:to-indigo-950/40">
      <div className="flex items-center gap-3 min-w-0">
        <Globe className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="min-w-0">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            {t('extension.bannerTitle')}
          </span>
          <span className="ml-2 hidden text-sm text-blue-700 dark:text-blue-300 sm:inline">
            {t('extension.bannerDescription')}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onInstallClick}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {t('extension.bannerAction')} →
        </button>
        <button
          type="button"
          onClick={() => {
            dismissBanner()
            setVisible(false)
          }}
          className="rounded p-1 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900 dark:hover:text-blue-300"
          aria-label={t('extension.bannerDismiss')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
