/**
 * Page Write Auth Store — DEPRECATED thin wrapper.
 *
 * PR-1 merged this single-slot queue into the unified FIFO tool-auth.store
 * (web/store/tool-auth.store.ts). Semantics change is intentional and safe:
 * a second concurrent request now queues behind the visible one instead of
 * silently denying it (FIFO only ever delays, never loses, a request).
 *
 * The wrapper resolves the FULL unified-channel resolution
 * ({ approved, remembered }): dropping `remembered` here silently broke
 * "Always allow" — exactly the §3.9-7 failure the redesign doc predicted.
 * The CALLER (page-write.tool.ts) owns writing the grant into
 * session-allow, so the conversation id must be passed through too.
 *
 * Modal rendering happens in ToolAuthModal (subscribed to the unified
 * store). Will be deleted after the page-action side is verified.
 */

import { useToolAuthStore, type ToolAuthResolution } from '@/store/tool-auth.store'

interface PageWriteAuthState {
  /**
   * Push a new auth request. Resolves { approved, remembered } so the caller
   * can persist the "always allow" grant conversation-scoped.
   */
  request: (
    toolName: string,
    description: string,
    signal?: AbortSignal,
    conversationId?: string | null,
  ) => Promise<ToolAuthResolution>
  approve: (remember?: boolean) => void
  deny: () => void
  clear: () => void
}

function createPageWriteWrapper(): PageWriteAuthState & { getState: () => PageWriteAuthState } {
  const state: PageWriteAuthState = {
    request: (toolName, description, signal, conversationId) =>
      useToolAuthStore
        .getState()
        .request({
          toolName,
          description,
          // Coarse grant: one approval covers page-action writes for the
          // conversation (the URL blacklist remains a separate hard pre-check).
          memoryKey: 'page-action-write',
          conversationId: conversationId ?? null,
          signal,
        }),

    approve: (remember = false) => useToolAuthStore.getState().approve(remember),
    deny: () => useToolAuthStore.getState().deny(),
    clear: () => useToolAuthStore.getState().clear(),
  }
  return { ...state, getState: () => state }
}

export const usePageWriteAuthStore = createPageWriteWrapper()
