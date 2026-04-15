import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('index.html font sources', () => {
  it('does not include external Google Fonts links', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf-8')

    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
  })
})
