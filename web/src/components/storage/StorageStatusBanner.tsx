/**
 * StorageStatusBanner Component
 *
 * Displays persistent storage status as a subtle inline warning.
 * Shows when storage is not persisted, with optional retry action.
 */

import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

export interface StorageStatusBannerProps {
  /**
   * Whether persistent storage is granted
   */
  isPersisted: boolean
  /**
   * Whether the banner is visible
   */
  isVisible: boolean
  /**
   * Callback when retry is clicked
   */
  onRetry: () => void
  /**
   * Callback when dismissed
   */
  onDismiss: () => void
  /**
   * CSS class
   */
  className?: string
}

/**
 * StorageStatusBanner displays persistent storage status as a subtle inline warning.
 * Only shows when storage is not persisted and user hasn't dismissed it.
 */
export function StorageStatusBanner({
  isPersisted,
  isVisible,
  onRetry,
  onDismiss,
  className,
}: StorageStatusBannerProps) {
  const t = useT()

  if (isPersisted || !isVisible) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed right-4 top-3 z-40 flex items-center gap-1.5 rounded-md bg-yellow-50/90 dark:bg-yellow-950/90 px-2 py-1 text-[11px] text-yellow-700 dark:text-yellow-300 shadow-sm backdrop-blur-sm',
        className
      )}
      role="alert"
      aria-live="polite"
      aria-label="Storage status"
    >
      <RefreshCw className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      <span>{t('storageStatusBanner.cacheUnstable')}</span>
      <button
        onClick={onRetry}
        className="ml-0.5 hover:underline"
        aria-label={t('storageStatusBanner.retry')}
      >
        {t('storageStatusBanner.retry')}
      </button>
      <button
        onClick={onDismiss}
        className="ml-0.5 opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
