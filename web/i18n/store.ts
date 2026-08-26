import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { detectBrowserLocale, type Locale } from '@creatorweave/i18n'

/**
 * Deployment-region default locale — build-time inlined.
 *
 * The domestic (.cn) and international (.com) deployments are built
 * separately: the CN build sets NEXT_PUBLIC_DEPLOY_REGION=cn, the
 * international build sets `global` (enforced by web/next.config.mjs for
 * production builds). When the browser language cannot be matched to a
 * supported locale, fall back to the deployment's default instead of a
 * hardcoded one — international users get English, not Chinese.
 * Dev builds default to English.
 */
const REGION_DEFAULT_LOCALE: Locale =
  process.env.NEXT_PUBLIC_DEPLOY_REGION === 'cn' ? 'zh-CN' : 'en-US'

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: detectBrowserLocale(REGION_DEFAULT_LOCALE),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'bfosa-i18n',
    }
  )
)
