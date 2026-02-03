import type { TranslationObject } from './types'

/**
 * 获取嵌套对象的值，支持点号路径
 * @example getNested(obj, 'common.save') => obj.common.save
 */
export function getNested<T>(
  obj: T,
  path: string
): string | undefined {
  return path.split('.').reduce((acc, key) => {
    return acc && typeof acc === 'object'
      ? (acc as Record<string, unknown>)[key]
      : undefined
  }, obj as unknown) as string | undefined
}

/**
 * 插值处理 {var} 替换
 * @example interpolate('Hello {name}', { name: 'World' }) => 'Hello World'
 */
export function interpolate(
  template: string,
  params: Record<string, string | number>
): string {
  const missing: string[] = []
  const result = template.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in params)) {
      missing.push(key)
    }
    return params[key]?.toString() ?? `{${key}}`
  })

  if (missing.length > 0) {
    console.warn(`[i18n] Missing params: ${missing.join(', ')}`)
  }

  return result
}

/**
 * 语言标签映射
 */
export const LOCALE_LABELS: Record<string, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
} as const
