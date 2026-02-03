import { zhCN } from './locales/zh-CN'
import { enUS } from './locales/en-US'
import type { Locale } from './types'

/**
 * 默认语言
 */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

/**
 * 支持的所有语言
 */
export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en-US']

/**
 * 翻译映射表
 */
export const translations = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const

/**
 * RTL 语言列表（预留）
 */
export const RTL_LOCALES: Locale[] = []

/**
 * 检查是否为 RTL 语言
 */
export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale)
}
