import { describe, expect, it } from 'vitest'
import { toolOkJson } from '../tool-envelope'

describe('toolOkJson', () => {
  it('keeps legacy metadata passed as the third argument', () => {
    const envelope = JSON.parse(toolOkJson('ls', [], { _hint: 'Project directory is empty' }))

    expect(envelope.meta).toEqual({ _hint: 'Project directory is empty' })
  })
})
