/**
 * LanguageSwitcher - 移动端语言切换组件
 *
 * 设置页面内的语言切换选项
 * Phase 5: Added i18n support
 */

import { Check, Globe } from 'lucide-react'
import { LOCALE_LABELS } from '@creatorweave/i18n'
import { useLocale } from '../i18n'
import type { Locale } from '../i18n'

interface LanguageSwitcherProps {
  className?: string
}

export function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const [locale, setLocale] = useLocale()

  const locales: Locale[] = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
        <Globe className="h-4 w-4" />
        <span>语言 / Language</span>
      </div>
      <div className="space-y-1">
        {locales.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setLocale(lang)}
            className={`w-full flex items-center justify-between rounded-lg px-4 py-3 text-left transition-colors ${
              locale === lang
                ? 'bg-primary-50 text-primary-700'
                : 'bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <span className="text-sm font-medium">{LOCALE_LABELS[lang]}</span>
            {locale === lang && <Check className="h-4 w-4" />}
          </button>
        ))}
      </div>
    </div>
  )
}
