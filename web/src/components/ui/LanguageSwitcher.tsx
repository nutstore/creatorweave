/**
 * LanguageSwitcher - 语言切换组件
 *
 * 下拉式语言切换按钮，支持中英文切换
 */

import { Globe, Check } from 'lucide-react'
import { LOCALE_LABELS } from '@browser-fs-analyzer/i18n'
import { useLocale } from '@/i18n'
import type { Locale } from '@/i18n'

export function LanguageSwitcher() {
  const [locale, setLocale] = useLocale()

  return (
    <div className="group relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
      >
        <Globe className="h-4 w-4" />
        <span className="text-xs">{LOCALE_LABELS[locale]}</span>
      </button>

      <div className="absolute right-0 top-full z-50 mt-1 hidden rounded-lg border bg-white py-1 shadow-lg group-hover:block">
        {(['zh-CN', 'en-US'] as Locale[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setLocale(key)}
            className="flex w-full items-center justify-between gap-4 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            <span>{LOCALE_LABELS[key]}</span>
            {locale === key && <Check className="h-4 w-4 text-primary-600" />}
          </button>
        ))}
      </div>
    </div>
  )
}
