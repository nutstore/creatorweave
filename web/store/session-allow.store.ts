/**
 * Session Allow Store
 *
 * Conversation-scoped "always allow" memory for tool authorizations.
 *
 * When the user picks "Allow for this conversation" in ToolAuthModal, the
 * tool's memory key (e.g. `sync-to-disk`, `sync-to-disk:delete` or
 * `mcp-server::tool_name`) is added
 * here. The policy engine checks this store BEFORE showing a prompt modal, so
 * remembered tools pass without further interruption.
 *
 * Scope model (see tool-authorization-redesign.md §3.8):
 * - Purely in-memory (zustand, no persistence). Closing the tab or refreshing
 *   the page clears everything — every new session is a fresh review.
 * - Keyed by conversation id. Switching conversations never shares approvals;
 *   closing a conversation calls clearFor() so its grants are dropped.
 * - No cross-conversation fallback: with conversationId unknown (rare subagent
 *   edges) nothing matches and nothing can be written — the modal asks every
 *   time.
 */

import { create } from 'zustand'

interface SessionAllowState {
  /** conversationId -> set of remembered memory keys */
  allowed: Map<string, Set<string>>

  /** True when `key` is remembered for the given conversation. */
  has: (conversationId: string | null | undefined, key: string) => boolean

  /** Remember `key` for the given conversation. No-op without a conversation. */
  add: (conversationId: string | null | undefined, key: string) => void

  /** Drop all remembered keys for one conversation (conversation closed). */
  clearFor: (conversationId: string) => void

  /** Drop every remembered key (settings panel "clear authorization memory"). */
  clearAll: () => void
}

export const useSessionAllowStore = create<SessionAllowState>((set, get) => ({
  allowed: new Map(),

  has: (conversationId, key) => {
    if (!conversationId) return false
    return get().allowed.get(conversationId)?.has(key) ?? false
  },

  add: (conversationId, key) => {
    if (!conversationId) return
    const allowed = get().allowed
    const existing = allowed.get(conversationId)
    if (existing?.has(key)) return
    const next = new Map(allowed)
    next.set(
      conversationId,
      existing ? new Set(existing).add(key) : new Set([key]),
    )
    set({ allowed: next })
  },

  clearFor: (conversationId) => {
    if (!get().allowed.has(conversationId)) return
    const next = new Map(get().allowed)
    next.delete(conversationId)
    set({ allowed: next })
  },

  clearAll: () => {
    set({ allowed: new Map() })
  },
}))

/** Test/diagnostic helper — read-only snapshot of remembered keys. */
export function getSessionAllowedKeys(conversationId: string): string[] {
  return Array.from(
    useSessionAllowStore.getState().allowed.get(conversationId) ?? [],
  )
}
