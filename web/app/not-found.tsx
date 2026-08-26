'use client'

import Link from 'next/link'
import { useT } from '@/i18n'
import { projectsPath } from '@/lib/route-paths'

/**
 * Root not-found page — replaces the legacy client router's catch-all
 * (`*` → redirect /projects) for any URL that matches no App Router route
 * (`/foobar`, `/projects/…/unknown-deeper-path`, …).
 *
 * It must live at the ROOT app/ level (not inside (app)/): segment-level
 * not-found files only render for explicit notFound() calls within that
 * segment, while unmatched URLs fall through to the root one. Inside (app)/
 * it was dead code — the build compiled it but nothing could reach it.
 *
 * Locale: the i18n store is a module-level zustand store (no provider), so
 * the hook works here. On the server/prerender pass detectBrowserLocale()
 * falls back to the deployment-region default (no navigator); the persisted
 * user preference re-hydrates on the client. Copy: `app.notFound*` keys.
 */
export default function NotFound() {
  const t = useT()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <p className="text-5xl font-semibold tabular-nums text-muted-foreground">404</p>
      <p className="text-sm text-muted-foreground">{t('app.notFoundDescription')}</p>
      <Link
        href={projectsPath()}
        className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {t('app.notFoundBack')}
      </Link>
    </div>
  )
}
