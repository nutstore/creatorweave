import { createUseT } from '@creatorweave/i18n'
import { useI18nStore } from './store'

/**
 * mobile-web 项目的翻译 Hook
 * @example
 * const t = useT()
 * t('common.save') => '保存'
 */
export function useT() {
  const locale = useI18nStore((state) => state.locale)
  return createUseT(locale)
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

// 重新导出类型
export type { Locale } from '@creatorweave/i18n'
