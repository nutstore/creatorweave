/**
 * AgentLoop registry — module-level Map<conversationId, AgentLoop>.
 *
 * Lives outside any Zustand store because `AgentLoop` is a service object,
 * not serializable state:
 *
 *   - It holds runtime dependencies (provider, toolRegistry, contextManager,
 *     toolContext) and an AbortController — none of which can be immer-drafted
 *     or persisted.
 *   - Its private fields (`provider`, `toolRegistry`, …) make
 *     `WritableNonArrayDraft<AgentLoop>` fail to type-check. That is the
 *     root cause of the twelve `TS2345` errors previously emitted by
 *     `conversation.store.sqlite.ts` when its callbacks tried to access
 *     `state.agentLoops` inside `useConversationRuntimeStore.setState(...)`.
 *   - It is intentionally not persisted across page reloads (the comment in
 *     the original store already said "not persisted"), so it has no place
 *     in persisted state.
 *
 * Lifetime is bounded by the conversation: created when the user starts a
 * run, removed (and `.cancel()` called) when the run ends or the
 * conversation is deleted.
 */

import type { AgentLoop } from '@/agent/agent-loop'

const agentLoops = new Map<string, AgentLoop>()

/** Register a live loop for a conversation, replacing any prior one. */
export function setAgentLoop(convId: string, loop: AgentLoop): void {
  agentLoops.set(convId, loop)
}

/** Look up the live loop for a conversation, if any. */
export function getAgentLoop(convId: string): AgentLoop | undefined {
  return agentLoops.get(convId)
}

/**
 * Remove a loop from the registry and return it. The caller is responsible
 * for calling `.cancel()` on the returned loop if it should be aborted.
 */
export function deleteAgentLoop(convId: string): AgentLoop | undefined {
  const loop = agentLoops.get(convId)
  agentLoops.delete(convId)
  return loop
}

export function hasAgentLoop(convId: string): boolean {
  return agentLoops.has(convId)
}

/** Test-only: drop every entry. Production code should never need this. */
export function clearAgentLoops(): void {
  agentLoops.clear()
}
