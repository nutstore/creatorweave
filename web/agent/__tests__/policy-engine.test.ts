import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useToolAuthStore } from '@/store/tool-auth.store'
import { useSessionAllowStore } from '@/store/session-allow.store'
import { authorize, getToolPolicy } from '../policy-engine'

describe('tool-auth.store (unified FIFO queue)', () => {
  afterEach(() => {
    useToolAuthStore.getState().clear()
  })

  it('resolves { approved, remembered } when the user picks "always allow"', async () => {
    const request = useToolAuthStore.getState().request({
      toolName: 'sync-to-disk',
      description: 'Write 3 files to disk',
      memoryKey: 'sync-to-disk',
      conversationId: 'conv-1',
    })
    useToolAuthStore.getState().approve(true)
    await expect(request).resolves.toEqual({ approved: true, remembered: true })
  })

  it('queues concurrent requests FIFO and only the head is visible', async () => {
    const first = useToolAuthStore.getState().request({ toolName: 'a', description: 'A' })
    const second = useToolAuthStore.getState().request({ toolName: 'b', description: 'B' })

    expect(useToolAuthStore.getState().pending?.toolName).toBe('a')
    expect(useToolAuthStore.getState().queue).toHaveLength(2)

    useToolAuthStore.getState().approve()
    await expect(first).resolves.toEqual({ approved: true, remembered: false })
    expect(useToolAuthStore.getState().pending?.toolName).toBe('b')

    useToolAuthStore.getState().deny()
    await expect(second).resolves.toEqual({ approved: false, remembered: false })
  })

  it('resolves an aborted request as deny without disturbing the queue head', async () => {
    const first = useToolAuthStore.getState().request({ toolName: 'a', description: 'A' })
    const controller = new AbortController()
    const second = useToolAuthStore
      .getState()
      .request({ toolName: 'b', description: 'B', signal: controller.signal })

    controller.abort()
    await expect(second).resolves.toEqual({ approved: false, remembered: false })
    expect(useToolAuthStore.getState().pending?.toolName).toBe('a')
    expect(useToolAuthStore.getState().queue).toHaveLength(1)

    useToolAuthStore.getState().approve()
    await expect(first).resolves.toEqual({ approved: true, remembered: false })
  })

  it('denyAll denies pending and queued requests at once', async () => {
    const first = useToolAuthStore.getState().request({ toolName: 'a', description: 'A' })
    const second = useToolAuthStore.getState().request({ toolName: 'b', description: 'B' })

    useToolAuthStore.getState().denyAll()

    await expect(first).resolves.toEqual({ approved: false, remembered: false })
    await expect(second).resolves.toEqual({ approved: false, remembered: false })
    expect(useToolAuthStore.getState().queue).toEqual([])
  })
})

describe('session-allow.store (conversation-scoped memory)', () => {
  afterEach(() => {
    useSessionAllowStore.getState().clearAll()
  })

  it('scopes grants per conversation and never matches without one', () => {
    const store = useSessionAllowStore.getState()
    expect(store.has(null, 'sync-to-disk')).toBe(false)
    expect(store.has(undefined, 'sync-to-disk')).toBe(false)

    store.add('conv-1', 'sync-to-disk')
    expect(store.has('conv-1', 'sync-to-disk')).toBe(true)
    expect(store.has('conv-2', 'sync-to-disk')).toBe(false)
  })

  it('add() without a conversation id is a no-op', () => {
    useSessionAllowStore.getState().add(null, 'sync-to-disk')
    expect(useSessionAllowStore.getState().allowed.size).toBe(0)
  })

  it('clearFor drops one conversation; clearAll drops everything', () => {
    const store = useSessionAllowStore.getState()
    store.add('conv-1', 'k1')
    store.add('conv-2', 'k2')

    useSessionAllowStore.getState().clearFor('conv-1')
    expect(useSessionAllowStore.getState().has('conv-1', 'k1')).toBe(false)
    expect(useSessionAllowStore.getState().has('conv-2', 'k2')).toBe(true)

    useSessionAllowStore.getState().clearAll()
    expect(useSessionAllowStore.getState().allowed.size).toBe(0)
  })
})

