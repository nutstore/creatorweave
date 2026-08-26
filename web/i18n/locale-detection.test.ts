import { describe, expect, it } from 'vitest'
import { resolveLocaleFromLanguageTag } from '@creatorweave/i18n'

describe('resolveLocaleFromLanguageTag', () => {
  it('matches supported locale with case-insensitive exact match', () => {
    expect(resolveLocaleFromLanguageTag('EN-us')).toBe('en-US')
    expect(resolveLocaleFromLanguageTag('zh-CN')).toBe('zh-CN')
  })

  it('maps base language to supported locale', () => {
    expect(resolveLocaleFromLanguageTag('en-GB')).toBe('en-US')
    expect(resolveLocaleFromLanguageTag('ja')).toBe('ja-JP')
    expect(resolveLocaleFromLanguageTag('ko-KR')).toBe('ko-KR')
  })

  it('returns null for unsupported language tags', () => {
    expect(resolveLocaleFromLanguageTag('fr-FR')).toBeNull()
    expect(resolveLocaleFromLanguageTag('')).toBeNull()
    expect(resolveLocaleFromLanguageTag(undefined)).toBeNull()
    expect(resolveLocaleFromLanguageTag(null)).toBeNull()
  })
})
