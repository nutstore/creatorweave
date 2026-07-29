import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'

describe('development Service Worker build', () => {
  it('does not emit CommonJS require calls for the browser worker runtime', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/sw.ts'), 'utf8')
    const output = transformSync(source, {
      loader: 'ts',
      format: 'iife',
      target: 'es2020',
    })

    expect(output.code).not.toContain('require(')
    expect(output.code).toContain('/workspaces/')
  })
})