describe('policy-engine authorize()', () => {
  beforeEach(() => {
    useSessionAllowStore.getState().clearAll()
    useToolAuthStore.getState().clear()
  })
  afterEach(() => {
    useSessionAllowStore.getState().clearAll()
    useToolAuthStore.getState().clear()
  })

  it('forbidden tools are denied and cannot be overridden by yolo or memory', async () => {
    useSessionAllowStore.getState().add('conv-1', 'switch_agent_mode')
    const result = await authorize({
      toolName: 'switch_agent_mode',
      conversationId: 'conv-1',
    })
    expect(result).toEqual({
      decision: 'deny',
      reason: expect.stringContaining('forbidden'),
    })
  })

  it('auto tools pass without user interaction', async () => {
    const result = await authorize({ toolName: 'read', args: { path: 'a.md' } })
    expect(result).toEqual({ decision: 'allow', via: 'auto' })
    expect(useToolAuthStore.getState().queue).toHaveLength(0)
  })

  it('session memory short-circuits the prompt', async () => {
    useSessionAllowStore.getState().add('conv-1', 'page-action-write')
    const result = await authorize({
      toolName: 'page_click',
      args: {},
      conversationId: 'conv-1',
    })
    expect(result).toEqual({ decision: 'allow', via: 'session-memory' })
  })

  it('memory miss queues a prompt modal; remember=true records the grant', async () => {
    const pending = authorize({
      toolName: 'page_click',
      args: {},
      conversationId: 'conv-1',
    })
    expect(useToolAuthStore.getState().pending?.memoryKey).toBe('page-action-write')

    useToolAuthStore.getState().approve(true)
    expect(await pending).toEqual({ decision: 'allow', via: 'auto' })
    expect(useSessionAllowStore.getState().has('conv-1', 'page-action-write')).toBe(true)

    // Next call short-circuits.
    const second = await authorize({
      toolName: 'page_fill',
      args: {},
      conversationId: 'conv-1',
    })
    expect(second).toEqual({ decision: 'allow', via: 'session-memory' })
  })

  it('memory grants stay scoped to the conversation that made them', async () => {
    const pending = authorize({
      toolName: 'page_click',
      args: {},
      conversationId: 'conv-1',
    })
    useToolAuthStore.getState().approve(true)
    expect(await pending).toEqual({ decision: 'allow', via: 'auto' })

    // conv-2 has no grant → a second modal is queued (no cross-conversation
    // fallback). Decide it, then assert the denial.
    const other = authorize({
      toolName: 'page_click',
      args: {},
      conversationId: 'conv-2',
    })
    expect(useToolAuthStore.getState().queue).toHaveLength(1)
    useToolAuthStore.getState().deny()
    expect(await other).toEqual({
      decision: 'deny',
      reason: expect.stringContaining('denied'),
    })
  })

  it('memoryKey null tools (snapshot_restore) can never be remembered', async () => {
    const pending = authorize({ toolName: 'snapshot_restore', args: {} })
    const queued = useToolAuthStore.getState().pending
    expect(queued?.memoryKey).toBeNull()

    // "Always allow" click is impossible in UI, but even if forced:
    queued?.resolve(true, true)
    expect(await pending).toEqual({ decision: 'allow', via: 'auto' })
    expect(useSessionAllowStore.getState().allowed.size).toBe(0)
  })

  it('denial returns a reason the LLM can act on', async () => {
    const pending = authorize({ toolName: 'snapshot_restore', args: {} })
    useToolAuthStore.getState().deny()
    const result = await pending
    expect(result.decision).toBe('deny')
    if (result.decision === 'deny') {
      expect(result.reason).toContain('snapshot_restore')
    }
  })
})

