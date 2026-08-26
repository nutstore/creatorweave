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
    <div className="my-2 overflow-hidden rounded-xl border border-danger/20 bg-danger-bg">
      <div className="flex items-center gap-2 border-b border-danger/20 px-4 py-2.5">
        <Globe className="h-4 w-4 text-danger" />
        <span className="text-sm font-medium text-danger">
          {t('extension.errorCardTitle')}
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-danger">
          {t('extension.errorCardDescription')}
        </p>
        <ul className="mt-2.5 space-y-1.5">
          <li className="flex items-center gap-2 text-sm text-danger">
            <Search className="h-3.5 w-3.5 shrink-0" />
            {t('extension.errorCardFeature1')}
          </li>
          <li className="flex items-center gap-2 text-sm text-danger">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            {t('extension.errorCardFeature2')}
          </li>
          <li className="flex items-center gap-2 text-sm text-danger">
            <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" />
            {t('extension.errorCardFeature3')}
          </li>
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onInstallClick}
            className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 dark:bg-primary-500 dark:hover:bg-primary-600"
          >
            {t('extension.errorCardAction')} →
          </button>
          <span className="text-xs text-danger">
            {t('extension.errorCardDismiss')}
          </span>
        </div>
      </div>
    </div>
  )
})
