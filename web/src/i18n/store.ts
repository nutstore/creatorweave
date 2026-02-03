import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@browser-fs-analyzer/i18n'

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'zh-CN' as Locale,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'bfosa-i18n',
    }
  )
)
