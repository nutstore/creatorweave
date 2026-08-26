import { useMemo } from 'react'
import { createUseT } from '@creatorweave/i18n'
import { useI18nStore } from './store'

/**
 * web 项目的翻译 Hook
 * @example
 * const t = useT()
 * t('common.save') => '保存'
 */
export function useT() {
  const locale = useI18nStore((state) => state.locale)
  return useMemo(() => createUseT(locale), [locale])
}

/**
 * 获取和设置语言
 * @example
 * const [locale, setLocale] = useLocale()
 * setLocale('en-US')
 */
export function useLocale() {
  const { locale, setLocale } = useI18nStore()
  return [locale, setLocale] as const
}

// 重新导出类型和常量
export type { Locale } from '@creatorweave/i18n'
export { LOCALE_LABELS } from '@creatorweave/i18n'
