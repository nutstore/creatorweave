import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Next root layout font sources', () => {
  it('does not include external Google Fonts links', () => {
    const layout = readFileSync(resolve(__dirname, '../../app/layout.tsx'), 'utf-8')
    const globalStyles = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf-8')
    const sources = `${layout}\n${globalStyles}`

    expect(sources).not.toContain('fonts.googleapis.com')
    expect(sources).not.toContain('fonts.gstatic.com')
  })
})
