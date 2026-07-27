import { describe, expect, it } from 'vitest'
import { isSubagentPermissionDenied } from '../agent-file-protection'

describe('isSubagentPermissionDenied', () => {
  it('recognizes bridge permission errors returned through Bash stderr', () => {
    expect(
      isSubagentPermissionDenied(
        new Error('EACCES: delegated subagent cannot access protected agent file: SOUL.md')
      )
    ).toBe(true)
  })
})
