/**
 * DatabaseRefreshDialog - Non-dismissible dialog for database inaccessibility
 *
 * This dialog is shown when the database becomes inaccessible (e.g., after tab sleep).
 * It CANNOT be closed by ESC key or backdrop click - user must refresh the page.
 * This ensures the user understands they need to refresh to restore access.
 */

import { useEffect, useRef } from 'react'
import { useT } from '@/i18n'

interface DatabaseRefreshDialogProps {
  isOpen: boolean
}

export function DatabaseRefreshDialog({ isOpen }: DatabaseRefreshDialogProps) {
  const t = useT()
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Focus the refresh button when dialog opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      buttonRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleRefresh = () => {
    // Reload the page
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="mx-4 w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Warning Icon */}
        <div className="flex justify-center bg-warning-bg px-6 pt-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning-bg">
            <svg
              className="h-8 w-8 text-warning"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
        </div>

        {/* Header */}
        <div className="px-6 py-4 text-center">
          <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('app.databaseConnectionLost')}</h3>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{t('app.databaseConnectionLostDescription')}</p>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 text-center">
          <div className="mb-4 rounded-lg bg-amber-50 p-4 text-left">
            <p className="mb-2 text-sm font-medium text-amber-900">{t('app.whatHappened')}</p>
            <p className="text-sm text-amber-800">
              {t('app.databaseHandleInvalidExplanation')}
            </p>
            <p className="mt-2 text-sm text-amber-800">
              {t('app.ifJustClearedData')}
            </p>
          </div>

          <p className="mb-4 text-sm text-neutral-700 dark:text-neutral-300">
            <strong>{t('app.yourDataIsSafe')}</strong>
            <br />
            {t('app.dataStoredInOPFS')}
          </p>

          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('app.willAutoRecoverAfterRefresh')}</p>
        </div>

        {/* Footer - Only refresh button, no cancel */}
        <div className="bg-neutral-50 px-6 py-4 dark:bg-neutral-800">
          <button
            ref={buttonRef}
            onClick={handleRefresh}
            className="w-full rounded-lg bg-primary-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            {t('app.refreshPage')}
            <span className="ml-2 text-sm opacity-80">{t('app.refreshPageParenthetical')}</span>
          </button>
          <p className="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
            {t('app.cannotCloseDialog')}
          </p>
        </div>
      </div>

      {/* Backdrop overlay - prevent clicks from passing through */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}
