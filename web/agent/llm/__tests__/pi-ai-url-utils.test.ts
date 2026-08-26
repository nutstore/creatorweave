import { describe, expect, it } from 'vitest'
import { normalizeBaseUrl } from '../pi-ai-url-utils'

describe('normalizeBaseUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  https://example.com/v1///  ')).toBe('https://example.com/v1')
  })

  it('keeps internal path segments unchanged', () => {
    expect(normalizeBaseUrl('https://example.com/api/v1')).toBe('https://example.com/api/v1')
  })
})
