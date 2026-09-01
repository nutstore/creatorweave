'use client'

import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { useT } from '@/i18n'
import { SITE_FOOTER_CONFIG } from '@/lib/site-footer-config'

/**
 * SiteFooter — compliance footer for public-facing pages.
 *
 * Shows the deployment-region operator (CN build → 上海奕惟网络科技有限公司,
 * international build → Astronet Technology PTE LTD), an optional ICP filing
 * link (NEXT_PUBLIC_ICP_NUMBER, CN build only), and the privacy-policy entry.
 *
 * Deliberately NOT mounted app-wide: it lives only on pages with a
 * compliance narrative (currently /projects; the privacy page keeps its own
 * footer). Editor workspaces and docs stay footer-free.
 */
export function SiteFooter() {
  const t = useT()
  const { operator, rights, icpNumber, privacyHref } = SITE_FOOTER_CONFIG

  return (
    <footer className="relative z-10 border-t border-border/60 bg-background/60">
      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <div className="text-xs text-muted-foreground">
          <span>© 2026 {operator}</span>
          <span className="mx-1.5 opacity-50">·</span>
          <span>{rights}</span>
        </div>

        <div className="flex items-center gap-4 text-xs sm:ml-auto">
          {icpNumber && (
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {icpNumber}
            </a>
          )}
          <Link
            href={privacyHref}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {t('siteFooter.privacy')}
          </Link>
        </div>
      </div>
    </footer>
  )
}