describe('policy table', () => {
  it('classifies page-action writes as prompt with a coarse memory key', () => {
    const policy = getToolPolicy('page_fill')
    expect(policy.level).toBe('prompt')
    expect(policy.memoryKey?.({})).toBe('page-action-write')
  })

  it('snapshot_restore prompts without memory', () => {
    const policy = getToolPolicy('snapshot_restore')
    expect(policy.level).toBe('prompt')
    expect(policy.memoryKey?.({})).toBeNull()
  })

  it('call_tool prompts with a per server+tool memory key', () => {
    const policy = getToolPolicy('call_tool')
    expect(policy.level).toBe('prompt')
    expect(
      policy.memoryKey?.({ full_tool_name: 'github:create_issue' }),
    ).toBe('call_tool::github:create_issue')
    // unusable name → no safe key, ask every time
    expect(policy.memoryKey?.({})).toBeNull()
    expect(policy.memoryKey?.({ full_tool_name: '  ' })).toBeNull()
  })

  it('untrusted call_tool targets never get a memory key', () => {
    const policy = getToolPolicy('call_tool')
    expect(
      policy.memoryKey?.({ full_tool_name: 'page_tool', untrusted: true }),
    ).toBeNull()
  })

  it('switch_agent_mode is forbidden', () => {
    expect(getToolPolicy('switch_agent_mode').level).toBe('forbidden')
  })

  it('sync-to-disk prompts with a fixed memory key and file-count description', () => {
    const policy = getToolPolicy('sync-to-disk')
    expect(policy.level).toBe('prompt')
    expect(policy.memoryKey?.({})).toBe('sync-to-disk')
    expect(policy.describe?.({ count: 3 })).toContain('3 pending file changes')
    expect(policy.describe?.({ count: 1 })).toContain('1 pending file change ')
  })

  it('sync-to-opfs (renamed from sync) stays auto', () => {
    expect(getToolPolicy('sync-to-opfs').level).toBe('auto')
  })

  it('unregistered tools default to auto (PR-1 behavior freeze)', () => {
    expect(getToolPolicy('totally_unknown_tool').level).toBe('auto')
  })
})

describe('policy-engine: plan mode (call_tool double gating)', () => {
  beforeEach(() => {
    useSessionAllowStore.getState().clearAll()
    useToolAuthStore.getState().clear()
  })
  afterEach(() => {
    useSessionAllowStore.getState().clearAll()
    useToolAuthStore.getState().clear()
  })

  it('a remembered call_tool grant does NOT short-circuit in plan mode', async () => {
    // Act-mode approval remembered earlier in the same conversation.
    useSessionAllowStore.getState().add('conv-1', 'call_tool::jira:get_ticket')

    const pending = authorize({
      toolName: 'call_tool',
      args: { full_tool_name: 'jira:get_ticket' },
      conversationId: 'conv-1',
      mode: 'plan',
    })
    // Queues a modal (no short-circuit)…
    expect(useToolAuthStore.getState().queue).toHaveLength(1)
    // …and without the "always allow" option (memoryKey stripped).
    expect(useToolAuthStore.getState().pending?.memoryKey).toBeNull()
    useToolAuthStore.getState().approve()
    expect(await pending).toEqual({ decision: 'allow', via: 'auto' })
    // Single-call approval must NOT write memory.
    expect(
      useSessionAllowStore.getState().has('conv-1', 'call_tool::jira:get_ticket'),
    ).toBe(true) // pre-existing grant untouched
  })

  it('plan-mode deny returns a reason the LLM can act on', async () => {
    const pending = authorize({
      toolName: 'call_tool',
      args: { full_tool_name: 'jira:get_ticket' },
      conversationId: 'conv-1',
      mode: 'plan',
    })
    useToolAuthStore.getState().deny()
    const result = await pending
    expect(result.decision).toBe('deny')
  })

  it('auto tools are unaffected by plan mode (memory check is a no-op for them)', async () => {
    const result = await authorize({
      toolName: 'read',
      args: { path: 'a.md' },
      mode: 'plan',
    })
    expect(result).toEqual({ decision: 'allow', via: 'auto' })
  })

  it('call_tool still prompts in act mode and CAN be remembered', async () => {
    const pending = authorize({
      toolName: 'call_tool',
      args: { full_tool_name: 'github:create_issue' },
      conversationId: 'conv-1',
      mode: 'act',
    })
    expect(useToolAuthStore.getState().pending?.memoryKey).toBe(
      'call_tool::github:create_issue',
    )
    useToolAuthStore.getState().approve(true)
    expect(await pending).toEqual({ decision: 'allow', via: 'auto' })
    expect(
      useSessionAllowStore.getState().has('conv-1', 'call_tool::github:create_issue'),
    ).toBe(true)

    // Later call in the same conversation short-circuits (act mode).
    const second = await authorize({
      toolName: 'call_tool',
      args: { full_tool_name: 'github:create_issue' },
      conversationId: 'conv-1',
      mode: 'act',
    })
    expect(second).toEqual({ decision: 'allow', via: 'session-memory' })
  })
})
