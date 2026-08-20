import { describe, expect, it } from 'vitest'
import { htmlHandler } from '../formats/html/handler'
import { csvHandler } from '../formats/csv/handler'
import { stripEnvelopeEchoHeader } from '../envelope-echo'

// Regression tests for the recurring "[HTML] index.html" file pollution.
//
// Root cause chain: format handlers prefixed read() content with an envelope
// header (`[HTML] index.html`, `[CSV] path`); models echoing read() output
// back into write()/edit() content corrupted files at the very top.
// browser-extension/entrypoints/popup/index.html was hit three times before
// this was fixed. These tests pin the fix from both sides:
//   1. Source: handlers must not put headers inside content
//   2. Defense: write() strips any residual envelope echo

const te = (s: string) => new TextEncoder().encode(s)

describe('html format handler — no envelope header in content', () => {
  it('returns raw HTML without any [HTML] prefix', async () => {
    const html = '<!DOCTYPE html>\n<html lang="en">\n<head><title>t</title></head>\n</html>'
    const result = await htmlHandler.read(te(html), 'web/popup/index.html')
    expect(result.content).toBe(html)
  })

  it('empty file yields a bare marker without file name', async () => {
    const result = await htmlHandler.read(te(''), 'web/popup/index.html')
    expect(result.content).not.toContain('[HTML]')
    expect(result.content).not.toContain('index.html')
  })

  it('truncation note does not include file name header', async () => {
    const big = 'x'.repeat(60000)
    const result = await htmlHandler.read(te(big), 'a/big.html')
    expect(result.content.startsWith('[HTML]')).toBe(false)
    expect(result.content).toContain('showing first')
    expect(result.metadata?.truncated).toBe(true)
  })
})

describe('csv format handler — no envelope header in content', () => {
  it('returns only the markdown table, no [CSV]/Rows/Columns lines', async () => {
    const csv = 'name,score\nalice,1\nbob,2\n'
    const result = await csvHandler.read(te(csv), 'data/scores.csv')
    expect(result.content.startsWith('[CSV]')).toBe(false)
    expect(result.content).not.toContain('Rows:')
    expect(result.content).not.toContain('Columns:')
    expect(result.content).not.toContain('Delimiter:')
    expect(result.content).toContain('| name | score |')
    // pandas hint moved from content to formatHint
    expect(result.content).not.toContain('pandas')
    expect(result.content).not.toContain('read_csv')
  })

  it('empty csv yields bare marker without [CSV] header', async () => {
    const result = await csvHandler.read(te(''), 'data/empty.csv')
    expect(result.content).not.toContain('[CSV]')
  })
})

describe('stripEnvelopeEchoHeader — write-side defense', () => {
  it('strips exact basename echo', () => {
    const content = '[HTML] index.html\n\n<!DOCTYPE html>\n<html></html>'
    const out = stripEnvelopeEchoHeader(content, 'browser-extension/entrypoints/popup/index.html')
    expect(out.stripped).toBe(true)
    expect(out.content.startsWith('<!DOCTYPE html>')).toBe(true)
  })

  it('strips full-path echo (csv style)', () => {
    const content = '[CSV] myRoot/data/x.csv\n\nname,score\na,1\n'
    const out = stripEnvelopeEchoHeader(content, 'myRoot/data/x.csv')
    expect(out.stripped).toBe(true)
    expect(out.content.startsWith('name,score')).toBe(true)
  })

  it('strips header even without a blank line after it', () => {
    const content = '[HTML] a.html\n<!DOCTYPE html>'
    const out = stripEnvelopeEchoHeader(content, 'a.html')
    expect(out.stripped).toBe(true)
    expect(out.content).toBe('<!DOCTYPE html>')
  })

  it('strips any [Label] header that echoes the file name (label itself is not validated)', () => {
    const content = '[TODO] index.html\nfix this'
    const out = stripEnvelopeEchoHeader(content, 'index.html')
    expect(out.stripped).toBe(true)
    expect(out.content).toBe('fix this')
  })

  it('does NOT strip ordinary bracket-starting content', () => {
    const content = '[TODO] buy milk\n- eggs'
    const out = stripEnvelopeEchoHeader(content, 'notes.md')
    expect(out.stripped).toBe(false)
    expect(out.content).toBe(content)
  })

  it('does NOT strip [Label] with different file name', () => {
    const content = '[HTML] other.html\nrest'
    const out = stripEnvelopeEchoHeader(content, 'index.html')
    expect(out.stripped).toBe(false)
    expect(out.content).toBe(content)
  })
})
