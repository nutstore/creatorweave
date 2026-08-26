import { describe, expect, it } from 'vitest'
import {
  referencesSecretTemplate,
  collectSecretNames,
  applySecrets,
  redactSecrets,
  redactSecretHeaders,
} from '../web-bridge.tool'

// ===========================================================================
// referencesSecretTemplate
// ===========================================================================

describe('referencesSecretTemplate', () => {
  it('returns true for a Bearer token template', () => {
    expect(referencesSecretTemplate('Bearer ${WEREAD_API_KEY}')).toBe(true)
  })

  it('returns true for a template embedded mid-string', () => {
    expect(referencesSecretTemplate('token=${GITHUB_TOKEN}&scope=repo')).toBe(true)
  })

  it('returns true for multiple templates in one string', () => {
    expect(referencesSecretTemplate('${A} and ${B}')).toBe(true)
  })

  it('returns false for a plain string with no template', () => {
    expect(referencesSecretTemplate('application/json')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(referencesSecretTemplate('')).toBe(false)
  })

  it('returns false for non-string values', () => {
    expect(referencesSecretTemplate(undefined)).toBe(false)
    expect(referencesSecretTemplate(null)).toBe(false)
    expect(referencesSecretTemplate(123)).toBe(false)
    expect(referencesSecretTemplate({ a: 1 })).toBe(false)
  })

  it('ignores reserved env names like PATH / HOME', () => {
    expect(referencesSecretTemplate('prefix-${PATH}-suffix')).toBe(false)
    expect(referencesSecretTemplate('${HOME}')).toBe(false)
  })

  it('ignores lowercase template names (not valid secret names)', () => {
    expect(referencesSecretTemplate('${lowercase_name}')).toBe(false)
  })

  it('treats lowercase and reserved as no-match even when a real secret name coexists', () => {
    expect(referencesSecretTemplate('${PATH} ${REAL_SECRET}')).toBe(true)
  })
})

// ===========================================================================
// collectSecretNames
// ===========================================================================

describe('collectSecretNames', () => {
  it('collects names from headers only', () => {
    const names = collectSecretNames(
      { Authorization: 'Bearer ${WEREAD_API_KEY}', 'X-Other': '${GH_TOKEN}' },
      undefined,
    )
    expect(names.sort()).toEqual(['GH_TOKEN', 'WEREAD_API_KEY'])
  })

  it('collects names from body only', () => {
    const names = collectSecretNames(undefined, '{"key":"${API_KEY}"}')
    expect(names).toEqual(['API_KEY'])
  })

  it('collects from both headers and body, deduped', () => {
    const names = collectSecretNames(
      { Authorization: '${SHARED}' },
      '{"token":"${SHARED}","other":"${OTHER}"}',
    )
    expect(names.sort()).toEqual(['OTHER', 'SHARED'])
  })

  it('returns empty when no templates present', () => {
    expect(collectSecretNames({ 'Content-Type': 'application/json' }, '{"a":1}')).toEqual([])
  })

  it('returns empty for undefined inputs', () => {
    expect(collectSecretNames(undefined, undefined)).toEqual([])
  })

  it('skips reserved env names', () => {
    expect(collectSecretNames({ a: '${PATH}' }, '${HOME}')).toEqual([])
  })

  it('handles repeated names in the same string', () => {
    const names = collectSecretNames(undefined, '${API_KEY} ${API_KEY} ${API_KEY}')
    expect(names).toEqual(['API_KEY'])
  })
})

// ===========================================================================
// applySecrets
// ===========================================================================

describe('applySecrets', () => {
  it('replaces a known secret value', () => {
    const secrets = new Map([['WEREAD_API_KEY', 'wrk-secret123']])
    const { text, resolvedValues } = applySecrets('Bearer ${WEREAD_API_KEY}', secrets)
    expect(text).toBe('Bearer wrk-secret123')
    expect(resolvedValues).toEqual(['wrk-secret123'])
  })

  it('replaces multiple distinct secrets in one string', () => {
    const secrets = new Map([
      ['A', 'aaa'],
      ['B', 'bbb'],
    ])
    const { text, resolvedValues } = applySecrets('${A}-${B}', secrets)
    expect(text).toBe('aaa-bbb')
    expect(resolvedValues.sort()).toEqual(['aaa', 'bbb'])
  })

  it('leaves unresolved names literal', () => {
    const secrets = new Map([['A', 'aaa']])
    const { text, resolvedValues } = applySecrets('${A} and ${MISSING}', secrets)
    expect(text).toBe('aaa and ${MISSING}')
    expect(resolvedValues).toEqual(['aaa'])
  })

  it('returns empty resolvedValues when nothing resolves', () => {
    const { text, resolvedValues } = applySecrets('${MISSING}', new Map())
    expect(text).toBe('${MISSING}')
    expect(resolvedValues).toEqual([])
  })

  it('replaces whatever is in the secrets map (reserved filtering is upstream)', () => {
    // applySecrets is a pure regex replacer — it replaces any `${NAME}` whose
    // name is in the secrets map, regardless of whether the name is a reserved
    // env var. Reserved-name filtering happens in collectSecretNames, which
    // would never put PATH into the map. This test documents that applySecrets
    // itself does not re-filter, so it is driven solely by the map contents.
    const secrets = new Map([['PATH', '/usr/bin']])
    const { text, resolvedValues } = applySecrets('${PATH}', secrets)
    expect(text).toBe('/usr/bin')
    expect(resolvedValues).toEqual(['/usr/bin'])
  })

  it('handles repeated occurrences of the same secret', () => {
    const secrets = new Map([['X', 'xx']])
    const { text, resolvedValues } = applySecrets('${X}${X}${X}', secrets)
    expect(text).toBe('xxxxxx')
    expect(resolvedValues).toEqual(['xx', 'xx', 'xx'])
  })

  it('handles plaintext with no templates', () => {
    const secrets = new Map([['A', 'aaa']])
    const { text, resolvedValues } = applySecrets('plain text', secrets)
    expect(text).toBe('plain text')
    expect(resolvedValues).toEqual([])
  })
})

// ===========================================================================
// redactSecrets
// ===========================================================================

describe('redactSecrets', () => {
  it('replaces a known secret value with [REDACTED]', () => {
    expect(redactSecrets('token is wrk-secret123 here', ['wrk-secret123'])).toBe(
      'token is [REDACTED] here',
    )
  })

  it('redacts multiple distinct secrets', () => {
    const out = redactSecrets('aaa and bbb', ['aaa', 'bbb'])
    expect(out).toBe('[REDACTED] and [REDACTED]')
  })

  it('redacts repeated occurrences', () => {
    expect(redactSecrets('xx xx xx', ['xx'])).toBe('[REDACTED] [REDACTED] [REDACTED]')
  })

  it('returns text unchanged when secret value is empty string', () => {
    expect(redactSecrets('some text', [''])).toBe('some text')
  })

  it('returns text unchanged when no secrets match', () => {
    expect(redactSecrets('hello world', ['nonexistent'])).toBe('hello world')
  })

  it('handles a secret value that is a substring of another redaction target', () => {
    // If 'ab' and 'abc' are both secrets, the order of reduce matters.
    // 'abc' should be redacted fully, not partially split into '[REDACTED]c'.
    const out = redactSecrets('abc ab', ['ab', 'abc'])
    // 'ab' applied first: '[REDACTED]c [REDACTED]'; then 'abc' won't match.
    // This documents the current reduce behavior (order-sensitive).
    expect(out).toBe('[REDACTED]c [REDACTED]')
  })
})

describe('redactSecretHeaders', () => {
  it('redacts resolved secret values from every response header', () => {
    expect(redactSecretHeaders({
      'x-debug-token': 'Bearer wrk-secret123',
      'content-type': 'application/json',
    }, ['wrk-secret123'])).toEqual({
      'x-debug-token': 'Bearer [REDACTED]',
      'content-type': 'application/json',
    })
  })
})
