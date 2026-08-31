/**
 * Page-action write authorization: conversation-scoped "Always allow".
 *
 * Covers the §3.9-7 regression fixed after the PR-1~4 review: the page-write
 * path must persist `remembered` grants into session-allow (scoped to the
 * conversation), short-circuit subsequent writes, and keep the URL blacklist
 * as the first hard pre-check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToolAuthStore } from '@/store/tool-auth.store'
import { useSessionAllowStore } from '@/store/session-allow.store'
import { useYoloModeStore } from '@/store/yolo-mode.store'

// page-write.tool.ts pulls the page-action bridge (extension-only) — mock it
// out; the authorization guard under test runs before the bridge anyway.
vi.mock('../page-action-bridge', () => ({
  isPageActionAvailable: () => true,
  runPageAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/agent/workspace-assistant-context', () => ({
  getSidePanelHostname: () => null,
  isSidePanelMode: () => true,
}))

import { pageClickExecutor } from '../page-write.tool'
import type { ToolContext } from '../tool-types'

const context = {
  workspaceId: 'conv-42',
  abortSignal: undefined,
} as unknown as ToolContext

describe('page-action write authorization (always-allow persistence)', () => {
  beforeEach(() => {
    useToolAuthStore.getState().clear()
    useSessionAllowStore.getState().clearAll()
    useYoloModeStore.getState().clearAll()
  })
  afterEach(() => {
    useToolAuthStore.getState().clear()
    useSessionAllowStore.getState().clearAll()
    useYoloModeStore.getState().clearAll()
  })

  it('queues a modal on first write; "always allow" persists the grant and short-circuits the next write', async () => {
    const first = pageClickExecutor({ locator: { uid: 'u1' } }, context)
    await new Promise((r) => setTimeout(r, 0))

    // Modal queued with the coarse page-action memory key.
    const pending = useToolAuthStore.getState().pending
    expect(pending?.toolName).toBe('page_click')
    expect(pending?.memoryKey).toBe('page-action-write')
    expect(pending?.conversationId).toBe('conv-42')

    useToolAuthStore.getState().approve(true)
    // The run proceeds (bridge is mocked; result shape is irrelevant here —
    // it must not be an auth error).
    const firstResult = JSON.parse((await first) as string) as { error?: unknown }
    expect(firstResult.error).toBeUndefined()
    expect(useSessionAllowStore.getState().has('conv-42', 'page-action-write')).toBe(true)

    // Second write: memory short-circuit → no modal queued.
    const second = await pageClickExecutor({ locator: { uid: 'u1' } }, context)
    expect(useToolAuthStore.getState().queue).toHaveLength(0)
    const parsed = JSON.parse(second as string) as { error?: unknown }
    expect(parsed.error).toBeUndefined()
  })

  it('one-shot approve does NOT persist a grant', async () => {
    const first = pageClickExecutor({ locator: { uid: 'u1' } }, context)
    await new Promise((r) => setTimeout(r, 0))
    useToolAuthStore.getState().approve(false)
    await first

    expect(useSessionAllowStore.getState().has('conv-42', 'page-action-write')).toBe(false)

    // Next write prompts again.
    const second = pageClickExecutor({ locator: { uid: 'u1' } }, context)
    await new Promise((r) => setTimeout(r, 0))
    expect(useToolAuthStore.getState().queue).toHaveLength(1)
    useToolAuthStore.getState().deny()
    await second
  })

  it('deny returns an auth error envelope', async () => {
    const first = pageClickExecutor({ locator: { uid: 'u1' } }, context)
    await new Promise((r) => setTimeout(r, 0))
    useToolAuthStore.getState().deny()
    const result = JSON.parse((await first) as string) as {
      error?: { code?: string }
    }
    expect(result.error?.code).toBe('AUTH_DENIED_BY_USER')
  })

  it('grants stay scoped to the conversation that made them', async () => {
    useSessionAllowStore.getState().add('conv-other', 'page-action-write')

    const first = pageClickExecutor({ locator: { uid: 'u1' } }, context)
    await new Promise((r) => setTimeout(r, 0))
    // conv-42 has no grant → modal queued despite conv-other's grant.
    expect(useToolAuthStore.getState().queue).toHaveLength(1)
    useToolAuthStore.getState().deny()
    await first
  })
})
