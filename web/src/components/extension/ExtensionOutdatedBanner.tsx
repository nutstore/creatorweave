/**
 * ExtensionOutdatedBanner — top banner that shows when the browser extension
 * is installed but outdated. Dismissible for 3 days.
 */

import { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useT } from '@/i18n'
import { useExtensionStore } from '@/store/extension.store'

export function ExtensionOutdatedBanner() {
  const t = useT()
  const status = useExtensionStore((s) => s.status)
  const extensionVersion = useExtensionStore((s) => s.extensionVersion)
  const latestVersion = __EXTENSION_LATEST_VERSION__
  const shouldShowOutdatedBanner = useExtensionStore((s) => s.shouldShowOutdatedBanner)
  const dismissOutdatedBanner = useExtensionStore((s) => s.dismissOutdatedBanner)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (status === 'checking') return
    setVisible(shouldShowOutdatedBanner())
  }, [status, extensionVersion, shouldShowOutdatedBanner])

  if (!visible) return null

  return (
    <div className="relative flex items-center justify-between gap-3 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-2.5 dark:border-amber-800 dark:from-amber-950/60 dark:to-yellow-950/40">
      <div className="flex items-center gap-3 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {t('extension.outdatedBannerTitle')}
          </span>
          <span className="ml-2 hidden text-sm text-amber-700 dark:text-amber-300 sm:inline">
            {t('extension.outdatedBannerDescription')
              .replace('{current}', extensionVersion || '?')
              .replace('{latest}', latestVersion)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => window.open(`/chrome-extension.zip?v=${__APP_BUILD_ID__}`, '_blank')}
          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
        >
          {t('extension.outdatedBannerAction')} →
        </button>
        <button
          type="button"
          onClick={() => {
            dismissOutdatedBanner()
            setVisible(false)
          }}
          className="rounded p-1 text-amber-400 transition-colors hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-900 dark:hover:text-amber-300"
          aria-label={t('extension.bannerDismiss')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
