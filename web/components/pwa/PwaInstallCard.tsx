'use client'

/**
 * PwaInstallCard — bottom-right install card driven by the captured
 * `beforeinstallprompt` event (see @/pwa/install-prompt).
 *
 * Shows when all of these hold:
 *   - Chrome captured the install prompt (install criteria met)
 *   - the app is NOT already running installed
 *   - the user has not dismissed the card before (persisted in localStorage)
 *
 * Once shown it stays for the visit (a scroll-away card nobody acts on is
 * worse than a stable offer); a dismissal is remembered forever unless the
 * app gets installed later (appinstalled resets it).
 *
 * Mounted in AppBootstrap (after storage init) so it never fights the
 * loading/error gates for screen space. AppBootstrap is client-only
 * (dynamic ssr:false), so `useState`'s initializer runs on the client only.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { getInstallPromptController } from '@/pwa/install-prompt'
import { useT } from '@/i18n'

export function PwaInstallCard() {
  const t = useT()
  const controller = getInstallPromptController()

  // Persisted dismissal read once at mount; in-session dismissals come
  // through the `state.dismissed` snapshot (identity-stable for uSES).
  const [dismissedAtMount] = useState(() => controller.isDismissedPersisted())

  // getState returns a cached snapshot → stable across re-renders.
  const state = useSyncExternalStore(controller.onStateChange, controller.getState, controller.getState)

  // Re-read persisted dismissal + installed display-mode after mount.
  useEffect(() => {
    controller.refresh()
  }, [controller])

  if (dismissedAtMount || state.dismissed || state.installed || !state.available) {
    return null
  }

  const onInstall = async () => {
    const outcome = await controller.prompt()
    if (outcome === 'dismissed') {
      controller.dismiss() // user said "no" inside Chrome's native dialog
    }
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-border bg-card p-4 shadow-lg"
      role="region"
      aria-label={t('app.pwaInstall.title')}
    >
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{t('app.pwaInstall.title')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('app.pwaInstall.description')}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => controller.dismiss()}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          {t('app.pwaInstall.dismiss')}
        </button>
        <button
          type="button"
          onClick={onInstall}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t('app.pwaInstall.action')}
        </button>
      </div>
    </div>
  )
}
