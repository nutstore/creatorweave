/**
 * Exec Auth Store — DEPRECATED thin wrapper.
 *
 * PR-1 merged this FIFO queue into the unified tool-auth.store
 * (web/store/tool-auth.store.ts). This wrapper keeps the legacy
 * useExecAuthStore API (getState().request/approve/deny/denyAll) for
 * exec.tool.ts; behavior is unchanged: same FIFO semantics, same
 * abort → deny resolution, same request signature (command, description,
 * signal). The exec command travels as `detail` so ToolAuthModal renders it
 * in the code block, exactly like ExecAuthModal did.
 *
 * Modal rendering now happens in ToolAuthModal (subscribed to the unified
 * store) — nothing here is reactive by design.
 *
 * Will be deleted once the migration is fully verified (PR-2/PR-3 window).
 */

import { useToolAuthStore } from '@/store/tool-auth.store'

interface ExecAuthState {
  /** Enqueue an auth request. Resolves when the user acts on that request. */
  request: (command: string[], description: string, signal?: AbortSignal) => Promise<boolean>
  approve: () => void
  deny: () => void
  denyAll: () => void
  clear: () => void
}

function createExecAuthWrapper(): ExecAuthState & { getState: () => ExecAuthState } {
  const state: ExecAuthState = {
    request: (command, description, signal) =>
      useToolAuthStore
        .getState()
        .request({
          toolName: 'exec',
          description,
          detail: command.join(' '),
          // exec grants are tuned via execpolicy.json, not "always allow"
          memoryKey: null,
          conversationId: null,
          signal,
        })
        .then((r) => r.approved),

    approve: () => useToolAuthStore.getState().approve(false),
    deny: () => useToolAuthStore.getState().deny(),
    denyAll: () => useToolAuthStore.getState().denyAll(),
    clear: () => useToolAuthStore.getState().clear(),
  }
  return { ...state, getState: () => state }
}

export const useExecAuthStore = createExecAuthWrapper()
