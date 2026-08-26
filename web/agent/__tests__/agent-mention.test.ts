import { describe, expect, it } from 'vitest'
import {
  extractFirstMentionedAgentId,
  extractMentionContextFromTextTail,
  extractMentionedAgentIds,
} from '../agent-mention'

describe('agent mention helpers', () => {
  it('extracts first mentioned agent id with Chinese characters', () => {
    expect(extractFirstMentionedAgentId('请 @墨染 看下这段')).toBe('墨染')
  })

  it('ignores default mention', () => {
    expect(extractFirstMentionedAgentId('@default 继续')).toBeNull()
  })

  it('extracts mention context from input tail', () => {
    expect(extractMentionContextFromTextTail('hello @墨染')).toEqual({
      mentionText: '@墨染',
      query: '墨染',
    })
  })

  it('extracts mentioned agent ids with canonical ids and dedupe', () => {
    const result = extractMentionedAgentIds(
      '先找 @墨染，然后 @NOVEL-editor，重复 @novel-editor',
      ['default', '墨染', 'novel-editor']
    )
    expect(result).toEqual(['墨染', 'novel-editor'])
  })
})
