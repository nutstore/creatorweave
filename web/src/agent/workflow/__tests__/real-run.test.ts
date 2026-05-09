import { describe, expect, it } from 'vitest'
import { NodeOutputStore, gatherInputs } from '../node-io'
import { buildNodeSystemPrompt, buildNodeUserMessage } from '../node-prompts'
import { parseReviewResult } from '../real-run'

// ---------------------------------------------------------------------------
// NodeOutputStore
// ---------------------------------------------------------------------------

describe('NodeOutputStore', () => {
  it('set / get / has / clear', () => {
    const store = new NodeOutputStore()

    expect(store.has('outline')).toBe(false)
    expect(store.get('outline')).toBeUndefined()

    store.set('outline', 'chapter 1: ...')
    expect(store.has('outline')).toBe(true)
    expect(store.get('outline')).toBe('chapter 1: ...')

    store.set('draft', 'content here')
    expect(store.get('draft')).toBe('content here')

    store.clear()
    expect(store.has('outline')).toBe(false)
    expect(store.has('draft')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// gatherInputs
// ---------------------------------------------------------------------------

describe('gatherInputs', () => {
  it('resolves refs from store', () => {
    const store = new NodeOutputStore()
    store.set('outline', 'plan content')
    store.set('draft', 'draft content')

    const inputs = gatherInputs(['outline', 'draft', 'nonexistent'], store)
    expect(inputs.size).toBe(2)
    expect(inputs.get('outline')).toBe('plan content')
    expect(inputs.get('draft')).toBe('draft content')
    expect(inputs.has('nonexistent')).toBe(false)
  })

  it('returns empty map for empty refs', () => {
    const store = new NodeOutputStore()
    store.set('x', 'y')
    const inputs = gatherInputs([], store)
    expect(inputs.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildNodeSystemPrompt
// ---------------------------------------------------------------------------

describe('buildNodeSystemPrompt', () => {
  it('returns a prompt containing role label and instruction for each kind', () => {
    const kinds = ['plan', 'produce', 'review', 'repair', 'assemble'] as const

    for (const kind of kinds) {
      const prompt = buildNodeSystemPrompt(kind, 'plot_planner')
      expect(prompt).toContain('Plot Planner')
      expect(prompt.length).toBeGreaterThan(10)
    }
  })

  it('uses role label for known roles', () => {
    const prompt = buildNodeSystemPrompt('plan', 'plot_planner')
    expect(prompt).toContain('Plot Planner')
  })

  it('falls back to raw agentRole for unknown roles', () => {
    const prompt = buildNodeSystemPrompt('plan', 'custom_role_xyz')
    expect(prompt).toContain('custom_role_xyz')
  })

  it('prefers custom task instruction when provided', () => {
    const prompt = buildNodeSystemPrompt(
      'produce',
      'chapter_writer',
      '请将同一语义内容组织成一个段落，每段至少 3 句。'
    )
    expect(prompt).toContain('Chapter Writer')
    expect(prompt).toContain('每段至少 3 句')
    expect(prompt).not.toContain('请根据以下大纲创作内容')
  })
})

// ---------------------------------------------------------------------------
// buildNodeUserMessage
// ---------------------------------------------------------------------------

describe('buildNodeUserMessage', () => {
  it('returns default message for empty inputs', () => {
    const msg = buildNodeUserMessage(new Map())
    expect(msg).toContain('Please begin work')
  })

  it('includes all input keys and content', () => {
    const inputs = new Map([
      ['outline', 'chapter 1 plan'],
      ['draft', 'chapter 1 content'],
    ])
    const msg = buildNodeUserMessage(inputs)
    expect(msg).toContain('outline')
    expect(msg).toContain('chapter 1 plan')
    expect(msg).toContain('draft')
    expect(msg).toContain('chapter 1 content')
  })
})

// ---------------------------------------------------------------------------
// parseReviewResult
// ---------------------------------------------------------------------------

describe('parseReviewResult', () => {
  it('parses valid JSON review', () => {
    const raw = 'Here is the review:\n```json\n{"score": 85, "passed": true, "issues": [], "suggestions": ["good job"]}\n```'
    const result = parseReviewResult(raw)
    expect(result).not.toBeNull()
    expect(result!.score).toBe(85)
    expect(result!.passed).toBe(true)
    expect(result!.suggestions).toEqual(['good job'])
  })

  it('returns null for non-JSON response', () => {
    const result = parseReviewResult('This is just plain text without any JSON')
    expect(result).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    const result = parseReviewResult('{invalid json}')
    expect(result).toBeNull()
  })

  it('returns null for JSON without score/passed fields', () => {
    const result = parseReviewResult('{"rating": "good"}')
    expect(result).toBeNull()
  })

  it('parses review with issues', () => {
    const raw = '{"score": 60, "passed": false, "issues": ["too short", "bad grammar"], "suggestions": ["expand section 2"]}'
    const result = parseReviewResult(raw)
    expect(result).not.toBeNull()
    expect(result!.score).toBe(60)
    expect(result!.passed).toBe(false)
    expect(result!.issues).toEqual(['too short', 'bad grammar'])
  })
})
