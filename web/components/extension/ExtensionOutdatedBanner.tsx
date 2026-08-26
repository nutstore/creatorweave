/**
 * ExtensionOutdatedBanner — top banner that shows when the browser extension
 * is installed but outdated. Dismissible for 3 days.
 */

import { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useT } from '@/i18n'
import { useExtensionStore } from '@/store/extension.store'
import { APP_BUILD_ID, EXTENSION_LATEST_VERSION } from '@/app-build'

export function ExtensionOutdatedBanner() {
  const t = useT()
  const status = useExtensionStore((s) => s.status)
  const extensionVersion = useExtensionStore((s) => s.extensionVersion)
  const latestVersion = EXTENSION_LATEST_VERSION
  const shouldShowOutdatedBanner = useExtensionStore((s) => s.shouldShowOutdatedBanner)
  const dismissOutdatedBanner = useExtensionStore((s) => s.dismissOutdatedBanner)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (status === 'checking') return
    setVisible(shouldShowOutdatedBanner())
  }, [status, extensionVersion, shouldShowOutdatedBanner])

  if (!visible) return null

  return (
    <div className="relative flex items-center justify-between gap-3 border-b border-warning-200 bg-gradient-to-r from-warning-50 to-warning-100 px-4 py-2.5 dark:border-warning-200/30 dark:from-warning-100/15 dark:to-warning-100/5">
      <div className="flex items-center gap-3 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <span className="text-sm font-medium text-warning-900">
            {t('extension.outdatedBannerTitle')}
          </span>
          <span className="ml-2 hidden text-sm text-warning dark:text-warning-200 sm:inline">
            {t('extension.outdatedBannerDescription')
              .replace('{current}', extensionVersion || '?')
              .replace('{latest}', latestVersion)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => window.open(`/chrome-extension.zip?v=${APP_BUILD_ID}`, '_blank')}
          className="rounded-md bg-warning px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-warning-500 focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-2"
        >
          {t('extension.outdatedBannerAction')} →
        </button>
        <button
          type="button"
          onClick={() => {
            dismissOutdatedBanner()
            setVisible(false)
          }}
          className="rounded p-1 text-warning-200 transition-colors hover:bg-warning-100 hover:text-warning focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-2 dark:hover:bg-warning-100/30"
          aria-label={t('extension.bannerDismiss')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
