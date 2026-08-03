import { describe, expect, it } from 'vitest'
import { t, type Locale } from '@creatorweave/i18n'

describe('skills discovery translations', () => {
  it.each([
    ['zh-CN', '管理'],
    ['en-US', 'Manage'],
    ['ja-JP', '管理'],
    ['ko-KR', '관리'],
  ] satisfies Array<[Locale, string]>)('resolves tabManage for %s', (locale, expected) => {
    expect(t(locale, 'skills.discover.tabManage')).toBe(expected)
  })
})
