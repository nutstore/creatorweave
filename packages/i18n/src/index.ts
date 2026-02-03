export * from './types'
export * from './config'
export * from './utils'
export { zhCN, enUS } from './locales'

import { translations, DEFAULT_LOCALE } from './config'
import { getNested, interpolate } from './utils'
import type { Locale } from './types'

/**
 * 创建翻译 Hook 工厂函数
 *
 * 使用方式（在各项目中）：
 * ```ts
 * import { createUseT } from '@browser-fs-analyzer/i18n'
 * import { useI18nStore } from '@/store/i18n.store'
 *
 * export function useT() {
 *   const locale = useI18nStore((state) => state.locale)
 *   return createUseT(locale)
 * }
 * ```
 */
export function createUseT(locale: Locale) {
  const localeTranslations = translations[locale]

  return (
    key: string,
    params?: Record<string, string | number>
  ): string => {
    const value = getNested(localeTranslations, key)

    if (value === undefined) {
      // 尝试 fallback 到默认语言
      if (locale !== DEFAULT_LOCALE) {
        const fallbackValue = getNested(translations[DEFAULT_LOCALE], key)
        if (fallbackValue !== undefined) {
          console.warn(
            `[i18n] Missing "${key}" for "${locale}", using "${DEFAULT_LOCALE}" fallback`
          )
          return params ? interpolate(fallbackValue, params) : fallbackValue
        }
      }

      console.warn(`[i18n] Missing translation: ${key} for locale: ${locale}`)
      return key
    }

    return params ? interpolate(value, params) : value
  }
}

/**
 * 静态翻译函数（用于 React 组件外部）
 *
 * @example
 * import { t } from '@browser-fs-analyzer/i18n'
 * t('zh-CN', 'common.save') => '保存'
 */
export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const localeTranslations = translations[locale]
  const value = getNested(localeTranslations, key)

  if (value === undefined) {
    console.warn(`[i18n] Missing translation: ${key} for locale: ${locale}`)
    return key
  }

  return params ? interpolate(value, params) : value
}
