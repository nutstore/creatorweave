import { describe, expect, it } from 'vitest'
import { coerceToolArgs, normalizeToolResult, truncateLargeToolResult } from '../loop/tool-execution'

describe('tool-execution helpers', () => {
  it('coerceToolArgs returns empty object for null and throws on non-object', () => {
    expect(coerceToolArgs(null)).toEqual({})
    expect(() => coerceToolArgs('abc')).toThrow('invalid_arguments')
  })

  it('normalizeToolResult marks envelope errors as isError=true', () => {
    const result = normalizeToolResult(
      JSON.stringify({
        ok: false,
        version: 2,
        tool: 'read',
        error: { code: 'E_TEST', message: 'boom' },
      })
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('E_TEST')
    expect(result.content).toContain('boom')
  })

  it('truncateLargeToolResult skips truncation when existingTokens is undefined', async () => {
    const raw = JSON.stringify({
      results: [{ path: 'a.ts', line: 1, match: 'x'.repeat(3000), preview: 'x'.repeat(3000) }],
      totalMatches: 1,
      scannedFiles: 1,
    })

    const result = await truncateLargeToolResult({
      rawResult: raw,
      toolName: 'search',
      // existingTokens intentionally omitted — no real usage data available
      maxContextTokens: 3000,
      reserveTokens: 200,
      estimateTextTokens: (text) => text.length,
    })

    // Should return raw result unchanged — no truncation without real usage data
    expect(result).toBe(raw)
  })

  it('truncateLargeToolResult reduces oversized search payload to summary-only result', async () => {
    const raw = JSON.stringify({
      results: [{ path: 'a.ts', line: 1, match: 'x'.repeat(3000), preview: 'x'.repeat(3000) }],
      totalMatches: 1,
      scannedFiles: 1,
    })

    const truncated = await truncateLargeToolResult({
      rawResult: raw,
      toolName: 'search',
      existingTokens: 2000,
      maxContextTokens: 3000,
      reserveTokens: 200,
      estimateTextTokens: (text) => text.length,
    })

    const parsed = JSON.parse(truncated)
    expect(parsed.truncated).toBe(true)
    expect(parsed.results).toEqual([])
  })
})
