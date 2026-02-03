/**
 * 支持的语言代码
 */
export type Locale = 'zh-CN' | 'en-US'

/**
 * 翻译值类型（支持嵌套对象）
 */
export type TranslationValue = string | TranslationObject

export interface TranslationObject {
  [key: string]: TranslationValue
}

/**
 * 类型工具：获取嵌套对象的所有路径
 * @example Paths<{ a: { b: { c: 'value' } }> => 'a' | 'a.b' | 'a.b.c'
 */
export type Paths<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends string
          ? K
          : K | `${K}.${Paths<T[K]>}`
        : never
    }[keyof T]
  : never
