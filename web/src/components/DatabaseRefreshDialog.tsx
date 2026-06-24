/**
 * DatabaseRefreshDialog - Non-dismissible dialog for database inaccessibility
 *
 * Shown when the SQLite OPFS file handle is invalidated (tab sleep, browser
 * storage cleanup, etc.). Cannot be closed by ESC or backdrop click — user
 * must refresh the page to restore access.
 *
 * `errorMessage` (raw worker error) is rendered inside a collapsible
 * <details> block so non-technical users see only the friendly explanation,
 * while developers / support can expand to view the underlying error string.
 */

import { useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { useT } from '@/i18n'

interface DatabaseRefreshDialogProps {
  isOpen: boolean
  /** Raw error message from the SQLite worker — optional, shown in a collapsible block. */
  errorMessage?: string | null
}

export function DatabaseRefreshDialog({ isOpen, errorMessage }: DatabaseRefreshDialogProps) {
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
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="mx-4 w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-8 pb-4 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
            <RefreshCw className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {t('app.databaseConnectionLost')}
          </h3>
          <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">
            {t('app.willAutoRecoverAfterRefresh')}
          </p>
        </div>

        {/* Body — minimal. Data safety + technical details only. */}
        <div className="px-6 pb-4">
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            {t('app.dataStoredInOPFS')}
          </p>

          {errorMessage && (
            <details className="mt-3 text-left">
              <summary className="cursor-pointer text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200">
                {t('app.showTechnicalDetails')}
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-neutral-100 p-3 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {errorMessage}
              </pre>
            </details>
          )}
        </div>

        {/* Footer — single primary action */}
        <div className="px-6 pb-6">
          <button
            ref={buttonRef}
            onClick={handleRefresh}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" />
            {t('app.refreshPage')}
          </button>
        </div>
      </div>
    </div>
  )
}
