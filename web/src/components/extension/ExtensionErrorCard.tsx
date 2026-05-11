/**
 * ExtensionErrorCard — shown in conversation when web_search/web_fetch fails
 * due to BRIDGE_UNAVAILABLE. Replaces the generic tool error display.
 */

import { memo } from 'react'
import { Globe, Search, FileText, MonitorSmartphone } from 'lucide-react'
import { useT } from '@/i18n'

interface ExtensionErrorCardProps {
  onInstallClick: () => void
}

export const ExtensionErrorCard = memo(function ExtensionErrorCard({
  onInstallClick,
}: ExtensionErrorCardProps) {
  const t = useT()

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-2.5 dark:border-amber-800">
        <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
          {t('extension.errorCardTitle')}
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-amber-800 dark:text-amber-300">
          {t('extension.errorCardDescription')}
        </p>
        <ul className="mt-2.5 space-y-1.5">
          <li className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Search className="h-3.5 w-3.5 shrink-0" />
            {t('extension.errorCardFeature1')}
          </li>
          <li className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            {t('extension.errorCardFeature2')}
          </li>
          <li className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" />
            {t('extension.errorCardFeature3')}
          </li>
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onInstallClick}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            {t('extension.errorCardAction')} →
          </button>
          <span className="text-xs text-amber-600 dark:text-amber-500">
            {t('extension.errorCardDismiss')}
          </span>
        </div>
      </div>
    </div>
  )
})
