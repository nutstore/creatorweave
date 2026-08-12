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
    <div className="relative flex items-center justify-between gap-3 border-b border-primary-200 bg-gradient-to-r from-primary-50 to-primary-100 px-4 py-2.5 dark:border-primary-100/30 dark:from-primary-100/15 dark:to-primary-100/5">
      <div className="flex items-center gap-3 min-w-0">
        <Globe className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
        <div className="min-w-0">
          <span className="text-sm font-medium text-primary-900 dark:text-primary-200">
            {t('extension.bannerTitle')}
          </span>
          <span className="ml-2 hidden text-sm text-primary-700 dark:text-primary-300 sm:inline">
            {t('extension.bannerDescription')}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onInstallClick}
          className="rounded-md bg-primary-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 dark:bg-primary-500 dark:hover:bg-primary-600"
        >
          {t('extension.bannerAction')} →
        </button>
        <button
          type="button"
          onClick={() => {
            dismissBanner()
            setVisible(false)
          }}
          className="rounded p-1 text-primary-400 transition-colors hover:bg-primary-100 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 dark:hover:bg-primary-100/30 dark:hover:text-primary-300"
          aria-label={t('extension.bannerDismiss')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
