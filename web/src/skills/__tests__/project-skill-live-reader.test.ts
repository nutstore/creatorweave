/**
 * Tests for project-skill-live-reader.ts
 *
 * Focus on the pure-function ID parser (no DOM / native FS required).
 * The native FS read functions are exercised via integration in WorkspaceLayout.
 */
import { describe, it, expect } from 'vitest'
import { parseProjectSkillId } from '../project-skill-live-reader'

describe('parseProjectSkillId', () => {
  it('parses .skills/ root path correctly', () => {
    const result = parseProjectSkillId('project:myRoot:.skills/my-skill')
    expect(result).toEqual({
      rootName: 'myRoot',
      dirSegments: ['.skills', 'my-skill'],
    })
  })

  it('parses .claude/skills/ nested path correctly', () => {
    const result = parseProjectSkillId('project:myRoot:.claude/skills/my-skill')
    expect(result).toEqual({
      rootName: 'myRoot',
      dirSegments: ['.claude', 'skills', 'my-skill'],
    })
  })

  it('parses deeply nested skill directories', () => {
    const result = parseProjectSkillId('project:root1:.skills/group/sub-skill')
    expect(result).toEqual({
      rootName: 'root1',
      dirSegments: ['.skills', 'group', 'sub-skill'],
    })
  })

  it('parses root name with hyphens', () => {
    const result = parseProjectSkillId('project:my-cool-root:.skills/skill')
    expect(result).toEqual({
      rootName: 'my-cool-root',
      dirSegments: ['.skills', 'skill'],
    })
  })

  it('returns null for non-project skill IDs', () => {
    expect(parseProjectSkillId('builtin:cw-word-editor')).toBeNull()
    expect(parseProjectSkillId('user:my-skill')).toBeNull()
    expect(parseProjectSkillId('some-random-id')).toBeNull()
  })

  it('returns null for legacy project IDs without rootName', () => {
    // Legacy format from skill-scanner.ts: 'project:.skills/my-skill'
    // (no rootName segment). After stripping 'project:', the remainder
    // '.skills/my-skill' has no colon → returns null → falls back to cache.
    expect(parseProjectSkillId('project:.skills/my-skill')).toBeNull()
  })

  it('returns null for empty or malformed input', () => {
    expect(parseProjectSkillId('')).toBeNull()
    expect(parseProjectSkillId('project')).toBeNull()
    expect(parseProjectSkillId('project:')).toBeNull()
    expect(parseProjectSkillId('project::')).toBeNull()
    expect(parseProjectSkillId('project:x:')).toBeNull()
  })
})

describe('deleteProjectSkillFromNativeFs — path derivation', () => {
  // These tests verify the path-segment derivation logic indirectly via
  // parseProjectSkillId, which deleteProjectSkillFromNativeFs depends on.
  // The actual FS deletion requires a live directory handle (integration test).
  it('derives correct parent + target for .skills/ deletion', () => {
    const parsed = parseProjectSkillId('project:root:.skills/my-skill')!
    expect(parsed.dirSegments).toEqual(['.skills', 'my-skill'])
    // deleteProjectSkillFromNativeFs would remove 'my-skill' from '.skills/'
    const skillDirName = parsed.dirSegments[parsed.dirSegments.length - 1]
    const parentSegments = parsed.dirSegments.slice(0, -1)
    expect(skillDirName).toBe('my-skill')
    expect(parentSegments).toEqual(['.skills'])
  })

  it('derives correct parent for .claude/skills/ deletion', () => {
    const parsed = parseProjectSkillId('project:root:.claude/skills/my-skill')!
    const skillDirName = parsed.dirSegments[parsed.dirSegments.length - 1]
    const parentSegments = parsed.dirSegments.slice(0, -1)
    expect(skillDirName).toBe('my-skill')
    expect(parentSegments).toEqual(['.claude', 'skills'])
  })
})
